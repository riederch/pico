import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { wordlist as bip39EnglishWordlist } from '@scure/bip39/wordlists/english.js';
import {
  buildPicoMemoryContentAd,
  buildPicoMemoryDekWrapAd,
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyKekRotationSignatureInput,
  buildPicoReaderCustodyReaderGrantLifecycleSignatureInput,
  buildPicoReaderCustodyReaderGrantSignatureInput,
  buildPicoReaderCustodySyncEvidenceDigestInput,
  buildPicoReaderCustodySyncManifestSignatureInput,
  buildPicoReaderCustodySyncRecordDigestInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  buildPicoShareWrapPayload,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  buildPicoVaultKeyfileHeaderAad,
  buildPicoRecoveryCardPayload,
  picoMemoryContentSuite,
  picoReaderCustodyCanonicalLabels,
  picoReaderCustodyDomainRecordSchema,
  picoReaderCustodyItemRecordSchema,
  picoReaderCustodyKekRotationRecordSchema,
  picoReaderCustodyReaderGrantLifecycleRecordSchema,
  picoReaderCustodyReaderGrantRecordSchema,
  picoReaderCustodySyncBatchRecordSchema,
  picoReaderCustodySyncPayloadSchema,
  picoReaderCustodyWriterGrantLifecycleRecordSchema,
  picoReaderCustodyWriterGrantRecordSchema,
  picoHomeDeviceLifecycleCanonicalLabels,
  picoHomeDeviceRecoveryCanonicalLabels,
  picoHomeSignatureInputLabels,
  picoHomeV2SignatureInputLabels,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentityReaderKeyFreshnessSignatureInputLabel,
  picoIdentitySignatureInputLabels,
  picoLinkDirectRequestSignatureInputLabel,
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
  picoRecoveryCardSchema,
} from '@pico/protocol';
import type {
  PicoVaultAeadAlgorithm,
  PicoVaultKdfAlgorithm,
  PicoVaultKdfProfile,
  PicoVaultKeyfileHeaderAadInput,
  PicoVaultPersonKeyRole,
  PicoIdentityKeyRecordSignatureInput,
  PicoIdentityReaderKeyFreshnessCheckpoint,
  PicoIdentityReaderKeyFreshnessSignatureInput,
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyDomainSignatureInput,
  PicoReaderCustodyItemRecord,
  PicoReaderCustodyItemSignatureInput,
  PicoReaderCustodyKekRotationRecord,
  PicoReaderCustodyKekRotationSignatureInput,
  PicoReaderCustodyReaderGrantLifecycleRecord,
  PicoReaderCustodyReaderGrantLifecycleSignatureInput,
  PicoReaderCustodyReaderGrantRecord,
  PicoReaderCustodyReaderGrantSignatureInput,
  PicoReaderCustodySyncBatchRecord,
  PicoReaderCustodySyncEvidenceReference,
  PicoReaderCustodySyncManifestSignatureInput,
  PicoReaderCustodySyncPayload,
  PicoReaderCustodyWriterGrantLifecycleRecord,
  PicoReaderCustodyWriterGrantLifecycleSignatureInput,
  PicoReaderCustodyWriterGrantRecord,
  PicoReaderCustodyWriterGrantSignatureInput,
  PicoShareEnvelopeRecord,
  PicoRecoveryCardPayload,
} from '@pico/protocol';

export const picoVaultKeyfileEnvelopeSchema = 'pico.vault.keyfile.encrypted.v1' as const;
export const picoVaultPrivateKeyPayloadLabel = 'pico.vault.private-key-payload.v1' as const;
export const MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_MS = 5 * 60 * 1_000;
export const MAX_PICO_READER_CUSTODY_SYNC_PAYLOAD_BYTES = 16 * 1024 * 1024;
export const MAX_PICO_READER_CUSTODY_SYNC_MANIFEST_MS =
  24 * 60 * 60 * 1_000;
export const PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX = '00'.repeat(32);
export const picoRecoveryPinProtection = {
  kdfAlgorithm: 'argon2id13',
  kdfProfile: 'moderate',
  saltLabel: 'pico.recovery.pin-salt.v1',
  nonceLabel: 'pico.recovery.pin-nonce.v1',
  streamAlgorithm: 'xchacha20',
  minLength: 6,
  maxLength: 64,
  alphabet: '0123456789abcdefghijklmnopqrstuvwxyz',
} as const;

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

export interface IssuePicoVaultRecoveryCardInput {
  picoName: string;
  homeNameOrId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  hostKeyAgreementPublicKeyHex: string;
  endpointHint: string;
  issuedAt: string;
  pin: string;
}

export interface PicoVaultRecoveryCard {
  payload: PicoRecoveryCardPayload;
  recoveryPhrase: string;
  canonicalPayloadHex: string;
}

export interface RestorePicoVaultIdentityFromRecoveryInput {
  recoveryPhrase?: string;
  seedMaterialHex?: string;
  pinProtected: true;
  pin: string;
  identityKeyFingerprintHex: string;
  passphrase: string;
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

/**
 * ADR 0100 seam: everything a ceremony needs from a signing key, and nothing
 * else. `PicoVaultSession` satisfies it structurally; `@pico/vault-daemon`
 * supplies it over the local socket. It deliberately excludes unwrap, lock and
 * export - a detached signer signs, and the V4 label discipline is enforced by
 * whichever implementation stands behind it.
 */
/**
 * ADR 0106: what a signature is *of*, alongside the bytes. `label` names the
 * canonical family and `fields` is the exact builder input the bytes were
 * built from. An in-process `PicoVaultSession` ignores it - locally, the
 * process that renders is the process that signs, so there is nothing to
 * bind. A remote signer (the Vault daemon) requires it, rebuilds the bytes
 * from it with the same builder, and shows the person a statement derived
 * from the same fields the signature covers.
 */
export interface PicoVaultSignatureContext {
  label: string;
  fields: object;
}

export interface PicoVaultDetachedSigner {
  metadata(): PicoVaultSessionMetadata;
  sign(signatureInput: Uint8Array, context: PicoVaultSignatureContext): Uint8Array;
}

export interface PicoVaultPathSeparationInput {
  vaultKeyfilePath: string;
  foundationDataPath: string;
  foundationBackupPath: string;
}

export interface CreatePicoReaderCustodyDomainInput {
  ownerIdentitySession: PicoVaultDetachedSigner;
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
  ownerIdentitySession: PicoVaultDetachedSigner;
  domainRecord: PicoReaderCustodyDomainRecord;
  rotationRecords?: PicoReaderCustodyKekRotationRecord[];
  writerDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  writerGrantId: string;
  writerIdentityKeyFingerprintHex: string;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface CreatePicoReaderCustodyReaderGrantInput {
  ownerIdentitySession: PicoVaultDetachedSigner;
  ownerReaderKeyAgreementSession: PicoVaultSession;
  domainRecord: PicoReaderCustodyDomainRecord;
  rotationRecords?: PicoReaderCustodyKekRotationRecord[];
  readerKeyRecord: PicoIdentityKeyRecordSignatureInput;
  readerGrantId: string;
  readerIdentityKeyFingerprintHex: string;
  readerDeviceSigningKeyFingerprintHex: string;
  readerDelegationId: string;
  accessMode: PicoReaderCustodyReaderGrantSignatureInput['accessMode'];
  firstKekVersion: number;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface RevokePicoReaderCustodyReaderGrantInput {
  ownerIdentitySession: PicoVaultDetachedSigner;
  domainRecord: PicoReaderCustodyDomainRecord;
  readerGrantRecord: PicoReaderCustodyReaderGrantRecord;
  lifecycleId: string;
  reasonCategory:
    PicoReaderCustodyReaderGrantLifecycleSignatureInput['reasonCategory'];
  changedAt: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface RotatePicoReaderCustodyDomainInput {
  ownerIdentitySession: PicoVaultDetachedSigner;
  domainRecord: PicoReaderCustodyDomainRecord;
  rotationRecords?: PicoReaderCustodyKekRotationRecord[];
  readerGrantLifecycleRecords?:
    PicoReaderCustodyReaderGrantLifecycleRecord[];
  writerGrantLifecycleRecords?:
    PicoReaderCustodyWriterGrantLifecycleRecord[];
  remainingReaderGrantRecords?: PicoReaderCustodyReaderGrantRecord[];
  rotationId: string;
  rotatedAt: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface RevokePicoReaderCustodyWriterGrantInput {
  ownerIdentitySession: PicoVaultDetachedSigner;
  domainRecord: PicoReaderCustodyDomainRecord;
  rotationRecords?: PicoReaderCustodyKekRotationRecord[];
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord;
  lifecycleId: string;
  reasonCategory: PicoReaderCustodyWriterGrantLifecycleSignatureInput['reasonCategory'];
  changedAt: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface EncryptPicoReaderCustodyItemInput {
  readerKeyAgreementSession: PicoVaultSession;
  writerSigningSession: PicoVaultDetachedSigner;
  domainRecord: PicoReaderCustodyDomainRecord;
  rotationRecords?: PicoReaderCustodyKekRotationRecord[];
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
  rotationRecords?: PicoReaderCustodyKekRotationRecord[];
  readerGrantRecord?: PicoReaderCustodyReaderGrantRecord;
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord;
  itemRecord: PicoReaderCustodyItemRecord;
  nowMs?: number;
}

export interface CreatePicoIdentityReaderKeyFreshnessCheckpointInput {
  identitySession: PicoVaultDetachedSigner;
  checkpointId: string;
  homeId: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
  status: PicoIdentityReaderKeyFreshnessSignatureInput['status'];
  observedThroughLifecycleOrder: string;
  checkedAt: string;
  freshUntil: string;
}

export interface CreatePicoReaderCustodySyncBatchInput {
  ownerIdentitySession: PicoVaultDetachedSigner;
  domainRecord: PicoReaderCustodyDomainRecord;
  readerGrantRecord: PicoReaderCustodyReaderGrantRecord;
  readerGrantLifecycleRecords?:
    PicoReaderCustodyReaderGrantLifecycleRecord[];
  writerGrantRecords?: PicoReaderCustodyWriterGrantRecord[];
  writerGrantLifecycleRecords?:
    PicoReaderCustodyWriterGrantLifecycleRecord[];
  rotationRecords?: PicoReaderCustodyKekRotationRecord[];
  itemRecords?: PicoReaderCustodyItemRecord[];
  syncBatchId: string;
  routeRef: string;
  sequence: number;
  previousManifestDigestHex: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreatePicoReaderCustodySyncBatchResult {
  batchRecord: PicoReaderCustodySyncBatchRecord;
  manifestDigestHex: string;
}

export interface OpenPicoReaderCustodySyncBatchInput {
  readerKeyAgreementSession: PicoVaultSession;
  batchRecord: PicoReaderCustodySyncBatchRecord;
  evaluatedAt?: string;
  nowMs?: number;
}

export interface PicoVaultReaderCustodySyncItemEvidence {
  domainRecord: PicoReaderCustodyDomainRecord;
  readerGrantRecord: PicoReaderCustodyReaderGrantRecord;
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord;
  rotationRecords: PicoReaderCustodyKekRotationRecord[];
  itemRecord: PicoReaderCustodyItemRecord;
}

/**
 * Structurally implements the narrow @pico/sync access-session capability
 * without making Vault depend on Sync.
 */
export interface PicoVaultReaderCustodySyncAccessSession {
  metadata(): PicoVaultSessionMetadata;
  isLocked(options: { nowMs: number }): boolean;
  lock(): void;
  openPayload(input: {
    batchRecord: PicoReaderCustodySyncBatchRecord;
    evaluatedAt: string;
  }): PicoReaderCustodySyncPayload;
  decryptItem(
    evidence: PicoVaultReaderCustodySyncItemEvidence,
  ): string;
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
  crypto_stream_xchacha20_KEYBYTES: number;
  crypto_stream_xchacha20_NONCEBYTES: number;
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
  crypto_hash_sha256(message: Uint8Array): Uint8Array;
  crypto_stream_xchacha20_xor(
    message: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  crypto_sign_detached(message: Uint8Array | string, privateKey: Uint8Array): Uint8Array;
  crypto_sign_ed25519_sk_to_seed(privateKey: Uint8Array): Uint8Array;
  crypto_sign_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_sign_seed_keypair(seed: Uint8Array): {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
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
 * families are listed now that the split is settled rather than guessed: the
 * issuer statement carries the authority and is a person's to sign, while the
 * host's activation signature acknowledges it and is made by a key this Vault
 * never holds.
 */
const signableLabelsByKeyRole: Record<PicoVaultPersonKeyRole, ReadonlySet<string>> = {
  pico_identity: new Set<string>([
    ...Object.values(picoIdentitySignatureInputLabels),
    picoHomeSignatureInputLabels.claim,
    picoHomeSignatureInputLabels.founding,
    picoHomeV2SignatureInputLabels.claim,
    picoHomeV2SignatureInputLabels.founding,
    // ADR 0110: the identity root first authorizes target-bound lifecycle
    // discovery, then authorizes the total-replacement recovery. The claim
    // bytes are co-signed below by the target device as possession proof; the
    // daemon keeps approval policy role-aware.
    picoHomeDeviceRecoveryCanonicalLabels.prepare,
    picoHomeDeviceRecoveryCanonicalLabels.claim,
    // The issuer half of a Home membership, and its lifecycle. ADR 0080 H6
    // makes `issuerSignatureHex` the authority, and an authority over a
    // resident's membership is a person's to give - so it is signable by a
    // Pico Identity and by nothing else. The host's activation signature is
    // deliberately absent: it acknowledges rather than authorizes, it is made
    // by the Home host key, and that key lives in the Foundation
    // (`home-setup.ts`), never in a person's Vault.
    picoHomeSignatureInputLabels.membership,
    picoHomeSignatureInputLabels.membershipLifecycle,
    picoIdentityReaderKeyFreshnessSignatureInputLabel,
    picoShareCanonicalLabels.envelope,
    picoReaderCustodyCanonicalLabels.domain,
    picoReaderCustodyCanonicalLabels.readerGrant,
    picoReaderCustodyCanonicalLabels.readerGrantLifecycle,
    picoReaderCustodyCanonicalLabels.writerGrant,
    picoReaderCustodyCanonicalLabels.writerGrantLifecycle,
    picoReaderCustodyCanonicalLabels.kekRotation,
    picoReaderCustodyCanonicalLabels.syncManifest,
  ]),
  device_signing: new Set<string>([
    ...Object.values(picoIdentitySignatureInputLabels),
    // ADR 0107 D3: this authenticates one short-lived request and creates no
    // authority of its own. The semantic record inside the operation still
    // carries its own gated signature where required.
    picoLinkDirectRequestSignatureInputLabel,
    // ADR 0108: possession proof over the fresh claim bytes. The root
    // signature creates the Home authority; this co-signature only proves
    // that the first delegated device holds its signing key.
    picoHomeV2SignatureInputLabels.claim,
    // ADR 0109: the root-signed delegation creates device authority. This
    // short-lived, Home-bound co-signature proves only that the target device
    // holds the signing key named by that delegation.
    picoHomeDeviceLifecycleCanonicalLabels.activation,
    picoHomeDeviceRecoveryCanonicalLabels.claim,
    picoReaderCustodyCanonicalLabels.item,
  ]),
  device_key_agreement: new Set<string>(),
};
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const canonicalHexPattern = /^[0-9a-f]+$/;

/**
 * Read-only view of the V4 catalog above, so a caller outside this module can
 * refuse an input this Vault would never sign without having to try. It is a
 * predicate rather than the sets themselves: the catalog stays unmodifiable,
 * and `sign` remains the authority that actually enforces it.
 */
export function picoVaultCanSignLabel(
  keyRole: PicoVaultPersonKeyRole,
  label: string,
): boolean {
  return signableLabelsByKeyRole[keyRole]?.has(label) ?? false;
}

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

  /**
   * Accepts either use-options or an ADR 0106 signature context. A local
   * session deliberately ignores the context: the process that rendered the
   * fields is the process calling sign, so there is no display boundary to
   * bind. The context exists for remote signers, where there is.
   */
  public sign(
    signatureInput: Uint8Array,
    contextOrOptions: PicoVaultSignatureContext | PicoVaultSessionUseOptions = {},
  ): Uint8Array {
    const options: PicoVaultSessionUseOptions =
      'label' in contextOrOptions ? {} : contextOrOptions;
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

  /**
   * ADR 0110's one named no-export exception. The raw Ed25519 seed exists only
   * inside this call and is zeroed after the printable phrase/card payload has
   * been produced. The daemon exposes this method only behind the dedicated
   * approval-gated card-issuance request; it is never a generic key export.
   */
  public issueRecoveryCard(
    input: IssuePicoVaultRecoveryCardInput,
    options: PicoVaultSessionUseOptions = {},
  ): PicoVaultRecoveryCard {
    assertOptionalTimestampMs(options.nowMs);
    this.#assertUnlocked(options.nowMs ?? Date.now());
    if (this.#metadata.keyRole !== 'pico_identity') {
      throw new Error('recovery_card_requires_identity_root');
    }
    const seed =
      this.#sodium.crypto_sign_ed25519_sk_to_seed(this.#privateKey);
    try {
      const card = issuePicoVaultRecoveryCardFromSeed(
        this.#sodium,
        seed,
        this.#metadata.keyFingerprintHex,
        input,
      );
      this.#markUsed(options.nowMs ?? Date.now());
      return card;
    } finally {
      this.#sodium.memzero(seed);
    }
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

export function createPicoVaultReaderCustodySyncAccessSession(
  sodium: VaultSodium,
  session: PicoVaultSession,
): PicoVaultReaderCustodySyncAccessSession {
  let nowMs: number | undefined;
  return Object.freeze({
    metadata: () => session.metadata(),
    isLocked: (options: { nowMs: number }) => {
      const locked = session.isLocked(options);
      nowMs = options.nowMs;
      return locked;
    },
    lock: () => session.lock(),
    openPayload: (input: {
      batchRecord: PicoReaderCustodySyncBatchRecord;
      evaluatedAt: string;
    }) => openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: session,
      batchRecord: input.batchRecord,
      evaluatedAt: input.evaluatedAt,
      nowMs,
    }),
    decryptItem: (
      evidence: PicoVaultReaderCustodySyncItemEvidence,
    ) => decryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: session,
      domainRecord: evidence.domainRecord,
      rotationRecords: evidence.rotationRecords,
      readerGrantRecord: evidence.readerGrantRecord,
      writerGrantRecord: evidence.writerGrantRecord,
      itemRecord: evidence.itemRecord,
      nowMs,
    }),
  });
}

export function createPicoIdentityReaderKeyFreshnessCheckpoint(
  input: CreatePicoIdentityReaderKeyFreshnessCheckpointInput,
): PicoIdentityReaderKeyFreshnessCheckpoint {
  const metadata = input.identitySession.metadata();
  if (metadata.keyRole !== 'pico_identity') {
    throw new Error('pico_identity_key_required');
  }
  const checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput = {
    suite: picoIdentitySuite,
    checkpointId: input.checkpointId,
    homeId: input.homeId,
    issuerIdentityKeyFingerprintHex: metadata.keyFingerprintHex,
    deviceSigningKeyFingerprintHex:
      input.deviceSigningKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex:
      input.deviceKeyAgreementKeyFingerprintHex,
    delegationId: input.delegationId,
    status: input.status,
    observedThroughLifecycleOrder:
      input.observedThroughLifecycleOrder,
    checkedAt: input.checkedAt,
    freshUntil: input.freshUntil,
  };
  const signatureInput =
    buildPicoIdentityReaderKeyFreshnessSignatureInput(checkpoint);
  if (Date.parse(checkpoint.freshUntil) - Date.parse(checkpoint.checkedAt)
      > MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_MS) {
    throw new Error('reader_key_freshness_window_too_long');
  }
  return {
    schema: picoIdentityReaderKeyFreshnessCheckpointSchema,
    checkpoint,
    issuerIdentityKeyRecord: keyRecordFromMetadata(metadata),
    issuerSignatureHex: bytesToHex(
      input.identitySession.sign(signatureInput, {
        label: picoIdentityReaderKeyFreshnessSignatureInputLabel,
        fields: checkpoint,
      }),
    ),
  };
}

export function createPicoReaderCustodySyncBatch(
  sodium: VaultSodium,
  input: CreatePicoReaderCustodySyncBatchInput,
): CreatePicoReaderCustodySyncBatchResult {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  assertPicoReaderCustodyReaderGrantRecord(
    sodium,
    input.domainRecord,
    input.readerGrantRecord,
  );
  const ownerMetadata = input.ownerIdentitySession.metadata();
  const domain = input.domainRecord.domain;
  const readerGrant = input.readerGrantRecord.grant;
  if (ownerMetadata.keyRole !== 'pico_identity'
    || ownerMetadata.keyFingerprintHex
      !== domain.ownerIdentityKeyFingerprintHex) {
    throw new Error('owner_identity_key_required');
  }
  if (!/^route_[A-Za-z0-9_-]{32,128}$/.test(input.routeRef)
    || !isCanonicalInstant(input.createdAt)
    || !isCanonicalInstant(input.expiresAt)
    || input.createdAt >= input.expiresAt
    || Date.parse(input.expiresAt) - Date.parse(input.createdAt)
      > MAX_PICO_READER_CUSTODY_SYNC_MANIFEST_MS
    || input.createdAt < domain.authorizedAt
    || input.createdAt < readerGrant.validFrom
    || input.createdAt >= readerGrant.validUntil) {
    throw new Error('invalid_reader_sync_manifest');
  }
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1
    || (input.sequence === 1
      && input.previousManifestDigestHex
        !== PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX)
    || (input.sequence > 1
      && input.previousManifestDigestHex
        === PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX)) {
    throw new Error('invalid_sync_predecessor');
  }

  const rotations = validatedRotationChain(
    sodium,
    input.domainRecord,
    input.rotationRecords ?? [],
  );
  const readerLifecycles = input.readerGrantLifecycleRecords ?? [];
  const writerGrants = input.writerGrantRecords ?? [];
  const writerLifecycles = input.writerGrantLifecycleRecords ?? [];
  const items = input.itemRecords ?? [];
  const currentKekVersion = currentReaderCustodyKekVersion(
    input.domainRecord,
    rotations,
  );

  for (const lifecycle of readerLifecycles) {
    assertPicoReaderCustodyReaderGrantLifecycleRecord(
      sodium,
      input.domainRecord,
      lifecycle,
    );
    assertReaderGrantLifecycleLink(input.readerGrantRecord, lifecycle);
    if (lifecycle.lifecycle.changedAt < readerGrant.validFrom
      || lifecycle.lifecycle.changedAt > input.createdAt) {
      throw new Error('invalid_reader_custody_reader_lifecycle');
    }
  }
  const writerGrantById =
    new Map<string, PicoReaderCustodyWriterGrantRecord>();
  for (const grant of writerGrants) {
    assertPicoReaderCustodyWriterGrantRecord(
      sodium,
      input.domainRecord,
      grant,
      currentKekVersion,
    );
    if (writerGrantById.has(grant.grant.writerGrantId)) {
      throw new Error('duplicate_writer_grant');
    }
    if (grant.grant.validFrom > input.createdAt) {
      throw new Error('invalid_reader_custody_writer_grant');
    }
    writerGrantById.set(grant.grant.writerGrantId, grant);
  }
  for (const lifecycle of writerLifecycles) {
    assertPicoReaderCustodyWriterGrantLifecycleRecord(
      sodium,
      input.domainRecord,
      lifecycle,
    );
    const grant = writerGrantById.get(lifecycle.lifecycle.writerGrantId);
    if (grant === undefined) {
      throw new Error('writer_grant_evidence_missing');
    }
    assertWriterGrantLifecycleLink(grant, lifecycle);
    if (lifecycle.lifecycle.changedAt < grant.grant.validFrom
      || lifecycle.lifecycle.changedAt > input.createdAt) {
      throw new Error('invalid_reader_custody_writer_lifecycle');
    }
  }
  assertSyncRotationCauses(
    rotations,
    readerLifecycles,
    writerLifecycles,
    domain.lifecycleOrder,
    domain.authorizedAt,
    input.createdAt,
  );
  const itemPackageIds = new Set<string>();
  const memoryItemIds = new Set<string>();
  for (const item of items) {
    const grant = writerGrantById.get(item.item.writerGrantId);
    if (grant === undefined) {
      throw new Error('writer_grant_evidence_missing');
    }
    if (itemPackageIds.has(item.item.packageId)
      || memoryItemIds.has(item.item.memoryItemId)) {
      throw new Error('duplicate_sync_item');
    }
    itemPackageIds.add(item.item.packageId);
    memoryItemIds.add(item.item.memoryItemId);
    assertPicoReaderCustodyItemRecord(
      sodium,
      input.domainRecord,
      grant,
      item,
    );
    if (item.item.createdAt > input.createdAt) {
      throw new Error('invalid_reader_custody_item');
    }
  }

  const records = syncEvidenceRecords({
    domainRecord: input.domainRecord,
    readerGrantRecord: input.readerGrantRecord,
    readerGrantLifecycleRecords: readerLifecycles,
    writerGrantRecords: writerGrants,
    writerGrantLifecycleRecords: writerLifecycles,
    rotationRecords: rotations,
    itemRecords: items,
  });
  const references = syncEvidenceReferences(sodium, records);
  const evidenceDigestHex = bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoReaderCustodySyncEvidenceDigestInput(references),
    null,
  ));
  const observedThroughLifecycleOrder = maximumLifecycleOrder(
    domain.lifecycleOrder,
    readerGrant.lifecycleOrder,
    ...readerLifecycles.map((record) => record.lifecycle.lifecycleOrder),
    ...writerGrants.map((record) => record.grant.lifecycleOrder),
    ...writerLifecycles.map((record) => record.lifecycle.lifecycleOrder),
    ...rotations.map((record) => record.rotation.lifecycleOrder),
  );
  const manifest: PicoReaderCustodySyncManifestSignatureInput = {
    suite: picoMemoryContentSuite,
    syncBatchId: input.syncBatchId,
    routeRef: input.routeRef,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex:
      domain.ownerIdentityKeyFingerprintHex,
    readerGrantId: readerGrant.readerGrantId,
    readerKeyFingerprintHex: readerGrant.readerKeyFingerprintHex,
    sequence: input.sequence,
    previousManifestDigestHex: input.previousManifestDigestHex,
    evidenceDigestHex,
    throughKekVersion: currentKekVersion,
    observedThroughLifecycleOrder,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  };
  const manifestInput =
    buildPicoReaderCustodySyncManifestSignatureInput(manifest);
  const ownerIdentityKeyRecord = keyRecordFromMetadata(ownerMetadata);
  const payload: PicoReaderCustodySyncPayload = {
    schema: picoReaderCustodySyncPayloadSchema,
    manifest,
    ownerIdentityKeyRecord,
    ownerSignatureHex: bytesToHex(
      input.ownerIdentitySession.sign(manifestInput, {
        label: picoReaderCustodyCanonicalLabels.syncManifest,
        fields: manifest,
      }),
    ),
    domainRecord: input.domainRecord,
    readerGrantRecord: input.readerGrantRecord,
    readerGrantLifecycleRecords: [...readerLifecycles],
    writerGrantRecords: [...writerGrants],
    writerGrantLifecycleRecords: [...writerLifecycles],
    rotationRecords: [...rotations],
    itemRecords: [...items],
  };
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  if (plaintext.byteLength > MAX_PICO_READER_CUSTODY_SYNC_PAYLOAD_BYTES) {
    sodium.memzero(plaintext);
    throw new Error('sync_payload_too_large');
  }
  try {
    const sealedPayload = sodium.crypto_box_seal(
      plaintext,
      hexToBytes(input.readerGrantRecord.readerKeyRecord.publicKeyHex),
    );
    return {
      batchRecord: {
        schema: picoReaderCustodySyncBatchRecordSchema,
        routeRef: input.routeRef,
        syncBatchId: input.syncBatchId,
        sealedPayloadHex: bytesToHex(sealedPayload),
        sealedPayloadDigestHex: bytesToHex(
          sodium.crypto_generichash(32, sealedPayload, null),
        ),
        expiresAt: input.expiresAt,
      },
      manifestDigestHex: bytesToHex(
        sodium.crypto_generichash(32, manifestInput, null),
      ),
    };
  } finally {
    sodium.memzero(plaintext);
  }
}

/**
 * Opens only the reader-addressed transport layer. The owner manifest and
 * exact evidence digest are checked here; individual domain/grant/item
 * authority is independently projected by `@pico/sync` before any KEK unwrap.
 */
export function openPicoReaderCustodySyncBatch(
  sodium: VaultSodium,
  input: OpenPicoReaderCustodySyncBatchInput,
): PicoReaderCustodySyncPayload {
  assertOptionalTimestampMs(input.nowMs);
  assertExactKeys(input.batchRecord as unknown as Record<string, unknown>, [
    'schema',
    'routeRef',
    'syncBatchId',
    'sealedPayloadHex',
    'sealedPayloadDigestHex',
    'expiresAt',
  ]);
  const batch = input.batchRecord;
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const metadata = input.readerKeyAgreementSession.metadata();
  const sealedPayload = hexToBytes(batch.sealedPayloadHex);
  if (batch.schema !== picoReaderCustodySyncBatchRecordSchema
    || metadata.keyRole !== 'device_key_agreement'
    || !isCanonicalInstant(batch.expiresAt)
    || !isCanonicalInstant(evaluatedAt)
    || evaluatedAt >= batch.expiresAt
    || sealedPayload.byteLength
      > MAX_PICO_READER_CUSTODY_SYNC_PAYLOAD_BYTES + 128
    || bytesToHex(sodium.crypto_generichash(32, sealedPayload, null))
      !== batch.sealedPayloadDigestHex) {
    throw new Error('invalid_reader_sync_batch');
  }
  const plaintext = input.readerKeyAgreementSession.unwrapSealedBox(
    sealedPayload,
    { nowMs: input.nowMs },
  );
  try {
    if (plaintext.byteLength > MAX_PICO_READER_CUSTODY_SYNC_PAYLOAD_BYTES) {
      throw new Error('sync_payload_too_large');
    }
    const parsed = JSON.parse(textDecoder.decode(plaintext)) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('invalid_reader_sync_payload');
    }
    assertExactKeys(parsed, [
      'schema',
      'manifest',
      'ownerIdentityKeyRecord',
      'ownerSignatureHex',
      'domainRecord',
      'readerGrantRecord',
      'readerGrantLifecycleRecords',
      'writerGrantRecords',
      'writerGrantLifecycleRecords',
      'rotationRecords',
      'itemRecords',
    ]);
    const payload = parsed as unknown as PicoReaderCustodySyncPayload;
    const manifest = payload.manifest;
    if (payload.schema !== picoReaderCustodySyncPayloadSchema
      || !isRecord(manifest)
      || manifest.routeRef !== batch.routeRef
      || manifest.syncBatchId !== batch.syncBatchId
      || manifest.expiresAt !== batch.expiresAt
      || manifest.readerKeyFingerprintHex !== metadata.keyFingerprintHex
      || !isRecord(payload.ownerIdentityKeyRecord)
      || !Array.isArray(payload.readerGrantLifecycleRecords)
      || !Array.isArray(payload.writerGrantRecords)
      || !Array.isArray(payload.writerGrantLifecycleRecords)
      || !Array.isArray(payload.rotationRecords)
      || !Array.isArray(payload.itemRecords)) {
      throw new Error('invalid_reader_sync_payload');
    }
    const manifestInput =
      buildPicoReaderCustodySyncManifestSignatureInput(manifest);
    assertKeyRecordMatchesMetadata(
      sodium,
      payload.ownerIdentityKeyRecord,
      'pico_identity',
    );
    const ownerFingerprint = keyRecordFingerprintHex(
      sodium,
      'pico_identity',
      hexToBytes(payload.ownerIdentityKeyRecord.publicKeyHex),
    );
    if (ownerFingerprint !== manifest.ownerIdentityKeyFingerprintHex
      || !verifyDetached(
        sodium,
        payload.ownerIdentityKeyRecord.publicKeyHex,
        manifestInput,
        payload.ownerSignatureHex,
      )) {
      throw new Error('invalid_reader_sync_manifest');
    }
    const references = syncEvidenceReferences(
      sodium,
      syncEvidenceRecords(payload),
    );
    const evidenceDigestHex = bytesToHex(sodium.crypto_generichash(
      32,
      buildPicoReaderCustodySyncEvidenceDigestInput(references),
      null,
    ));
    if (evidenceDigestHex !== manifest.evidenceDigestHex) {
      throw new Error('invalid_reader_sync_evidence_digest');
    }
    return payload;
  } catch (error) {
    if (error instanceof Error
      && (error.message.startsWith('invalid_reader_sync')
        || error.message === 'sync_payload_too_large')) {
      throw error;
    }
    throw new Error('invalid_reader_sync_payload');
  } finally {
    sodium.memzero(plaintext);
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
  const ownerSignatureHex = bytesToHex(input.ownerIdentitySession.sign(domainSignatureInput, {
    label: picoReaderCustodyCanonicalLabels.domain,
    fields: domain,
  }));
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
        input.ownerIdentitySession.sign(buildPicoShareEnvelopeSignatureInput(envelope), {
          label: picoShareCanonicalLabels.envelope,
          fields: envelope,
        }),
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

export function createPicoReaderCustodyReaderGrant(
  sodium: VaultSodium,
  input: CreatePicoReaderCustodyReaderGrantInput,
): PicoReaderCustodyReaderGrantRecord {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  const rotations = validatedRotationChain(
    sodium,
    input.domainRecord,
    input.rotationRecords ?? [],
  );
  const ownerMetadata = input.ownerIdentitySession.metadata();
  if (ownerMetadata.keyRole !== 'pico_identity'
    || ownerMetadata.keyFingerprintHex
      !== input.domainRecord.domain.ownerIdentityKeyFingerprintHex) {
    throw new Error('owner_identity_key_required');
  }
  assertKeyRecordMatchesMetadata(
    sodium,
    input.readerKeyRecord,
    'device_key_agreement',
  );
  const currentKekVersion = currentReaderCustodyKekVersion(
    input.domainRecord,
    rotations,
  );
  if (!Number.isSafeInteger(input.firstKekVersion)
    || input.firstKekVersion < input.domainRecord.domain.kekVersion
    || input.firstKekVersion > currentKekVersion
    || (input.accessMode === 'forward_only'
      && input.firstKekVersion !== currentKekVersion)) {
    throw new Error('invalid_reader_history_range');
  }

  const domain = input.domainRecord.domain;
  const readerKeyFingerprintHex = keyRecordFingerprintHex(
    sodium,
    'device_key_agreement',
    hexToBytes(input.readerKeyRecord.publicKeyHex),
  );
  const grant: PicoReaderCustodyReaderGrantSignatureInput = {
    suite: picoMemoryContentSuite,
    readerGrantId: input.readerGrantId,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    readerIdentityKeyFingerprintHex: input.readerIdentityKeyFingerprintHex,
    readerDeviceSigningKeyFingerprintHex:
      input.readerDeviceSigningKeyFingerprintHex,
    readerKeyFingerprintHex,
    readerDelegationId: input.readerDelegationId,
    accessMode: input.accessMode,
    firstKekVersion: input.firstKekVersion,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: input.lifecycleOrder,
  };
  const ownerIdentityKeyRecord = keyRecordFromMetadata(ownerMetadata);
  const envelopes: PicoShareEnvelopeRecord[] = [];

  for (
    let kekVersion = input.firstKekVersion;
    kekVersion <= currentKekVersion;
    kekVersion += 1
  ) {
    const ownerEnvelope = ownerEnvelopeForVersion(
      input.domainRecord,
      rotations,
      kekVersion,
    );
    const kek = openPicoReaderCustodyKekFromEnvelope(
      sodium,
      input.ownerReaderKeyAgreementSession,
      domain.domainId,
      kekVersion,
      domain.ownerReaderKeyFingerprintHex,
      ownerEnvelope,
    );
    try {
      envelopes.push(createPicoReaderCustodyEnvelope(sodium, {
        ownerIdentitySession: input.ownerIdentitySession,
        ownerIdentityKeyRecord,
        grantId: grant.readerGrantId,
        domain,
        kekVersion,
        readerKeyRecord: input.readerKeyRecord,
        readerKeyFingerprintHex,
        kek,
        grantedAt: input.validFrom,
        createdAt: input.receivedAt ?? input.validFrom,
      }));
    } finally {
      sodium.memzero(kek);
    }
  }

  return {
    schema: picoReaderCustodyReaderGrantRecordSchema,
    grant,
    ownerIdentityKeyRecord,
    readerKeyRecord: { ...input.readerKeyRecord },
    envelopes,
    ownerSignatureHex: bytesToHex(
      input.ownerIdentitySession.sign(
        buildPicoReaderCustodyReaderGrantSignatureInput(grant),
        { label: picoReaderCustodyCanonicalLabels.readerGrant, fields: grant },
      ),
    ),
    receivedAt: input.receivedAt ?? input.validFrom,
  };
}

export function revokePicoReaderCustodyReaderGrant(
  sodium: VaultSodium,
  input: RevokePicoReaderCustodyReaderGrantInput,
): PicoReaderCustodyReaderGrantLifecycleRecord {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  assertPicoReaderCustodyReaderGrantRecord(
    sodium,
    input.domainRecord,
    input.readerGrantRecord,
  );
  const ownerMetadata = input.ownerIdentitySession.metadata();
  if (ownerMetadata.keyRole !== 'pico_identity'
    || ownerMetadata.keyFingerprintHex
      !== input.domainRecord.domain.ownerIdentityKeyFingerprintHex) {
    throw new Error('owner_identity_key_required');
  }
  const domain = input.domainRecord.domain;
  const grant = input.readerGrantRecord.grant;
  const lifecycle: PicoReaderCustodyReaderGrantLifecycleSignatureInput = {
    suite: picoMemoryContentSuite,
    lifecycleId: input.lifecycleId,
    readerGrantId: grant.readerGrantId,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    readerIdentityKeyFingerprintHex: grant.readerIdentityKeyFingerprintHex,
    readerKeyFingerprintHex: grant.readerKeyFingerprintHex,
    status: 'revoked',
    reasonCategory: input.reasonCategory,
    changedAt: input.changedAt,
    lifecycleOrder: input.lifecycleOrder,
  };

  return {
    schema: picoReaderCustodyReaderGrantLifecycleRecordSchema,
    lifecycle,
    ownerIdentityKeyRecord: keyRecordFromMetadata(ownerMetadata),
    ownerSignatureHex: bytesToHex(
      input.ownerIdentitySession.sign(
        buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(lifecycle),
        { label: picoReaderCustodyCanonicalLabels.readerGrantLifecycle, fields: lifecycle },
      ),
    ),
    receivedAt: input.receivedAt ?? input.changedAt,
  };
}

export function rotatePicoReaderCustodyDomain(
  sodium: VaultSodium,
  input: RotatePicoReaderCustodyDomainInput,
): PicoReaderCustodyKekRotationRecord {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  const rotations = validatedRotationChain(
    sodium,
    input.domainRecord,
    input.rotationRecords ?? [],
  );
  const ownerMetadata = input.ownerIdentitySession.metadata();
  if (ownerMetadata.keyRole !== 'pico_identity'
    || ownerMetadata.keyFingerprintHex
      !== input.domainRecord.domain.ownerIdentityKeyFingerprintHex) {
    throw new Error('owner_identity_key_required');
  }
  const domain = input.domainRecord.domain;
  const readerLifecycles = input.readerGrantLifecycleRecords ?? [];
  const writerLifecycles = input.writerGrantLifecycleRecords ?? [];
  for (const lifecycle of readerLifecycles) {
    assertPicoReaderCustodyReaderGrantLifecycleRecord(
      sodium,
      input.domainRecord,
      lifecycle,
    );
  }
  for (const lifecycle of writerLifecycles) {
    assertPicoReaderCustodyWriterGrantLifecycleRecord(
      sodium,
      input.domainRecord,
      lifecycle,
    );
  }
  const causeLifecycleIds = [
    ...readerLifecycles.map((record) => record.lifecycle.lifecycleId),
    ...writerLifecycles.map((record) => record.lifecycle.lifecycleId),
  ].sort();
  if (causeLifecycleIds.length === 0
    || new Set(causeLifecycleIds).size !== causeLifecycleIds.length) {
    throw new Error('invalid_rotation_causes');
  }
  const previousLifecycleOrder = rotations.at(-1)?.rotation.lifecycleOrder
    ?? domain.lifecycleOrder;
  const causeLifecycles = [
    ...readerLifecycles.map((record) => record.lifecycle),
    ...writerLifecycles.map((record) => record.lifecycle),
  ];
  if (causeLifecycles.some((lifecycle) =>
    lifecycle.lifecycleOrder <= previousLifecycleOrder
    || lifecycle.lifecycleOrder >= input.lifecycleOrder
    || lifecycle.changedAt > input.rotatedAt)) {
    throw new Error('invalid_rotation_causes');
  }

  const remainingReaderGrantRecords =
    input.remainingReaderGrantRecords ?? [];
  for (const grant of remainingReaderGrantRecords) {
    assertPicoReaderCustodyReaderGrantRecord(
      sodium,
      input.domainRecord,
      grant,
    );
    if (grant.grant.validFrom > input.rotatedAt
      || grant.grant.validUntil <= input.rotatedAt) {
      throw new Error('inactive_reader_grant');
    }
  }
  const remainingReaderGrantIds = remainingReaderGrantRecords
    .map((record) => record.grant.readerGrantId)
    .sort();
  if (new Set(remainingReaderGrantIds).size
      !== remainingReaderGrantIds.length) {
    throw new Error('duplicate_reader_grant');
  }

  const previousKekVersion = currentReaderCustodyKekVersion(
    input.domainRecord,
    rotations,
  );
  const rotation: PicoReaderCustodyKekRotationSignatureInput = {
    suite: picoMemoryContentSuite,
    rotationId: input.rotationId,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    previousKekVersion,
    kekVersion: previousKekVersion + 1,
    causeLifecycleIds,
    remainingReaderGrantIds,
    rotatedAt: input.rotatedAt,
    lifecycleOrder: input.lifecycleOrder,
  };
  const ownerIdentityKeyRecord = keyRecordFromMetadata(ownerMetadata);
  const kek = sodium.randombytes_buf(32);
  try {
    const envelopes = [
      createPicoReaderCustodyEnvelope(sodium, {
        ownerIdentitySession: input.ownerIdentitySession,
        ownerIdentityKeyRecord,
        grantId: rotation.rotationId,
        domain,
        kekVersion: rotation.kekVersion,
        readerKeyRecord: input.domainRecord.ownerReaderKeyRecord,
        readerKeyFingerprintHex: domain.ownerReaderKeyFingerprintHex,
        kek,
        grantedAt: input.rotatedAt,
        createdAt: input.receivedAt ?? input.rotatedAt,
      }),
      ...remainingReaderGrantRecords.map((readerGrant) =>
        createPicoReaderCustodyEnvelope(sodium, {
          ownerIdentitySession: input.ownerIdentitySession,
          ownerIdentityKeyRecord,
          grantId: readerGrant.grant.readerGrantId,
          domain,
          kekVersion: rotation.kekVersion,
          readerKeyRecord: readerGrant.readerKeyRecord,
          readerKeyFingerprintHex:
            readerGrant.grant.readerKeyFingerprintHex,
          kek,
          grantedAt: input.rotatedAt,
          createdAt: input.receivedAt ?? input.rotatedAt,
        })),
    ];
    return {
      schema: picoReaderCustodyKekRotationRecordSchema,
      rotation,
      ownerIdentityKeyRecord,
      envelopes,
      ownerSignatureHex: bytesToHex(
        input.ownerIdentitySession.sign(
          buildPicoReaderCustodyKekRotationSignatureInput(rotation),
          { label: picoReaderCustodyCanonicalLabels.kekRotation, fields: rotation },
        ),
      ),
      receivedAt: input.receivedAt ?? input.rotatedAt,
    };
  } finally {
    sodium.memzero(kek);
  }
}

export function createPicoReaderCustodyWriterGrant(
  sodium: VaultSodium,
  input: CreatePicoReaderCustodyWriterGrantInput,
): PicoReaderCustodyWriterGrantRecord {
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  const rotations = validatedRotationChain(
    sodium,
    input.domainRecord,
    input.rotationRecords ?? [],
  );
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
    kekVersion: currentReaderCustodyKekVersion(
      input.domainRecord,
      rotations,
    ),
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
        { label: picoReaderCustodyCanonicalLabels.writerGrant, fields: grant },
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
  const rotations = validatedRotationChain(
    sodium,
    input.domainRecord,
    input.rotationRecords ?? [],
  );
  assertPicoReaderCustodyWriterGrantRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
    currentReaderCustodyKekVersion(input.domainRecord, rotations),
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
        { label: picoReaderCustodyCanonicalLabels.writerGrantLifecycle, fields: lifecycle },
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
  const rotations = validatedRotationChain(
    sodium,
    input.domainRecord,
    input.rotationRecords ?? [],
  );
  assertPicoReaderCustodyWriterGrantRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
    currentReaderCustodyKekVersion(input.domainRecord, rotations),
  );
  const domain = input.domainRecord.domain;
  const grant = input.writerGrantRecord.grant;
  if (grant.kekVersion !== currentReaderCustodyKekVersion(
    input.domainRecord,
    rotations,
  )) {
    throw new Error('writer_grant_not_current');
  }
  if (input.createdAt < grant.validFrom || input.createdAt >= grant.validUntil) {
    throw new Error('writer_grant_inactive');
  }

  const writerMetadata = input.writerSigningSession.metadata();
  if (writerMetadata.keyRole !== 'device_signing'
    || writerMetadata.keyFingerprintHex
      !== grant.writerDeviceSigningKeyFingerprintHex) {
    throw new Error('writer_signing_key_mismatch');
  }

  const kek = openPicoReaderCustodyKekFromEnvelope(
    sodium,
    input.readerKeyAgreementSession,
    domain.domainId,
    grant.kekVersion,
    domain.ownerReaderKeyFingerprintHex,
    ownerEnvelopeForVersion(
      input.domainRecord,
      rotations,
      grant.kekVersion,
    ),
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
      kekVersion: grant.kekVersion,
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
          { label: picoReaderCustodyCanonicalLabels.item, fields: item },
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
  assertOptionalTimestampMs(input.nowMs);
  assertPicoReaderCustodyDomainRecord(sodium, input.domainRecord);
  const rotations = validatedRotationChain(
    sodium,
    input.domainRecord,
    input.rotationRecords ?? [],
  );
  assertPicoReaderCustodyWriterGrantRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
    currentReaderCustodyKekVersion(input.domainRecord, rotations),
  );
  assertPicoReaderCustodyItemRecord(
    sodium,
    input.domainRecord,
    input.writerGrantRecord,
    input.itemRecord,
  );
  const metadata = input.readerKeyAgreementSession.metadata();
  const envelope = metadata.keyFingerprintHex
      === input.domainRecord.domain.ownerReaderKeyFingerprintHex
    ? ownerEnvelopeForVersion(
      input.domainRecord,
      rotations,
      input.itemRecord.item.kekVersion,
    )
    : readerEnvelopeForVersion(
      sodium,
      input.domainRecord,
      rotations,
      input.readerGrantRecord,
      input.itemRecord.item.kekVersion,
      metadata.keyFingerprintHex,
    );
  const kek = openPicoReaderCustodyKekFromEnvelope(
    sodium,
    input.readerKeyAgreementSession,
    input.domainRecord.domain.domainId,
    input.itemRecord.item.kekVersion,
    metadata.keyFingerprintHex,
    envelope,
    { nowMs: input.nowMs },
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

export function encodePicoRecoveryPhrase(
  sodium: VaultSodium,
  seedMaterial: Uint8Array,
): string {
  if (seedMaterial.byteLength !== 32) {
    throw new Error('invalid_recovery_seed_length');
  }
  if (bip39EnglishWordlist.length !== 2_048) {
    throw new Error('invalid_bip39_english_wordlist');
  }
  const checksum = sodium.crypto_hash_sha256(seedMaterial)[0]!;
  const bits = [...seedMaterial, checksum]
    .map((byte) => byte.toString(2).padStart(8, '0'))
    .join('');
  return Array.from({ length: 24 }, (_, index) =>
    bip39EnglishWordlist[
      Number.parseInt(bits.slice(index * 11, (index + 1) * 11), 2)
    ]!,
  ).join(' ');
}

export function decodePicoRecoveryPhrase(
  sodium: VaultSodium,
  recoveryPhrase: string,
): Uint8Array {
  if (typeof recoveryPhrase !== 'string') {
    throw new Error('invalid_recovery_phrase');
  }
  const words = recoveryPhrase.normalize('NFKD').trim().split(/\s+/);
  if (words.length !== 24) {
    throw new Error('invalid_recovery_phrase_word_count');
  }
  const bits = words.map((word) => {
    if (!/^[a-z]+$/.test(word)) {
      throw new Error('invalid_recovery_phrase_word');
    }
    const index = bip39EnglishWordlist.indexOf(word);
    if (index < 0) {
      throw new Error('invalid_recovery_phrase_word');
    }
    return index.toString(2).padStart(11, '0');
  }).join('');
  const seed = Uint8Array.from(
    Array.from({ length: 32 }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, (index + 1) * 8), 2),
    ),
  );
  const checksum = Number.parseInt(bits.slice(256, 264), 2);
  if (sodium.crypto_hash_sha256(seed)[0] !== checksum) {
    sodium.memzero(seed);
    throw new Error('invalid_recovery_phrase_checksum');
  }
  return seed;
}

export function protectPicoRecoverySeedWithPin(
  sodium: VaultSodium,
  input: {
    seed: Uint8Array;
    identityKeyFingerprintHex: string;
    pin: string;
  },
): Uint8Array {
  if (input.seed.byteLength !== 32) {
    throw new Error('invalid_recovery_seed_length');
  }
  const { key, nonce } = derivePicoRecoveryPinMaterial(
    sodium,
    input.identityKeyFingerprintHex,
    input.pin,
  );
  try {
    return sodium.crypto_stream_xchacha20_xor(
      input.seed,
      nonce,
      key,
    );
  } finally {
    sodium.memzero(key);
    sodium.memzero(nonce);
  }
}

export function restorePicoVaultIdentityFromRecovery(
  sodium: VaultSodium,
  input: RestorePicoVaultIdentityFromRecoveryInput,
): CreatePicoVaultKeyfileResult {
  assertSodiumConstants(sodium);
  assertPassphrase(input.passphrase);
  const hasPhrase = input.recoveryPhrase !== undefined;
  const hasSeedMaterial = input.seedMaterialHex !== undefined;
  if (hasPhrase === hasSeedMaterial) {
    throw new Error('recovery_source_must_be_phrase_or_qr_seed');
  }
  let cardSeedMaterial = hasPhrase
    ? decodePicoRecoveryPhrase(sodium, input.recoveryPhrase!)
    : hexToBytes(input.seedMaterialHex!);
  if (cardSeedMaterial.byteLength !== 32) {
    sodium.memzero(cardSeedMaterial);
    throw new Error('invalid_recovery_seed_length');
  }
  let rootSeed = cardSeedMaterial;
  try {
    if (input.pinProtected !== true) {
      throw new Error('recovery_card_pin_protection_required');
    }
    rootSeed = protectPicoRecoverySeedWithPin(sodium, {
      seed: cardSeedMaterial,
      identityKeyFingerprintHex:
        input.identityKeyFingerprintHex,
      pin: input.pin,
    });

    const pair = sodium.crypto_sign_seed_keypair(rootSeed);
    const fingerprint = keyRecordFingerprintHex(
      sodium,
      'pico_identity',
      pair.publicKey,
    );
    if (fingerprint !== input.identityKeyFingerprintHex) {
      sodium.memzero(pair.privateKey);
      throw new Error('recovery_pin_or_seed_mismatch');
    }
    return createEncryptedPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: input.passphrase,
    }, pair);
  } finally {
    if (rootSeed !== cardSeedMaterial) {
      sodium.memzero(rootSeed);
    }
    sodium.memzero(cardSeedMaterial);
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
  return createEncryptedPicoVaultKeyfile(sodium, input, keypair);
}

function createEncryptedPicoVaultKeyfile(
  sodium: VaultSodium,
  input: CreatePicoVaultKeyfileInput,
  keypair: { publicKey: Uint8Array; privateKey: Uint8Array },
): CreatePicoVaultKeyfileResult {
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

function issuePicoVaultRecoveryCardFromSeed(
  sodium: VaultSodium,
  seed: Uint8Array,
  identityKeyFingerprintHex: string,
  input: IssuePicoVaultRecoveryCardInput,
): PicoVaultRecoveryCard {
  assertSodiumConstants(sodium);
  if (seed.byteLength !== 32) {
    throw new Error('invalid_recovery_seed_length');
  }
  let seedMaterial: Uint8Array = new Uint8Array(seed);
  try {
    const protectedSeed = protectPicoRecoverySeedWithPin(sodium, {
      seed: seedMaterial,
      identityKeyFingerprintHex,
      pin: input.pin,
    });
    sodium.memzero(seedMaterial);
    seedMaterial = protectedSeed;
    const payload: PicoRecoveryCardPayload = {
      schema: picoRecoveryCardSchema,
      suite: picoIdentitySuite,
      picoName: input.picoName,
      homeNameOrId: input.homeNameOrId,
      seedMaterialHex: bytesToHex(seedMaterial),
      pinProtected: true,
      identityKeyFingerprintHex,
      homeId: input.homeId,
      hostSigningKeyFingerprintHex:
        input.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex:
        input.hostKeyAgreementKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex:
        input.hostKeyAgreementPublicKeyHex,
      endpointHint: input.endpointHint,
      issuedAt: input.issuedAt,
    };
    const canonicalPayload = buildPicoRecoveryCardPayload(payload);
    return {
      payload,
      recoveryPhrase:
        encodePicoRecoveryPhrase(sodium, seedMaterial),
      canonicalPayloadHex: bytesToHex(canonicalPayload),
    };
  } finally {
    sodium.memzero(seedMaterial);
  }
}

function derivePicoRecoveryPinMaterial(
  sodium: VaultSodium,
  identityKeyFingerprintHex: string,
  pin: string,
): { key: Uint8Array; nonce: Uint8Array } {
  assertSodiumConstants(sodium);
  if (
    typeof pin !== 'string'
    || pin.length < picoRecoveryPinProtection.minLength
    || pin.length > picoRecoveryPinProtection.maxLength
    || !/^[0-9a-z]+$/.test(pin)
  ) {
    throw new Error('invalid_recovery_pin');
  }
  const identityFingerprint = hexToBytes(
    identityKeyFingerprintHex,
  );
  if (identityFingerprint.byteLength !== 32) {
    throw new Error('invalid_recovery_identity_fingerprint');
  }
  const salt = sodium.crypto_generichash(
    sodium.crypto_pwhash_SALTBYTES,
    concatElements([
      asciiBytes(picoRecoveryPinProtection.saltLabel),
      identityFingerprint,
    ]),
    null,
  );
  const nonce = sodium.crypto_generichash(
    sodium.crypto_stream_xchacha20_NONCEBYTES,
    concatElements([
      asciiBytes(picoRecoveryPinProtection.nonceLabel),
      identityFingerprint,
    ]),
    null,
  );
  try {
    return {
      key: sodium.crypto_pwhash(
        sodium.crypto_stream_xchacha20_KEYBYTES,
        pin,
        salt,
        picoVaultArgon2idModerateParams.opsLimit,
        picoVaultArgon2idModerateParams.memLimitBytes,
        sodium.crypto_pwhash_ALG_ARGON2ID13,
      ),
      nonce,
    };
  } finally {
    sodium.memzero(salt);
    sodium.memzero(identityFingerprint);
  }
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

function assertPicoReaderCustodyReaderGrantRecord(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  record: PicoReaderCustodyReaderGrantRecord,
): void {
  const domain = domainRecord.domain;
  const grant = record.grant;
  if (record.schema !== picoReaderCustodyReaderGrantRecordSchema
    || grant.suite !== picoMemoryContentSuite
    || grant.domainAuthorityId !== domain.domainAuthorityId
    || grant.homeId !== domain.homeId
    || grant.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || grant.domainId !== domain.domainId
    || grant.ownerIdentityKeyFingerprintHex
      !== domain.ownerIdentityKeyFingerprintHex
    || !sameKeyRecord(
      record.ownerIdentityKeyRecord,
      domainRecord.ownerIdentityKeyRecord,
    )
    || !isCanonicalInstant(record.receivedAt)
    || !Array.isArray(record.envelopes)
    || record.envelopes.length === 0) {
    throw new Error('invalid_reader_custody_reader_grant');
  }
  buildPicoReaderCustodyReaderGrantSignatureInput(grant);
  assertKeyRecordMatchesMetadata(
    sodium,
    record.readerKeyRecord,
    'device_key_agreement',
  );
  const readerKeyFingerprintHex = keyRecordFingerprintHex(
    sodium,
    'device_key_agreement',
    hexToBytes(record.readerKeyRecord.publicKeyHex),
  );
  const versions = record.envelopes
    .map((envelope) => envelope.envelope.kekVersion)
    .sort((left, right) => left - right);
  if (grant.readerKeyFingerprintHex !== readerKeyFingerprintHex
    || versions[0] !== grant.firstKekVersion
    || new Set(versions).size !== versions.length
    || versions.some((version, index) =>
      version !== grant.firstKekVersion + index)
    || (grant.accessMode === 'forward_only' && versions.length !== 1)
    || !verifyDetached(
      sodium,
      record.ownerIdentityKeyRecord.publicKeyHex,
      buildPicoReaderCustodyReaderGrantSignatureInput(grant),
      record.ownerSignatureHex,
    )) {
    throw new Error('invalid_reader_custody_reader_grant');
  }
  for (const envelope of record.envelopes) {
    assertPicoReaderCustodyEnvelope(sodium, {
      envelope,
      ownerIdentityKeyRecord: record.ownerIdentityKeyRecord,
      grantId: grant.readerGrantId,
      domain,
      kekVersion: envelope.envelope.kekVersion,
      readerKeyFingerprintHex,
      grantedAt: grant.validFrom,
    });
  }
}

function assertPicoReaderCustodyReaderGrantLifecycleRecord(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  record: PicoReaderCustodyReaderGrantLifecycleRecord,
): void {
  const domain = domainRecord.domain;
  const lifecycle = record.lifecycle;
  if (record.schema !== picoReaderCustodyReaderGrantLifecycleRecordSchema
    || lifecycle.suite !== picoMemoryContentSuite
    || lifecycle.domainAuthorityId !== domain.domainAuthorityId
    || lifecycle.homeId !== domain.homeId
    || lifecycle.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || lifecycle.domainId !== domain.domainId
    || lifecycle.ownerIdentityKeyFingerprintHex
      !== domain.ownerIdentityKeyFingerprintHex
    || !sameKeyRecord(
      record.ownerIdentityKeyRecord,
      domainRecord.ownerIdentityKeyRecord,
    )
    || !isCanonicalInstant(record.receivedAt)) {
    throw new Error('invalid_reader_custody_reader_lifecycle');
  }
  buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(lifecycle);
  if (!verifyDetached(
    sodium,
    record.ownerIdentityKeyRecord.publicKeyHex,
    buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(lifecycle),
    record.ownerSignatureHex,
  )) {
    throw new Error('invalid_reader_custody_reader_lifecycle');
  }
}

function assertPicoReaderCustodyWriterGrantLifecycleRecord(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  record: PicoReaderCustodyWriterGrantLifecycleRecord,
): void {
  const domain = domainRecord.domain;
  const lifecycle = record.lifecycle;
  if (record.schema !== picoReaderCustodyWriterGrantLifecycleRecordSchema
    || lifecycle.suite !== picoMemoryContentSuite
    || lifecycle.domainAuthorityId !== domain.domainAuthorityId
    || lifecycle.homeId !== domain.homeId
    || lifecycle.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || lifecycle.domainId !== domain.domainId
    || lifecycle.ownerIdentityKeyFingerprintHex
      !== domain.ownerIdentityKeyFingerprintHex
    || !sameKeyRecord(
      record.ownerIdentityKeyRecord,
      domainRecord.ownerIdentityKeyRecord,
    )
    || !isCanonicalInstant(record.receivedAt)) {
    throw new Error('invalid_reader_custody_writer_lifecycle');
  }
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(lifecycle);
  if (!verifyDetached(
    sodium,
    record.ownerIdentityKeyRecord.publicKeyHex,
    buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(lifecycle),
    record.ownerSignatureHex,
  )) {
    throw new Error('invalid_reader_custody_writer_lifecycle');
  }
}

function assertPicoReaderCustodyKekRotationRecord(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  record: PicoReaderCustodyKekRotationRecord,
): void {
  const domain = domainRecord.domain;
  const rotation = record.rotation;
  if (record.schema !== picoReaderCustodyKekRotationRecordSchema
    || rotation.suite !== picoMemoryContentSuite
    || rotation.domainAuthorityId !== domain.domainAuthorityId
    || rotation.homeId !== domain.homeId
    || rotation.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || rotation.domainId !== domain.domainId
    || rotation.ownerIdentityKeyFingerprintHex
      !== domain.ownerIdentityKeyFingerprintHex
    || !sameKeyRecord(
      record.ownerIdentityKeyRecord,
      domainRecord.ownerIdentityKeyRecord,
    )
    || !Array.isArray(record.envelopes)
    || record.envelopes.length
      !== rotation.remainingReaderGrantIds.length + 1
    || !isCanonicalInstant(record.receivedAt)) {
    throw new Error('invalid_reader_custody_rotation');
  }
  buildPicoReaderCustodyKekRotationSignatureInput(rotation);
  if (!verifyDetached(
    sodium,
    record.ownerIdentityKeyRecord.publicKeyHex,
    buildPicoReaderCustodyKekRotationSignatureInput(rotation),
    record.ownerSignatureHex,
  )) {
    throw new Error('invalid_reader_custody_rotation');
  }

  const envelopeByGrant = new Map(
    record.envelopes.map((envelope) => [
      envelope.envelope.grantId,
      envelope,
    ]),
  );
  if (envelopeByGrant.size !== record.envelopes.length) {
    throw new Error('invalid_reader_custody_rotation');
  }
  const ownerEnvelope = envelopeByGrant.get(rotation.rotationId);
  if (ownerEnvelope === undefined) {
    throw new Error('invalid_reader_custody_rotation');
  }
  assertPicoReaderCustodyEnvelope(sodium, {
    envelope: ownerEnvelope,
    ownerIdentityKeyRecord: record.ownerIdentityKeyRecord,
    grantId: rotation.rotationId,
    domain,
    kekVersion: rotation.kekVersion,
    readerKeyFingerprintHex: domain.ownerReaderKeyFingerprintHex,
    grantedAt: rotation.rotatedAt,
  });
  const readerGrantIds = [...rotation.remainingReaderGrantIds].sort();
  const envelopeGrantIds = record.envelopes
    .map((envelope) => envelope.envelope.grantId)
    .filter((grantId) => grantId !== rotation.rotationId)
    .sort();
  if (JSON.stringify(readerGrantIds) !== JSON.stringify(envelopeGrantIds)) {
    throw new Error('invalid_reader_custody_rotation');
  }
  for (const grantId of readerGrantIds) {
    const envelope = envelopeByGrant.get(grantId);
    if (envelope === undefined) {
      throw new Error('invalid_reader_custody_rotation');
    }
    assertPicoReaderCustodyEnvelope(sodium, {
      envelope,
      ownerIdentityKeyRecord: record.ownerIdentityKeyRecord,
      grantId,
      domain,
      kekVersion: rotation.kekVersion,
      readerKeyFingerprintHex: envelope.envelope.readerKeyFingerprintHex,
      grantedAt: rotation.rotatedAt,
    });
  }
}

function assertPicoReaderCustodyWriterGrantRecord(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  record: PicoReaderCustodyWriterGrantRecord,
  maximumKekVersion: number = domainRecord.domain.kekVersion,
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
    || grant.kekVersion < domain.kekVersion
    || grant.kekVersion > maximumKekVersion
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
    || item.kekVersion !== grant.kekVersion
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

function createPicoReaderCustodyEnvelope(
  sodium: VaultSodium,
  input: {
    ownerIdentitySession: PicoVaultDetachedSigner;
    ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    grantId: string;
    domain: PicoReaderCustodyDomainSignatureInput;
    kekVersion: number;
    readerKeyRecord: PicoIdentityKeyRecordSignatureInput;
    readerKeyFingerprintHex: string;
    kek: Uint8Array;
    grantedAt: string;
    createdAt: string;
  },
): PicoShareEnvelopeRecord {
  const wrapPayload = buildPicoShareWrapPayload({
    suite: picoShareSuite,
    domainId: input.domain.domainId,
    kekVersion: input.kekVersion,
    readerKeyFingerprintHex: input.readerKeyFingerprintHex,
    kekHex: bytesToHex(input.kek),
  });
  try {
    const sealedWrap = sodium.crypto_box_seal(
      wrapPayload,
      hexToBytes(input.readerKeyRecord.publicKeyHex),
    );
    const envelope = {
      suite: picoShareSuite,
      grantId: input.grantId,
      domainId: input.domain.domainId,
      kekVersion: input.kekVersion,
      hostSigningKeyFingerprintHex:
        input.domain.hostSigningKeyFingerprintHex,
      issuerIdentityKeyFingerprintHex:
        input.domain.ownerIdentityKeyFingerprintHex,
      readerKeyFingerprintHex: input.readerKeyFingerprintHex,
      wrapDigestHex: bytesToHex(
        sodium.crypto_generichash(32, sealedWrap, null),
      ),
      grantedAt: input.grantedAt,
    };
    return {
      schema: picoShareEnvelopeRecordSchema,
      envelope,
      sealedWrapHex: bytesToHex(sealedWrap),
      issuerIdentityKeyRecord: { ...input.ownerIdentityKeyRecord },
      issuerSignatureHex: bytesToHex(
        input.ownerIdentitySession.sign(
          buildPicoShareEnvelopeSignatureInput(envelope),
          { label: picoShareCanonicalLabels.envelope, fields: envelope },
        ),
      ),
      createdAt: input.createdAt,
    };
  } finally {
    sodium.memzero(wrapPayload);
  }
}

function openPicoReaderCustodyKekFromEnvelope(
  sodium: VaultSodium,
  readerSession: PicoVaultSession,
  domainId: string,
  kekVersion: number,
  readerKeyFingerprintHex: string,
  envelope: PicoShareEnvelopeRecord,
  options: PicoVaultSessionUseOptions = {},
): Uint8Array {
  const metadata = readerSession.metadata();
  if (metadata.keyRole !== 'device_key_agreement'
    || metadata.keyFingerprintHex !== readerKeyFingerprintHex
    || envelope.envelope.domainId !== domainId
    || envelope.envelope.kekVersion !== kekVersion
    || envelope.envelope.readerKeyFingerprintHex
      !== readerKeyFingerprintHex) {
    throw new Error('reader_key_mismatch');
  }
  const plaintext = readerSession.unwrapSealedBox(
    hexToBytes(envelope.sealedWrapHex),
    options,
  );
  try {
    const reader = new CanonicalElementReader(plaintext, 'invalid_share_wrap');
    if (reader.readAscii() !== picoShareCanonicalLabels.wrap
      || reader.readAscii() !== picoShareSuite
      || reader.readAscii() !== domainId
      || reader.readAscii() !== String(kekVersion)
      || bytesToHex(reader.readBytes()) !== readerKeyFingerprintHex) {
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

function validatedRotationChain(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  rotationRecords: readonly PicoReaderCustodyKekRotationRecord[],
): PicoReaderCustodyKekRotationRecord[] {
  const rotations = [...rotationRecords].sort(
    (left, right) =>
      left.rotation.kekVersion - right.rotation.kekVersion,
  );
  let previousVersion = domainRecord.domain.kekVersion;
  let previousLifecycleOrder = domainRecord.domain.lifecycleOrder;
  const coveredCauses = new Set<string>();
  for (const record of rotations) {
    assertPicoReaderCustodyKekRotationRecord(sodium, domainRecord, record);
    const rotation = record.rotation;
    if (rotation.previousKekVersion !== previousVersion
      || rotation.kekVersion !== previousVersion + 1
      || rotation.lifecycleOrder <= previousLifecycleOrder
      || rotation.causeLifecycleIds.some((id) => coveredCauses.has(id))) {
      throw new Error('invalid_reader_custody_rotation_chain');
    }
    rotation.causeLifecycleIds.forEach((id) => coveredCauses.add(id));
    previousVersion = rotation.kekVersion;
    previousLifecycleOrder = rotation.lifecycleOrder;
  }
  return rotations;
}

function currentReaderCustodyKekVersion(
  domainRecord: PicoReaderCustodyDomainRecord,
  rotationRecords: readonly PicoReaderCustodyKekRotationRecord[],
): number {
  return rotationRecords.at(-1)?.rotation.kekVersion
    ?? domainRecord.domain.kekVersion;
}

function ownerEnvelopeForVersion(
  domainRecord: PicoReaderCustodyDomainRecord,
  rotationRecords: readonly PicoReaderCustodyKekRotationRecord[],
  kekVersion: number,
): PicoShareEnvelopeRecord {
  if (kekVersion === domainRecord.domain.kekVersion) {
    return domainRecord.ownerEnvelope;
  }
  const rotation = rotationRecords.find(
    (record) => record.rotation.kekVersion === kekVersion,
  );
  const envelope = rotation?.envelopes.find(
    (candidate) =>
      candidate.envelope.grantId === rotation.rotation.rotationId
      && candidate.envelope.readerKeyFingerprintHex
        === domainRecord.domain.ownerReaderKeyFingerprintHex,
  );
  if (envelope === undefined) {
    throw new Error('owner_kek_envelope_unavailable');
  }
  return envelope;
}

function readerEnvelopeForVersion(
  sodium: VaultSodium,
  domainRecord: PicoReaderCustodyDomainRecord,
  rotationRecords: readonly PicoReaderCustodyKekRotationRecord[],
  readerGrantRecord: PicoReaderCustodyReaderGrantRecord | undefined,
  kekVersion: number,
  readerKeyFingerprintHex: string,
): PicoShareEnvelopeRecord {
  if (readerGrantRecord === undefined) {
    throw new Error('reader_grant_required');
  }
  assertPicoReaderCustodyReaderGrantRecord(
    sodium,
    domainRecord,
    readerGrantRecord,
  );
  if (readerGrantRecord.grant.readerKeyFingerprintHex
      !== readerKeyFingerprintHex
    || kekVersion < readerGrantRecord.grant.firstKekVersion) {
    throw new Error('reader_key_mismatch');
  }
  const initialEnvelope = readerGrantRecord.envelopes.find(
    (envelope) => envelope.envelope.kekVersion === kekVersion,
  );
  if (initialEnvelope !== undefined) {
    return initialEnvelope;
  }
  const rotatedEnvelope = rotationRecords
    .find((record) => record.rotation.kekVersion === kekVersion)
    ?.envelopes.find(
      (envelope) =>
        envelope.envelope.grantId
          === readerGrantRecord.grant.readerGrantId
        && envelope.envelope.readerKeyFingerprintHex
          === readerKeyFingerprintHex,
    );
  if (rotatedEnvelope === undefined) {
    throw new Error('reader_kek_envelope_unavailable');
  }
  return rotatedEnvelope;
}

function assertPicoReaderCustodyEnvelope(
  sodium: VaultSodium,
  input: {
    envelope: PicoShareEnvelopeRecord;
    ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    grantId: string;
    domain: PicoReaderCustodyDomainSignatureInput;
    kekVersion: number;
    readerKeyFingerprintHex: string;
    grantedAt: string;
  },
): void {
  const record = input.envelope;
  const envelope = record.envelope;
  if (record.schema !== picoShareEnvelopeRecordSchema
    || envelope.suite !== picoShareSuite
    || envelope.grantId !== input.grantId
    || envelope.domainId !== input.domain.domainId
    || envelope.kekVersion !== input.kekVersion
    || envelope.hostSigningKeyFingerprintHex
      !== input.domain.hostSigningKeyFingerprintHex
    || envelope.issuerIdentityKeyFingerprintHex
      !== input.domain.ownerIdentityKeyFingerprintHex
    || envelope.readerKeyFingerprintHex !== input.readerKeyFingerprintHex
    || envelope.grantedAt !== input.grantedAt
    || !sameKeyRecord(
      record.issuerIdentityKeyRecord,
      input.ownerIdentityKeyRecord,
    )
    || !isCanonicalInstant(record.createdAt)) {
    throw new Error('invalid_reader_custody_envelope');
  }
  const sealedWrap = hexToBytes(record.sealedWrapHex);
  if (bytesToHex(sodium.crypto_generichash(32, sealedWrap, null))
      !== envelope.wrapDigestHex
    || !verifyDetached(
      sodium,
      input.ownerIdentityKeyRecord.publicKeyHex,
      buildPicoShareEnvelopeSignatureInput(envelope),
      record.issuerSignatureHex,
    )) {
    throw new Error('invalid_reader_custody_envelope');
  }
}

interface SyncEvidenceRecord {
  family: PicoReaderCustodySyncEvidenceReference['family'];
  recordId: string;
  record: unknown;
}

function syncEvidenceRecords(input: {
  domainRecord: PicoReaderCustodyDomainRecord;
  readerGrantRecord: PicoReaderCustodyReaderGrantRecord;
  readerGrantLifecycleRecords:
    readonly PicoReaderCustodyReaderGrantLifecycleRecord[];
  writerGrantRecords: readonly PicoReaderCustodyWriterGrantRecord[];
  writerGrantLifecycleRecords:
    readonly PicoReaderCustodyWriterGrantLifecycleRecord[];
  rotationRecords: readonly PicoReaderCustodyKekRotationRecord[];
  itemRecords: readonly PicoReaderCustodyItemRecord[];
}): SyncEvidenceRecord[] {
  return [
    {
      family: 'domain',
      recordId: input.domainRecord.domain.domainAuthorityId,
      record: input.domainRecord,
    },
    {
      family: 'reader_grant',
      recordId: input.readerGrantRecord.grant.readerGrantId,
      record: input.readerGrantRecord,
    },
    ...input.readerGrantLifecycleRecords.map((record) => ({
      family: 'reader_grant_lifecycle' as const,
      recordId: record.lifecycle.lifecycleId,
      record,
    })),
    ...input.writerGrantRecords.map((record) => ({
      family: 'writer_grant' as const,
      recordId: record.grant.writerGrantId,
      record,
    })),
    ...input.writerGrantLifecycleRecords.map((record) => ({
      family: 'writer_grant_lifecycle' as const,
      recordId: record.lifecycle.lifecycleId,
      record,
    })),
    ...input.rotationRecords.map((record) => ({
      family: 'kek_rotation' as const,
      recordId: record.rotation.rotationId,
      record,
    })),
    ...input.itemRecords.map((record) => ({
      family: 'item' as const,
      recordId: record.item.packageId,
      record,
    })),
  ];
}

function syncEvidenceReferences(
  sodium: VaultSodium,
  records: readonly SyncEvidenceRecord[],
): PicoReaderCustodySyncEvidenceReference[] {
  return records.map((record) => ({
    family: record.family,
    recordId: record.recordId,
    recordDigestHex: bytesToHex(sodium.crypto_generichash(
      32,
      buildPicoReaderCustodySyncRecordDigestInput(record.record),
      null,
    )),
  }));
}

function assertReaderGrantLifecycleLink(
  grantRecord: PicoReaderCustodyReaderGrantRecord,
  lifecycleRecord: PicoReaderCustodyReaderGrantLifecycleRecord,
): void {
  const grant = grantRecord.grant;
  const lifecycle = lifecycleRecord.lifecycle;
  if (lifecycle.readerGrantId !== grant.readerGrantId
    || lifecycle.readerIdentityKeyFingerprintHex
      !== grant.readerIdentityKeyFingerprintHex
    || lifecycle.readerKeyFingerprintHex
      !== grant.readerKeyFingerprintHex
    || lifecycle.lifecycleOrder <= grant.lifecycleOrder) {
    throw new Error('invalid_reader_custody_reader_lifecycle');
  }
}

function assertWriterGrantLifecycleLink(
  grantRecord: PicoReaderCustodyWriterGrantRecord,
  lifecycleRecord: PicoReaderCustodyWriterGrantLifecycleRecord,
): void {
  const grant = grantRecord.grant;
  const lifecycle = lifecycleRecord.lifecycle;
  if (lifecycle.writerGrantId !== grant.writerGrantId
    || lifecycle.writerIdentityKeyFingerprintHex
      !== grant.writerIdentityKeyFingerprintHex
    || lifecycle.writerDeviceSigningKeyFingerprintHex
      !== grant.writerDeviceSigningKeyFingerprintHex
    || lifecycle.lifecycleOrder <= grant.lifecycleOrder) {
    throw new Error('invalid_reader_custody_writer_lifecycle');
  }
}

function maximumLifecycleOrder(
  first: string,
  ...rest: string[]
): string {
  return rest.reduce(
    (maximum, value) => value > maximum ? value : maximum,
    first,
  );
}

function assertSyncRotationCauses(
  rotations: readonly PicoReaderCustodyKekRotationRecord[],
  readerLifecycles:
    readonly PicoReaderCustodyReaderGrantLifecycleRecord[],
  writerLifecycles:
    readonly PicoReaderCustodyWriterGrantLifecycleRecord[],
  initialLifecycleOrder: string,
  initialAt: string,
  throughAt: string,
): void {
  const lifecycleById = new Map<string, {
    changedAt: string;
    lifecycleOrder: string;
  }>();
  for (const record of readerLifecycles) {
    if (lifecycleById.has(record.lifecycle.lifecycleId)) {
      throw new Error('duplicate_sync_lifecycle');
    }
    lifecycleById.set(record.lifecycle.lifecycleId, {
      changedAt: record.lifecycle.changedAt,
      lifecycleOrder: record.lifecycle.lifecycleOrder,
    });
  }
  for (const record of writerLifecycles) {
    if (lifecycleById.has(record.lifecycle.lifecycleId)) {
      throw new Error('duplicate_sync_lifecycle');
    }
    lifecycleById.set(record.lifecycle.lifecycleId, {
      changedAt: record.lifecycle.changedAt,
      lifecycleOrder: record.lifecycle.lifecycleOrder,
    });
  }

  const covered = new Set<string>();
  let previousLifecycleOrder = initialLifecycleOrder;
  let previousAt = initialAt;
  for (const record of rotations) {
    const rotation = record.rotation;
    if (rotation.rotatedAt < previousAt
      || rotation.rotatedAt > throughAt) {
      throw new Error('invalid_sync_rotation_causes');
    }
    for (const [lifecycleId, evidence] of lifecycleById) {
      if (covered.has(lifecycleId)) {
        continue;
      }
      if (evidence.lifecycleOrder <= previousLifecycleOrder
        || (evidence.lifecycleOrder < rotation.lifecycleOrder
          && evidence.changedAt > rotation.rotatedAt)) {
        throw new Error('invalid_sync_rotation_causes');
      }
    }
    const actual = [...rotation.causeLifecycleIds].sort();
    const required = [...lifecycleById.entries()]
      .filter(([lifecycleId, evidence]) =>
        !covered.has(lifecycleId)
        && evidence.lifecycleOrder > previousLifecycleOrder
        && evidence.lifecycleOrder < rotation.lifecycleOrder
        && evidence.changedAt <= rotation.rotatedAt)
      .map(([lifecycleId]) => lifecycleId)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(required)) {
      throw new Error('invalid_sync_rotation_causes');
    }
    actual.forEach((lifecycleId) => covered.add(lifecycleId));
    previousLifecycleOrder = rotation.lifecycleOrder;
    previousAt = rotation.rotatedAt;
  }
}

function sameKeyRecord(
  left: PicoIdentityKeyRecordSignatureInput,
  right: PicoIdentityKeyRecordSignatureInput,
): boolean {
  return left.suite === right.suite
    && left.keyRole === right.keyRole
    && left.publicKeyHex === right.publicKeyHex;
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
  if (sodium.crypto_stream_xchacha20_KEYBYTES !== 32
    || sodium.crypto_stream_xchacha20_NONCEBYTES !== 24) {
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
