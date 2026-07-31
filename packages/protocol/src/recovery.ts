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

export const picoRecoveryCardSchema = 'pico.recovery.card.v1' as const;
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

export interface PicoRecoveryCardPayload {
  schema: typeof picoRecoveryCardSchema;
  suite: string;
  picoName: string;
  homeNameOrId: string;
  seedMaterialHex: string;
  pinProtected: boolean;
  identityKeyFingerprintHex: string;
  homeId: string;
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
  assertExactKeys(input as unknown as Record<string, unknown>, [
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
  assertInstant(input.createdAt);
  assertInstant(input.expiresAt);
  if (Date.parse(input.expiresAt) <= Date.parse(input.createdAt)) {
    throw new Error('invalid_validity_bounds');
  }

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
  assertExactKeys(input as unknown as Record<string, unknown>, [
    'schema',
    'suite',
    'picoName',
    'homeNameOrId',
    'seedMaterialHex',
    'pinProtected',
    'identityKeyFingerprintHex',
    'homeId',
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
  assertInstant(input.issuedAt);
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
    fixedHexBytes(input.hostSigningKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementKeyFingerprintHex, 32, 'invalid_fingerprint_length'),
    fixedHexBytes(input.hostKeyAgreementPublicKeyHex, 32, 'invalid_public_key_length'),
    utf8Bytes(input.endpointHint),
    asciiBytes(input.issuedAt),
  ]);
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
  assertExactKeys(input as unknown as Record<string, unknown>, [
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
  assertLifecycleOrder(input.observedLifecycleOrder);
  assertInstant(input.createdAt);
  assertInstant(input.expiresAt);
  if (Date.parse(input.expiresAt) <= Date.parse(input.createdAt)) {
    throw new Error('invalid_validity_bounds');
  }

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
  assertExactKeys(input as unknown as Record<string, unknown>, [
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
  assertLifecycleOrder(input.acceptedLifecycleOrder);
  assertLifecycleOrder(input.resultingLifecycleOrder);
  for (const instant of [
    input.pendingAcceptedAt,
    input.effectiveAt,
    input.completionExpiresAt,
    input.completedAt,
  ]) {
    assertInstant(instant);
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
  assertExactKeys(evidence as unknown as Record<string, unknown>, [
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
  assertExactKeys(evidence.delegation, ['record', 'signatureHex']);
  assertDelegation(evidence.delegation.record as PicoIdentityDelegationSignatureInput);
  fixedHexBytes(evidence.delegation.signatureHex as string, 64, 'invalid_signature_length');
  if (!Array.isArray(evidence.revocations)) {
    throw new Error('invalid_recovery_revocations');
  }
  for (const revocation of evidence.revocations) {
    if (!isRecord(revocation)) {
      throw new Error('invalid_recovery_revocation');
    }
    assertExactKeys(revocation, ['record', 'signatureHex']);
    assertRevocation(revocation.record as PicoIdentityRevocationSignatureInput);
    fixedHexBytes(revocation.signatureHex as string, 64, 'invalid_signature_length');
  }
}

function assertKeyRecord(record: PicoIdentityKeyRecordSignatureInput): void {
  assertExactKeys(record as unknown as Record<string, unknown>, [
    'suite',
    'keyRole',
    'publicKeyHex',
  ]);
  buildPicoIdentityKeyRecordSignatureInput(record);
}

function assertDelegation(record: PicoIdentityDelegationSignatureInput): void {
  assertExactKeys(record as unknown as Record<string, unknown>, [
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
  assertExactKeys(record as unknown as Record<string, unknown>, [
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

const textEncoder = new TextEncoder();
const asciiTokenPattern = /^[A-Za-z0-9._:/+-]+$/;
const canonicalHexPattern = /^[0-9a-f]+$/;
const canonicalInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const lifecycleOrderPattern = /^seq:[0-9]{16}$/;

function concatCanonicalElements(elements: readonly Uint8Array[]): Uint8Array {
  const parts = elements.flatMap((element) => {
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, element.byteLength, false);
    return [length, element];
  });
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function utf8Bytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function asciiBytes(value: string): Uint8Array {
  assertAsciiToken(value);
  return utf8Bytes(value);
}

function fixedHexBytes(
  value: string,
  expectedByteLength: number,
  lengthReason: string,
): Uint8Array {
  if (typeof value !== 'string' || !canonicalHexPattern.test(value)) {
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

function assertAsciiToken(value: string): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 1024
    || !asciiTokenPattern.test(value)
  ) {
    throw new Error('invalid_field_charset');
  }
}

function assertDisplayText(value: string, reason: string): void {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || textEncoder.encode(value).byteLength > 256
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(reason);
  }
}

function assertEndpointHint(value: string): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || textEncoder.encode(value).byteLength > 2048
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error('invalid_endpoint_hint');
  }
}

function assertInstant(value: string): void {
  assertAsciiToken(value);
  const parsed = new Date(value);
  if (
    !canonicalInstantPattern.test(value)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString() !== value
  ) {
    throw new Error('invalid_instant');
  }
}

function assertLifecycleOrder(value: string): void {
  if (typeof value !== 'string' || !lifecycleOrderPattern.test(value)) {
    throw new Error('invalid_lifecycle_order');
  }
}

function assertExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
): void {
  if (!isRecord(record)) {
    throw new Error('invalid_record');
  }
  if ('fieldOrder' in record) {
    throw new Error('field_reordering');
  }
  const expected = new Set(expectedKeys);
  if (Object.keys(record).some((key) => !expected.has(key))) {
    throw new Error('unexpected_field');
  }
  if (expectedKeys.some((key) => !(key in record))) {
    throw new Error('missing_field');
  }
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error('invalid_json_number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new Error('invalid_json_value');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
