import { bytesToHex, hexToBytes } from '@pico/protocol/canonical-bytes';

/**
 * Dieselbe Regel, eigener Ablehnungssatz - und deshalb ein eigener Name
 * (Befund B138).
 *
 * Die Regel steht im Protokoll und wird von dort geholt; was hier oertlich
 * bleibt, ist nur die Vorgabe fuer den Satz: hier liest ein Betreiber die
 * Meldung, und `invalid_hex` sagt ihm nicht, welches Material gemeint war.
 *
 * Sie hiess beim Schreiben zuerst auch `hexToBytes`, und `canonical:check` hat
 * das gemeldet - zu Recht. Ein Name ist keine Regel (Befund B124): wer diesen
 * Namen ein zweites Mal vergibt, verdeckt genau die Frage, die der Pruefer
 * stellt.
 */
const hostKeyHexToBytes = (
  hex: string,
  errorMessage = 'Pico Home host key material must be lowercase hex.',
): Uint8Array => hexToBytes(hex, errorMessage);
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  buildPicoIdentityKeyRecordSignatureInput,
  picoIdentitySuite,
  type PicoIdentityKeyRole,
} from '@pico/protocol';
import { createPicoHomeFileDurably, removePicoHomeFileDurably } from './durable-file.js';
import { digest } from './session-store.js';

/**
 * Pico Home setup-mode mechanics (ADR 0080 Gate M2 slice).
 *
 * This module deliberately implements only host-side setup foundations:
 * host-role key custody, a per-process Move-In Code and the local reset marker.
 * It does not seal claim payloads, verify claimant signatures, issue membership
 * credentials or implement Pico Link. Those remain behind ADR 0080 M2/M3.
 */

const MOVE_IN_CODE_BYTES = 24;
const MAX_MOVE_IN_CODE_ATTEMPTS = 10;
const HOST_KEY_SCHEMA = 'pico.home.host-keypair.v1' as const;
const HOST_SIGNING_KEY_FILE = 'home_host_signing.key.json';
const HOST_KEY_AGREEMENT_KEY_FILE = 'home_host_key_agreement.key.json';
// ADR 0115 U3. Staged successor keys live beside the active pair until the
// continuity link is accepted; promotion is two atomic per-file renames, and
// an interrupted promotion is completed at boot against the proven chain head.
const STAGED_HOST_SIGNING_KEY_FILE = 'home_host_signing.staged.key.json';
const STAGED_HOST_KEY_AGREEMENT_KEY_FILE = 'home_host_key_agreement.staged.key.json';

export const HOME_RESET_MARKER_FILENAME = 'home-reset';
/**
 * ADR 0110 R6. Re-seeding the recovery anchor after anchor loss is an
 * operator decision, and it takes the same shape as the other drastic host
 * actions: a file placed beside the database, consumed once at startup. That
 * keeps it off the Foundation HTTP surface - which ADR 0112 pins as
 * diagnosis, never a product surface - and requires exactly the authority it
 * implies, local access to the Home host. It grants nothing: the re-seed can
 * only rebuild terminal knowledge the rows already carry.
 */
export const RECOVERY_ANCHOR_RESEED_MARKER_FILENAME = 'recovery-anchor-reseed';

export interface MoveInCodeConsumeResult {
  ok: boolean;
  exhausted: boolean;
}

export class MoveInCode {
  private codeDigest: string | undefined;
  private attempts = 0;

  public mint(): string {
    const value = randomBytes(MOVE_IN_CODE_BYTES).toString('base64url');

    this.codeDigest = digest(value);
    this.attempts = 0;

    return value;
  }

  public isPending(): boolean {
    return this.codeDigest !== undefined;
  }

  public consume(candidate: unknown): MoveInCodeConsumeResult {
    if (this.codeDigest === undefined) {
      return { ok: false, exhausted: true };
    }

    if (typeof candidate !== 'string' || candidate.length === 0 || !this.equals(candidate)) {
      this.attempts += 1;
      const exhausted = this.attempts >= MAX_MOVE_IN_CODE_ATTEMPTS;

      if (exhausted) {
        this.clear();
      }

      return { ok: false, exhausted };
    }

    this.clear();
    return { ok: true, exhausted: false };
  }

  public clear(): void {
    this.codeDigest = undefined;
    this.attempts = 0;
  }

  private equals(candidate: string): boolean {
    if (this.codeDigest === undefined) {
      return false;
    }

    const expected = Buffer.from(this.codeDigest, 'utf8');
    const actual = Buffer.from(digest(candidate), 'utf8');

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

export interface HomeHostPublicKeyBundle {
  suite: typeof picoIdentitySuite;
  signingPublicKeyHex: string;
  signingKeyFingerprintHex: string;
  keyAgreementPublicKeyHex: string;
  keyAgreementKeyFingerprintHex: string;
}

export interface HomeHostKeyPairSet {
  publicBundle: HomeHostPublicKeyBundle;
  createdAt: string;
}

export interface HomeHostKeyStoreSodium {
  crypto_box_PUBLICKEYBYTES: number;
  crypto_box_SECRETKEYBYTES: number;
  crypto_sign_PUBLICKEYBYTES: number;
  crypto_sign_SECRETKEYBYTES: number;
  crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_box_seal_open(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array;
  crypto_generichash(hashLength: number, message: Uint8Array | string, key: Uint8Array | string | null): Uint8Array;
  crypto_sign_detached(message: Uint8Array, privateKey: Uint8Array): Uint8Array;
  crypto_sign_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  memzero(bytes: Uint8Array): void;
}

interface StoredHostKeyPair {
  schema: typeof HOST_KEY_SCHEMA;
  schemaVersion: 1;
  suite: typeof picoIdentitySuite;
  keyRole: PicoIdentityKeyRole;
  publicKeyHex: string;
  privateKeyHex: string;
  keyFingerprintHex: string;
  createdAt: string;
}

export class HomeHostKeyStore {
  public constructor(private readonly storePath: string) {}

  public ensure(sodium: HomeHostKeyStoreSodium, now: Date = new Date()): HomeHostKeyPairSet {
    const existing = this.load(sodium);
    if (existing !== undefined) {
      return existing;
    }

    mkdirSync(this.storePath, { recursive: true, mode: 0o700 });
    const createdAt = now.toISOString();
    const signing = createStoredKeyPair(sodium, 'home_host_signing', sodium.crypto_sign_keypair(), createdAt);
    const keyAgreement = createStoredKeyPair(sodium, 'home_host_key_agreement', sodium.crypto_box_keypair(), createdAt);

    writeStoredKeyPair(this.keyPath(HOST_SIGNING_KEY_FILE), signing);
    writeStoredKeyPair(this.keyPath(HOST_KEY_AGREEMENT_KEY_FILE), keyAgreement);

    return toKeyPairSet(signing, keyAgreement);
  }

  public load(sodium: HomeHostKeyStoreSodium): HomeHostKeyPairSet | undefined {
    const signingPath = this.keyPath(HOST_SIGNING_KEY_FILE);
    const keyAgreementPath = this.keyPath(HOST_KEY_AGREEMENT_KEY_FILE);
    const hasSigning = existsSync(signingPath);
    const hasKeyAgreement = existsSync(keyAgreementPath);

    if (!hasSigning && !hasKeyAgreement) {
      return undefined;
    }

    if (hasSigning !== hasKeyAgreement) {
      throw new Error('Pico Home host key custody is incomplete.');
    }

    const signing = readStoredKeyPair(sodium, signingPath, 'home_host_signing');
    const keyAgreement = readStoredKeyPair(sodium, keyAgreementPath, 'home_host_key_agreement');

    return toKeyPairSet(signing, keyAgreement);
  }

  public clear(): { removedFiles: number } {
    if (!existsSync(this.storePath)) {
      return { removedFiles: 0 };
    }

    let removedFiles = 0;
    for (const name of readdirSync(this.storePath)) {
      if (name === HOST_SIGNING_KEY_FILE || name === HOST_KEY_AGREEMENT_KEY_FILE) {
        removePicoHomeFileDurably(this.keyPath(name));
        removedFiles += 1;
      }
    }
    // A partial copy of a pair whose creation never finished holds a private
    // key too, and has no file of its own for the loop above to find.
    removePicoHomeFileDurably(this.keyPath(HOST_SIGNING_KEY_FILE));
    removePicoHomeFileDurably(this.keyPath(HOST_KEY_AGREEMENT_KEY_FILE));

    return { removedFiles };
  }

  /**
   * The claim envelope was the first thing sealed to this key; ADR 0107 link
   * requests are the second. The operation was always generic - only its name
   * was not - so this delegates rather than duplicating the key handling and
   * its zeroization.
   */
  public openSealedClaimPayload(sodium: HomeHostKeyStoreSodium, sealedClaimPayloadHex: string): string {
    return this.openSealedToKeyAgreement(
      sodium,
      sealedClaimPayloadHex,
      'Pico Home claim envelope',
    );
  }

  public openSealedToKeyAgreement(
    sodium: HomeHostKeyStoreSodium,
    sealedPayloadHex: string,
    label = 'Pico Home sealed payload',
  ): string {
    const keyAgreement = readStoredKeyPair(sodium, this.keyPath(HOST_KEY_AGREEMENT_KEY_FILE), 'home_host_key_agreement');
    const ciphertext = hostKeyHexToBytes(sealedPayloadHex, `${label} must be lowercase hex.`);
    const publicKey = hostKeyHexToBytes(keyAgreement.publicKeyHex);
    const privateKey = hostKeyHexToBytes(keyAgreement.privateKeyHex);

    try {
      const plaintext = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
      try {
        return new TextDecoder().decode(plaintext);
      } finally {
        sodium.memzero(plaintext);
      }
    } catch {
      throw new Error(`${label} could not be opened.`);
    } finally {
      sodium.memzero(publicKey);
      sodium.memzero(privateKey);
      sodium.memzero(ciphertext);
    }
  }

  /**
   * Sealing needs only the recipient's public key, so this holds no custody at
   * all - it lives here because the link intake's authority surface belongs in
   * one place, not because a host key is involved.
   */
  public sealToPublicKey(
    sodium: HomeHostKeyStoreSodium & {
      crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
    },
    recipientPublicKeyHex: string,
    plaintext: string,
  ): string {
    const recipient = hostKeyHexToBytes(recipientPublicKeyHex, 'Reply key must be lowercase hex.');
    const message = new TextEncoder().encode(plaintext);

    try {
      return bytesToHex(sodium.crypto_box_seal(message, recipient));
    } finally {
      sodium.memzero(message);
      sodium.memzero(recipient);
    }
  }

  /**
   * ADR 0115 U3. Creates (or returns) the staged successor key pair. Staging
   * is durable and idempotent: a ceremony may span a restart, and re-staging
   * would silently invalidate a possession signature already made over the
   * first staged keys.
   */
  public stageRotation(sodium: HomeHostKeyStoreSodium, now: Date = new Date()): HomeHostKeyPairSet {
    const existing = this.loadStagedRotation(sodium);
    if (existing !== undefined) {
      return existing;
    }
    mkdirSync(this.storePath, { recursive: true, mode: 0o700 });
    const createdAt = now.toISOString();
    const signing = createStoredKeyPair(sodium, 'home_host_signing', sodium.crypto_sign_keypair(), createdAt);
    const keyAgreement = createStoredKeyPair(sodium, 'home_host_key_agreement', sodium.crypto_box_keypair(), createdAt);
    writeStoredKeyPair(this.keyPath(STAGED_HOST_SIGNING_KEY_FILE), signing);
    writeStoredKeyPair(this.keyPath(STAGED_HOST_KEY_AGREEMENT_KEY_FILE), keyAgreement);
    return toKeyPairSet(signing, keyAgreement);
  }

  public loadStagedRotation(sodium: HomeHostKeyStoreSodium): HomeHostKeyPairSet | undefined {
    const signingPath = this.keyPath(STAGED_HOST_SIGNING_KEY_FILE);
    const agreementPath = this.keyPath(STAGED_HOST_KEY_AGREEMENT_KEY_FILE);
    if (!existsSync(signingPath) || !existsSync(agreementPath)) {
      return undefined;
    }
    return toKeyPairSet(
      readStoredKeyPair(sodium, signingPath, 'home_host_signing'),
      readStoredKeyPair(sodium, agreementPath, 'home_host_key_agreement'),
    );
  }

  public discardStagedRotation(): void {
    removePicoHomeFileDurably(this.keyPath(STAGED_HOST_SIGNING_KEY_FILE));
    removePicoHomeFileDurably(this.keyPath(STAGED_HOST_KEY_AGREEMENT_KEY_FILE));
  }

  public signWithStagedSigningKey(sodium: HomeHostKeyStoreSodium, signatureInput: Uint8Array): string {
    const signing = readStoredKeyPair(sodium, this.keyPath(STAGED_HOST_SIGNING_KEY_FILE), 'home_host_signing');
    const privateKey = hostKeyHexToBytes(signing.privateKeyHex);
    try {
      return bytesToHex(sodium.crypto_sign_detached(signatureInput, privateKey));
    } finally {
      sodium.memzero(privateKey);
    }
  }

  /**
   * Promotes the staged pair to active: one atomic rename per file, each
   * idempotent, and the retired private keys go with the replaced files -
   * nothing new is ever signed with them, and historical verification needs
   * only the public keys the continuity chain carries.
   */
  public promoteStagedRotation(): void {
    for (const [staged, active] of [
      [STAGED_HOST_SIGNING_KEY_FILE, HOST_SIGNING_KEY_FILE],
      [STAGED_HOST_KEY_AGREEMENT_KEY_FILE, HOST_KEY_AGREEMENT_KEY_FILE],
    ] as const) {
      if (existsSync(this.keyPath(staged))) {
        renameSync(this.keyPath(staged), this.keyPath(active));
      }
    }
  }

  /**
   * ADR 0115 U3. Completes a promotion the process died in the middle of.
   * The chain link is recorded before the swap, so after a crash the proven
   * head may name keys that are still staged - or half-promoted. Whatever
   * combination of active and staged files can form the head is renamed into
   * place; anything else is left untouched and reported false, and the
   * custody guard keeps the Home closed.
   */
  public completeInterruptedRotation(
    sodium: HomeHostKeyStoreSodium,
    head: { hostSigningKeyFingerprintHex: string; hostKeyAgreementKeyFingerprintHex: string },
  ): boolean {
    const roles = [
      {
        staged: STAGED_HOST_SIGNING_KEY_FILE,
        active: HOST_SIGNING_KEY_FILE,
        keyRole: 'home_host_signing' as const,
        expected: head.hostSigningKeyFingerprintHex,
      },
      {
        staged: STAGED_HOST_KEY_AGREEMENT_KEY_FILE,
        active: HOST_KEY_AGREEMENT_KEY_FILE,
        keyRole: 'home_host_key_agreement' as const,
        expected: head.hostKeyAgreementKeyFingerprintHex,
      },
    ];
    // Decide completely before renaming anything: a half-completable head
    // must not become more half-completed by the attempt.
    const pending: { from: string; to: string }[] = [];
    for (const role of roles) {
      const activePath = this.keyPath(role.active);
      if (existsSync(activePath)
        && readStoredKeyPair(sodium, activePath, role.keyRole).keyFingerprintHex === role.expected) {
        continue;
      }
      const stagedPath = this.keyPath(role.staged);
      if (existsSync(stagedPath)
        && readStoredKeyPair(sodium, stagedPath, role.keyRole).keyFingerprintHex === role.expected) {
        pending.push({ from: stagedPath, to: activePath });
        continue;
      }
      return false;
    }
    for (const rename of pending) {
      renameSync(rename.from, rename.to);
    }
    return true;
  }

  public signWithHostSigningKey(sodium: HomeHostKeyStoreSodium, signatureInput: Uint8Array): string {
    const signing = readStoredKeyPair(sodium, this.keyPath(HOST_SIGNING_KEY_FILE), 'home_host_signing');
    const privateKey = hostKeyHexToBytes(signing.privateKeyHex);

    try {
      return bytesToHex(sodium.crypto_sign_detached(signatureInput, privateKey));
    } finally {
      sodium.memzero(privateKey);
    }
  }

  private keyPath(name: string): string {
    return join(this.storePath, name);
  }
}

export function homeResetMarkerPath(databasePath: string): string {
  return join(dirname(databasePath), HOME_RESET_MARKER_FILENAME);
}

export function consumeHomeResetMarker(databasePath: string): boolean {
  const markerPath = homeResetMarkerPath(databasePath);

  if (!existsSync(markerPath)) {
    return false;
  }

  rmSync(markerPath, { force: true });

  return true;
}

export function recoveryAnchorReseedMarkerPath(databasePath: string): string {
  return join(dirname(databasePath), RECOVERY_ANCHOR_RESEED_MARKER_FILENAME);
}

export function consumeRecoveryAnchorReseedMarker(databasePath: string): boolean {
  const markerPath = recoveryAnchorReseedMarkerPath(databasePath);

  if (!existsSync(markerPath)) {
    return false;
  }

  rmSync(markerPath, { force: true });

  return true;
}

export function assertHomeHostKeyStoreSeparation(params: {
  homeHostKeyStorePath: string;
  keyStorePath: string;
  databasePath: string;
  backupDirectory: string;
}): void {
  const homeHostKeyStore = resolve(params.homeHostKeyStorePath);
  const keyStore = resolve(params.keyStorePath);
  const databaseDirectory = resolve(dirname(params.databasePath));
  const backupDirectory = resolve(params.backupDirectory);

  if (homeHostKeyStore === backupDirectory || isWithin(homeHostKeyStore, backupDirectory)) {
    throw new Error(
      'PICO_HOME_HOST_KEY_STORE_PATH must not be inside the SQLite backup directory: host identity keys and data must not share a backup artifact (ADR 0080 H5).',
    );
  }

  if (homeHostKeyStore === databaseDirectory) {
    throw new Error(
      'PICO_HOME_HOST_KEY_STORE_PATH must not be the database directory: host identity keys must not sit alongside the database file (ADR 0080 H5).',
    );
  }

  if (homeHostKeyStore === keyStore || isWithin(homeHostKeyStore, keyStore) || isWithin(keyStore, homeHostKeyStore)) {
    throw new Error(
      'PICO_HOME_HOST_KEY_STORE_PATH must be separate from PICO_KEY_STORE_PATH: host identity keys and memory domain keys have different blast radii (ADR 0080 H5).',
    );
  }
}

function createStoredKeyPair(
  sodium: HomeHostKeyStoreSodium,
  keyRole: PicoIdentityKeyRole,
  keypair: { publicKey: Uint8Array; privateKey: Uint8Array },
  createdAt: string,
): StoredHostKeyPair {
  assertExpectedKeyLengths(sodium, keyRole, keypair.publicKey, keypair.privateKey);
  const publicKeyHex = bytesToHex(keypair.publicKey);
  const keyFingerprintHex = fingerprintKeyRecord(sodium, keyRole, publicKeyHex);

  return {
    schema: HOST_KEY_SCHEMA,
    schemaVersion: 1,
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex,
    privateKeyHex: bytesToHex(keypair.privateKey),
    keyFingerprintHex,
    createdAt,
  };
}

function readStoredKeyPair(
  sodium: HomeHostKeyStoreSodium,
  path: string,
  expectedRole: PicoIdentityKeyRole,
): StoredHostKeyPair {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoredHostKeyPair>;

  if (
    parsed.schema !== HOST_KEY_SCHEMA
    || parsed.schemaVersion !== 1
    || parsed.suite !== picoIdentitySuite
    || parsed.keyRole !== expectedRole
    || typeof parsed.publicKeyHex !== 'string'
    || typeof parsed.privateKeyHex !== 'string'
    || typeof parsed.keyFingerprintHex !== 'string'
    || typeof parsed.createdAt !== 'string'
  ) {
    throw new Error('Pico Home host key file is invalid.');
  }

  const publicKey = hostKeyHexToBytes(parsed.publicKeyHex);
  const privateKey = hostKeyHexToBytes(parsed.privateKeyHex);
  assertExpectedKeyLengths(sodium, expectedRole, publicKey, privateKey);

  if (fingerprintKeyRecord(sodium, expectedRole, parsed.publicKeyHex) !== parsed.keyFingerprintHex) {
    throw new Error('Pico Home host key fingerprint does not match the stored public key.');
  }

  return parsed as StoredHostKeyPair;
}

/**
 * Finding B275. On the disk before the Home uses it. A pair written only to
 * the page cache could come back empty after a power cut, `load` refuses an
 * empty file as invalid, and the Home would not start - with a founding
 * record elsewhere that names exactly this key.
 */
function writeStoredKeyPair(path: string, keyPair: StoredHostKeyPair): void {
  createPicoHomeFileDurably(path, `${JSON.stringify(keyPair, null, 2)}\n`);
}

function toKeyPairSet(signing: StoredHostKeyPair, keyAgreement: StoredHostKeyPair): HomeHostKeyPairSet {
  return {
    publicBundle: {
      suite: picoIdentitySuite,
      signingPublicKeyHex: signing.publicKeyHex,
      signingKeyFingerprintHex: signing.keyFingerprintHex,
      keyAgreementPublicKeyHex: keyAgreement.publicKeyHex,
      keyAgreementKeyFingerprintHex: keyAgreement.keyFingerprintHex,
    },
    createdAt: signing.createdAt < keyAgreement.createdAt ? signing.createdAt : keyAgreement.createdAt,
  };
}

function fingerprintKeyRecord(sodium: HomeHostKeyStoreSodium, keyRole: PicoIdentityKeyRole, publicKeyHex: string): string {
  const signatureInput = buildPicoIdentityKeyRecordSignatureInput({
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex,
  });

  return bytesToHex(sodium.crypto_generichash(32, signatureInput, null));
}

function assertExpectedKeyLengths(
  sodium: HomeHostKeyStoreSodium,
  keyRole: PicoIdentityKeyRole,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
): void {
  const expectedPublic = keyRole === 'home_host_signing'
    ? sodium.crypto_sign_PUBLICKEYBYTES
    : sodium.crypto_box_PUBLICKEYBYTES;
  const expectedPrivate = keyRole === 'home_host_signing'
    ? sodium.crypto_sign_SECRETKEYBYTES
    : sodium.crypto_box_SECRETKEYBYTES;

  if (publicKey.length !== expectedPublic || privateKey.length !== expectedPrivate) {
    throw new Error('Pico Home host key length is invalid.');
  }
}

function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
