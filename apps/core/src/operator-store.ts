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
 * Only the verifier is persisted. Sessions are in-memory (see
 * {@link SessionStore}), so no backup can resurrect a revoked one.
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
}

interface OperatorRow {
  credential_verifier: string;
  created_at: string;
  updated_at: string;
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

    return { createdAt: row.created_at, updatedAt: row.updated_at };
  }

  /**
   * Establishes the first operator credential. Fails if one already exists, so
   * bootstrap cannot silently replace a live operator.
   */
  public async create(passphrase: string): Promise<OperatorRecord> {
    assertPassphraseShape(passphrase);

    const verifier = await this.hash(passphrase);
    const now = new Date().toISOString();
    const result = this.db
      .prepare(`
        INSERT OR IGNORE INTO foundation_operator (
          operator_id,
          credential_verifier,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?)
      `)
      .run(OPERATOR_ROW_ID, verifier, now, now);

    if (result.changes === 0) {
      throw new Error('Foundation operator already exists.');
    }

    return { createdAt: now, updatedAt: now };
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
      .prepare('SELECT credential_verifier, created_at, updated_at FROM foundation_operator WHERE operator_id = ?')
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

function isPlausiblePassphrase(passphrase: unknown): passphrase is string {
  return typeof passphrase === 'string'
    && passphrase.length >= MIN_PASSPHRASE_LENGTH
    && passphrase.length <= MAX_PASSPHRASE_LENGTH;
}

function assertPassphraseShape(passphrase: unknown): asserts passphrase is string {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Operator passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }

  if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
    throw new Error(`Operator passphrase must be at most ${MAX_PASSPHRASE_LENGTH} characters.`);
  }
}
