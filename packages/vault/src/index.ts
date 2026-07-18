import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoVaultKeyfileHeaderAad,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  picoVaultAeadAlgorithms,
  picoVaultArgon2idModerateParams,
  picoVaultKdfAlgorithms,
  picoVaultKdfProfiles,
  picoVaultKeyfileFormat,
  picoVaultPersonKeyRoles,
} from '@pico/protocol';
import type {
  PicoVaultAeadAlgorithm,
  PicoVaultKdfAlgorithm,
  PicoVaultKdfProfile,
  PicoVaultKeyfileHeaderAadInput,
  PicoVaultPersonKeyRole,
} from '@pico/protocol';

export const picoVaultKeyfileEnvelopeSchema = 'pico.vault.keyfile.encrypted.v1' as const;
export const picoVaultPrivateKeyPayloadLabel = 'pico.vault.private-key-payload.v1' as const;

export interface PicoVaultEncryptedKeyfileV1 {
  schema: typeof picoVaultKeyfileEnvelopeSchema;
  schemaVersion: 1;
  format: typeof picoVaultKeyfileFormat;
  header: PicoVaultKeyfileHeaderAadInput;
  ciphertextHex: string;
}

export interface CreatePicoVaultKeyfileInput {
  keyRole: PicoVaultPersonKeyRole;
  passphrase: string;
}

export interface CreatePicoVaultKeyfileResult {
  keyfile: PicoVaultEncryptedKeyfileV1;
  publicKeyHex: string;
  keyFingerprintHex: string;
}

export interface OpenPicoVaultKeyfileInput {
  keyfile: PicoVaultEncryptedKeyfileV1 | string;
  passphrase: string;
  autoLockAfterMs?: number;
  nowMs?: number;
}

export interface PicoVaultSessionMetadata {
  suite: typeof picoIdentitySuite;
  keyRole: PicoVaultPersonKeyRole;
  publicKeyHex: string;
  keyFingerprintHex: string;
}

export interface PicoVaultSessionUseOptions {
  nowMs?: number;
}

export interface PicoVaultPathSeparationInput {
  vaultKeyfilePath: string;
  foundationDataPath: string;
  foundationBackupPath: string;
}

// Minimal shape of the ready libsodium-wrappers-sumo module the Vault runtime uses.
export interface VaultSodium {
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  crypto_box_PUBLICKEYBYTES: number;
  crypto_box_SECRETKEYBYTES: number;
  crypto_pwhash_ALG_ARGON2ID13: number;
  crypto_pwhash_SALTBYTES: number;
  crypto_sign_PUBLICKEYBYTES: number;
  crypto_sign_SECRETKEYBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: Uint8Array,
    additionalData: Uint8Array,
    secretNonce: null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_decrypt(
    secretNonce: null,
    ciphertext: Uint8Array,
    additionalData: Uint8Array,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_box_seal_open(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array;
  crypto_generichash(hashLength: number, message: Uint8Array | string, key: Uint8Array | string | null): Uint8Array;
  crypto_pwhash(
    keyLength: number,
    password: Uint8Array | string,
    salt: Uint8Array,
    opsLimit: number,
    memLimit: number,
    algorithm: number,
  ): Uint8Array;
  crypto_sign_detached(message: Uint8Array | string, privateKey: Uint8Array): Uint8Array;
  crypto_sign_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  memzero(bytes: Uint8Array): void;
  randombytes_buf(length: number): Uint8Array;
}

interface PrivateKeyPayload {
  suite: typeof picoIdentitySuite;
  keyRole: PicoVaultPersonKeyRole;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

const recognizedSignatureInputLabels = new Set<string>(Object.values(picoIdentitySignatureInputLabels));
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const canonicalHexPattern = /^[0-9a-f]+$/;

export class PicoVaultSession {
  readonly #sodium: VaultSodium;

  readonly #sourceKeyfile: PicoVaultEncryptedKeyfileV1;

  readonly #metadata: PicoVaultSessionMetadata;

  readonly #privateKey: Uint8Array;

  readonly #autoLockAfterMs: number | undefined;

  #locked = false;

  #lastUsedAtMs: number;

  public constructor(params: {
    sodium: VaultSodium;
    sourceKeyfile: PicoVaultEncryptedKeyfileV1;
    payload: PrivateKeyPayload;
    autoLockAfterMs?: number;
    nowMs?: number;
  }) {
    assertOptionalDurationMs(params.autoLockAfterMs, 'invalid_auto_lock_after_ms');
    assertOptionalTimestampMs(params.nowMs);

    this.#sodium = params.sodium;
    this.#sourceKeyfile = cloneKeyfile(params.sourceKeyfile);
    this.#metadata = {
      suite: params.payload.suite,
      keyRole: params.payload.keyRole,
      publicKeyHex: bytesToHex(params.payload.publicKey),
      keyFingerprintHex: keyRecordFingerprintHex(params.sodium, params.payload.keyRole, params.payload.publicKey),
    };
    this.#privateKey = new Uint8Array(params.payload.privateKey);
    this.#autoLockAfterMs = params.autoLockAfterMs;
    this.#lastUsedAtMs = params.nowMs ?? Date.now();
  }

  public metadata(): PicoVaultSessionMetadata {
    return { ...this.#metadata };
  }

  public isLocked(options: PicoVaultSessionUseOptions = {}): boolean {
    assertOptionalTimestampMs(options.nowMs);
    this.#lockIfIdle(options.nowMs ?? Date.now());
    return this.#locked;
  }

  public lock(): void {
    if (!this.#locked) {
      this.#sodium.memzero(this.#privateKey);
      this.#locked = true;
    }
  }

  public sign(signatureInput: Uint8Array, options: PicoVaultSessionUseOptions = {}): Uint8Array {
    assertOptionalTimestampMs(options.nowMs);
    this.#assertUnlocked(options.nowMs ?? Date.now());
    if (this.#metadata.keyRole === 'device_key_agreement') {
      throw new Error('key_role_cannot_sign');
    }

    const label = firstCanonicalElementAscii(signatureInput);
    if (!recognizedSignatureInputLabels.has(label)) {
      throw new Error('unknown_signature_input_label');
    }

    this.#markUsed(options.nowMs ?? Date.now());
    return this.#sodium.crypto_sign_detached(signatureInput, this.#privateKey);
  }

  public unwrapSealedBox(ciphertext: Uint8Array, options: PicoVaultSessionUseOptions = {}): Uint8Array {
    assertOptionalTimestampMs(options.nowMs);
    this.#assertUnlocked(options.nowMs ?? Date.now());
    if (this.#metadata.keyRole !== 'device_key_agreement') {
      throw new Error('key_role_cannot_unwrap');
    }

    this.#markUsed(options.nowMs ?? Date.now());
    return this.#sodium.crypto_box_seal_open(
      ciphertext,
      hexToBytes(this.#metadata.publicKeyHex),
      this.#privateKey,
    );
  }

  public exportEncryptedKeyfile(): PicoVaultEncryptedKeyfileV1 {
    return cloneKeyfile(this.#sourceKeyfile);
  }

  public serializeEncryptedKeyfile(): string {
    return serializePicoVaultKeyfile(this.#sourceKeyfile);
  }

  #assertUnlocked(nowMs: number): void {
    this.#lockIfIdle(nowMs);
    if (this.#locked) {
      throw new Error('vault_locked');
    }
  }

  #lockIfIdle(nowMs: number): void {
    if (this.#locked || this.#autoLockAfterMs === undefined) {
      return;
    }
    if (nowMs - this.#lastUsedAtMs > this.#autoLockAfterMs) {
      this.lock();
    }
  }

  #markUsed(nowMs: number): void {
    this.#lastUsedAtMs = nowMs;
  }
}

export function createPicoVaultKeyfile(
  sodium: VaultSodium,
  input: CreatePicoVaultKeyfileInput,
): CreatePicoVaultKeyfileResult {
  assertStringMember(input.keyRole, picoVaultPersonKeyRoles, 'invalid_vault_key_role');
  assertPassphrase(input.passphrase);
  assertSodiumConstants(sodium);

  const keypair = generateKeypairForRole(sodium, input.keyRole);
  const publicKey = new Uint8Array(keypair.publicKey);
  const privateKey = new Uint8Array(keypair.privateKey);
  const keyFingerprintHex = keyRecordFingerprintHex(sodium, input.keyRole, publicKey);
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const header: PicoVaultKeyfileHeaderAadInput = {
    format: picoVaultKeyfileFormat,
    suite: picoIdentitySuite,
    keyRole: input.keyRole,
    keyFingerprintHex,
    kdfAlgorithm: picoVaultKdfAlgorithms[0],
    kdfProfile: picoVaultKdfProfiles[0],
    kdfOpsLimit: picoVaultArgon2idModerateParams.opsLimit,
    kdfMemLimitBytes: picoVaultArgon2idModerateParams.memLimitBytes,
    kdfSaltHex: bytesToHex(salt),
    aeadAlgorithm: picoVaultAeadAlgorithms[0],
    aeadNonceHex: bytesToHex(nonce),
  };
  const fileKey = deriveFileKey(sodium, input.passphrase, header);
  const payload = buildPrivateKeyPayload({
    suite: picoIdentitySuite,
    keyRole: input.keyRole,
    publicKey,
    privateKey,
  });
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    payload,
    buildPicoVaultKeyfileHeaderAad(header),
    null,
    nonce,
    fileKey,
  );

  sodium.memzero(fileKey);
  sodium.memzero(payload);
  sodium.memzero(privateKey);

  return {
    keyfile: {
      schema: picoVaultKeyfileEnvelopeSchema,
      schemaVersion: 1,
      format: picoVaultKeyfileFormat,
      header,
      ciphertextHex: bytesToHex(ciphertext),
    },
    publicKeyHex: bytesToHex(publicKey),
    keyFingerprintHex,
  };
}

export function openPicoVaultKeyfile(
  sodium: VaultSodium,
  input: OpenPicoVaultKeyfileInput,
): PicoVaultSession {
  const keyfile = typeof input.keyfile === 'string'
    ? parsePicoVaultKeyfile(input.keyfile)
    : cloneKeyfile(input.keyfile);
  assertPassphrase(input.passphrase);
  assertOptionalDurationMs(input.autoLockAfterMs, 'invalid_auto_lock_after_ms');
  assertOptionalTimestampMs(input.nowMs);
  assertSodiumConstants(sodium);

  const fileKey = deriveFileKey(sodium, input.passphrase, keyfile.header);
  try {
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      hexToBytes(keyfile.ciphertextHex),
      buildPicoVaultKeyfileHeaderAad(keyfile.header),
      hexToBytes(keyfile.header.aeadNonceHex),
      fileKey,
    );
    const payload = parsePrivateKeyPayload(plaintext);
    validatePayloadAgainstHeader(sodium, payload, keyfile.header);

    try {
      return new PicoVaultSession({
        sodium,
        sourceKeyfile: keyfile,
        payload,
        autoLockAfterMs: input.autoLockAfterMs,
        nowMs: input.nowMs,
      });
    } finally {
      sodium.memzero(payload.privateKey);
      sodium.memzero(plaintext);
    }
  } finally {
    sodium.memzero(fileKey);
  }
}

export function serializePicoVaultKeyfile(keyfile: PicoVaultEncryptedKeyfileV1): string {
  return `${JSON.stringify(cloneKeyfile(keyfile), null, 2)}\n`;
}

export function parsePicoVaultKeyfile(serialized: string): PicoVaultEncryptedKeyfileV1 {
  const parsed: unknown = JSON.parse(serialized);
  if (!isRecord(parsed)) {
    throw new Error('invalid_keyfile_envelope');
  }
  assertExactKeys(parsed, ['schema', 'schemaVersion', 'format', 'header', 'ciphertextHex']);
  if (parsed.schema !== picoVaultKeyfileEnvelopeSchema || parsed.schemaVersion !== 1) {
    throw new Error('invalid_keyfile_envelope');
  }
  if (parsed.format !== picoVaultKeyfileFormat) {
    throw new Error('wrong_keyfile_label');
  }
  if (!isRecord(parsed.header)) {
    throw new Error('invalid_keyfile_header');
  }
  const header = parseHeader(parsed.header);
  buildPicoVaultKeyfileHeaderAad(header);
  const ciphertextHex = stringField(parsed, 'ciphertextHex');
  hexToBytes(ciphertextHex);

  return {
    schema: picoVaultKeyfileEnvelopeSchema,
    schemaVersion: 1,
    format: picoVaultKeyfileFormat,
    header,
    ciphertextHex,
  };
}

export function writePicoVaultKeyfile(path: string, keyfile: PicoVaultEncryptedKeyfileV1): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, serializePicoVaultKeyfile(keyfile), { mode: 0o600, flag: 'wx' });
}

export function readPicoVaultKeyfile(path: string): PicoVaultEncryptedKeyfileV1 {
  return parsePicoVaultKeyfile(readFileSync(path, 'utf8'));
}

export function assertPicoVaultKeyfileMode(path: string): void {
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) {
    throw new Error('vault_keyfile_permissions');
  }
}

export function assertVaultCustodyPathSeparation(input: PicoVaultPathSeparationInput): void {
  const vaultPath = resolve(input.vaultKeyfilePath);
  for (const forbidden of [input.foundationDataPath, input.foundationBackupPath]) {
    const forbiddenPath = resolve(forbidden);
    if (vaultPath === forbiddenPath || isWithin(vaultPath, forbiddenPath)) {
      throw new Error('vault_path_inside_foundation_scope');
    }
  }
}

function generateKeypairForRole(
  sodium: VaultSodium,
  keyRole: PicoVaultPersonKeyRole,
): { publicKey: Uint8Array; privateKey: Uint8Array } {
  if (keyRole === 'device_key_agreement') {
    return sodium.crypto_box_keypair();
  }

  return sodium.crypto_sign_keypair();
}

function deriveFileKey(
  sodium: VaultSodium,
  passphrase: string,
  header: PicoVaultKeyfileHeaderAadInput,
): Uint8Array {
  if (header.kdfAlgorithm !== 'argon2id' || header.kdfProfile !== 'moderate') {
    throw new Error('invalid_kdf_profile');
  }

  return sodium.crypto_pwhash(
    sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES,
    passphrase,
    hexToBytes(header.kdfSaltHex),
    header.kdfOpsLimit,
    header.kdfMemLimitBytes,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function keyRecordFingerprintHex(
  sodium: VaultSodium,
  keyRole: PicoVaultPersonKeyRole,
  publicKey: Uint8Array,
): string {
  const keyRecord = buildPicoIdentityKeyRecordSignatureInput({
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex: bytesToHex(publicKey),
  });
  return bytesToHex(sodium.crypto_generichash(32, keyRecord, null));
}

function buildPrivateKeyPayload(payload: PrivateKeyPayload): Uint8Array {
  return concatElements([
    asciiBytes(picoVaultPrivateKeyPayloadLabel),
    asciiBytes(payload.suite),
    asciiBytes(payload.keyRole),
    payload.publicKey,
    payload.privateKey,
  ]);
}

function parsePrivateKeyPayload(payload: Uint8Array): PrivateKeyPayload {
  const reader = new ElementReader(payload);
  const label = reader.readAscii();
  if (label !== picoVaultPrivateKeyPayloadLabel) {
    throw new Error('invalid_private_key_payload');
  }

  const suite = reader.readAscii();
  if (suite !== picoIdentitySuite) {
    throw new Error('invalid_private_key_payload');
  }
  const keyRole = reader.readAscii();
  assertStringMember(keyRole, picoVaultPersonKeyRoles, 'invalid_private_key_payload');
  const publicKey = reader.readBytes();
  const privateKey = reader.readBytes();
  reader.assertDone();

  return {
    suite,
    keyRole,
    publicKey,
    privateKey,
  };
}

function validatePayloadAgainstHeader(
  sodium: VaultSodium,
  payload: PrivateKeyPayload,
  header: PicoVaultKeyfileHeaderAadInput,
): void {
  if (payload.suite !== header.suite || payload.keyRole !== header.keyRole) {
    throw new Error('payload_header_mismatch');
  }
  const expectedPublicLength = payload.keyRole === 'device_key_agreement'
    ? sodium.crypto_box_PUBLICKEYBYTES
    : sodium.crypto_sign_PUBLICKEYBYTES;
  const expectedPrivateLength = payload.keyRole === 'device_key_agreement'
    ? sodium.crypto_box_SECRETKEYBYTES
    : sodium.crypto_sign_SECRETKEYBYTES;

  if (payload.publicKey.byteLength !== expectedPublicLength || payload.privateKey.byteLength !== expectedPrivateLength) {
    throw new Error('payload_header_mismatch');
  }
  if (keyRecordFingerprintHex(sodium, payload.keyRole, payload.publicKey) !== header.keyFingerprintHex) {
    throw new Error('payload_header_mismatch');
  }
}

function firstCanonicalElementAscii(input: Uint8Array): string {
  if (input.byteLength < 4) {
    throw new Error('invalid_signature_input');
  }
  const length = new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(0, false);
  if (length === 0 || input.byteLength < 4 + length) {
    throw new Error('invalid_signature_input');
  }

  return textDecoder.decode(input.subarray(4, 4 + length));
}

function parseHeader(source: Record<string, unknown>): PicoVaultKeyfileHeaderAadInput {
  assertExactKeys(source, [
    'format',
    'suite',
    'keyRole',
    'keyFingerprintHex',
    'kdfAlgorithm',
    'kdfProfile',
    'kdfOpsLimit',
    'kdfMemLimitBytes',
    'kdfSaltHex',
    'aeadAlgorithm',
    'aeadNonceHex',
  ]);

  return {
    format: stringField(source, 'format'),
    suite: stringField(source, 'suite'),
    keyRole: stringField(source, 'keyRole') as PicoVaultPersonKeyRole,
    keyFingerprintHex: stringField(source, 'keyFingerprintHex'),
    kdfAlgorithm: stringField(source, 'kdfAlgorithm') as PicoVaultKdfAlgorithm,
    kdfProfile: stringField(source, 'kdfProfile') as PicoVaultKdfProfile,
    kdfOpsLimit: numberField(source, 'kdfOpsLimit'),
    kdfMemLimitBytes: numberField(source, 'kdfMemLimitBytes'),
    kdfSaltHex: stringField(source, 'kdfSaltHex'),
    aeadAlgorithm: stringField(source, 'aeadAlgorithm') as PicoVaultAeadAlgorithm,
    aeadNonceHex: stringField(source, 'aeadNonceHex'),
  };
}

function assertSodiumConstants(sodium: VaultSodium): void {
  if (sodium.crypto_pwhash_SALTBYTES !== 16) {
    throw new Error('unsupported_sodium_constants');
  }
  if (sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES !== 32) {
    throw new Error('unsupported_sodium_constants');
  }
  if (sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES !== 24) {
    throw new Error('unsupported_sodium_constants');
  }
  if (sodium.crypto_sign_PUBLICKEYBYTES !== 32 || sodium.crypto_box_PUBLICKEYBYTES !== 32) {
    throw new Error('unsupported_sodium_constants');
  }
}

function assertPassphrase(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    throw new Error('invalid_passphrase');
  }
}

function assertOptionalDurationMs(value: number | undefined, reason: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(reason);
  }
}

function assertOptionalTimestampMs(value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error('invalid_now_ms');
  }
}

function concatElements(elements: readonly Uint8Array[]): Uint8Array {
  const parts = elements.map((element) => {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, element.byteLength, false);
    return [length, element] as const;
  }).flat();
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function asciiBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !canonicalHexPattern.test(hex)) {
    throw new Error('invalid_hex');
  }

  return Buffer.from(hex, 'hex');
}

function cloneKeyfile(keyfile: PicoVaultEncryptedKeyfileV1): PicoVaultEncryptedKeyfileV1 {
  return parsePicoVaultKeyfile(JSON.stringify(keyfile));
}

function assertExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): void {
  const expected = new Set(expectedKeys);
  const unexpected = Object.keys(record).find((key) => !expected.has(key));
  if (unexpected !== undefined) {
    throw new Error('unexpected_field');
  }
  const missing = expectedKeys.find((key) => !(key in record));
  if (missing !== undefined) {
    throw new Error('missing_field');
  }
}

function assertStringMember<const TValues extends readonly string[]>(
  value: string,
  allowedValues: TValues,
  reason: string,
): asserts value is TValues[number] {
  if (!allowedValues.includes(value)) {
    throw new Error(reason);
  }
}

function stringField(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string.`);
  }
  return value;
}

function numberField(source: Record<string, unknown>, field: string): number {
  const value = source[field];
  if (typeof value !== 'number') {
    throw new Error(`${field} must be a number.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isWithin(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

class ElementReader {
  private offset = 0;

  public constructor(private readonly input: Uint8Array) {}

  public readAscii(): string {
    return textDecoder.decode(this.readBytes());
  }

  public readBytes(): Uint8Array {
    if (this.input.byteLength < this.offset + 4) {
      throw new Error('invalid_private_key_payload');
    }
    const length = new DataView(
      this.input.buffer,
      this.input.byteOffset + this.offset,
      this.input.byteLength - this.offset,
    ).getUint32(0, false);
    this.offset += 4;
    if (this.input.byteLength < this.offset + length) {
      throw new Error('invalid_private_key_payload');
    }
    const value = new Uint8Array(this.input.slice(this.offset, this.offset + length));
    this.offset += length;
    return value;
  }

  public assertDone(): void {
    if (this.offset !== this.input.byteLength) {
      throw new Error('invalid_private_key_payload');
    }
  }
}
