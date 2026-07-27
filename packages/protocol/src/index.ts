export const foundationEventTypes = [
  'device.registered',
  'device.seen',
  'session.created',
  'message.created',
  'avatar.state_changed',
  'memory.recorded',
  'memory.tombstone',
  'memory.domain_shredded',
  'auth.operator_bootstrapped',
  'auth.credential_changed',
  'auth.operator_reset',
  'auth.sessions_revoked',
  'home.claimed',
  'home.reset',
  'home.membership_recorded',
  'home.membership_changed',
  'home.domain_read_granted',
  'home.domain_read_revoked',
  'home.share_envelope_issued',
  'home.share_envelope_removed',
] as const;

export type FoundationEventType = typeof foundationEventTypes[number];

// Foundation event types the server synthesizes itself and never accepts on the
// client write path (a client must not forge them). `memory.domain_shredded` is
// the crypto-shred audit record (ADR 0071 step 4): it is appended by the shred
// operation, not by `POST /api/events`. The `auth.*` records are the operator
// audit trail (ADR 0076): only low-volume state changes an attacker cannot
// trigger are durable — failed logins stay in operational logging so the
// append-only log cannot be flooded (ADR 0075 A9).
export const serverSynthesizedFoundationEventTypes = [
  'memory.domain_shredded',
  'auth.operator_bootstrapped',
  'auth.credential_changed',
  'auth.operator_reset',
  'auth.sessions_revoked',
  'home.claimed',
  'home.reset',
  'home.membership_recorded',
  'home.membership_changed',
  'home.domain_read_granted',
  'home.domain_read_revoked',
  'home.share_envelope_issued',
  'home.share_envelope_removed',
] as const satisfies readonly FoundationEventType[];

export type ServerSynthesizedFoundationEventType = typeof serverSynthesizedFoundationEventTypes[number];

export type DeviceRegisteredPayload = Record<string, never>;

export const deviceSeenStatuses = [
  'online',
  'offline',
] as const;

export type DeviceSeenStatus = typeof deviceSeenStatuses[number];

export interface DeviceSeenPayload {
  status: DeviceSeenStatus;
}

export type SessionCreatedPayload = Record<string, never>;

// Reserved product protocol direction. The current Foundation POST /api/events
// endpoint must reject these names until dedicated Pico Rules, Action Runner or
// Action History write paths exist.
export const actionEventTypes = [
  'action.requested',
  'action.completed',
  'pico_rules.decision_created',
  'approval.requested',
  'approval.resolved',
  'action_runner.action_started',
  'action_runner.action_completed',
  'action_history.event_created',
] as const;

export type ActionEventType = typeof actionEventTypes[number];

// Reserved Pico Home Link direction. These names are not claim, membership or
// residency write APIs in the current Foundation implementation.
export const picoHomeEventTypes = [
  'pico_home.claim_requested',
  'pico_home.claim_completed',
  'pico_home.invite_created',
  'pico_home.resident_joined',
  'pico_home.resident_removed',
] as const;

export type PicoHomeEventType = typeof picoHomeEventTypes[number];

export const picoEventTypes = [
  ...foundationEventTypes,
  ...actionEventTypes,
  ...picoHomeEventTypes,
] as const;

export type PicoEventType = typeof picoEventTypes[number];

export const protocolCapabilities = {
  'pico.core.events.v1': true,
  'pico.core.websocket.v1': true,
  'pico.avatar_state.v1': true,
  'pico.home.setup.v1': true,
} as const;

export type PicoProtocolCapability = keyof typeof protocolCapabilities;
export type PicoProtocolCapabilities = typeof protocolCapabilities;

export const picoHomeClaimStates = [
  'unclaimed',
  'claimed',
] as const;

export type PicoHomeClaimStateName = typeof picoHomeClaimStates[number];

export const picoHomeClaimEnvelopeSchema = 'pico.home.claim-envelope.v1' as const;
export const picoHomeSealedClaimPayloadSchema = 'pico.home.claim-payload.v1' as const;
export const picoHomeClaimResponseRecordSchema = 'pico.home.claim-response-record.v1' as const;
export const picoHomeFoundingAcceptanceSchema = 'pico.home.founding-acceptance.v1' as const;
export const picoHomeFoundingRecordSchema = 'pico.home.founding-record.v1' as const;

// ADR 0080 H6 record families. A credential carries two signatures with
// different meanings: the Home Host Pico's issuer signature is the authority,
// and the host's activation countersignature is operational acknowledgment
// that creates none. Lifecycle statements are issuer-signed only - the host
// enforces the freshest, it does not co-decide status.
export const picoHomeMembershipCredentialSchema = 'pico.home.membership-credential.v1' as const;

export const picoHomeMembershipLifecycleRecordSchema = 'pico.home.membership-lifecycle-record.v1' as const;

export const picoHomeDomainReadGrantRecordSchema = 'pico.home.domain-read-grant-record.v1' as const;

export const picoHomeDomainReadGrantLifecycleRecordSchema = 'pico.home.domain-read-grant-lifecycle-record.v1' as const;

export const picoIdentitySuite = 'pico.suite.id.v1' as const;

// Authoritative signature-input families for ADR 0079 Gate G1. These builders
// assemble bytes only; they do not generate keys, sign, verify or authorize.
export const picoIdentitySignatureInputFamilies = [
  'keyrecord',
  'possession',
  'delegation',
  'revocation',
] as const;

export type PicoIdentitySignatureInputFamily = typeof picoIdentitySignatureInputFamilies[number];

export const picoIdentitySignatureInputLabels = {
  keyrecord: 'pico.id.keyrecord.v1',
  possession: 'pico.id.possession.v1',
  delegation: 'pico.id.delegation.v1',
  revocation: 'pico.id.revocation.v1',
} as const satisfies Record<PicoIdentitySignatureInputFamily, string>;

// ADR 0085 freshness checkpoints deliberately remain outside the generic
// device-signable identity families above. Only the owning `pico_identity`
// root may sign this label; Registry/Sync transports the record but gains no
// authority to create one.
export const picoIdentityReaderKeyFreshnessSignatureInputLabel =
  'pico.id.reader-key-freshness.v1' as const;

export const picoIdentityReaderKeyFreshnessCheckpointSchema =
  'pico.identity.reader-key-freshness-checkpoint.v1' as const;

export const picoIdentityReaderKeyFreshnessStatuses = [
  'current',
  'revoked',
] as const;

export type PicoIdentityReaderKeyFreshnessStatus =
  typeof picoIdentityReaderKeyFreshnessStatuses[number];

// Authoritative signature-input families for ADR 0080 Gate M1. These builders
// assemble bytes only; they do not generate move-in codes, sign, verify, persist
// records or authorize membership transitions.
export const picoHomeSignatureInputFamilies = [
  'claim',
  'claimResponse',
  'founding',
  'membership',
  'membershipLifecycle',
  'domainReadGrant',
  'domainReadGrantLifecycle',
  'continuity',
] as const;

export type PicoHomeSignatureInputFamily = typeof picoHomeSignatureInputFamilies[number];

export const picoHomeSignatureInputLabels = {
  claim: 'pico.home.claim.v1',
  claimResponse: 'pico.home.claim-response.v1',
  founding: 'pico.home.founding.v1',
  membership: 'pico.home.membership.v1',
  membershipLifecycle: 'pico.home.membership-lifecycle.v1',
  domainReadGrant: 'pico.home.domain-read-grant.v1',
  domainReadGrantLifecycle: 'pico.home.domain-read-grant-lifecycle.v1',
  continuity: 'pico.home.continuity.v1',
} as const satisfies Record<PicoHomeSignatureInputFamily, string>;

export const picoIdentityKeyRoles = [
  'pico_identity',
  'device_signing',
  'device_key_agreement',
  'home_host_signing',
  'home_host_key_agreement',
] as const;

export type PicoIdentityKeyRole = typeof picoIdentityKeyRoles[number];

export const picoIdentityDelegationScopes = [
  'sign_history',
  'verify_history',
  'sync_exchange',
  'decrypt_domain',
  'receive_key_envelope',
  'surface_session',
  'home_membership',
] as const;

export type PicoIdentityDelegationScope = typeof picoIdentityDelegationScopes[number];

export const picoIdentityRevocationReasonCategories = [
  'lost_device',
  'suspected_compromise',
  'device_retired',
  'key_rotated',
  'membership_removed',
] as const;

export type PicoIdentityRevocationReasonCategory = typeof picoIdentityRevocationReasonCategories[number];

export const picoHomeMembershipRoles = [
  'home_host',
  'home_member',
] as const;

export type PicoHomeMembershipRole = typeof picoHomeMembershipRoles[number];

export const picoHomeMembershipScopes = [
  'host.use',
  'packet.receive',
  'storage.queue',
  'sync.exchange',
] as const;

export type PicoHomeMembershipScope = typeof picoHomeMembershipScopes[number];

export const picoHomeMembershipStatuses = [
  'invited',
  'active',
  'revoked',
  'expired',
  'evicted',
  'transferred_or_reissued',
] as const;

export type PicoHomeMembershipStatus = typeof picoHomeMembershipStatuses[number];

export const picoHomeMembershipLifecycleReasonCategories = [
  'invite_accepted',
  'invite_expired',
  'member_removed',
  'host_reset',
  'membership_reissued',
  'security_review',
] as const;

export type PicoHomeMembershipLifecycleReasonCategory =
  typeof picoHomeMembershipLifecycleReasonCategories[number];

export const picoHomeDomainReadGrantLifecycleStatuses = [
  'revoked',
] as const;

export type PicoHomeDomainReadGrantLifecycleStatus =
  typeof picoHomeDomainReadGrantLifecycleStatuses[number];

export const picoHomeDomainReadGrantRevocationReasonCategories = [
  'reader_removed',
  'membership_removed',
  'domain_retired',
  'security_review',
  'grant_reissued',
] as const;

export type PicoHomeDomainReadGrantRevocationReasonCategory =
  typeof picoHomeDomainReadGrantRevocationReasonCategories[number];

export const picoHomeContinuityReasonCategories = [
  'host_key_rotated',
  'host_migrated',
  'host_restored',
] as const;

export type PicoHomeContinuityReasonCategory = typeof picoHomeContinuityReasonCategories[number];

// ADR 0078 Gate R2 wrap suite. Reader keys are X25519 key-agreement keys; a KEK
// grant is a libsodium sealed box over the wrap payload, and the envelope that
// carries it is authenticated by a separate issuer signature — sealed boxes
// authenticate no sender, so authenticity is a signature concern, not a wrap
// concern. These layouts are authoritative bytes only; nothing here seals,
// signs, issues or honors an envelope (K4).
export const picoShareSuite = 'pico.suite.share.v1' as const;

export const picoShareCanonicalFamilies = ['wrap', 'envelope'] as const;

export type PicoShareCanonicalFamily = typeof picoShareCanonicalFamilies[number];

export const picoShareCanonicalLabels = {
  // The sealed plaintext (K3): the reader verifies this binding after unsealing.
  wrap: 'pico.share.wrap.v1',
  // What the controller signs (K4): binds the wrap so a swapped sealed box is
  // visible to the signature.
  envelope: 'pico.share.envelope.v1',
} as const satisfies Record<PicoShareCanonicalFamily, string>;

export interface PicoShareWrapPayloadInput {
  suite: string;
  domainId: string;
  kekVersion: number;
  readerKeyFingerprintHex: string;
  /** The domain KEK bytes, 32 bytes hex. Synthetic in authoritative vectors. */
  kekHex: string;
}

export interface PicoShareEnvelopeSignatureInput {
  suite: string;
  grantId: string;
  domainId: string;
  kekVersion: number;
  /**
   * The Foundation instance the domain and its KEK live on — the host signing
   * key fingerprint, the same instance anchor the membership credential binds.
   * A domainId alone is ambiguous across instances: the same controller may run
   * an identically-named domain at two hosts, and without this a genuine
   * envelope would carry across instances. Binding it scopes the grant, exactly
   * as the founding record's host key mints "this Home".
   */
  hostSigningKeyFingerprintHex: string;
  /** The controller identity whose signature is the grant's authority. */
  issuerIdentityKeyFingerprintHex: string;
  /** The reader's X25519 key-agreement key the wrap is sealed to. */
  readerKeyFingerprintHex: string;
  /**
   * BLAKE2b-256 of the sealed wrap ciphertext. Binding it is the load-bearing
   * decision of this layout: without it an attacker can seal a well-formed
   * wrap payload carrying the wrong KEK to the same reader — the reader's K3
   * context check passes — and only the issuer signature over this digest makes
   * the swap fail.
   */
  wrapDigestHex: string;
  grantedAt: string;
}

/**
 * Persisted, controller-authenticated share envelope. The sealed wrap is
 * public ciphertext; its BLAKE2b-256 digest is bound by `envelope`, while the
 * detached signature proves controller authority. No raw KEK is represented
 * by this record.
 */
export const picoShareEnvelopeRecordSchema = 'pico.share.envelope-record.v1' as const;

export interface PicoShareEnvelopeRecord {
  schema: typeof picoShareEnvelopeRecordSchema;
  envelope: PicoShareEnvelopeSignatureInput;
  sealedWrapHex: string;
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  issuerSignatureHex: string;
  createdAt: string;
}

// ADR 0086 reader-custody authority and opaque item packages. The owner
// identity root authorizes the domain and its writers. A specifically named
// device-signing key signs each encrypted item package. These builders only
// freeze canonical bytes; they never grant authority by themselves.
export const picoReaderCustodyCanonicalFamilies = [
  'domain',
  'readerGrant',
  'readerGrantLifecycle',
  'writerGrant',
  'writerGrantLifecycle',
  'kekRotation',
  'item',
] as const;

export type PicoReaderCustodyCanonicalFamily =
  typeof picoReaderCustodyCanonicalFamilies[number];

export const picoReaderCustodyCanonicalLabels = {
  domain: 'pico.mem.reader-domain.v1',
  readerGrant: 'pico.mem.reader-grant.v1',
  readerGrantLifecycle: 'pico.mem.reader-grant-lifecycle.v1',
  writerGrant: 'pico.mem.reader-writer-grant.v1',
  writerGrantLifecycle: 'pico.mem.reader-writer-grant-lifecycle.v1',
  kekRotation: 'pico.mem.reader-kek-rotation.v1',
  item: 'pico.mem.reader-item.v1',
} as const satisfies Record<PicoReaderCustodyCanonicalFamily, string>;

export const picoReaderCustodyDomainRecordSchema =
  'pico.mem.reader-domain-record.v1' as const;
export const picoReaderCustodyReaderGrantRecordSchema =
  'pico.mem.reader-grant-record.v1' as const;
export const picoReaderCustodyReaderGrantLifecycleRecordSchema =
  'pico.mem.reader-grant-lifecycle-record.v1' as const;
export const picoReaderCustodyWriterGrantRecordSchema =
  'pico.mem.reader-writer-grant-record.v1' as const;
export const picoReaderCustodyWriterGrantLifecycleRecordSchema =
  'pico.mem.reader-writer-grant-lifecycle-record.v1' as const;
export const picoReaderCustodyKekRotationRecordSchema =
  'pico.mem.reader-kek-rotation-record.v1' as const;
export const picoReaderCustodyItemRecordSchema =
  'pico.mem.reader-item-record.v1' as const;

export const picoReaderCustodyReaderAccessModes = [
  'from_version',
  'forward_only',
] as const;

export type PicoReaderCustodyReaderAccessMode =
  typeof picoReaderCustodyReaderAccessModes[number];

export const picoReaderCustodyReaderGrantLifecycleStatuses = [
  'revoked',
] as const;

export type PicoReaderCustodyReaderGrantLifecycleStatus =
  typeof picoReaderCustodyReaderGrantLifecycleStatuses[number];

export const picoReaderCustodyReaderGrantRevocationReasonCategories = [
  'reader_removed',
  'device_retired',
  'relationship_revoked',
  'security_review',
  'grant_reissued',
] as const;

export type PicoReaderCustodyReaderGrantRevocationReasonCategory =
  typeof picoReaderCustodyReaderGrantRevocationReasonCategories[number];

export const picoReaderCustodyWriterGrantLifecycleStatuses = [
  'revoked',
] as const;

export type PicoReaderCustodyWriterGrantLifecycleStatus =
  typeof picoReaderCustodyWriterGrantLifecycleStatuses[number];

export const picoReaderCustodyWriterGrantRevocationReasonCategories = [
  'writer_removed',
  'device_retired',
  'domain_retired',
  'security_review',
  'grant_reissued',
] as const;

export type PicoReaderCustodyWriterGrantRevocationReasonCategory =
  typeof picoReaderCustodyWriterGrantRevocationReasonCategories[number];

export interface PicoReaderCustodyDomainSignatureInput {
  suite: string;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  custodyClass: 'reader_custody';
  ownerIdentityKeyFingerprintHex: string;
  ownerReaderKeyFingerprintHex: string;
  kekVersion: number;
  authorizedAt: string;
  lifecycleOrder: string;
}

export interface PicoReaderCustodyWriterGrantSignatureInput {
  suite: string;
  writerGrantId: string;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  kekVersion: number;
  ownerIdentityKeyFingerprintHex: string;
  writerIdentityKeyFingerprintHex: string;
  writerDeviceSigningKeyFingerprintHex: string;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}

export interface PicoReaderCustodyReaderGrantSignatureInput {
  suite: string;
  readerGrantId: string;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  ownerIdentityKeyFingerprintHex: string;
  readerIdentityKeyFingerprintHex: string;
  readerDeviceSigningKeyFingerprintHex: string;
  readerKeyFingerprintHex: string;
  readerDelegationId: string;
  accessMode: PicoReaderCustodyReaderAccessMode;
  firstKekVersion: number;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}

export interface PicoReaderCustodyReaderGrantLifecycleSignatureInput {
  suite: string;
  lifecycleId: string;
  readerGrantId: string;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  ownerIdentityKeyFingerprintHex: string;
  readerIdentityKeyFingerprintHex: string;
  readerKeyFingerprintHex: string;
  status: PicoReaderCustodyReaderGrantLifecycleStatus;
  reasonCategory: PicoReaderCustodyReaderGrantRevocationReasonCategory;
  changedAt: string;
  lifecycleOrder: string;
}

export interface PicoReaderCustodyWriterGrantLifecycleSignatureInput {
  suite: string;
  lifecycleId: string;
  writerGrantId: string;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  ownerIdentityKeyFingerprintHex: string;
  writerIdentityKeyFingerprintHex: string;
  writerDeviceSigningKeyFingerprintHex: string;
  status: PicoReaderCustodyWriterGrantLifecycleStatus;
  reasonCategory: PicoReaderCustodyWriterGrantRevocationReasonCategory;
  changedAt: string;
  lifecycleOrder: string;
}

export interface PicoReaderCustodyItemSignatureInput {
  suite: string;
  packageId: string;
  domainAuthorityId: string;
  writerGrantId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  memoryItemId: string;
  contentType: string;
  kekVersion: number;
  writerIdentityKeyFingerprintHex: string;
  writerDeviceSigningKeyFingerprintHex: string;
  contentNonceHex: string;
  contentCiphertextDigestHex: string;
  dekWrapNonceHex: string;
  wrappedDekDigestHex: string;
  createdAt: string;
}

export interface PicoReaderCustodyKekRotationSignatureInput {
  suite: string;
  rotationId: string;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  ownerIdentityKeyFingerprintHex: string;
  previousKekVersion: number;
  kekVersion: number;
  causeLifecycleIds: string[];
  remainingReaderGrantIds: string[];
  rotatedAt: string;
  lifecycleOrder: string;
}

export interface PicoReaderCustodyDomainRecord {
  schema: typeof picoReaderCustodyDomainRecordSchema;
  domain: PicoReaderCustodyDomainSignatureInput;
  ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  ownerReaderKeyRecord: PicoIdentityKeyRecordSignatureInput;
  ownerEnvelope: PicoShareEnvelopeRecord;
  ownerSignatureHex: string;
  receivedAt: string;
}

export interface PicoReaderCustodyReaderGrantRecord {
  schema: typeof picoReaderCustodyReaderGrantRecordSchema;
  grant: PicoReaderCustodyReaderGrantSignatureInput;
  ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  readerKeyRecord: PicoIdentityKeyRecordSignatureInput;
  envelopes: PicoShareEnvelopeRecord[];
  ownerSignatureHex: string;
  receivedAt: string;
}

export interface PicoReaderCustodyReaderGrantLifecycleRecord {
  schema: typeof picoReaderCustodyReaderGrantLifecycleRecordSchema;
  lifecycle: PicoReaderCustodyReaderGrantLifecycleSignatureInput;
  ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  ownerSignatureHex: string;
  receivedAt: string;
}

export interface PicoReaderCustodyWriterGrantRecord {
  schema: typeof picoReaderCustodyWriterGrantRecordSchema;
  grant: PicoReaderCustodyWriterGrantSignatureInput;
  ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  writerDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  ownerSignatureHex: string;
  receivedAt: string;
}

export interface PicoReaderCustodyWriterGrantLifecycleRecord {
  schema: typeof picoReaderCustodyWriterGrantLifecycleRecordSchema;
  lifecycle: PicoReaderCustodyWriterGrantLifecycleSignatureInput;
  ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  ownerSignatureHex: string;
  receivedAt: string;
}

export interface PicoReaderCustodyItemRecord {
  schema: typeof picoReaderCustodyItemRecordSchema;
  item: PicoReaderCustodyItemSignatureInput;
  contentCiphertextHex: string;
  wrappedDekHex: string;
  writerDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  writerSignatureHex: string;
  receivedAt: string;
}

export interface PicoReaderCustodyKekRotationRecord {
  schema: typeof picoReaderCustodyKekRotationRecordSchema;
  rotation: PicoReaderCustodyKekRotationSignatureInput;
  ownerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  envelopes: PicoShareEnvelopeRecord[];
  ownerSignatureHex: string;
  receivedAt: string;
}

export const picoVaultKeyfileFormat = 'pico.vault.keyfile.v1' as const;

// ADR 0081 Gate P1 covers person-role key custody only. Host-role keys stay on
// the ADR 0080 host-custody path and must not be accepted as Vault keyfiles.
export const picoVaultPersonKeyRoles = [
  'pico_identity',
  'device_signing',
  'device_key_agreement',
] as const satisfies readonly PicoIdentityKeyRole[];

export type PicoVaultPersonKeyRole = typeof picoVaultPersonKeyRoles[number];

export const picoVaultKdfAlgorithms = [
  'argon2id',
] as const;

export type PicoVaultKdfAlgorithm = typeof picoVaultKdfAlgorithms[number];

export const picoVaultKdfProfiles = [
  'moderate',
] as const;

export type PicoVaultKdfProfile = typeof picoVaultKdfProfiles[number];

export const picoVaultAeadAlgorithms = [
  'xchacha20poly1305-ietf',
] as const;

export type PicoVaultAeadAlgorithm = typeof picoVaultAeadAlgorithms[number];

export const picoVaultArgon2idModerateParams = {
  opsLimit: 3,
  memLimitBytes: 268_435_456,
} as const;

// The upper end of what a keyfile header may declare: libsodium's own SENSITIVE
// class, so the bound is a named cost class rather than an invented number, and
// the moderate-to-sensitive upgrade on rewrite still fits. Above it the file is
// refused instead of derived from, because these parameters are read before the
// AEAD authenticates the header - the AAD cannot protect them - and Argon2id is
// a synchronous, non-interruptible call. At the moderate memory cost one pass
// takes roughly 215 ms, so an opsLimit near 2^31 is not slow, it never returns.
export const picoVaultArgon2idMaximumParams = {
  opsLimit: 4,
  memLimitBytes: 1_073_741_824,
} as const;

export interface PicoIdentityKeyRecordSignatureInput {
  suite: string;
  keyRole: PicoIdentityKeyRole;
  publicKeyHex: string;
}

export interface PicoIdentityPossessionSignatureInput {
  suite: string;
  subjectKeyFingerprintHex: string;
  verifierNonceHex: string;
  verifierContext: string;
}

export interface PicoIdentityDelegationSignatureInput {
  suite: string;
  delegationId: string;
  issuerIdentityKeyFingerprintHex: string;
  subjectSigningKeyFingerprintHex: string;
  subjectKeyAgreementKeyFingerprintHex: string;
  scopes: PicoIdentityDelegationScope[];
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}

export interface PicoIdentityRevocationSignatureInput {
  suite: string;
  revocationId: string;
  issuerIdentityKeyFingerprintHex: string;
  subjectKind: 'delegation' | 'key';
  subjectRef: string;
  reasonCategory: PicoIdentityRevocationReasonCategory;
  revokedAt: string;
  lifecycleOrder: string;
}

export interface PicoIdentityReaderKeyFreshnessSignatureInput {
  suite: string;
  checkpointId: string;
  homeId: string;
  issuerIdentityKeyFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
  status: PicoIdentityReaderKeyFreshnessStatus;
  observedThroughLifecycleOrder: string;
  checkedAt: string;
  freshUntil: string;
}

/**
 * Short-lived identity-root statement transported by a Registry/Sync lookup.
 * `sourceRef` is intentionally absent: transport metadata is useful for
 * diagnostics but never part of the identity authority or freshness proof.
 */
export interface PicoIdentityReaderKeyFreshnessCheckpoint {
  schema: typeof picoIdentityReaderKeyFreshnessCheckpointSchema;
  checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput;
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  issuerSignatureHex: string;
}

export interface PicoHomeClaimSignatureInput {
  suite: string;
  claimId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  moveInCode: string;
  claimantIdentityKeyFingerprintHex: string;
  claimantNonceHex: string;
  hostSetupNonceHex: string;
}

export interface PicoHomeClaimEnvelope {
  schema: typeof picoHomeClaimEnvelopeSchema;
  sealedClaimPayloadHex: string;
}

export interface PicoHomeSealedClaimPayload {
  schema: typeof picoHomeSealedClaimPayloadSchema;
  claim: PicoHomeClaimSignatureInput;
  claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  claimantSignatureHex: string;
}

export interface PicoHomeClaimResponseRecord {
  schema: typeof picoHomeClaimResponseRecordSchema;
  claimResponse: PicoHomeClaimResponseSignatureInput;
  hostSignatureHex: string;
}

export interface PicoHomeFoundingAcceptance {
  schema: typeof picoHomeFoundingAcceptanceSchema;
  claimId: string;
  foundingId: string;
  claimantFoundingSignatureHex: string;
}

export interface PicoHomeFoundingRecord {
  schema: typeof picoHomeFoundingRecordSchema;
  founding: PicoHomeFoundingSignatureInput;
  claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  // No claimant signature over the claim: the claim's signed bytes carry the
  // Move-In Code and the host setup nonce, and neither is kept, so such a field
  // could never be re-verified. What the record does carry is checkable for as
  // long as it exists - both founding signatures cover `founding`, which is
  // stored in full.
  claimantFoundingSignatureHex: string;
  hostClaimResponse: PicoHomeClaimResponseRecord;
  hostFoundingSignatureHex: string;
  createdAt: string;
}

/**
 * What the Home Host Pico produces and hands over: the authority half on its
 * own. A Home turns this into a credential by adding its activation
 * countersignature, which is why the two are separate types - the host signs
 * only what already verified, and no code path can pass around a "credential"
 * whose activation half is a placeholder.
 */
export interface PicoHomeMembershipIssuerStatement {
  schema: typeof picoHomeMembershipCredentialSchema;
  membership: PicoHomeMembershipSignatureInput;
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  /** The authority (ADR 0080 H6). Without it the credential is inert. */
  issuerSignatureHex: string;
}

export interface PicoHomeMembershipCredential extends PicoHomeMembershipIssuerStatement {
  /**
   * Operational acknowledgment by the host key that this credential is active
   * at this Home. It creates no authority: over an issuer-less credential it
   * would be a signature over garbage, which is why verification checks the
   * issuer first.
   */
  hostActivationSignatureHex: string;
  createdAt: string;
}

export interface PicoHomeMembershipLifecycleRecord {
  schema: typeof picoHomeMembershipLifecycleRecordSchema;
  lifecycle: PicoHomeMembershipLifecycleSignatureInput;
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  issuerSignatureHex: string;
  createdAt: string;
}

export interface PicoHomeDomainReadGrantRecord {
  schema: typeof picoHomeDomainReadGrantRecordSchema;
  grant: PicoHomeDomainReadGrantSignatureInput;
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  issuerSignatureHex: string;
  createdAt: string;
}

export interface PicoHomeDomainReadGrantLifecycleRecord {
  schema: typeof picoHomeDomainReadGrantLifecycleRecordSchema;
  lifecycle: PicoHomeDomainReadGrantLifecycleSignatureInput;
  issuerIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  issuerSignatureHex: string;
  createdAt: string;
}

export interface PicoHomeClaimResponseSignatureInput {
  suite: string;
  claimId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  claimantIdentityKeyFingerprintHex: string;
  claimantNonceHex: string;
  hostNonceHex: string;
  foundingRecordId: string;
}

export interface PicoHomeFoundingSignatureInput {
  suite: string;
  foundingId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  homeHostPicoIdentityFingerprintHex: string;
  claimantNonceHex: string;
  hostNonceHex: string;
  foundedAt: string;
  lifecycleOrder: string;
}

export interface PicoHomeMembershipSignatureInput {
  suite: string;
  credentialId: string;
  homeId: string;
  issuerPicoIdentityFingerprintHex: string;
  subjectPicoIdentityFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
  role: PicoHomeMembershipRole;
  scopes: PicoHomeMembershipScope[];
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}

export interface PicoHomeMembershipLifecycleSignatureInput {
  suite: string;
  lifecycleId: string;
  homeId: string;
  credentialId: string;
  issuerPicoIdentityFingerprintHex: string;
  subjectPicoIdentityFingerprintHex: string;
  status: PicoHomeMembershipStatus;
  reasonCategory: PicoHomeMembershipLifecycleReasonCategory;
  changedAt: string;
  lifecycleOrder: string;
}

export interface PicoHomeDomainReadGrantSignatureInput {
  suite: string;
  grantId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  privacyDomain: string;
  controllerPicoIdentityFingerprintHex: string;
  readerPicoIdentityFingerprintHex: string;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}

export interface PicoHomeDomainReadGrantLifecycleSignatureInput {
  suite: string;
  lifecycleId: string;
  grantId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  privacyDomain: string;
  controllerPicoIdentityFingerprintHex: string;
  readerPicoIdentityFingerprintHex: string;
  status: PicoHomeDomainReadGrantLifecycleStatus;
  reasonCategory: PicoHomeDomainReadGrantRevocationReasonCategory;
  changedAt: string;
  lifecycleOrder: string;
}

export interface PicoHomeContinuitySignatureInput {
  suite: string;
  continuityId: string;
  homeId: string;
  outgoingHostSigningKeyFingerprintHex: string;
  outgoingHostKeyAgreementKeyFingerprintHex: string;
  incomingHostSigningKeyFingerprintHex: string;
  incomingHostKeyAgreementKeyFingerprintHex: string;
  homeHostPicoIdentityFingerprintHex: string;
  reasonCategory: PicoHomeContinuityReasonCategory;
  changedAt: string;
  lifecycleOrder: string;
}

export interface PicoVaultKeyfileHeaderAadInput {
  format: string;
  suite: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  kdfAlgorithm: PicoVaultKdfAlgorithm;
  kdfProfile: PicoVaultKdfProfile;
  kdfOpsLimit: number;
  kdfMemLimitBytes: number;
  kdfSaltHex: string;
  aeadAlgorithm: PicoVaultAeadAlgorithm;
  aeadNonceHex: string;
}

export type PicoIdentitySignatureInput =
  | PicoIdentityKeyRecordSignatureInput
  | PicoIdentityPossessionSignatureInput
  | PicoIdentityDelegationSignatureInput
  | PicoIdentityRevocationSignatureInput;

export type PicoHomeSignatureInput =
  | PicoHomeClaimSignatureInput
  | PicoHomeClaimResponseSignatureInput
  | PicoHomeFoundingSignatureInput
  | PicoHomeMembershipSignatureInput
  | PicoHomeMembershipLifecycleSignatureInput
  | PicoHomeDomainReadGrantSignatureInput
  | PicoHomeDomainReadGrantLifecycleSignatureInput
  | PicoHomeContinuitySignatureInput;

export const realtimeMessageType = {
  coreConnected: 'pico.core.connected',
  eventCreated: 'pico.event.created',
} as const;

export const realtimeMessageTypes = [
  realtimeMessageType.coreConnected,
  realtimeMessageType.eventCreated,
] as const;

export type PicoRealtimeMessageType = typeof realtimeMessageTypes[number];

export type PicoNodeType =
  | 'pico_home'
  | 'pico_vault'
  | 'pico_surface'
  | 'pico_relay'
  | 'mobile'
  | 'desktop'
  | 'home_assistant'
  | 'browser_extension'
  | 'unknown';

// Reserved context-signal posture. These values are planning direction only
// and must not be used as authorization roles, host-administration grants or
// capabilities.
export type ContextSignalLevel = 'untrusted' | 'known' | 'trusted';

export const messageCreatedRoles = [
  'user',
  'assistant',
  'system',
  'tool',
] as const;

export type MessageCreatedRole = typeof messageCreatedRoles[number];

export interface MessageCreatedPayload {
  role: MessageCreatedRole;
  text: string;
}

export const avatarModes = [
  'everyday',
  'technical',
  'wwg',
  'firefighter',
  'security',
  'organization',
  'smart_home',
] as const;

export type AvatarMode = typeof avatarModes[number];

export const avatarStates = [
  'idle',
  'listening',
  'thinking',
  'working',
  'unsure',
  'warning',
  'confirmation_required',
  'blocked',
  'success',
  'sleeping',
] as const;

export type AvatarStateName = typeof avatarStates[number];

export const avatarIntensities = [
  'low',
  'normal',
  'high',
] as const;

export type AvatarIntensity = typeof avatarIntensities[number];

export const avatarStatusColors = [
  'neutral',
  'blue',
  'green',
  'yellow',
  'red',
  'violet',
] as const;

export type AvatarStatusColor = typeof avatarStatusColors[number];

export interface AvatarStateChangedPayload {
  mode: AvatarMode;
  state: AvatarStateName;
  intensity: AvatarIntensity;
  statusColor: AvatarStatusColor;
  message?: string;
}

// Stored reference to a recorded memory item (ADR 0068 / ADR 0069). This is the
// derived, content-free payload a `memory.recorded` event carries after the
// server stores the content in the deleteable memory store. The request that
// creates it carries the content; the stored event never does.
export interface MemoryRecordedPayload {
  memoryItemId: string;
  privacyDomain: string;
  contentType: string;
  summary?: string;
}

// Append-only deletion marker for a deleteable memory item (ADR 0014 / ADR 0068).
// It references the deleted item and carries no sensitive content.
export interface MemoryTombstonePayload {
  memoryItemId: string;
  privacyDomain: string;
  reason?: string;
}

// Append-only crypto-shred audit record for a privacy domain (ADR 0071 step 4,
// ADR 0037 audit style: a decision and references, never content or key
// material). It records which domain was shredded, how many KEK versions were
// destroyed and an optional reason. The actor and time live on the event
// envelope (deviceId, wallTime).
export interface MemoryDomainShreddedPayload {
  privacyDomain: string;
  removedKeyVersions: number;
  reason?: string;
}

// Append-only operator audit records (ADR 0076, ADR 0037 audit style). They
// carry no credential material, no session identifiers, no passphrase metadata
// and no content; the actor and time live on the event envelope (deviceId,
// wallTime). Individual logins, logouts and failed attempts are deliberately
// absent: failures are attacker-triggerable and must not reach an undeletable
// log (ADR 0075 A9).
export type AuthOperatorBootstrappedPayload = Record<string, never>;

export type AuthCredentialChangedPayload = Record<string, never>;

// `reason` distinguishes how the operator was cleared, never who or with what.
export interface AuthOperatorResetPayload {
  reason?: string;
}

export interface AuthSessionsRevokedPayload {
  revokedSessions: number;
}

export type HomeClaimedPayload = Record<string, never>;

export type HomeResetPayload = Record<string, never>;

export interface HomeMembershipRecordedPayload {
  credentialId: string;
  subjectPicoIdentityFingerprintHex: string;
  status: PicoHomeMembershipStatus;
}

export interface HomeMembershipChangedPayload extends HomeMembershipRecordedPayload {
  lifecycleId: string;
}

export interface HomeDomainReadGrantedPayload {
  grantId: string;
  privacyDomain: string;
  readerPicoIdentityFingerprintHex: string;
}

export interface HomeDomainReadRevokedPayload extends HomeDomainReadGrantedPayload {
  lifecycleId: string;
}

export interface HomeShareEnvelopeIssuedPayload {
  grantId: string;
  privacyDomain: string;
  readerKeyFingerprintHex: string;
  kekVersion: number;
}

export const homeShareEnvelopeRemovalReasonCategories = [
  'authority_reconciliation',
  'key_unavailable',
] as const;

export type HomeShareEnvelopeRemovalReasonCategory =
  typeof homeShareEnvelopeRemovalReasonCategories[number];

export interface HomeShareEnvelopeRemovedPayload extends HomeShareEnvelopeIssuedPayload {
  reasonCategory: HomeShareEnvelopeRemovalReasonCategory;
}

export type FoundationEventPayload =
  | DeviceRegisteredPayload
  | DeviceSeenPayload
  | SessionCreatedPayload
  | MessageCreatedPayload
  | AvatarStateChangedPayload
  | MemoryRecordedPayload
  | MemoryTombstonePayload
  | MemoryDomainShreddedPayload
  | AuthOperatorBootstrappedPayload
  | AuthCredentialChangedPayload
  | AuthOperatorResetPayload
  | AuthSessionsRevokedPayload
  | HomeClaimedPayload
  | HomeResetPayload
  | HomeMembershipRecordedPayload
  | HomeMembershipChangedPayload
  | HomeDomainReadGrantedPayload
  | HomeDomainReadRevokedPayload
  | HomeShareEnvelopeIssuedPayload
  | HomeShareEnvelopeRemovedPayload;

export type FoundationPayloadValidationResult =
  | { ok: true; payload: FoundationEventPayload }
  | { ok: false; error: string };

export interface FoundationPayloadValidationOptions {
  maxMessageTextLength?: number;
  maxAvatarMessageLength?: number;
}

export function validateFoundationEventPayload(
  type: FoundationEventType,
  payload: unknown,
  options: FoundationPayloadValidationOptions = {},
): FoundationPayloadValidationResult {
  if (!isRecord(payload)) {
    return { ok: false, error: 'payload must be an object.' };
  }

  if (type === 'device.registered') {
    const extraKey = firstUnexpectedKey(payload, []);
    if (extraKey !== undefined) {
      return { ok: false, error: `device.registered payload has unexpected field: ${extraKey}.` };
    }

    return { ok: true, payload: {} };
  }

  if (type === 'device.seen') {
    const extraKey = firstUnexpectedKey(payload, ['status']);
    if (extraKey !== undefined) {
      return { ok: false, error: `device.seen payload has unexpected field: ${extraKey}.` };
    }

    if (!isStringMember(payload.status, deviceSeenStatuses)) {
      return { ok: false, error: 'device.seen payload requires status.' };
    }

    return { ok: true, payload: { status: payload.status } };
  }

  if (type === 'session.created') {
    const extraKey = firstUnexpectedKey(payload, []);
    if (extraKey !== undefined) {
      return { ok: false, error: `session.created payload has unexpected field: ${extraKey}.` };
    }

    return { ok: true, payload: {} };
  }

  if (type === 'message.created') {
    const extraKey = firstUnexpectedKey(payload, ['role', 'text']);
    if (extraKey !== undefined) {
      return { ok: false, error: `message.created payload has unexpected field: ${extraKey}.` };
    }

    if (!isStringMember(payload.role, messageCreatedRoles) || !isNonEmptyString(payload.text, options.maxMessageTextLength)) {
      return { ok: false, error: 'message.created payload requires role and text.' };
    }

    return { ok: true, payload: { role: payload.role, text: payload.text } };
  }

  if (type === 'memory.recorded') {
    const extraKey = firstUnexpectedKey(payload, ['memoryItemId', 'privacyDomain', 'contentType', 'summary']);
    if (extraKey !== undefined) {
      return { ok: false, error: `memory.recorded payload has unexpected field: ${extraKey}.` };
    }

    if (!isNonEmptyString(payload.memoryItemId, 256) || !isNonEmptyString(payload.privacyDomain, 256) || !isNonEmptyString(payload.contentType, 256)) {
      return { ok: false, error: 'memory.recorded payload requires memoryItemId, privacyDomain and contentType.' };
    }

    if (payload.summary !== undefined && !isNonEmptyString(payload.summary, 1_000)) {
      return { ok: false, error: 'memory.recorded summary must be a non-empty string when provided.' };
    }

    return {
      ok: true,
      payload: {
        memoryItemId: payload.memoryItemId,
        privacyDomain: payload.privacyDomain,
        contentType: payload.contentType,
        ...(payload.summary === undefined ? {} : { summary: payload.summary }),
      },
    };
  }

  if (type === 'memory.tombstone') {
    const extraKey = firstUnexpectedKey(payload, ['memoryItemId', 'privacyDomain', 'reason']);
    if (extraKey !== undefined) {
      return { ok: false, error: `memory.tombstone payload has unexpected field: ${extraKey}.` };
    }

    if (!isNonEmptyString(payload.memoryItemId, 256) || !isNonEmptyString(payload.privacyDomain, 256)) {
      return { ok: false, error: 'memory.tombstone payload requires memoryItemId and privacyDomain.' };
    }

    if (payload.reason !== undefined && !isNonEmptyString(payload.reason, 1_000)) {
      return { ok: false, error: 'memory.tombstone reason must be a non-empty string when provided.' };
    }

    return {
      ok: true,
      payload: {
        memoryItemId: payload.memoryItemId,
        privacyDomain: payload.privacyDomain,
        ...(payload.reason === undefined ? {} : { reason: payload.reason }),
      },
    };
  }

  if (type === 'memory.domain_shredded') {
    const extraKey = firstUnexpectedKey(payload, ['privacyDomain', 'removedKeyVersions', 'reason']);
    if (extraKey !== undefined) {
      return { ok: false, error: `memory.domain_shredded payload has unexpected field: ${extraKey}.` };
    }

    if (!isNonEmptyString(payload.privacyDomain, 256)) {
      return { ok: false, error: 'memory.domain_shredded payload requires privacyDomain.' };
    }

    if (typeof payload.removedKeyVersions !== 'number' || !Number.isInteger(payload.removedKeyVersions) || payload.removedKeyVersions < 0) {
      return { ok: false, error: 'memory.domain_shredded removedKeyVersions must be a non-negative integer.' };
    }

    if (payload.reason !== undefined && !isNonEmptyString(payload.reason, 1_000)) {
      return { ok: false, error: 'memory.domain_shredded reason must be a non-empty string when provided.' };
    }

    return {
      ok: true,
      payload: {
        privacyDomain: payload.privacyDomain,
        removedKeyVersions: payload.removedKeyVersions,
        ...(payload.reason === undefined ? {} : { reason: payload.reason }),
      },
    };
  }

  if (type === 'auth.operator_bootstrapped' || type === 'auth.credential_changed') {
    const extraKey = firstUnexpectedKey(payload, []);
    if (extraKey !== undefined) {
      return { ok: false, error: `${type} payload has unexpected field: ${extraKey}.` };
    }

    return { ok: true, payload: {} };
  }

  if (type === 'auth.operator_reset') {
    const extraKey = firstUnexpectedKey(payload, ['reason']);
    if (extraKey !== undefined) {
      return { ok: false, error: `auth.operator_reset payload has unexpected field: ${extraKey}.` };
    }

    if (payload.reason !== undefined && !isNonEmptyString(payload.reason, 1_000)) {
      return { ok: false, error: 'auth.operator_reset reason must be a non-empty string when provided.' };
    }

    return {
      ok: true,
      payload: payload.reason === undefined ? {} : { reason: payload.reason },
    };
  }

  if (type === 'auth.sessions_revoked') {
    const extraKey = firstUnexpectedKey(payload, ['revokedSessions']);
    if (extraKey !== undefined) {
      return { ok: false, error: `auth.sessions_revoked payload has unexpected field: ${extraKey}.` };
    }

    if (typeof payload.revokedSessions !== 'number' || !Number.isInteger(payload.revokedSessions) || payload.revokedSessions < 0) {
      return { ok: false, error: 'auth.sessions_revoked revokedSessions must be a non-negative integer.' };
    }

    return { ok: true, payload: { revokedSessions: payload.revokedSessions } };
  }

  if (type === 'home.claimed' || type === 'home.reset') {
    const extraKey = firstUnexpectedKey(payload, []);
    if (extraKey !== undefined) {
      return { ok: false, error: `${type} payload has unexpected field: ${extraKey}.` };
    }

    return { ok: true, payload: {} };
  }

  // ADR 0078 K7 audit: references and counts, never key material and never
  // content. A membership fingerprint is a key reference, which is exactly the
  // class the reader-graph metadata rule allows.
  if (type === 'home.membership_recorded' || type === 'home.membership_changed') {
    const allowed = type === 'home.membership_recorded'
      ? ['credentialId', 'subjectPicoIdentityFingerprintHex', 'status']
      : ['credentialId', 'lifecycleId', 'subjectPicoIdentityFingerprintHex', 'status'];
    const extraKey = firstUnexpectedKey(payload, allowed);
    if (extraKey !== undefined) {
      return { ok: false, error: `${type} payload has unexpected field: ${extraKey}.` };
    }

    if (!isNonEmptyString(payload.credentialId, 256)
      || !isNonEmptyString(payload.subjectPicoIdentityFingerprintHex, 64)
      || !isStringMember(payload.status, picoHomeMembershipStatuses)) {
      return { ok: false, error: `${type} payload requires credentialId, subjectPicoIdentityFingerprintHex and status.` };
    }

    if (type === 'home.membership_changed' && !isNonEmptyString(payload.lifecycleId, 256)) {
      return { ok: false, error: 'home.membership_changed payload requires lifecycleId.' };
    }

    return {
      ok: true,
      payload: {
        credentialId: payload.credentialId,
        ...(type === 'home.membership_changed' ? { lifecycleId: payload.lifecycleId } : {}),
        subjectPicoIdentityFingerprintHex: payload.subjectPicoIdentityFingerprintHex,
        status: payload.status,
      },
    };
  }

  if (type === 'home.domain_read_granted' || type === 'home.domain_read_revoked') {
    const allowed = type === 'home.domain_read_granted'
      ? ['grantId', 'privacyDomain', 'readerPicoIdentityFingerprintHex']
      : ['grantId', 'lifecycleId', 'privacyDomain', 'readerPicoIdentityFingerprintHex'];
    const extraKey = firstUnexpectedKey(payload, allowed);
    if (extraKey !== undefined) {
      return { ok: false, error: `${type} payload has unexpected field: ${extraKey}.` };
    }

    if (!isNonEmptyString(payload.grantId, 256)
      || !isNonEmptyString(payload.privacyDomain, 256)
      || !isNonEmptyString(payload.readerPicoIdentityFingerprintHex, 64)) {
      return {
        ok: false,
        error: `${type} payload requires grantId, privacyDomain and readerPicoIdentityFingerprintHex.`,
      };
    }

    if (type === 'home.domain_read_revoked' && !isNonEmptyString(payload.lifecycleId, 256)) {
      return { ok: false, error: 'home.domain_read_revoked payload requires lifecycleId.' };
    }

    return {
      ok: true,
      payload: {
        grantId: payload.grantId,
        ...(type === 'home.domain_read_revoked' ? { lifecycleId: payload.lifecycleId } : {}),
        privacyDomain: payload.privacyDomain,
        readerPicoIdentityFingerprintHex: payload.readerPicoIdentityFingerprintHex,
      },
    };
  }

  if (type === 'home.share_envelope_issued' || type === 'home.share_envelope_removed') {
    const allowed = type === 'home.share_envelope_issued'
      ? ['grantId', 'privacyDomain', 'readerKeyFingerprintHex', 'kekVersion']
      : ['grantId', 'privacyDomain', 'readerKeyFingerprintHex', 'kekVersion', 'reasonCategory'];
    const extraKey = firstUnexpectedKey(payload, allowed);
    if (extraKey !== undefined) {
      return { ok: false, error: `${type} payload has unexpected field: ${extraKey}.` };
    }

    if (!isNonEmptyString(payload.grantId, 256)
      || !isNonEmptyString(payload.privacyDomain, 256)
      || typeof payload.readerKeyFingerprintHex !== 'string'
      || !/^[0-9a-f]{64}$/.test(payload.readerKeyFingerprintHex)
      || !Number.isSafeInteger(payload.kekVersion)
      || (payload.kekVersion as number) < 1) {
      return {
        ok: false,
        error: `${type} payload requires grantId, privacyDomain, readerKeyFingerprintHex and kekVersion.`,
      };
    }

    if (type === 'home.share_envelope_removed'
      && !isStringMember(payload.reasonCategory, homeShareEnvelopeRemovalReasonCategories)) {
      return { ok: false, error: 'home.share_envelope_removed payload requires reasonCategory.' };
    }

    return {
      ok: true,
      payload: {
        grantId: payload.grantId,
        privacyDomain: payload.privacyDomain,
        readerKeyFingerprintHex: payload.readerKeyFingerprintHex,
        kekVersion: payload.kekVersion as number,
        ...(type === 'home.share_envelope_removed'
          ? { reasonCategory: payload.reasonCategory as HomeShareEnvelopeRemovalReasonCategory }
          : {}),
      },
    };
  }

  const extraKey = firstUnexpectedKey(payload, ['mode', 'state', 'intensity', 'statusColor', 'message']);
  if (extraKey !== undefined) {
    return { ok: false, error: `avatar.state_changed payload has unexpected field: ${extraKey}.` };
  }

  if (
    !isStringMember(payload.mode, avatarModes)
    || !isStringMember(payload.state, avatarStates)
    || !isStringMember(payload.intensity, avatarIntensities)
    || !isStringMember(payload.statusColor, avatarStatusColors)
  ) {
    return { ok: false, error: 'avatar.state_changed payload is invalid.' };
  }

  if (payload.message !== undefined && !isNonEmptyString(payload.message, options.maxAvatarMessageLength)) {
    return { ok: false, error: 'avatar.state_changed message must be a non-empty string when provided.' };
  }

  return {
    ok: true,
    payload: {
      mode: payload.mode,
      state: payload.state,
      intensity: payload.intensity,
      statusColor: payload.statusColor,
      ...(payload.message === undefined ? {} : { message: payload.message }),
    },
  };
}

// Reserved privacy/deletability protocol direction (ADR 0014 / ADR 0067). These
// names prepare later additive payload-posture documentation, but the current
// Foundation PicoEvent shape does not expose a payloadPosture field and does not
// implement memory, tombstone, retention or privacy-domain storage semantics. An
// absent posture is treated as inline_operational once the field is added.
export const payloadPostures = [
  'inline_operational',
  'inline_test',
  'reference_only',
  'summary_only',
  'redacted',
] as const;

export type PayloadPosture = typeof payloadPostures[number];

// Payload postures writable through the current `POST /api/events` surface
// (ADR 0067). Reference, summary and redacted postures are reserved for future
// memory-referencing events and are not writable until reference targets and a
// deleteable memory store exist.
export const writablePayloadPostures = [
  'inline_operational',
  'inline_test',
] as const;

export type WritablePayloadPosture = typeof writablePayloadPostures[number];

// Reserved deleteable memory direction (ADR 0014 / ADR 0068). Additive planning
// vocabulary for a future memory store. The current Foundation implementation
// has no memory store, reference target, tombstone or deletion runtime; content
// stays out of append-only events (ADR 0067 payload posture).
export const memoryItemDeletionStates = [
  'active',
  'deleted',
  'tombstoned',
] as const;

export type MemoryItemDeletionState = typeof memoryItemDeletionStates[number];

export const referenceTargetResolutionStates = [
  'resolvable',
  'deleted',
  'unknown',
] as const;

export type ReferenceTargetResolutionState = typeof referenceTargetResolutionStates[number];

// Reserved planning type for a future `reference_only` payload posture target
// (ADR 0068). A reference target names where a deleteable memory item lives; it
// is not the content, not a decryption grant and is not accepted on any current
// write path.
export interface MemoryItemReference {
  referenceId: string;
  memoryItemId: string;
  store: string;
  privacyDomain: string;
  contentType: string;
  summary?: string;
  resolutionState: ReferenceTargetResolutionState;
}

// Reserved memory-content protection direction (ADR 0070). Storage metadata for
// how a memory item's content is protected at rest, not an access decision:
// `plaintext_foundation` is the current state (content stored as plaintext,
// development/foundation data only); `domain_encrypted` is the target state
// (content encrypted under a privacy-domain content key with a key-envelope
// reference). No encryption, key management or crypto-shredding exists yet.
export const memoryContentPostures = [
  'plaintext_foundation',
  'domain_encrypted',
] as const;

export type MemoryContentPosture = typeof memoryContentPostures[number];

export const picoMemoryContentSuite = 'pico.suite.mem.v1' as const;
export const picoMemoryContentAdLabel = 'pico.mem.ad.content.v1' as const;
export const picoMemoryDekWrapAdLabel = 'pico.mem.ad.dek-wrap.v1' as const;

// Reserved per-domain memory key custody classes (ADR 0078). `host_custody`
// is the existing ADR 0071/0072 model: the Foundation host has the domain KEK
// in its separated key store. `reader_custody` is future envelope-only hosting:
// the host stores ciphertext and wrapped keys, but never a raw domain KEK.
export const memoryDomainCustodyClasses = [
  'host_custody',
  'reader_custody',
] as const;

export type MemoryDomainCustodyClass = typeof memoryDomainCustodyClasses[number];

// how a memory item's retention is governed (ADR 0074), referenced by a memory
// item's retention policy. `keep_until_deleted` is the system default: no
// automatic expiry, content lives until a user or controller deletes it.
// `delete_after_max_age` expires content once the item is older than the
// policy's maximum age; expiry deletes through the tombstoned deletion path. A
// missing or unresolvable policy never deletes (fail-safe keep).
export const memoryRetentionModes = [
  'keep_until_deleted',
  'delete_after_max_age',
] as const;

export type MemoryRetentionMode = typeof memoryRetentionModes[number];

// Reserved action/policy/audit protocol direction. The current Foundation API
// exports these shapes for product planning only; it must not accept them on
// the generic event write path until dedicated product APIs and policy gates
// exist.
export type ActionRisk =
  | 'read_only'
  | 'local_write'
  | 'external_write'
  | 'destructive'
  | 'security_sensitive'
  | 'privileged_system_action';

export type PicoRulesDecision = 'allow' | 'require_approval' | 'deny';

export interface PicoEvent<TPayload = unknown> {
  eventId: string;
  deviceId: string;
  sessionId?: string;
  lamport: number;
  wallTime: string;
  type: PicoEventType;
  stream: string;
  payload: TPayload;
  signature?: string;
  // Additive, optional (ADR 0014 / ADR 0067). Absent is treated as
  // `inline_operational`; existing events stay valid without change.
  payloadPosture?: PayloadPosture;
}

export interface PicoHealthResponse {
  ok: boolean;
  service: string;
  deviceId: string;
}

export interface PicoSystemVersionResponse {
  service: string;
  version: string;
  protocolVersion: string;
}

export interface PicoAppliedMigration {
  id: string;
  appliedAt: string;
}

export interface PicoSystemStatusResponse {
  service: string;
  version: string;
  protocolVersion: string;
  deviceId: string;
  capabilities: Record<string, boolean>;
  picoHome: {
    claimState: PicoHomeClaimStateResponse;
  };
  database: {
    maxLamport: number;
    migrations: PicoAppliedMigration[];
  };
}

export interface PicoHomeClaimStateResponse {
  state: PicoHomeClaimStateName;
  setupMode: {
    active: boolean;
    moveInCodePending: boolean;
  };
  homeId?: string;
  homeHostPicoId?: string;
  hostSigningKeyFingerprintHex?: string;
  hostKeyAgreementKeyFingerprintHex?: string;
  claimedAt?: string;
}

export interface PicoHomeSetupResponse {
  setupMode: {
    active: true;
    moveInCodePending: true;
    claimEndpoint: '/api/home/claim';
    hostSetupNonceHex: string;
  };
  host: {
    suite: typeof picoIdentitySuite;
    signingPublicKeyHex: string;
    signingKeyFingerprintHex: string;
    keyAgreementPublicKeyHex: string;
    keyAgreementKeyFingerprintHex: string;
  };
}

export interface PicoHomeClaimResponse {
  claimState: PicoHomeClaimStateResponse & { state: 'claimed' };
  claimResponse?: PicoHomeClaimResponseRecord;
  foundingRecord?: PicoHomeFoundingRecord;
}

export interface PicoHomePendingClaimResponse {
  pendingClaim: {
    claimResponse: PicoHomeClaimResponseRecord;
    founding: PicoHomeFoundingSignatureInput;
  };
}

export interface PicoEventListResponse<TPayload = unknown> {
  events: PicoEvent<TPayload>[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface PicoRealtimeTicketResponse {
  ticket: string;
  expiresAt: string;
}

/**
 * A named retention policy (ADR 0074). Policies are administration objects, not
 * content: they say when items expire, never what the items hold. `maxAgeDays`
 * exists only for `delete_after_max_age`.
 */
export interface PicoRetentionPolicyResponse {
  retentionPolicyId: string;
  displayName: string;
  mode: MemoryRetentionMode;
  maxAgeDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PicoRetentionPolicyListResponse {
  retentionPolicies: PicoRetentionPolicyResponse[];
}

/**
 * One memory item as returned by the content read API (ADR 0077, Gate C). It
 * carries the metadata already readable at rest (ADR 0071) plus exactly one of
 * `content` (a readable item) or `contentUnavailable` (a `domain_encrypted`
 * item whose key was crypto-shredded or whose provider is absent). The stored
 * `owner`/`controller` are deliberately omitted: they are unverified writer
 * input today and are never authorization inputs (ADR 0077 C2).
 */
export interface PicoMemoryContentItem {
  memoryItemId: string;
  privacyDomain: string;
  contentType: string;
  contentPosture: MemoryContentPosture;
  deletionState: MemoryItemDeletionState;
  retentionPolicyRef?: string;
  content?: string;
  contentUnavailable?: 'key_shredded' | 'crypto_unavailable';
  createdAt: string;
  updatedAt: string;
}

export interface PicoMemoryContentListResponse {
  items: PicoMemoryContentItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type PicoEventAppendResult = 'inserted' | 'duplicate_same_payload' | 'duplicate_conflict';

export interface PicoEventCreateResponse<TPayload = unknown> {
  event: PicoEvent<TPayload>;
  appendResult: PicoEventAppendResult;
}

export interface PicoCoreConnectedMessage {
  type: typeof realtimeMessageType.coreConnected;
  deviceId: string;
}

export interface PicoEventCreatedMessage<TPayload = unknown> {
  type: typeof realtimeMessageType.eventCreated;
  event: PicoEvent<TPayload>;
}

export type PicoRealtimeMessage = PicoCoreConnectedMessage | PicoEventCreatedMessage;

export interface PicoNode {
  nodeId: string;
  name: string;
  type: PicoNodeType;
  // Context signal only. This is not a role, permission or auth boundary.
  contextSignalLevel: ContextSignalLevel;
  capabilities: Record<string, boolean>;
  lastSeenAt?: string;
}

export interface PicoSession {
  sessionId: string;
  activeDeviceId: string;
  createdAt: string;
}

// Reserved Pico Home membership direction. This is not an implemented host
// claim, resident membership or eviction API in the current Foundation build.
export interface PicoHomeMembership {
  picoId: string;
  homeId: string;
  role: 'home_host' | 'home_member';
  status: 'invited' | 'active' | 'removed';
}

export interface MessageCreatedPayload {
  role: MessageCreatedRole;
  text: string;
}

export interface AvatarStateChangedPayload {
  mode: AvatarMode;
  state: AvatarStateName;
  intensity: AvatarIntensity;
  statusColor: AvatarStatusColor;
  message?: string;
}

export interface ActionRequestedPayload {
  actionName: string;
  risk: ActionRisk;
  input: Record<string, unknown>;
}

export interface ActionCompletedPayload {
  actionName: string;
  success: boolean;
  summary: string;
}

export interface PicoRulesDecisionCreatedPayload {
  requestedEventId: string;
  decision: PicoRulesDecision;
  reason: string;
  risk?: ActionRisk;
  dataSpace?: string;
}

export interface ApprovalRequestedPayload {
  requestedEventId: string;
  prompt: string;
  risk: ActionRisk;
  expiresAt?: string;
}

export interface ApprovalResolvedPayload {
  approvalEventId: string;
  approved: boolean;
  resolvedAt: string;
}

export interface ActionRunnerStartedPayload {
  requestedEventId: string;
  actionName: string;
  risk: ActionRisk;
}

export interface ActionRunnerCompletedPayload {
  startedEventId: string;
  actionName: string;
  success: boolean;
  summary: string;
}

export interface ActionHistoryEventPayload {
  subjectEventId?: string;
  actorDeviceId?: string;
  action: string;
  decision?: PicoRulesDecision;
  dataSpace?: string;
  redaction: 'none' | 'summary' | 'reference_only';
  summary: string;
}

export function buildPicoIdentityKeyRecordSignatureInput(
  input: PicoIdentityKeyRecordSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, ['suite', 'keyRole', 'publicKeyHex']);
  assertAsciiToken(input.suite);
  assertStringMember(input.keyRole, picoIdentityKeyRoles, 'invalid_key_role');

  return concatCanonicalElements([
    asciiBytes(picoIdentitySignatureInputLabels.keyrecord),
    asciiBytes(input.suite),
    asciiBytes(input.keyRole),
    fixedHexBytes(input.publicKeyHex, 32, 'invalid_public_key_length'),
  ]);
}

export function buildPicoIdentityPossessionSignatureInput(
  input: PicoIdentityPossessionSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'subjectKeyFingerprintHex',
    'verifierNonceHex',
    'verifierContext',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.verifierContext);

  return concatCanonicalElements([
    asciiBytes(picoIdentitySignatureInputLabels.possession),
    asciiBytes(input.suite),
    fixedHexBytes(input.subjectKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.verifierNonceHex, 32, 'invalid_nonce_length'),
    asciiBytes(input.verifierContext),
  ]);
}

export function buildPicoIdentityDelegationSignatureInput(
  input: PicoIdentityDelegationSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'delegationId',
    'issuerIdentityKeyFingerprintHex',
    'subjectSigningKeyFingerprintHex',
    'subjectKeyAgreementKeyFingerprintHex',
    'scopes',
    'validFrom',
    'validUntil',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.delegationId);
  assertInstant(input.validFrom);
  assertInstant(input.validUntil);
  assertLifecycleOrder(input.lifecycleOrder);
  assertValidBounds(input.validFrom, input.validUntil);
  const scopes = canonicalScopeSet(input.scopes);

  return concatCanonicalElements([
    asciiBytes(picoIdentitySignatureInputLabels.delegation),
    asciiBytes(input.suite),
    asciiBytes(input.delegationId),
    fixedHexBytes(input.issuerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.subjectSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.subjectKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(String(scopes.length)),
    ...scopes.map((scope) => asciiBytes(scope)),
    asciiBytes(input.validFrom),
    asciiBytes(input.validUntil),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoIdentityRevocationSignatureInput(
  input: PicoIdentityRevocationSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'revocationId',
    'issuerIdentityKeyFingerprintHex',
    'subjectKind',
    'subjectRef',
    'reasonCategory',
    'revokedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.revocationId);
  assertStringMember(input.subjectKind, ['delegation', 'key'] as const, 'invalid_subject_kind');
  assertAsciiToken(input.subjectRef);
  assertStringMember(input.reasonCategory, picoIdentityRevocationReasonCategories, 'invalid_reason_category');
  assertInstant(input.revokedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoIdentitySignatureInputLabels.revocation),
    asciiBytes(input.suite),
    asciiBytes(input.revocationId),
    fixedHexBytes(input.issuerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.subjectKind),
    asciiBytes(input.subjectRef),
    asciiBytes(input.reasonCategory),
    asciiBytes(input.revokedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoIdentityReaderKeyFreshnessSignatureInput(
  input: PicoIdentityReaderKeyFreshnessSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'checkpointId',
    'homeId',
    'issuerIdentityKeyFingerprintHex',
    'deviceSigningKeyFingerprintHex',
    'deviceKeyAgreementKeyFingerprintHex',
    'delegationId',
    'status',
    'observedThroughLifecycleOrder',
    'checkedAt',
    'freshUntil',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.checkpointId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.delegationId);
  assertStringMember(
    input.status,
    picoIdentityReaderKeyFreshnessStatuses,
    'invalid_reader_key_freshness_status',
  );
  assertLifecycleOrder(input.observedThroughLifecycleOrder);
  assertInstant(input.checkedAt);
  assertInstant(input.freshUntil);
  assertValidBounds(input.checkedAt, input.freshUntil);

  return concatCanonicalElements([
    asciiBytes(picoIdentityReaderKeyFreshnessSignatureInputLabel),
    asciiBytes(input.suite),
    asciiBytes(input.checkpointId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.issuerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.deviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.deviceKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.delegationId),
    asciiBytes(input.status),
    asciiBytes(input.observedThroughLifecycleOrder),
    asciiBytes(input.checkedAt),
    asciiBytes(input.freshUntil),
  ]);
}

export function buildPicoHomeClaimSignatureInput(input: PicoHomeClaimSignatureInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'claimId',
    'hostSigningKeyFingerprintHex',
    'hostKeyAgreementKeyFingerprintHex',
    'moveInCode',
    'claimantIdentityKeyFingerprintHex',
    'claimantNonceHex',
    'hostSetupNonceHex',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.claimId);
  assertAsciiToken(input.moveInCode);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.claim),
    asciiBytes(input.suite),
    asciiBytes(input.claimId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.moveInCode),
    fixedHexBytes(input.claimantIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.claimantNonceHex, 32, 'invalid_nonce_length'),
    fixedHexBytes(input.hostSetupNonceHex, 32, 'invalid_nonce_length'),
  ]);
}

export function buildPicoHomeClaimResponseSignatureInput(input: PicoHomeClaimResponseSignatureInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'claimId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'hostKeyAgreementKeyFingerprintHex',
    'claimantIdentityKeyFingerprintHex',
    'claimantNonceHex',
    'hostNonceHex',
    'foundingRecordId',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.claimId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.foundingRecordId);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.claimResponse),
    asciiBytes(input.suite),
    asciiBytes(input.claimId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.claimantIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.claimantNonceHex, 32, 'invalid_nonce_length'),
    fixedHexBytes(input.hostNonceHex, 32, 'invalid_nonce_length'),
    asciiBytes(input.foundingRecordId),
  ]);
}

export function buildPicoHomeFoundingSignatureInput(input: PicoHomeFoundingSignatureInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'foundingId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'hostKeyAgreementKeyFingerprintHex',
    'homeHostPicoIdentityFingerprintHex',
    'claimantNonceHex',
    'hostNonceHex',
    'foundedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.foundingId);
  assertAsciiToken(input.homeId);
  assertInstant(input.foundedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.founding),
    asciiBytes(input.suite),
    asciiBytes(input.foundingId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.homeHostPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.claimantNonceHex, 32, 'invalid_nonce_length'),
    fixedHexBytes(input.hostNonceHex, 32, 'invalid_nonce_length'),
    asciiBytes(input.foundedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoHomeMembershipSignatureInput(input: PicoHomeMembershipSignatureInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'credentialId',
    'homeId',
    'issuerPicoIdentityFingerprintHex',
    'subjectPicoIdentityFingerprintHex',
    'hostSigningKeyFingerprintHex',
    'role',
    'scopes',
    'validFrom',
    'validUntil',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.credentialId);
  assertAsciiToken(input.homeId);
  assertStringMember(input.role, picoHomeMembershipRoles, 'invalid_membership_role');
  assertInstant(input.validFrom);
  assertInstant(input.validUntil);
  assertLifecycleOrder(input.lifecycleOrder);
  assertValidBounds(input.validFrom, input.validUntil);
  const scopes = canonicalHomeMembershipScopeSet(input.scopes);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.membership),
    asciiBytes(input.suite),
    asciiBytes(input.credentialId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.issuerPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.subjectPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.role),
    asciiBytes(String(scopes.length)),
    ...scopes.map((scope) => asciiBytes(scope)),
    asciiBytes(input.validFrom),
    asciiBytes(input.validUntil),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoHomeMembershipLifecycleSignatureInput(
  input: PicoHomeMembershipLifecycleSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'lifecycleId',
    'homeId',
    'credentialId',
    'issuerPicoIdentityFingerprintHex',
    'subjectPicoIdentityFingerprintHex',
    'status',
    'reasonCategory',
    'changedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.lifecycleId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.credentialId);
  assertStringMember(input.status, picoHomeMembershipStatuses, 'invalid_membership_status');
  assertStringMember(input.reasonCategory, picoHomeMembershipLifecycleReasonCategories, 'invalid_reason_category');
  assertInstant(input.changedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.membershipLifecycle),
    asciiBytes(input.suite),
    asciiBytes(input.lifecycleId),
    asciiBytes(input.homeId),
    asciiBytes(input.credentialId),
    fixedHexBytes(input.issuerPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.subjectPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.status),
    asciiBytes(input.reasonCategory),
    asciiBytes(input.changedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoHomeDomainReadGrantSignatureInput(
  input: PicoHomeDomainReadGrantSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'grantId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'privacyDomain',
    'controllerPicoIdentityFingerprintHex',
    'readerPicoIdentityFingerprintHex',
    'validFrom',
    'validUntil',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.grantId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.privacyDomain);
  assertInstant(input.validFrom);
  assertInstant(input.validUntil);
  assertLifecycleOrder(input.lifecycleOrder);
  assertValidBounds(input.validFrom, input.validUntil);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.domainReadGrant),
    asciiBytes(input.suite),
    asciiBytes(input.grantId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.privacyDomain),
    fixedHexBytes(input.controllerPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.validFrom),
    asciiBytes(input.validUntil),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoHomeDomainReadGrantLifecycleSignatureInput(
  input: PicoHomeDomainReadGrantLifecycleSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'lifecycleId',
    'grantId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'privacyDomain',
    'controllerPicoIdentityFingerprintHex',
    'readerPicoIdentityFingerprintHex',
    'status',
    'reasonCategory',
    'changedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.lifecycleId);
  assertAsciiToken(input.grantId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.privacyDomain);
  assertStringMember(input.status, picoHomeDomainReadGrantLifecycleStatuses, 'invalid_domain_read_grant_status');
  assertStringMember(
    input.reasonCategory,
    picoHomeDomainReadGrantRevocationReasonCategories,
    'invalid_reason_category',
  );
  assertInstant(input.changedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.domainReadGrantLifecycle),
    asciiBytes(input.suite),
    asciiBytes(input.lifecycleId),
    asciiBytes(input.grantId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.privacyDomain),
    fixedHexBytes(input.controllerPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.status),
    asciiBytes(input.reasonCategory),
    asciiBytes(input.changedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoHomeContinuitySignatureInput(input: PicoHomeContinuitySignatureInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'continuityId',
    'homeId',
    'outgoingHostSigningKeyFingerprintHex',
    'outgoingHostKeyAgreementKeyFingerprintHex',
    'incomingHostSigningKeyFingerprintHex',
    'incomingHostKeyAgreementKeyFingerprintHex',
    'homeHostPicoIdentityFingerprintHex',
    'reasonCategory',
    'changedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.continuityId);
  assertAsciiToken(input.homeId);
  assertStringMember(input.reasonCategory, picoHomeContinuityReasonCategories, 'invalid_reason_category');
  assertInstant(input.changedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoHomeSignatureInputLabels.continuity),
    asciiBytes(input.suite),
    asciiBytes(input.continuityId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.outgoingHostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.outgoingHostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.incomingHostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.incomingHostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.homeHostPicoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.reasonCategory),
    asciiBytes(input.changedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoVaultKeyfileHeaderAad(input: PicoVaultKeyfileHeaderAadInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
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

  if (input.format !== picoVaultKeyfileFormat) {
    throw new Error('wrong_keyfile_label');
  }

  assertAsciiToken(input.suite);
  assertStringMember(input.keyRole, picoVaultPersonKeyRoles, 'invalid_vault_key_role');
  assertStringMember(input.kdfAlgorithm, picoVaultKdfAlgorithms, 'invalid_kdf_algorithm');
  assertStringMember(input.kdfProfile, picoVaultKdfProfiles, 'invalid_kdf_profile');
  assertStringMember(input.aeadAlgorithm, picoVaultAeadAlgorithms, 'invalid_aead_algorithm');

  return concatCanonicalElements([
    asciiBytes(picoVaultKeyfileFormat),
    asciiBytes(input.suite),
    asciiBytes(input.keyRole),
    fixedHexBytes(input.keyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.kdfAlgorithm),
    asciiBytes(input.kdfProfile),
    kdfParameterBytes(
      input.kdfOpsLimit,
      picoVaultArgon2idModerateParams.opsLimit,
      picoVaultArgon2idMaximumParams.opsLimit,
    ),
    kdfParameterBytes(
      input.kdfMemLimitBytes,
      picoVaultArgon2idModerateParams.memLimitBytes,
      picoVaultArgon2idMaximumParams.memLimitBytes,
    ),
    fixedHexBytes(input.kdfSaltHex, 16, 'invalid_kdf_salt_length'),
    asciiBytes(input.aeadAlgorithm),
    fixedHexBytes(input.aeadNonceHex, 24, 'invalid_aead_nonce_length'),
  ]);
}

export function buildPicoShareWrapPayload(input: PicoShareWrapPayloadInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'domainId',
    'kekVersion',
    'readerKeyFingerprintHex',
    'kekHex',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.domainId);

  return concatCanonicalElements([
    asciiBytes(picoShareCanonicalLabels.wrap),
    asciiBytes(input.suite),
    asciiBytes(input.domainId),
    kekVersionBytes(input.kekVersion),
    fixedHexBytes(input.readerKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.kekHex, 32, 'invalid_kek_length'),
  ]);
}

export function buildPicoShareEnvelopeSignatureInput(input: PicoShareEnvelopeSignatureInput): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'grantId',
    'domainId',
    'kekVersion',
    'hostSigningKeyFingerprintHex',
    'issuerIdentityKeyFingerprintHex',
    'readerKeyFingerprintHex',
    'wrapDigestHex',
    'grantedAt',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.grantId);
  assertAsciiToken(input.domainId);
  assertInstant(input.grantedAt);

  return concatCanonicalElements([
    asciiBytes(picoShareCanonicalLabels.envelope),
    asciiBytes(input.suite),
    asciiBytes(input.grantId),
    asciiBytes(input.domainId),
    kekVersionBytes(input.kekVersion),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.issuerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.wrapDigestHex, 32, 'invalid_wrap_digest_length'),
    asciiBytes(input.grantedAt),
  ]);
}

export function buildPicoReaderCustodyDomainSignatureInput(
  input: PicoReaderCustodyDomainSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'domainAuthorityId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'domainId',
    'custodyClass',
    'ownerIdentityKeyFingerprintHex',
    'ownerReaderKeyFingerprintHex',
    'kekVersion',
    'authorizedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.domainAuthorityId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.domainId);
  if (input.custodyClass !== 'reader_custody') {
    throw new Error('invalid_custody_class');
  }
  assertInstant(input.authorizedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoReaderCustodyCanonicalLabels.domain),
    asciiBytes(input.suite),
    asciiBytes(input.domainAuthorityId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.domainId),
    asciiBytes(input.custodyClass),
    fixedHexBytes(input.ownerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.ownerReaderKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    kekVersionBytes(input.kekVersion),
    asciiBytes(input.authorizedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoReaderCustodyReaderGrantSignatureInput(
  input: PicoReaderCustodyReaderGrantSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'readerGrantId',
    'domainAuthorityId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'domainId',
    'ownerIdentityKeyFingerprintHex',
    'readerIdentityKeyFingerprintHex',
    'readerDeviceSigningKeyFingerprintHex',
    'readerKeyFingerprintHex',
    'readerDelegationId',
    'accessMode',
    'firstKekVersion',
    'validFrom',
    'validUntil',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.readerGrantId);
  assertAsciiToken(input.domainAuthorityId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.domainId);
  assertAsciiToken(input.readerDelegationId);
  assertStringMember(
    input.accessMode,
    picoReaderCustodyReaderAccessModes,
    'invalid_reader_access_mode',
  );
  assertInstant(input.validFrom);
  assertInstant(input.validUntil);
  assertLifecycleOrder(input.lifecycleOrder);
  assertValidBounds(input.validFrom, input.validUntil);

  return concatCanonicalElements([
    asciiBytes(picoReaderCustodyCanonicalLabels.readerGrant),
    asciiBytes(input.suite),
    asciiBytes(input.readerGrantId),
    asciiBytes(input.domainAuthorityId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.domainId),
    fixedHexBytes(input.ownerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerDeviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.readerDelegationId),
    asciiBytes(input.accessMode),
    kekVersionBytes(input.firstKekVersion),
    asciiBytes(input.validFrom),
    asciiBytes(input.validUntil),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(
  input: PicoReaderCustodyReaderGrantLifecycleSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'lifecycleId',
    'readerGrantId',
    'domainAuthorityId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'domainId',
    'ownerIdentityKeyFingerprintHex',
    'readerIdentityKeyFingerprintHex',
    'readerKeyFingerprintHex',
    'status',
    'reasonCategory',
    'changedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.lifecycleId);
  assertAsciiToken(input.readerGrantId);
  assertAsciiToken(input.domainAuthorityId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.domainId);
  assertStringMember(
    input.status,
    picoReaderCustodyReaderGrantLifecycleStatuses,
    'invalid_reader_grant_status',
  );
  assertStringMember(
    input.reasonCategory,
    picoReaderCustodyReaderGrantRevocationReasonCategories,
    'invalid_reason_category',
  );
  assertInstant(input.changedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoReaderCustodyCanonicalLabels.readerGrantLifecycle),
    asciiBytes(input.suite),
    asciiBytes(input.lifecycleId),
    asciiBytes(input.readerGrantId),
    asciiBytes(input.domainAuthorityId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.domainId),
    fixedHexBytes(input.ownerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.readerKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.status),
    asciiBytes(input.reasonCategory),
    asciiBytes(input.changedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoReaderCustodyWriterGrantSignatureInput(
  input: PicoReaderCustodyWriterGrantSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'writerGrantId',
    'domainAuthorityId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'domainId',
    'kekVersion',
    'ownerIdentityKeyFingerprintHex',
    'writerIdentityKeyFingerprintHex',
    'writerDeviceSigningKeyFingerprintHex',
    'validFrom',
    'validUntil',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.writerGrantId);
  assertAsciiToken(input.domainAuthorityId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.domainId);
  assertInstant(input.validFrom);
  assertInstant(input.validUntil);
  assertLifecycleOrder(input.lifecycleOrder);
  assertValidBounds(input.validFrom, input.validUntil);

  return concatCanonicalElements([
    asciiBytes(picoReaderCustodyCanonicalLabels.writerGrant),
    asciiBytes(input.suite),
    asciiBytes(input.writerGrantId),
    asciiBytes(input.domainAuthorityId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.domainId),
    kekVersionBytes(input.kekVersion),
    fixedHexBytes(input.ownerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.writerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.writerDeviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.validFrom),
    asciiBytes(input.validUntil),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(
  input: PicoReaderCustodyWriterGrantLifecycleSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'lifecycleId',
    'writerGrantId',
    'domainAuthorityId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'domainId',
    'ownerIdentityKeyFingerprintHex',
    'writerIdentityKeyFingerprintHex',
    'writerDeviceSigningKeyFingerprintHex',
    'status',
    'reasonCategory',
    'changedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.lifecycleId);
  assertAsciiToken(input.writerGrantId);
  assertAsciiToken(input.domainAuthorityId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.domainId);
  assertStringMember(
    input.status,
    picoReaderCustodyWriterGrantLifecycleStatuses,
    'invalid_writer_grant_status',
  );
  assertStringMember(
    input.reasonCategory,
    picoReaderCustodyWriterGrantRevocationReasonCategories,
    'invalid_reason_category',
  );
  assertInstant(input.changedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoReaderCustodyCanonicalLabels.writerGrantLifecycle),
    asciiBytes(input.suite),
    asciiBytes(input.lifecycleId),
    asciiBytes(input.writerGrantId),
    asciiBytes(input.domainAuthorityId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.domainId),
    fixedHexBytes(input.ownerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.writerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.writerDeviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.status),
    asciiBytes(input.reasonCategory),
    asciiBytes(input.changedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoReaderCustodyKekRotationSignatureInput(
  input: PicoReaderCustodyKekRotationSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'rotationId',
    'domainAuthorityId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'domainId',
    'ownerIdentityKeyFingerprintHex',
    'previousKekVersion',
    'kekVersion',
    'causeLifecycleIds',
    'remainingReaderGrantIds',
    'rotatedAt',
    'lifecycleOrder',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.rotationId);
  assertAsciiToken(input.domainAuthorityId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.domainId);
  const causeLifecycleIds = canonicalAsciiTokenSet(
    input.causeLifecycleIds,
    false,
    'invalid_rotation_causes',
  );
  const remainingReaderGrantIds = canonicalAsciiTokenSet(
    input.remainingReaderGrantIds,
    true,
    'invalid_remaining_reader_set',
  );
  if (!Number.isSafeInteger(input.previousKekVersion)
    || input.previousKekVersion < 1
    || input.kekVersion !== input.previousKekVersion + 1) {
    throw new Error('invalid_kek_rotation');
  }
  assertInstant(input.rotatedAt);
  assertLifecycleOrder(input.lifecycleOrder);

  return concatCanonicalElements([
    asciiBytes(picoReaderCustodyCanonicalLabels.kekRotation),
    asciiBytes(input.suite),
    asciiBytes(input.rotationId),
    asciiBytes(input.domainAuthorityId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.domainId),
    fixedHexBytes(input.ownerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    kekVersionBytes(input.previousKekVersion),
    kekVersionBytes(input.kekVersion),
    asciiBytes(String(causeLifecycleIds.length)),
    ...causeLifecycleIds.map((id) => asciiBytes(id)),
    asciiBytes(String(remainingReaderGrantIds.length)),
    ...remainingReaderGrantIds.map((id) => asciiBytes(id)),
    asciiBytes(input.rotatedAt),
    asciiBytes(input.lifecycleOrder),
  ]);
}

export function buildPicoReaderCustodyItemSignatureInput(
  input: PicoReaderCustodyItemSignatureInput,
): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'packageId',
    'domainAuthorityId',
    'writerGrantId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'domainId',
    'memoryItemId',
    'contentType',
    'kekVersion',
    'writerIdentityKeyFingerprintHex',
    'writerDeviceSigningKeyFingerprintHex',
    'contentNonceHex',
    'contentCiphertextDigestHex',
    'dekWrapNonceHex',
    'wrappedDekDigestHex',
    'createdAt',
  ]);
  assertAsciiToken(input.suite);
  assertAsciiToken(input.packageId);
  assertAsciiToken(input.domainAuthorityId);
  assertAsciiToken(input.writerGrantId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.domainId);
  assertAsciiToken(input.memoryItemId);
  assertAsciiToken(input.contentType);
  assertInstant(input.createdAt);

  return concatCanonicalElements([
    asciiBytes(picoReaderCustodyCanonicalLabels.item),
    asciiBytes(input.suite),
    asciiBytes(input.packageId),
    asciiBytes(input.domainAuthorityId),
    asciiBytes(input.writerGrantId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.domainId),
    asciiBytes(input.memoryItemId),
    asciiBytes(input.contentType),
    kekVersionBytes(input.kekVersion),
    fixedHexBytes(input.writerIdentityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.writerDeviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.contentNonceHex, 24, 'invalid_nonce_length'),
    fixedHexBytes(input.contentCiphertextDigestHex, 32, 'invalid_ciphertext_digest_length'),
    fixedHexBytes(input.dekWrapNonceHex, 24, 'invalid_nonce_length'),
    fixedHexBytes(input.wrappedDekDigestHex, 32, 'invalid_wrapped_dek_digest_length'),
    asciiBytes(input.createdAt),
  ]);
}

export function buildPicoMemoryContentAd(input: {
  suite: string;
  memoryItemId: string;
  privacyDomain: string;
  contentType: string;
}): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'memoryItemId',
    'privacyDomain',
    'contentType',
  ]);

  return concatCanonicalElements([
    asciiBytes(picoMemoryContentAdLabel),
    asciiBytes(input.suite),
    asciiBytes(input.memoryItemId),
    asciiBytes(input.privacyDomain),
    asciiBytes(input.contentType),
  ]);
}

export function buildPicoMemoryDekWrapAd(input: {
  suite: string;
  keyEnvelopeId: string;
  domainId: string;
  memoryItemId: string;
}): Uint8Array {
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'suite',
    'keyEnvelopeId',
    'domainId',
    'memoryItemId',
  ]);

  return concatCanonicalElements([
    asciiBytes(picoMemoryDekWrapAdLabel),
    asciiBytes(input.suite),
    asciiBytes(input.keyEnvelopeId),
    asciiBytes(input.domainId),
    asciiBytes(input.memoryItemId),
  ]);
}

// KEK versions are the ADR 0072 `domain_<id>.v<n>.key` versions, which start at
// 1. Serialized as ASCII decimal, mirroring the KDF-parameter encoding.
function kekVersionBytes(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('invalid_kek_version');
  }

  return asciiBytes(String(value));
}

function firstUnexpectedKey(record: Record<string, unknown>, allowedKeys: readonly string[]): string | undefined {
  const allowed = new Set(allowedKeys);
  return Object.keys(record).find((key) => !allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringMember<const TValues extends readonly string[]>(value: unknown, allowedValues: TValues): value is TValues[number] {
  return typeof value === 'string' && allowedValues.includes(value);
}

function isNonEmptyString(value: unknown, maxLength: number | undefined): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && (maxLength === undefined || value.length <= maxLength);
}

const canonicalTextEncoder = new TextEncoder();
const canonicalAsciiTokenPattern = /^[A-Za-z0-9._:/+-]+$/;
const canonicalHexPattern = /^[0-9a-f]+$/;
const canonicalInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function concatCanonicalElements(elements: readonly Uint8Array[]): Uint8Array {
  const parts = elements.map((element) => {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, element.byteLength, false);
    return [length, element] as const;
  }).flat();
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

function asciiBytes(value: string): Uint8Array {
  assertAsciiToken(value);
  return canonicalTextEncoder.encode(value);
}

function fixedHexBytes(value: string, expectedByteLength: number, lengthReason: string): Uint8Array {
  if (!canonicalHexPattern.test(value)) {
    throw new Error('invalid_hex');
  }
  if (value.length !== expectedByteLength * 2) {
    throw new Error(lengthReason);
  }

  const output = new Uint8Array(expectedByteLength);
  for (let i = 0; i < expectedByteLength; i += 1) {
    output[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }

  return output;
}

function kdfParameterBytes(value: number, minimumValue: number, maximumValue: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < minimumValue) {
    throw new Error('kdf_parameter_downgrade');
  }
  if (value > maximumValue) {
    throw new Error('kdf_parameter_unsupported');
  }

  return asciiBytes(String(value));
}

function assertAsciiToken(value: string): void {
  const bytes = canonicalTextEncoder.encode(value);
  if (bytes.length === 0) {
    throw new Error('empty_field');
  }
  if (bytes.length > 1024) {
    throw new Error('field_too_long');
  }
  if (!canonicalAsciiTokenPattern.test(value)) {
    throw new Error('invalid_field_charset');
  }
}

/**
 * Every consumer of a protected timestamp compares it as a string: validity
 * windows here, lifecycle lookups in `@pico/identity`, membership projections in
 * the Foundation. That is only sound while all writers use one fixed-width UTC
 * form, so it is pinned at the canonicalization boundary rather than left to
 * issuer discipline. An offset form sorts before `Z` at the same instant
 * (`+` = 0x2B, `.` = 0x2E, `Z` = 0x5A), which would keep an expired delegation
 * looking active; second precision misses the exact boundary the same way.
 */
function assertInstant(value: string): void {
  assertAsciiToken(value);
  if (!canonicalInstantPattern.test(value) || !isRoundTripInstant(value)) {
    throw new Error('invalid_instant');
  }
}

/**
 * The shape check alone still admits impossible dates: `Date.parse` rolls
 * `2026-02-30` forward to March 2 rather than failing. Re-serializing is the
 * exact calendar check, because `toISOString` emits precisely this form.
 */
function isRoundTripInstant(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function assertExactKeys(record: Record<string, unknown>, expectedKeys: readonly string[]): void {
  if ('fieldOrder' in record) {
    throw new Error('field_reordering');
  }

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

function canonicalScopeSet(scopes: readonly string[]): PicoIdentityDelegationScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('empty_scope_set');
  }

  const seen = new Set<string>();
  for (const scope of scopes) {
    assertStringMember(scope, picoIdentityDelegationScopes, 'invalid_scope');
    if (seen.has(scope)) {
      throw new Error('duplicate_scope');
    }
    seen.add(scope);
  }

  return [...scopes].sort() as PicoIdentityDelegationScope[];
}

function canonicalAsciiTokenSet(
  values: readonly string[],
  allowEmpty: boolean,
  error: string,
): string[] {
  if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) {
    throw new Error(error);
  }
  const unique = new Set<string>();
  for (const value of values) {
    try {
      assertAsciiToken(value);
    } catch {
      throw new Error(error);
    }
    if (unique.has(value)) {
      throw new Error(error);
    }
    unique.add(value);
  }
  return [...values].sort();
}

function canonicalHomeMembershipScopeSet(scopes: readonly string[]): PicoHomeMembershipScope[] {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('empty_scope_set');
  }

  const seen = new Set<string>();
  for (const scope of scopes) {
    assertStringMember(scope, picoHomeMembershipScopes, 'invalid_membership_scope');
    if (seen.has(scope)) {
      throw new Error('duplicate_scope');
    }
    seen.add(scope);
  }

  return [...scopes].sort() as PicoHomeMembershipScope[];
}

function assertValidBounds(validFrom: string, validUntil: string): void {
  if (validUntil <= validFrom) {
    throw new Error('invalid_validity_bounds');
  }
}

function assertLifecycleOrder(value: string): void {
  assertAsciiToken(value);
  if (!/^seq:[0-9]{16}$/.test(value)) {
    throw new Error('invalid_lifecycle_order');
  }
}
