import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  buildPicoIdentityKeyRecordSignatureInput,
  picoIdentitySuite,
  type PicoIdentityKeyRole,
} from '@pico/protocol';
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

export const HOME_RESET_MARKER_FILENAME = 'home-reset';

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
        rmSync(this.keyPath(name), { force: true });
        removedFiles += 1;
      }
    }

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
    const ciphertext = hexToBytes(sealedPayloadHex, `${label} must be lowercase hex.`);
    const publicKey = hexToBytes(keyAgreement.publicKeyHex);
    const privateKey = hexToBytes(keyAgreement.privateKeyHex);

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
    const recipient = hexToBytes(recipientPublicKeyHex, 'Reply key must be lowercase hex.');
    const message = new TextEncoder().encode(plaintext);

    try {
      return bytesToHex(sodium.crypto_box_seal(message, recipient));
    } finally {
      sodium.memzero(message);
      sodium.memzero(recipient);
    }
  }

  public signWithHostSigningKey(sodium: HomeHostKeyStoreSodium, signatureInput: Uint8Array): string {
    const signing = readStoredKeyPair(sodium, this.keyPath(HOST_SIGNING_KEY_FILE), 'home_host_signing');
    const privateKey = hexToBytes(signing.privateKeyHex);

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

  const publicKey = hexToBytes(parsed.publicKeyHex);
  const privateKey = hexToBytes(parsed.privateKeyHex);
  assertExpectedKeyLengths(sodium, expectedRole, publicKey, privateKey);

  if (fingerprintKeyRecord(sodium, expectedRole, parsed.publicKeyHex) !== parsed.keyFingerprintHex) {
    throw new Error('Pico Home host key fingerprint does not match the stored public key.');
  }

  return parsed as StoredHostKeyPair;
}

function writeStoredKeyPair(path: string, keyPair: StoredHostKeyPair): void {
  writeFileSync(path, `${JSON.stringify(keyPair, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
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

function hexToBytes(hex: string, errorMessage = 'Pico Home host key material must be lowercase hex.'): Uint8Array {
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) {
    throw new Error(errorMessage);
  }

  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}
