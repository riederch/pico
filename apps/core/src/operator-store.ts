import { isHexOfBytes } from '@pico/protocol/canonical-bytes';
import type Database from 'better-sqlite3';

/**
 * The Foundation Operator credential (ADR 0075 principal, ADR 0076 mechanics).
 *
 * The passphrase is verified with Argon2id through libsodium's
 * `crypto_pwhash_str`, the reviewed building block ADR 0016 allows; Pico invents
 * no password scheme. The verifier string embeds algorithm, salt and cost
 * parameters, so it is self-describing and upgradeable through
 * `crypto_pwhash_str_needs_rehash` without a migration format of our own.
 *
 * Cost parameters are the *interactive* limits, not moderate ones: moderate
 * allocates 256 MiB per verification, which on the Raspberry-Pi-class appliance
 * target is a denial-of-service lever before it is a defense. For the same
 * reason verification is serialized with a bounded queue — a memory-hard KDF on
 * an unauthenticated endpoint must never become an amplifier (ADR 0076).
 *
 * Only the verifier and its phase/Home binding are persisted. Sessions are
 * in-memory (see {@link SessionStore}), so no backup can resurrect a revoked
 * one.
 */

const OPERATOR_ROW_ID = 'operator';

// Bound the memory-hard work in flight. One verification at a time keeps peak
// memory at a single Argon2id allocation; the queue cap makes excess load fail
// fast instead of piling up allocations.
const MAX_QUEUED_VERIFICATIONS = 4;

export const MIN_PASSPHRASE_LENGTH = 12;
export const MAX_PASSPHRASE_LENGTH = 1024;

// Minimal shape of the ready libsodium-wrappers-sumo module this store needs.
export interface PasswordHashingSodium {
  crypto_pwhash_OPSLIMIT_INTERACTIVE: number;
  crypto_pwhash_MEMLIMIT_INTERACTIVE: number;
  crypto_pwhash_str(password: string, opsLimit: number, memLimit: number): string;
  crypto_pwhash_str_verify(hashedPassword: string, password: string): boolean;
  crypto_pwhash_str_needs_rehash?(hashedPassword: string, opsLimit: number, memLimit: number): boolean;
}

export interface OperatorRecord {
  createdAt: string;
  updatedAt: string;
  homeBinding?: OperatorHomeBinding;
}

export interface OperatorHomeBinding {
  homeId: string;
  foundingId: string;
  hostSigningKeyFingerprintHex: string;
}

interface OperatorRow {
  credential_verifier: string;
  created_at: string;
  updated_at: string;
  home_binding_json: string | null;
}

/**
 * A refusal this store means for the person in front of the dashboard.
 *
 * **Written for finding B110.** Both credential routes answered `400 {"error":
 * error.message}`, which is right for these eight sentences - they exist to
 * tell an operator what to do differently - and wrong for everything else. An
 * argon2 failure, a SQLite error or a `TypeError` would have had its message
 * sent to whoever called `/api/auth/operator`, and that route is reached with
 * a bootstrap code rather than a session.
 *
 * The class is the difference between "a sentence chosen for a person" and
 * "whatever a library said", and it is the one thing a `catch` can ask.
 */
export class OperatorRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OperatorRequestError';
  }
}

export class OperatorOverloadedError extends Error {
  public constructor() {
    super('Too many credential verifications in flight.');
    this.name = 'OperatorOverloadedError';
  }
}

export class OperatorStore {
  private queuedVerifications = 0;

  private verificationChain: Promise<unknown> = Promise.resolve();

  public constructor(
    private readonly db: Database.Database,
    private readonly sodium: PasswordHashingSodium,
  ) {}

  public exists(): boolean {
    return this.read() !== undefined;
  }

  public get(): OperatorRecord | undefined {
    const row = this.read();

    if (row === undefined) {
      return undefined;
    }

    return mapOperatorRecord(row);
  }

  /**
   * Establishes the first operator credential. Fails if one already exists, so
   * bootstrap cannot silently replace a live operator.
   */
  public async create(passphrase: string, homeBinding?: OperatorHomeBinding): Promise<OperatorRecord> {
    assertPassphraseShape(passphrase);
    assertOperatorHomeBinding(homeBinding);

    const verifier = await this.hash(passphrase);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(`
        INSERT OR IGNORE INTO foundation_operator (
          operator_id,
          credential_verifier,
          created_at,
          updated_at,
          home_binding_json
        ) VALUES (?, ?, ?, ?, ?)
      `)
      .run(OPERATOR_ROW_ID, verifier, now, now, serializeHomeBinding(homeBinding));

    if (result.changes === 0) {
      throw new OperatorRequestError('Foundation operator already exists.');
    }

    return {
      createdAt: now,
      updatedAt: now,
      ...(homeBinding === undefined ? {} : { homeBinding: cloneHomeBinding(homeBinding) }),
    };
  }

  /**
   * Narrows a pre-claim credential to the exact Home founding. Repeating the
   * same binding is idempotent; moving a credential between Homes is refused
   * and requires the explicit local reset/bootstrap path.
   */
  public bindToHome(homeBinding: OperatorHomeBinding): OperatorRecord {
    assertOperatorHomeBinding(homeBinding);
    const current = this.get();
    if (current === undefined) {
      throw new OperatorRequestError('Foundation operator does not exist.');
    }
    if (current.homeBinding !== undefined && !sameHomeBinding(current.homeBinding, homeBinding)) {
      throw new OperatorRequestError('Foundation operator is bound to a different Pico Home founding.');
    }
    if (current.homeBinding === undefined) {
      const now = new Date().toISOString();
      this.db
        .prepare('UPDATE foundation_operator SET home_binding_json = ?, updated_at = ? WHERE operator_id = ?')
        .run(serializeHomeBinding(homeBinding), now, OPERATOR_ROW_ID);
    }

    return this.get() as OperatorRecord;
  }

  /**
   * Home reset is an explicit local-host action. It may return the surviving
   * local credential to the unclaimed phase, but never silently rebind it to a
   * different claimed Home.
   */
  public clearHomeBinding(): boolean {
    const result = this.db
      .prepare(`
        UPDATE foundation_operator
        SET home_binding_json = NULL, updated_at = ?
        WHERE operator_id = ? AND home_binding_json IS NOT NULL
      `)
      .run(new Date().toISOString(), OPERATOR_ROW_ID);

    return result.changes > 0;
  }

  /**
   * Verifies a passphrase against the stored verifier. Returns false when no
   * operator exists, so callers cannot distinguish "no operator" from "wrong
   * passphrase" by return value alone.
   */
  public async verify(passphrase: string): Promise<boolean> {
    const row = this.read();

    if (row === undefined || !isPlausiblePassphrase(passphrase)) {
      return false;
    }

    const verified = await this.enqueue(
      () => this.sodium.crypto_pwhash_str_verify(row.credential_verifier, passphrase),
    );

    if (verified && this.needsRehash()) {
      // The upgrade path the self-describing verifier exists for. A successful
      // login is the only moment the plaintext is available to re-derive from,
      // so it happens here or not at all — and "not at all" is what it was:
      // nothing called needsRehash outside its own test.
      await this.rehash(passphrase);
    }

    return verified;
  }

  /**
   * Replaces the passphrase. The current one is required: a live session alone
   * must not be enough to lock the real operator out (ADR 0076).
   */
  public async changePassphrase(currentPassphrase: string, nextPassphrase: string): Promise<boolean> {
    if (!(await this.verify(currentPassphrase))) {
      return false;
    }

    assertPassphraseShape(nextPassphrase);

    const verifier = await this.hash(nextPassphrase);
    const now = new Date().toISOString();

    this.db
      .prepare('UPDATE foundation_operator SET credential_verifier = ?, updated_at = ? WHERE operator_id = ?')
      .run(verifier, now, OPERATOR_ROW_ID);

    return true;
  }

  /**
   * Clears the operator so the host returns to bootstrap. Only the explicit
   * local reset path calls this; it never touches keys, memory content or the
   * event log.
   */
  public clear(): boolean {
    const result = this.db.prepare('DELETE FROM foundation_operator WHERE operator_id = ?').run(OPERATOR_ROW_ID);

    return result.changes > 0;
  }

  /** True when the stored verifier was made with weaker parameters than current. */
  public needsRehash(): boolean {
    const row = this.read();

    if (row === undefined || this.sodium.crypto_pwhash_str_needs_rehash === undefined) {
      return false;
    }

    return this.sodium.crypto_pwhash_str_needs_rehash(
      row.credential_verifier,
      this.sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      this.sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    );
  }

  /**
   * Re-derives the verifier under current parameters. Best effort on purpose:
   * a failed upgrade must never turn a correct passphrase into a failed login,
   * so the old verifier simply stays and the next login tries again.
   */
  private async rehash(passphrase: string): Promise<void> {
    try {
      const verifier = await this.hash(passphrase);
      this.db
        .prepare('UPDATE foundation_operator SET credential_verifier = ?, updated_at = ? WHERE operator_id = ?')
        .run(verifier, new Date().toISOString(), OPERATOR_ROW_ID);
    } catch {
      // Keeping the working verifier is the safe outcome.
    }
  }

  private read(): OperatorRow | undefined {
    return this.db
      .prepare(`
        SELECT credential_verifier, created_at, updated_at, home_binding_json
        FROM foundation_operator
        WHERE operator_id = ?
      `)
      .get(OPERATOR_ROW_ID) as OperatorRow | undefined;
  }

  private async hash(passphrase: string): Promise<string> {
    return this.enqueue(() => this.sodium.crypto_pwhash_str(
      passphrase,
      this.sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      this.sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    ));
  }

  /**
   * Serializes memory-hard work: one Argon2id computation at a time, with a
   * bounded queue. Beyond the cap the request is rejected without hashing, so a
   * flood of login attempts cannot exhaust memory.
   */
  private async enqueue<T>(work: () => T): Promise<T> {
    if (this.queuedVerifications >= MAX_QUEUED_VERIFICATIONS) {
      throw new OperatorOverloadedError();
    }

    this.queuedVerifications += 1;

    const run = this.verificationChain.then(work, work);

    // Keep the chain alive regardless of this call's outcome, and never let a
    // rejected link mark the chain itself as unhandled.
    this.verificationChain = run.catch(() => undefined);

    try {
      return await run;
    } finally {
      this.queuedVerifications -= 1;
    }
  }
}

function mapOperatorRecord(row: OperatorRow): OperatorRecord {
  const homeBinding = parseHomeBinding(row.home_binding_json);

  return {
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(homeBinding === undefined ? {} : { homeBinding }),
  };
}

function serializeHomeBinding(homeBinding: OperatorHomeBinding | undefined): string | null {
  return homeBinding === undefined ? null : JSON.stringify(homeBinding);
}

function parseHomeBinding(serialized: string | null): OperatorHomeBinding | undefined {
  if (serialized === null) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new OperatorRequestError('Foundation operator Home binding is malformed.');
  }

  assertOperatorHomeBinding(parsed);
  if (parsed === undefined) {
    throw new OperatorRequestError('Foundation operator Home binding is malformed.');
  }
  return cloneHomeBinding(parsed);
}

function assertOperatorHomeBinding(homeBinding: unknown): asserts homeBinding is OperatorHomeBinding | undefined {
  if (homeBinding === undefined) {
    return;
  }
  if (!isRecord(homeBinding)
    || Object.keys(homeBinding).sort().join(',') !== 'foundingId,homeId,hostSigningKeyFingerprintHex'
    || !isPrintableAsciiToken(homeBinding.homeId)
    || !isPrintableAsciiToken(homeBinding.foundingId)
    || !isFingerprint(homeBinding.hostSigningKeyFingerprintHex)) {
    throw new OperatorRequestError('Foundation operator Home binding is invalid.');
  }
}

function sameHomeBinding(left: OperatorHomeBinding, right: OperatorHomeBinding): boolean {
  return left.homeId === right.homeId
    && left.foundingId === right.foundingId
    && left.hostSigningKeyFingerprintHex === right.hostSigningKeyFingerprintHex;
}

function cloneHomeBinding(homeBinding: OperatorHomeBinding): OperatorHomeBinding {
  return { ...homeBinding };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * **Eine andere Zeichenmenge, also ein anderer Name** (Befund B141).
 *
 * Sie hiess bis zum 2026-09-11 `isAsciiToken` wie das kanonische Praedikat im
 * Protokoll und meint etwas anderes: jedes druckbare ASCII-Zeichen ausser dem
 * Leerzeichen, nicht die kanonische Menge aus Buchstaben, Ziffern und sechs
 * Satzzeichen. Hier stehen Betreiberwerte, keine unterschriebenen Felder. Ein
 * Name ist keine Regel (Befund B124), und dieser hier war zweimal vergeben.
 */
function isPrintableAsciiToken(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && /^[\x21-\x7e]+$/.test(value);
}

function isFingerprint(value: unknown): value is string {
  return typeof value === 'string' && isHexOfBytes(value, 32);
}

function isPlausiblePassphrase(passphrase: unknown): passphrase is string {
  return typeof passphrase === 'string'
    && passphrase.length >= MIN_PASSPHRASE_LENGTH
    && passphrase.length <= MAX_PASSPHRASE_LENGTH;
}

function assertPassphraseShape(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new OperatorRequestError(`Operator passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }

  if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
    throw new OperatorRequestError(`Operator passphrase must be at most ${MAX_PASSPHRASE_LENGTH} characters.`);
  }
}
