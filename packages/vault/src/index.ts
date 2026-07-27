import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  buildPicoMemoryContentAd,
  buildPicoMemoryDekWrapAd,
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  buildPicoShareWrapPayload,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoVaultKeyfileHeaderAad,
  picoMemoryContentSuite,
  picoReaderCustodyCanonicalLabels,
  picoReaderCustodyDomainRecordSchema,
  picoReaderCustodyItemRecordSchema,
  picoReaderCustodyWriterGrantLifecycleRecordSchema,
  picoReaderCustodyWriterGrantRecordSchema,
  picoHomeSignatureInputLabels,
  picoIdentityReaderKeyFreshnessSignatureInputLabel,
  picoIdentitySignatureInputLabels,
  picoShareCanonicalLabels,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
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
  PicoIdentityKeyRecordSignatureInput,
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyDomainSignatureInput,
  PicoReaderCustodyItemRecord,
  PicoReaderCustodyItemSignatureInput,
  PicoReaderCustodyWriterGrantLifecycleRecord,
  PicoReaderCustodyWriterGrantLifecycleSignatureInput,
  PicoReaderCustodyWriterGrantRecord,
  PicoReaderCustodyWriterGrantSignatureInput,
  PicoShareEnvelopeRecord,
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

export interface CreatePicoReaderCustodyDomainInput {
  ownerIdentitySession: PicoVaultSession;
  ownerReaderKeyRecord: PicoIdentityKeyRecordSignatureInput;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  kekVersion?: number;
  authorizedAt: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface CreatePicoReaderCustodyWriterGrantInput {
  ownerIdentitySession: PicoVaultSession;
  domainRecord: PicoReaderCustodyDomainRecord;
  writerDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  writerGrantId: string;
  writerIdentityKeyFingerprintHex: string;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface RevokePicoReaderCustodyWriterGrantInput {
  ownerIdentitySession: PicoVaultSession;
  domainRecord: PicoReaderCustodyDomainRecord;
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord;
  lifecycleId: string;
  reasonCategory: PicoReaderCustodyWriterGrantLifecycleSignatureInput['reasonCategory'];
  changedAt: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface EncryptPicoReaderCustodyItemInput {
  readerKeyAgreementSession: PicoVaultSession;
  writerSigningSession: PicoVaultSession;
  domainRecord: PicoReaderCustodyDomainRecord;
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord;
  packageId: string;
  memoryItemId: string;
  contentType: string;
  plaintext: string;
  createdAt: string;
  receivedAt?: string;
}

export interface DecryptPicoReaderCustodyItemInput {
  readerKeyAgreementSession: PicoVaultSession;
  domainRecord: PicoReaderCustodyDomainRecord;
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord;
  itemRecord: PicoReaderCustodyItemRecord;
}

// Minimal shape of the ready libsodium-wrappers-sumo module the Vault runtime uses.
export interface VaultSodium {
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  crypto_box_PUBLICKEYBYTES: number;
  crypto_box_SECRETKEYBYTES: number;
  crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
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
  crypto_sign_verify_detached(
    signature: Uint8Array,
    message: Uint8Array | string,
    publicKey: Uint8Array,
  ): boolean;
  memzero(bytes: Uint8Array): void;
  randombytes_buf(length: number): Uint8Array;
}

interface PrivateKeyPayload {
  suite: typeof picoIdentitySuite;
  keyRole: PicoVaultPersonKeyRole;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * What each person-role key may be asked to sign (ADR 0081 V4). Keyed by role
 * rather than one flat set, because "never signs blind" and least privilege are
 * the same rule at this boundary: an identity root is the only key the ADR 0080
 * ceremony wants, so it is the only one that can produce those bytes.
 *
 * Host families (`claim-response`, `continuity`) appear nowhere on purpose -
 * host-role keys are not Vault keys at all (`picoVaultPersonKeyRoles`), so
 * those labels stay unrepresentable rather than merely unlisted. The membership
 * families wait for the runtime that issues them; listing them now would be a
 * guess about who signs which half.
 */
const signableLabelsByKeyRole: Record<PicoVaultPersonKeyRole, ReadonlySet<string>> = {
  pico_identity: new Set<string>([
    ...Object.values(picoIdentitySignatureInputLabels),
    picoHomeSignatureInputLabels.claim,
    picoHomeSignatureInputLabels.founding,
    picoIdentityReaderKeyFreshnessSignatureInputLabel,
    picoShareCanonicalLabels.envelope,
    picoReaderCustodyCanonicalLabels.domain,
    picoReaderCustodyCanonicalLabels.writerGrant,
    picoReaderCustodyCanonicalLabels.writerGrantLifecycle,
  ]),
  device_signing: new Set<string>([
    ...Object.values(picoIdentitySignatureInputLabels),
    picoReaderCustodyCanonicalLabels.item,
  ]),
  device_key_agreement: new Set<string>(),
};
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
    if (!signableLabelsByKeyRole[this.#metadata.keyRole].has(label)) {
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

/**
 * Creates a reader-custody domain without ever returning or persisting its raw
 * KEK. The fresh KEK is immediately sealed to the owner's device
 * key-agreement key. The owner identity root separately signs the domain
 * authority and the existing share-envelope bytes.
 */
export function createPicoReaderCustodyDomain(
  sodium: VaultSodium,
  input: CreatePicoReaderCustodyDomainInput,
): PicoReaderCustodyDomainRecord {
  assertSodiumConstants(sodium);
  const ownerMetadata = input.ownerIdentitySession.metadata();
  if (ownerMetadata.keyRole !== 'pico_identity') {
    throw new Error('owner_identity_key_required');
  }
  assertKeyRecordMatchesMetadata(sodium, input.ownerReaderKeyRecord, 'device_key_agreement');

  const kekVersion = input.kekVersion ?? 1;
  const domain: PicoReaderCustodyDomainSignatureInput = {
    suite: picoMemoryContentSuite,
    domainAuthorityId: input.domainAuthorityId,
    homeId: input.homeId,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    domainId: input.domainId,
    custodyClass: 'reader_custody',
    ownerIdentityKeyFingerprintHex: ownerMetadata.keyFingerprintHex,
    ownerReaderKeyFingerprintHex: keyRecordFingerprintHex(
      sodium,
      'device_key_agreement',
      hexToBytes(input.ownerReaderKeyRecord.publicKeyHex),
    ),
    kekVersion,
    authorizedAt: input.authorizedAt,
    lifecycleOrder: input.lifecycleOrder,
  };
  const domainSignatureInput = buildPicoReaderCustodyDomainSignatureInput(domain);
  const ownerSignatureHex = bytesToHex(input.ownerIdentitySession.sign(domainSignatureInput));
  const kek = sodium.randombytes_buf(32);
  const wrapPayload = buildPicoShareWrapPayload({
    suite: picoShareSuite,
    domainId: domain.domainId,
    kekVersion,
    readerKeyFingerprintHex: domain.ownerReaderKeyFingerprintHex,
    kekHex: bytesToHex(kek),
  });

  try {
    const sealedWrap = sodium.crypto_box_seal(
      wrapPayload,
      hexToBytes(input.ownerReaderKeyRecord.publicKeyHex),
    );
    const envelope = {
      suite: picoShareSuite,
      grantId: domain.domainAuthorityId,
      domainId: domain.domainId,
      kekVersion,
      hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
      issuerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
      readerKeyFingerprintHex: domain.ownerReaderKeyFingerprintHex,
      wrapDigestHex: bytesToHex(sodium.crypto_generichash(32, sealedWrap, null)),
      grantedAt: domain.authorizedAt,
    };
    const ownerEnvelope: PicoShareEnvelopeRecord = {
      schema: picoShareEnvelopeRecordSchema,
      envelope,
      sealedWrapHex: bytesToHex(sealedWrap),
      issuerIdentityKeyRecord: keyRecordFromMetadata(ownerMetadata),
      issuerSignatureHex: bytesToHex(
        input.ownerIdentitySession.sign(buildPicoShareEnvelopeSignatureInput(envelope)),
      ),
      createdAt: input.receivedAt ?? input.authorizedAt,
    };

    return {
      schema: picoReaderCustodyDomainRecordSchema,
      domain,
      ownerIdentityKeyRecord: keyRecordFromMetadata(ownerMetadata),
      ownerReaderKeyRecord: { ...input.ownerReaderKeyRecord },
      ownerEnvelope,
      ownerSignatureHex,
      receivedAt: input.receivedAt ?? input.authorizedAt,
    };
  } finally {
    sodium.memzero(kek);
    sodium.memzero(wrapPayload);
  }
}

export function createPicoReaderCustodyWriterGrant(
  sodium: VaultSodium,
  input: CreatePicoReaderCustodyWriterGrantInput,
): PicoReaderCustodyWriterGrantRecord {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  const ownerMetadata = input.ownerIdentitySession.metadata();
  if (ownerMetadata.keyRole !== 'pico_identity'
    || ownerMetadata.keyFingerprintHex
      !== input.domainRecord.domain.ownerIdentityKeyFingerprintHex) {
    throw new Error('owner_identity_key_required');
  }
  assertKeyRecordMatchesMetadata(
    sodium,
    input.writerDeviceSigningKeyRecord,
    'device_signing',
  );
  const domain = input.domainRecord.domain;
  const grant: PicoReaderCustodyWriterGrantSignatureInput = {
    suite: picoMemoryContentSuite,
    writerGrantId: input.writerGrantId,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    kekVersion: domain.kekVersion,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    writerIdentityKeyFingerprintHex: input.writerIdentityKeyFingerprintHex,
    writerDeviceSigningKeyFingerprintHex: keyRecordFingerprintHex(
      sodium,
      'device_signing',
      hexToBytes(input.writerDeviceSigningKeyRecord.publicKeyHex),
    ),
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: input.lifecycleOrder,
  };

  return {
    schema: picoReaderCustodyWriterGrantRecordSchema,
    grant,
    ownerIdentityKeyRecord: keyRecordFromMetadata(ownerMetadata),
    writerDeviceSigningKeyRecord: { ...input.writerDeviceSigningKeyRecord },
    ownerSignatureHex: bytesToHex(
      input.ownerIdentitySession.sign(
        buildPicoReaderCustodyWriterGrantSignatureInput(grant),
      ),
    ),
    receivedAt: input.receivedAt ?? input.validFrom,
  };
}

export function revokePicoReaderCustodyWriterGrant(
  sodium: VaultSodium,
  input: RevokePicoReaderCustodyWriterGrantInput,
): PicoReaderCustodyWriterGrantLifecycleRecord {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  assertPicoReaderCustodyWriterGrantRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
  );
  const ownerMetadata = input.ownerIdentitySession.metadata();
  if (ownerMetadata.keyRole !== 'pico_identity'
    || ownerMetadata.keyFingerprintHex
      !== input.domainRecord.domain.ownerIdentityKeyFingerprintHex) {
    throw new Error('owner_identity_key_required');
  }
  const domain = input.domainRecord.domain;
  const grant = input.writerGrantRecord.grant;
  const lifecycle: PicoReaderCustodyWriterGrantLifecycleSignatureInput = {
    suite: picoMemoryContentSuite,
    lifecycleId: input.lifecycleId,
    writerGrantId: grant.writerGrantId,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    writerIdentityKeyFingerprintHex: grant.writerIdentityKeyFingerprintHex,
    writerDeviceSigningKeyFingerprintHex:
      grant.writerDeviceSigningKeyFingerprintHex,
    status: 'revoked',
    reasonCategory: input.reasonCategory,
    changedAt: input.changedAt,
    lifecycleOrder: input.lifecycleOrder,
  };

  return {
    schema: picoReaderCustodyWriterGrantLifecycleRecordSchema,
    lifecycle,
    ownerIdentityKeyRecord: keyRecordFromMetadata(ownerMetadata),
    ownerSignatureHex: bytesToHex(
      input.ownerIdentitySession.sign(
        buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(lifecycle),
      ),
    ),
    receivedAt: input.receivedAt ?? input.changedAt,
  };
}

/**
 * Companion-side encryption path for reader custody. The only persisted input
 * carrying the domain KEK is the owner's sealed share envelope; the raw KEK
 * and per-item DEK are zeroed best-effort before this function returns.
 */
export function encryptPicoReaderCustodyItem(
  sodium: VaultSodium,
  input: EncryptPicoReaderCustodyItemInput,
): PicoReaderCustodyItemRecord {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  assertPicoReaderCustodyWriterGrantRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
  );
  const domain = input.domainRecord.domain;
  const grant = input.writerGrantRecord.grant;
  if (input.createdAt < grant.validFrom || input.createdAt >= grant.validUntil) {
    throw new Error('writer_grant_inactive');
  }

  const writerMetadata = input.writerSigningSession.metadata();
  if (writerMetadata.keyRole !== 'device_signing'
    || writerMetadata.keyFingerprintHex
      !== grant.writerDeviceSigningKeyFingerprintHex) {
    throw new Error('writer_signing_key_mismatch');
  }

  const kek = openPicoReaderCustodyDomainKek(
    sodium,
    input.readerKeyAgreementSession,
    input.domainRecord,
  );
  const dek = sodium.randombytes_buf(32);
  const contentNonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const dekWrapNonce = sodium.randombytes_buf(
    sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
  );
  const plaintext = textEncoder.encode(input.plaintext);

  try {
    const contentCiphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      buildPicoMemoryContentAd({
        suite: picoMemoryContentSuite,
        memoryItemId: input.memoryItemId,
        privacyDomain: domain.domainId,
        contentType: input.contentType,
      }),
      null,
      contentNonce,
      dek,
    );
    const wrappedDek = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dek,
      buildPicoMemoryDekWrapAd({
        suite: picoMemoryContentSuite,
        keyEnvelopeId: input.packageId,
        domainId: domain.domainId,
        memoryItemId: input.memoryItemId,
      }),
      null,
      dekWrapNonce,
      kek,
    );
    const item: PicoReaderCustodyItemSignatureInput = {
      suite: picoMemoryContentSuite,
      packageId: input.packageId,
      domainAuthorityId: domain.domainAuthorityId,
      writerGrantId: grant.writerGrantId,
      homeId: domain.homeId,
      hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
      domainId: domain.domainId,
      memoryItemId: input.memoryItemId,
      contentType: input.contentType,
      kekVersion: domain.kekVersion,
      writerIdentityKeyFingerprintHex: grant.writerIdentityKeyFingerprintHex,
      writerDeviceSigningKeyFingerprintHex:
        grant.writerDeviceSigningKeyFingerprintHex,
      contentNonceHex: bytesToHex(contentNonce),
      contentCiphertextDigestHex: bytesToHex(
        sodium.crypto_generichash(32, contentCiphertext, null),
      ),
      dekWrapNonceHex: bytesToHex(dekWrapNonce),
      wrappedDekDigestHex: bytesToHex(
        sodium.crypto_generichash(32, wrappedDek, null),
      ),
      createdAt: input.createdAt,
    };

    return {
      schema: picoReaderCustodyItemRecordSchema,
      item,
      contentCiphertextHex: bytesToHex(contentCiphertext),
      wrappedDekHex: bytesToHex(wrappedDek),
      writerDeviceSigningKeyRecord: {
        ...input.writerGrantRecord.writerDeviceSigningKeyRecord,
      },
      writerSignatureHex: bytesToHex(
        input.writerSigningSession.sign(
          buildPicoReaderCustodyItemSignatureInput(item),
        ),
      ),
      receivedAt: input.receivedAt ?? input.createdAt,
    };
  } finally {
    sodium.memzero(plaintext);
    sodium.memzero(kek);
    sodium.memzero(dek);
  }
}

export function decryptPicoReaderCustodyItem(
  sodium: VaultSodium,
  input: DecryptPicoReaderCustodyItemInput,
): string {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  assertPicoReaderCustodyWriterGrantRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
  );
  assertPicoReaderCustodyItemRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
    input.itemRecord,
  );
  const kek = openPicoReaderCustodyDomainKek(
    sodium,
    input.readerKeyAgreementSession,
    input.domainRecord,
  );
  const item = input.itemRecord.item;
  const wrappedDek = hexToBytes(input.itemRecord.wrappedDekHex);
  let dek: Uint8Array | undefined;

  try {
    dek = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      wrappedDek,
      buildPicoMemoryDekWrapAd({
        suite: item.suite,
        keyEnvelopeId: item.packageId,
        domainId: item.domainId,
        memoryItemId: item.memoryItemId,
      }),
      hexToBytes(item.dekWrapNonceHex),
      kek,
    );
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      hexToBytes(input.itemRecord.contentCiphertextHex),
      buildPicoMemoryContentAd({
        suite: item.suite,
        memoryItemId: item.memoryItemId,
        privacyDomain: item.domainId,
        contentType: item.contentType,
      }),
      hexToBytes(item.contentNonceHex),
      dek,
    );
    try {
      return textDecoder.decode(plaintext);
    } finally {
      sodium.memzero(plaintext);
    }
  } finally {
    sodium.memzero(kek);
    if (dek !== undefined) {
      sodium.memzero(dek);
    }
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
  // The buffer libsodium handed back is a second copy of the same secret. JS
  // memory hygiene is best-effort (V7), but leaving the generator's own copy of
  // a freshly minted root key alive for the collector is the one part we can
  // actually control here.
  sodium.memzero(keypair.privateKey);

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

function assertPicoReaderCustodyDomainRecord(
  sodium: VaultSodium,
  record: PicoReaderCustodyDomainRecord,
): void {
  const domain = record.domain;
  if (record.schema !== picoReaderCustodyDomainRecordSchema
    || domain.suite !== picoMemoryContentSuite
    || domain.custodyClass !== 'reader_custody'
    || !isCanonicalInstant(record.receivedAt)) {
    throw new Error('invalid_reader_custody_domain');
  }
  buildPicoReaderCustodyDomainSignatureInput(domain);
  assertKeyRecordMatchesMetadata(
    sodium,
    record.ownerIdentityKeyRecord,
    'pico_identity',
  );
  assertKeyRecordMatchesMetadata(
    sodium,
    record.ownerReaderKeyRecord,
    'device_key_agreement',
  );
  const ownerIdentityFingerprint = keyRecordFingerprintHex(
    sodium,
    'pico_identity',
    hexToBytes(record.ownerIdentityKeyRecord.publicKeyHex),
  );
  const ownerReaderFingerprint = keyRecordFingerprintHex(
    sodium,
    'device_key_agreement',
    hexToBytes(record.ownerReaderKeyRecord.publicKeyHex),
  );
  const ownerEnvelope = record.ownerEnvelope;
  const envelope = ownerEnvelope.envelope;
  if (domain.ownerIdentityKeyFingerprintHex !== ownerIdentityFingerprint
    || domain.ownerReaderKeyFingerprintHex !== ownerReaderFingerprint
    || ownerEnvelope.schema !== picoShareEnvelopeRecordSchema
    || ownerEnvelope.issuerIdentityKeyRecord.suite
      !== record.ownerIdentityKeyRecord.suite
    || ownerEnvelope.issuerIdentityKeyRecord.keyRole
      !== record.ownerIdentityKeyRecord.keyRole
    || ownerEnvelope.issuerIdentityKeyRecord.publicKeyHex
      !== record.ownerIdentityKeyRecord.publicKeyHex
    || envelope.suite !== picoShareSuite
    || envelope.grantId !== domain.domainAuthorityId
    || envelope.domainId !== domain.domainId
    || envelope.kekVersion !== domain.kekVersion
    || envelope.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || envelope.issuerIdentityKeyFingerprintHex
      !== domain.ownerIdentityKeyFingerprintHex
    || envelope.readerKeyFingerprintHex
      !== domain.ownerReaderKeyFingerprintHex
    || envelope.grantedAt !== domain.authorizedAt
    || !isCanonicalInstant(ownerEnvelope.createdAt)) {
    throw new Error('invalid_reader_custody_domain');
  }

  const sealedWrap = hexToBytes(ownerEnvelope.sealedWrapHex);
  if (bytesToHex(sodium.crypto_generichash(32, sealedWrap, null))
      !== envelope.wrapDigestHex
    || !verifyDetached(
      sodium,
      record.ownerIdentityKeyRecord.publicKeyHex,
      buildPicoReaderCustodyDomainSignatureInput(domain),
      record.ownerSignatureHex,
    )
    || !verifyDetached(
      sodium,
      record.ownerIdentityKeyRecord.publicKeyHex,
      buildPicoShareEnvelopeSignatureInput(envelope),
      ownerEnvelope.issuerSignatureHex,
    )) {
    throw new Error('invalid_reader_custody_domain');
  }
}

function assertPicoReaderCustodyWriterGrantRecord(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  record: PicoReaderCustodyWriterGrantRecord,
): void {
  const domain = domainRecord.domain;
  const grant = record.grant;
  if (record.schema !== picoReaderCustodyWriterGrantRecordSchema
    || grant.suite !== picoMemoryContentSuite
    || grant.domainAuthorityId !== domain.domainAuthorityId
    || grant.homeId !== domain.homeId
    || grant.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || grant.domainId !== domain.domainId
    || grant.kekVersion !== domain.kekVersion
    || grant.ownerIdentityKeyFingerprintHex
      !== domain.ownerIdentityKeyFingerprintHex
    || record.ownerIdentityKeyRecord.suite
      !== domainRecord.ownerIdentityKeyRecord.suite
    || record.ownerIdentityKeyRecord.keyRole
      !== domainRecord.ownerIdentityKeyRecord.keyRole
    || record.ownerIdentityKeyRecord.publicKeyHex
      !== domainRecord.ownerIdentityKeyRecord.publicKeyHex
    || !isCanonicalInstant(record.receivedAt)) {
    throw new Error('invalid_reader_custody_writer_grant');
  }
  buildPicoReaderCustodyWriterGrantSignatureInput(grant);
  assertKeyRecordMatchesMetadata(
    sodium,
    record.writerDeviceSigningKeyRecord,
    'device_signing',
  );
  const writerFingerprint = keyRecordFingerprintHex(
    sodium,
    'device_signing',
    hexToBytes(record.writerDeviceSigningKeyRecord.publicKeyHex),
  );
  if (grant.writerDeviceSigningKeyFingerprintHex !== writerFingerprint
    || !verifyDetached(
      sodium,
      record.ownerIdentityKeyRecord.publicKeyHex,
      buildPicoReaderCustodyWriterGrantSignatureInput(grant),
      record.ownerSignatureHex,
    )) {
    throw new Error('invalid_reader_custody_writer_grant');
  }
}

function assertPicoReaderCustodyItemRecord(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord,
  record: PicoReaderCustodyItemRecord,
): void {
  const domain = domainRecord.domain;
  const grant = writerGrantRecord.grant;
  const item = record.item;
  if (record.schema !== picoReaderCustodyItemRecordSchema
    || item.suite !== picoMemoryContentSuite
    || item.domainAuthorityId !== domain.domainAuthorityId
    || item.writerGrantId !== grant.writerGrantId
    || item.homeId !== domain.homeId
    || item.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || item.domainId !== domain.domainId
    || item.kekVersion !== domain.kekVersion
    || item.writerIdentityKeyFingerprintHex
      !== grant.writerIdentityKeyFingerprintHex
    || item.writerDeviceSigningKeyFingerprintHex
      !== grant.writerDeviceSigningKeyFingerprintHex
    || record.writerDeviceSigningKeyRecord.suite
      !== writerGrantRecord.writerDeviceSigningKeyRecord.suite
    || record.writerDeviceSigningKeyRecord.keyRole
      !== writerGrantRecord.writerDeviceSigningKeyRecord.keyRole
    || record.writerDeviceSigningKeyRecord.publicKeyHex
      !== writerGrantRecord.writerDeviceSigningKeyRecord.publicKeyHex
    || item.createdAt < grant.validFrom
    || item.createdAt >= grant.validUntil
    || !isCanonicalInstant(record.receivedAt)) {
    throw new Error('invalid_reader_custody_item');
  }
  buildPicoReaderCustodyItemSignatureInput(item);
  const contentCiphertext = hexToBytes(record.contentCiphertextHex);
  const wrappedDek = hexToBytes(record.wrappedDekHex);
  if (bytesToHex(sodium.crypto_generichash(32, contentCiphertext, null))
      !== item.contentCiphertextDigestHex
    || bytesToHex(sodium.crypto_generichash(32, wrappedDek, null))
      !== item.wrappedDekDigestHex
    || !verifyDetached(
      sodium,
      record.writerDeviceSigningKeyRecord.publicKeyHex,
      buildPicoReaderCustodyItemSignatureInput(item),
      record.writerSignatureHex,
    )) {
    throw new Error('invalid_reader_custody_item');
  }
}

function openPicoReaderCustodyDomainKek(
  sodium: VaultSodium,
  readerSession: PicoVaultSession,
  record: PicoReaderCustodyDomainRecord,
): Uint8Array {
  const metadata = readerSession.metadata();
  if (metadata.keyRole !== 'device_key_agreement'
    || metadata.keyFingerprintHex
      !== record.domain.ownerReaderKeyFingerprintHex) {
    throw new Error('reader_key_mismatch');
  }

  const plaintext = readerSession.unwrapSealedBox(
    hexToBytes(record.ownerEnvelope.sealedWrapHex),
  );
  try {
    const reader = new CanonicalElementReader(plaintext, 'invalid_share_wrap');
    if (reader.readAscii() !== picoShareCanonicalLabels.wrap
      || reader.readAscii() !== picoShareSuite
      || reader.readAscii() !== record.domain.domainId
      || reader.readAscii() !== String(record.domain.kekVersion)
      || bytesToHex(reader.readBytes())
        !== record.domain.ownerReaderKeyFingerprintHex) {
      throw new Error('invalid_share_wrap');
    }
    const kek = reader.readBytes();
    reader.assertDone();
    if (kek.byteLength !== 32) {
      throw new Error('invalid_share_wrap');
    }
    return kek;
  } finally {
    sodium.memzero(plaintext);
  }
}

function assertKeyRecordMatchesMetadata(
  sodium: VaultSodium,
  keyRecord: PicoIdentityKeyRecordSignatureInput,
  keyRole: PicoVaultPersonKeyRole,
): void {
  if (keyRecord.suite !== picoIdentitySuite || keyRecord.keyRole !== keyRole) {
    throw new Error('invalid_key_record');
  }
  const publicKey = hexToBytes(keyRecord.publicKeyHex);
  const expectedLength = keyRole === 'device_key_agreement'
    ? sodium.crypto_box_PUBLICKEYBYTES
    : sodium.crypto_sign_PUBLICKEYBYTES;
  if (publicKey.byteLength !== expectedLength) {
    throw new Error('invalid_key_record');
  }
  buildPicoIdentityKeyRecordSignatureInput(keyRecord);
}

function keyRecordFromMetadata(
  metadata: PicoVaultSessionMetadata,
): PicoIdentityKeyRecordSignatureInput {
  return {
    suite: metadata.suite,
    keyRole: metadata.keyRole,
    publicKeyHex: metadata.publicKeyHex,
  };
}

function verifyDetached(
  sodium: VaultSodium,
  publicKeyHex: string,
  signatureInput: Uint8Array,
  signatureHex: string,
): boolean {
  try {
    return sodium.crypto_sign_verify_detached(
      hexToBytes(signatureHex),
      signatureInput,
      hexToBytes(publicKeyHex),
    );
  } catch {
    return false;
  }
}

function isCanonicalInstant(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
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

class CanonicalElementReader {
  private offset = 0;

  public constructor(
    private readonly input: Uint8Array,
    private readonly reason: string,
  ) {}

  public readAscii(): string {
    return textDecoder.decode(this.readBytes());
  }

  public readBytes(): Uint8Array {
    if (this.input.byteLength < this.offset + 4) {
      throw new Error(this.reason);
    }
    const length = new DataView(
      this.input.buffer,
      this.input.byteOffset + this.offset,
      this.input.byteLength - this.offset,
    ).getUint32(0, false);
    this.offset += 4;
    if (length === 0 || this.input.byteLength < this.offset + length) {
      throw new Error(this.reason);
    }
    const value = new Uint8Array(
      this.input.slice(this.offset, this.offset + length),
    );
    this.offset += length;
    return value;
  }

  public assertDone(): void {
    if (this.offset !== this.input.byteLength) {
      throw new Error(this.reason);
    }
  }
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
