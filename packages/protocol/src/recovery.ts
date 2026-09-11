// Befund B50. Die kanonischen Bytes-Regeln standen hier ein zweites Mal, mit
// denselben Bytes und vier anderen Ablehnungen. Jetzt von dort, wo sie einmal
// stehen - und ein Blatt ohne eigene Importe legt keine Kante (Befund B49).
import {
  asciiBytes,
  assertAsciiToken,
  assertExactKeysWithoutFieldOrder,
  bytesToHex,
  canonicalTextEncoder,
  concatCanonicalElements,
  fixedHexBytes,
} from './canonical-bytes.js';
import { assertPicoInstant, assertPicoValidityBounds } from './instant.js';
import { assertPicoLifecycleOrder } from './lifecycle-order.js';
import type {
  PicoIdentityDelegationSignatureInput,
  PicoIdentityKeyRecordSignatureInput,
  PicoIdentityRevocationSignatureInput,
} from './index.js';
import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoIdentitySuite,
} from './index.js';
import {
  canonicalJson,
  decodeBase64Url,
  decodeCanonicalText,
  encodeBase64Url,
  picoBase64UrlPattern,
} from './canonical-transport.js';

export const picoRecoveryCardSchema = 'pico.recovery.card.v1' as const;

/**
 * ADR 0110 R5: the fixed ASCII transport a commodity camera or USB scanner
 * returns. It lives beside the canonical form rather than beside the issuing
 * PDF writer because the scanning side must be able to read a card without
 * depending on the side that printed it.
 */
export const picoRecoveryCardScanPrefix = 'pico-recovery-card-v1:' as const;

const maxPicoRecoveryCardCanonicalBytes = 4_096;
export const picoHomeDeviceRecoverySubmissionSchema =
  'pico.home.device-recovery-submission.v1' as const;
export const picoHomeDeviceRecoveryRecordSchema =
  'pico.home.device-recovery-record.v1' as const;

export const picoHomeDeviceRecoveryCanonicalLabels = {
  card: picoRecoveryCardSchema,
  prepare: 'pico.home.device-recovery-prepare.v1',
  evidenceDigest: 'pico.home.device-recovery-evidence-digest.v1',
  claim: 'pico.home.device-recovery-claim.v1',
  receipt: 'pico.home.device-recovery-receipt.v1',
} as const;

export const picoHomeDeviceRecoveryPendingStatuses = [
  'pending',
  'superseded',
  'vetoed',
  'lapsed',
  'consumed',
] as const;

export type PicoHomeDeviceRecoveryPendingStatus =
  typeof picoHomeDeviceRecoveryPendingStatuses[number];

/**
 * ADR 0110 timing is protocol policy, not host configuration. Keeping the
 * values beside the canonical forms lets Foundation and person-side ceremony
 * clients enforce the same fixed bounds without copying magic numbers.
 */
export const picoHomeDeviceRecoveryTiming = {
  signedRequestLifetimeMs: 5 * 60 * 1_000,
  vetoDelayMs: 48 * 60 * 60 * 1_000,
  completionWindowMs: 7 * 24 * 60 * 60 * 1_000,
} as const;

/**
 * ADR 0114 T1. The root rotation's veto window, and it stands here rather than
 * beside the rotation's canonical form because it *is* the value above.
 *
 * ADR 0114 says the rotation "inherits ADR 0110's device asymmetry, veto delay
 * and loudness rather than duplicating them" - it is one threat with one
 * answer, not two policies that happen to agree on 48 hours today. The Home
 * wrote the number a second time (Befund B68); a truth written twice drifts,
 * and this one would have drifted into contradicting the ADR that named it.
 *
 * A person-side ceremony client must bound the window it shows by the same
 * value the Home enforces, which is why this is protocol policy rather than
 * host configuration - the same reason the recovery timing above gives.
 */
export const picoIdentityRootRotationTiming = {
  vetoDelayMs: picoHomeDeviceRecoveryTiming.vetoDelayMs,
} as const;

export interface PicoRecoveryCardPayload {
  schema: typeof picoRecoveryCardSchema;
  suite: string;
  picoName: string;
  homeNameOrId: string;
  seedMaterialHex: string;
  pinProtected: boolean;
  identityKeyFingerprintHex: string;
  homeId: string;
  // ADR 0115. The non-rotating Home acceptor pin is required: a card without
  // it cannot establish a trustworthy first-run profile, and before the
  // format freeze there is no population holding one that lacks it
  // (ADR 0134 F2).
  homeHostPicoIdentityFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  hostKeyAgreementPublicKeyHex: string;
  endpointHint: string;
  issuedAt: string;
}

export interface PicoHomeDeviceRecoveryEvidence {
  identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  targetDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  targetDeviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
  delegation: {
    record: PicoIdentityDelegationSignatureInput;
    signatureHex: string;
  };
  revocations: {
    record: PicoIdentityRevocationSignatureInput;
    signatureHex: string;
  }[];
}

/**
 * Root-authenticated discovery for a zero-device recovery. The outer Pico Link
 * envelope proves possession of the proposed target device key; this canonical
 * input proves that the identity root authorizes that target to learn the
 * exact lifecycle head and active delegation set needed for total replacement.
 */
export interface PicoHomeDeviceRecoveryPrepareSignatureInput {
  suite: string;
  preparationId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  picoIdentityFingerprintHex: string;
  targetDelegationId: string;
  targetDeviceSigningKeyFingerprintHex: string;
  targetDeviceKeyAgreementKeyFingerprintHex: string;
  createdAt: string;
  expiresAt: string;
}

export interface PicoHomeDeviceRecoveryPreparation {
  request: PicoHomeDeviceRecoveryPrepareSignatureInput;
  identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  rootSignatureHex: string;
}

export interface PicoHomeDeviceRecoveryClaimSignatureInput {
  suite: string;
  recoveryId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  picoIdentityFingerprintHex: string;
  targetDelegationId: string;
  targetDeviceSigningKeyFingerprintHex: string;
  targetDeviceKeyAgreementKeyFingerprintHex: string;
  evidenceDigestHex: string;
  observedLifecycleOrder: string;
  createdAt: string;
  expiresAt: string;
}

export interface PicoHomeDeviceRecoverySubmission {
  schema: typeof picoHomeDeviceRecoverySubmissionSchema;
  claim: PicoHomeDeviceRecoveryClaimSignatureInput;
  evidence: PicoHomeDeviceRecoveryEvidence;
  rootSignatureHex: string;
  targetSignatureHex: string;
}

export interface PicoHomeDeviceRecoveryReceiptSignatureInput {
  suite: string;
  recoveryId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  picoIdentityFingerprintHex: string;
  targetDelegationId: string;
  targetDeviceSigningKeyFingerprintHex: string;
  targetDeviceKeyAgreementKeyFingerprintHex: string;
  evidenceDigestHex: string;
  claimDigestHex: string;
  acceptedLifecycleOrder: string;
  resultingLifecycleOrder: string;
  pendingAcceptedAt: string;
  effectiveAt: string;
  completionExpiresAt: string;
  completedAt: string;
  leavesExactlyOneActiveDevice: boolean;
}

export interface PicoHomeDeviceRecoveryRecord {
  schema: typeof picoHomeDeviceRecoveryRecordSchema;
  submission: PicoHomeDeviceRecoverySubmission;
  receipt: PicoHomeDeviceRecoveryReceiptSignatureInput;
  hostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  hostSignatureHex: string;
}

export interface PicoHomeDeviceRecoveryPendingView {
  recoveryId: string;
  claimDigestHex: string;
  targetDelegationId: string;
  targetDeviceSigningKeyFingerprintHex: string;
  targetDeviceKeyAgreementKeyFingerprintHex: string;
  acceptedAt: string;
  effectiveAt: string;
  completionExpiresAt: string;
}

export function buildPicoHomeDeviceRecoveryPrepareSignatureInput(
  input: PicoHomeDeviceRecoveryPrepareSignatureInput,
): Uint8Array {
  assertExactRecordShape(input as unknown as Record<string, unknown>, [
    'suite',
    'preparationId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'hostKeyAgreementKeyFingerprintHex',
    'picoIdentityFingerprintHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'createdAt',
    'expiresAt',
  ]);
  if (input.suite !== picoIdentitySuite) {
    throw new Error('invalid_recovery_suite');
  }
  assertAsciiToken(input.preparationId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.targetDelegationId);
  assertPicoValidityBounds(input.createdAt, input.expiresAt);

  return concatCanonicalElements([
    asciiBytes(picoHomeDeviceRecoveryCanonicalLabels.prepare),
    asciiBytes(input.suite),
    asciiBytes(input.preparationId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.picoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.targetDelegationId),
    fixedHexBytes(input.targetDeviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.targetDeviceKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.createdAt),
    asciiBytes(input.expiresAt),
  ]);
}

export function buildPicoRecoveryCardPayload(
  input: PicoRecoveryCardPayload,
): Uint8Array {
  assertExactRecordShape(input as unknown as Record<string, unknown>, [
    'schema',
    'suite',
    'picoName',
    'homeNameOrId',
    'seedMaterialHex',
    'pinProtected',
    'identityKeyFingerprintHex',
    'homeId',
    'homeHostPicoIdentityFingerprintHex',
    'hostSigningKeyFingerprintHex',
    'hostKeyAgreementKeyFingerprintHex',
    'hostKeyAgreementPublicKeyHex',
    'endpointHint',
    'issuedAt',
  ]);
  if (input.schema !== picoRecoveryCardSchema) {
    throw new Error('invalid_recovery_card_schema');
  }
  if (input.suite !== picoIdentitySuite) {
    throw new Error('invalid_recovery_suite');
  }
  assertDisplayText(input.picoName, 'invalid_pico_name');
  assertDisplayText(input.homeNameOrId, 'invalid_home_name');
  assertAsciiToken(input.homeId);
  assertEndpointHint(input.endpointHint);
  assertPicoInstant(input.issuedAt);
  if (typeof input.pinProtected !== 'boolean') {
    throw new Error('invalid_pin_protection_flag');
  }
  if (!input.pinProtected) {
    throw new Error('recovery_card_pin_protection_required');
  }

  return concatCanonicalElements([
    asciiBytes(picoHomeDeviceRecoveryCanonicalLabels.card),
    asciiBytes(input.suite),
    utf8Bytes(input.picoName),
    utf8Bytes(input.homeNameOrId),
    fixedHexBytes(input.seedMaterialHex, 32, 'invalid_seed_material_length'),
    asciiBytes('pin_protected'),
    fixedHexBytes(input.identityKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.homeId),
    fixedHexBytes(
      input.homeHostPicoIdentityFingerprintHex,
      32,
      'invalid_fingerprint_length',
    ),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementPublicKeyHex, 32, 'invalid_public_key_length'),
    utf8Bytes(input.endpointHint),
    asciiBytes(input.issuedAt),
  ]);
}

/**
 * Strict inverse of the binary QR canonical form. It accepts only the exact
 * v1/v2 element counts, bounded canonical lengths and valid UTF-8, then runs
 * the same semantic builder and byte-compares the result. No JSON or
 * field-order-tolerant alternate representation exists on the scan path.
 */
export function parsePicoRecoveryCardPayload(
  canonicalPayload: Uint8Array,
): PicoRecoveryCardPayload {
  const elements = parseCanonicalElements(
    canonicalPayload,
    14,
    maxPicoRecoveryCardCanonicalBytes,
  );
  const label = decodeAsciiElement(elements[0], 'invalid_recovery_card_schema');
  if (label !== picoRecoveryCardSchema) {
    throw new Error('invalid_recovery_card_schema');
  }
  if (elements.length !== 14) {
    throw new Error('invalid_recovery_card_element_count');
  }
  let index = 1;
  const common = {
    suite: decodeAsciiElement(elements[index++], 'invalid_recovery_suite'),
    picoName: decodeUtf8Element(elements[index++]),
    homeNameOrId: decodeUtf8Element(elements[index++]),
    seedMaterialHex: bytesToHex(elements[index++]),
    pinProtected:
      decodeAsciiElement(elements[index++], 'invalid_pin_protection_flag')
      === 'pin_protected',
    identityKeyFingerprintHex: bytesToHex(elements[index++]),
    homeId: decodeAsciiElement(elements[index++], 'invalid_field_charset'),
  };
  const homeHostPicoIdentityFingerprintHex = bytesToHex(elements[index++]);
  const tail = {
    hostSigningKeyFingerprintHex: bytesToHex(elements[index++]),
    hostKeyAgreementKeyFingerprintHex: bytesToHex(elements[index++]),
    hostKeyAgreementPublicKeyHex: bytesToHex(elements[index++]),
    endpointHint: decodeUtf8Element(elements[index++]),
    issuedAt: decodeAsciiElement(elements[index++], 'invalid_instant'),
  };
  const payload: PicoRecoveryCardPayload = {
    schema: picoRecoveryCardSchema,
    ...common,
    homeHostPicoIdentityFingerprintHex,
    ...tail,
  };
  const rebuilt = buildPicoRecoveryCardPayload(payload);
  if (!equalBytes(rebuilt, canonicalPayload)) {
    throw new Error('noncanonical_recovery_card_payload');
  }
  return Object.freeze(payload);
}

export interface PicoRecoveryCardScan {
  canonicalPayload: Uint8Array;
  payload: PicoRecoveryCardPayload;
}

/**
 * The single writer of the scan transport. Issuing surfaces call it so the
 * printed string and the accepted string can never drift apart.
 */
export function buildPicoRecoveryCardScanTransport(
  canonicalPayload: Uint8Array,
): string {
  if (!(canonicalPayload instanceof Uint8Array)
    || canonicalPayload.byteLength === 0
    || canonicalPayload.byteLength > maxPicoRecoveryCardCanonicalBytes) {
    throw new Error('invalid_recovery_card_payload_length');
  }
  return `${picoRecoveryCardScanPrefix}${encodeBase64Url(canonicalPayload)}`;
}

/**
 * Strict inverse of the scan transport, and deliberately intolerant: the
 * exact prefix, the unpadded base64url alphabet only, and a re-encode
 * byte-comparison that refuses a body whose final unused bits are non-zero -
 * the variant a tolerant decoder would silently accept as a second spelling of
 * the same card. Whitespace is not trimmed; a transport adapter must hand over
 * exactly what the scanner produced, minus its own framing.
 */
export function parsePicoRecoveryCardScanTransport(
  transport: string,
): PicoRecoveryCardScan {
  if (typeof transport !== 'string'
    || transport.length <= picoRecoveryCardScanPrefix.length
    || transport.length > maxPicoRecoveryCardScanChars) {
    throw new Error('invalid_recovery_card_scan_length');
  }
  if (!transport.startsWith(picoRecoveryCardScanPrefix)) {
    throw new Error('invalid_recovery_card_scan_prefix');
  }
  const body = transport.slice(picoRecoveryCardScanPrefix.length);
  if (!picoBase64UrlPattern.test(body)) {
    throw new Error('invalid_recovery_card_scan_charset');
  }
  // A remainder of one leaves six bits that encode no byte, so no canonical
  // encoder can produce it.
  if (body.length % 4 === 1) {
    throw new Error('invalid_recovery_card_scan_length');
  }
  const canonicalPayload = decodeBase64Url(body, 'invalid_recovery_card_scan_charset');
  if (encodeBase64Url(canonicalPayload) !== body) {
    throw new Error('noncanonical_recovery_card_scan');
  }
  const payload = parsePicoRecoveryCardPayload(canonicalPayload);
  return Object.freeze({ canonicalPayload, payload });
}

export function buildPicoHomeDeviceRecoveryEvidenceDigestInput(
  evidence: PicoHomeDeviceRecoveryEvidence,
): Uint8Array {
  assertRecoveryEvidence(evidence);
  return concatCanonicalElements([
    asciiBytes(picoHomeDeviceRecoveryCanonicalLabels.evidenceDigest),
    utf8Bytes(canonicalJson(evidence)),
  ]);
}

export function picoHomeDeviceRecoveryEvidenceDigestHex(
  sodium: RecoveryHashSodium,
  evidence: PicoHomeDeviceRecoveryEvidence,
): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoHomeDeviceRecoveryEvidenceDigestInput(evidence),
    null,
  ));
}

export function buildPicoHomeDeviceRecoveryClaimSignatureInput(
  input: PicoHomeDeviceRecoveryClaimSignatureInput,
): Uint8Array {
  assertExactRecordShape(input as unknown as Record<string, unknown>, [
    'suite',
    'recoveryId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'hostKeyAgreementKeyFingerprintHex',
    'picoIdentityFingerprintHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'evidenceDigestHex',
    'observedLifecycleOrder',
    'createdAt',
    'expiresAt',
  ]);
  if (input.suite !== picoIdentitySuite) {
    throw new Error('invalid_recovery_suite');
  }
  assertAsciiToken(input.recoveryId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.targetDelegationId);
  assertPicoLifecycleOrder(input.observedLifecycleOrder);
  assertPicoValidityBounds(input.createdAt, input.expiresAt);

  return concatCanonicalElements([
    asciiBytes(picoHomeDeviceRecoveryCanonicalLabels.claim),
    asciiBytes(input.suite),
    asciiBytes(input.recoveryId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.picoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.targetDelegationId),
    fixedHexBytes(input.targetDeviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.targetDeviceKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.evidenceDigestHex, 32, 'invalid_digest_length'),
    asciiBytes(input.observedLifecycleOrder),
    asciiBytes(input.createdAt),
    asciiBytes(input.expiresAt),
  ]);
}

export function picoHomeDeviceRecoveryClaimDigestHex(
  sodium: RecoveryHashSodium,
  claim: PicoHomeDeviceRecoveryClaimSignatureInput,
): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoHomeDeviceRecoveryClaimSignatureInput(claim),
    null,
  ));
}

export function buildPicoHomeDeviceRecoveryReceiptSignatureInput(
  input: PicoHomeDeviceRecoveryReceiptSignatureInput,
): Uint8Array {
  assertExactRecordShape(input as unknown as Record<string, unknown>, [
    'suite',
    'recoveryId',
    'homeId',
    'hostSigningKeyFingerprintHex',
    'picoIdentityFingerprintHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'evidenceDigestHex',
    'claimDigestHex',
    'acceptedLifecycleOrder',
    'resultingLifecycleOrder',
    'pendingAcceptedAt',
    'effectiveAt',
    'completionExpiresAt',
    'completedAt',
    'leavesExactlyOneActiveDevice',
  ]);
  if (input.suite !== picoIdentitySuite) {
    throw new Error('invalid_recovery_suite');
  }
  assertAsciiToken(input.recoveryId);
  assertAsciiToken(input.homeId);
  assertAsciiToken(input.targetDelegationId);
  assertPicoLifecycleOrder(input.acceptedLifecycleOrder);
  assertPicoLifecycleOrder(input.resultingLifecycleOrder);
  for (const instant of [
    input.pendingAcceptedAt,
    input.effectiveAt,
    input.completionExpiresAt,
    input.completedAt,
  ]) {
    assertPicoInstant(instant);
  }
  if (
    Date.parse(input.effectiveAt) <= Date.parse(input.pendingAcceptedAt)
    || Date.parse(input.completionExpiresAt) <= Date.parse(input.effectiveAt)
    || Date.parse(input.completedAt) < Date.parse(input.effectiveAt)
    || Date.parse(input.completedAt) >= Date.parse(input.completionExpiresAt)
  ) {
    throw new Error('invalid_recovery_timing');
  }
  if (input.leavesExactlyOneActiveDevice !== true) {
    throw new Error('recovery_must_leave_exactly_one_device');
  }

  return concatCanonicalElements([
    asciiBytes(picoHomeDeviceRecoveryCanonicalLabels.receipt),
    asciiBytes(input.suite),
    asciiBytes(input.recoveryId),
    asciiBytes(input.homeId),
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.picoIdentityFingerprintHex, 32, 'invalid_fingerprint_length'),
    asciiBytes(input.targetDelegationId),
    fixedHexBytes(input.targetDeviceSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.targetDeviceKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.evidenceDigestHex, 32, 'invalid_digest_length'),
    fixedHexBytes(input.claimDigestHex, 32, 'invalid_digest_length'),
    asciiBytes(input.acceptedLifecycleOrder),
    asciiBytes(input.resultingLifecycleOrder),
    asciiBytes(input.pendingAcceptedAt),
    asciiBytes(input.effectiveAt),
    asciiBytes(input.completionExpiresAt),
    asciiBytes(input.completedAt),
    asciiBytes('exactly_one_active_device'),
  ]);
}

function assertRecoveryEvidence(evidence: PicoHomeDeviceRecoveryEvidence): void {
  assertExactRecordShape(evidence as unknown as Record<string, unknown>, [
    'identityKeyRecord',
    'targetDeviceSigningKeyRecord',
    'targetDeviceKeyAgreementKeyRecord',
    'delegation',
    'revocations',
  ]);
  assertKeyRecord(evidence.identityKeyRecord);
  assertKeyRecord(evidence.targetDeviceSigningKeyRecord);
  assertKeyRecord(evidence.targetDeviceKeyAgreementKeyRecord);
  if (
    evidence.identityKeyRecord.keyRole !== 'pico_identity'
    || evidence.targetDeviceSigningKeyRecord.keyRole !== 'device_signing'
    || evidence.targetDeviceKeyAgreementKeyRecord.keyRole
      !== 'device_key_agreement'
  ) {
    throw new Error('invalid_recovery_key_roles');
  }
  if (!isRecord(evidence.delegation)) {
    throw new Error('invalid_recovery_delegation');
  }
  assertExactRecordShape(evidence.delegation, ['record', 'signatureHex']);
  assertDelegation(evidence.delegation.record as PicoIdentityDelegationSignatureInput);
  fixedHexBytes(evidence.delegation.signatureHex as string, 64, 'invalid_signature_length');
  if (!Array.isArray(evidence.revocations)) {
    throw new Error('invalid_recovery_revocations');
  }
  for (const revocation of evidence.revocations) {
    if (!isRecord(revocation)) {
      throw new Error('invalid_recovery_revocation');
    }
    assertExactRecordShape(revocation, ['record', 'signatureHex']);
    assertRevocation(revocation.record as PicoIdentityRevocationSignatureInput);
    fixedHexBytes(revocation.signatureHex as string, 64, 'invalid_signature_length');
  }
}

function assertKeyRecord(record: PicoIdentityKeyRecordSignatureInput): void {
  assertExactRecordShape(record as unknown as Record<string, unknown>, [
    'suite',
    'keyRole',
    'publicKeyHex',
  ]);
  buildPicoIdentityKeyRecordSignatureInput(record);
}

function assertDelegation(record: PicoIdentityDelegationSignatureInput): void {
  assertExactRecordShape(record as unknown as Record<string, unknown>, [
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
  buildPicoIdentityDelegationSignatureInput(record);
}

function assertRevocation(record: PicoIdentityRevocationSignatureInput): void {
  assertExactRecordShape(record as unknown as Record<string, unknown>, [
    'suite',
    'revocationId',
    'issuerIdentityKeyFingerprintHex',
    'subjectKind',
    'subjectRef',
    'reasonCategory',
    'revokedAt',
    'lifecycleOrder',
  ]);
  buildPicoIdentityRevocationSignatureInput(record);
}

interface RecoveryHashSodium {
  crypto_generichash(
    hashLength: number,
    message: Uint8Array,
    key: null,
  ): Uint8Array;
}


function utf8Bytes(value: string): Uint8Array {
  return canonicalTextEncoder.encode(value);
}

function assertDisplayText(value: string, reason: string): void {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || canonicalTextEncoder.encode(value).byteLength > 256
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(reason);
  }
}

function assertEndpointHint(value: string): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || canonicalTextEncoder.encode(value).byteLength > 2048
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error('invalid_endpoint_hint');
  }
}



/**
 * Befund B124, gefaltet von Befund B145. Die vierte Ablehnung ist die einzige,
 * die diesem Weg gehoert: eine Karte kommt als geparstes JSON herein, also ist
 * „das ist gar kein Datensatz" hier ein erreichbarer Zustand und kein
 * Aufruferfehler. Die drei darunter sind dieselbe Regel wie im Barrel, und
 * stehen seit B145 nur noch einmal.
 */
function assertExactRecordShape(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  if (!isRecord(record)) {
    throw new Error('invalid_record');
  }
  assertExactKeysWithoutFieldOrder(record, expectedKeys);
}

function parseCanonicalElements(
  input: Uint8Array,
  maximumElements: number,
  maximumBytes: number,
): Uint8Array[] {
  if (!(input instanceof Uint8Array) || input.byteLength === 0
    || input.byteLength > maximumBytes) {
    throw new Error('invalid_recovery_card_payload_length');
  }
  const elements: Uint8Array[] = [];
  let offset = 0;
  while (offset < input.byteLength) {
    if (elements.length >= maximumElements || offset + 4 > input.byteLength) {
      throw new Error('invalid_recovery_card_canonical_length');
    }
    const length = new DataView(
      input.buffer,
      input.byteOffset + offset,
      4,
    ).getUint32(0, false);
    offset += 4;
    if (length === 0 || offset + length > input.byteLength) {
      throw new Error('invalid_recovery_card_canonical_length');
    }
    elements.push(input.slice(offset, offset + length));
    offset += length;
  }
  return elements;
}

/**
 * Written out rather than delegated to a runtime decoder: `Buffer` and `atob`
 * both accept padding, the standard `+/` alphabet and in places stray
 * characters, which would give one card several accepted spellings. The rest
 * of this module has no runtime dependency either.
 */
/**
 * The longest a Recovery Card code can be, derived rather than chosen.
 *
 * Exported because a field that asks a person to type one has to stop where
 * this parser stops. The Electron shell's field stopped at 8,192 until
 * 2026-08-20 - two thousand seven hundred characters past the last one that
 * could ever be part of a code - so a scanner feeding a wrong line, or a
 * person pasting one, ran on into a refusal that could only say the code was
 * malformed. The same defect as the device-enrolment field, and it survived
 * that field's repair by a few hours because it lives in the window rather
 * than in the prompt beside the others.
 */
export const maxPicoRecoveryCardScanChars = picoRecoveryCardScanPrefix.length
  + Math.ceil(maxPicoRecoveryCardCanonicalBytes / 3) * 4;

function decodeUtf8Element(value: Uint8Array): string {
  try {
    // ICU-free, for the reason `decodeCanonicalText` gives: a Recovery Card
    // that a phone cannot read is the one card that matters.
    return decodeCanonicalText(value, 'invalid_recovery_card_utf8');
  } catch {
    throw new Error('invalid_recovery_card_utf8');
  }
}

function decodeAsciiElement(value: Uint8Array, reason: string): string {
  if ([...value].some((byte) => byte > 0x7f)) {
    throw new Error(reason);
  }
  return decodeUtf8Element(value);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index]);
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
