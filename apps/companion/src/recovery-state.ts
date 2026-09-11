import { assertExactKeys, isAsciiToken, isHexOfBytes } from '@pico/protocol/canonical-bytes';
import { assertPicoInstant, picoInstantToEpochMs } from '@pico/protocol/instant';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';

/**
 * ADR 0112 S3 device-local continuation state. It contains no phrase, PIN,
 * passphrase or key bytes: only the signed pending view needed to resume the
 * same target's pull-completion, or the small public receipt summary shown
 * after success.
 */
export const picoCompanionRecoveryStateSchema =
  'pico.companion.recovery-state.v1' as const;

export interface PicoCompanionPendingRecoveryState {
  schema: typeof picoCompanionRecoveryStateSchema;
  status: 'pending';
  pending: PicoHomeDeviceRecoveryPendingView;
}

export interface PicoCompanionRecoveryReceiptSummary {
  recoveryId: string;
  targetDelegationId: string;
  targetDeviceSigningKeyFingerprintHex: string;
  targetDeviceKeyAgreementKeyFingerprintHex: string;
  completedAt: string;
  leavesExactlyOneActiveDevice: true;
  otherDevicesRevoked: true;
}

export interface PicoCompanionCompletedRecoveryState {
  schema: typeof picoCompanionRecoveryStateSchema;
  status: 'completed';
  receipt: PicoCompanionRecoveryReceiptSummary;
}

export type PicoCompanionRecoveryState =
  | PicoCompanionPendingRecoveryState
  | PicoCompanionCompletedRecoveryState;

export function defaultPicoCompanionRecoveryStatePath(
  profilePath: string,
): string {
  return join(dirname(profilePath), 'recovery-state.json');
}

export function parsePicoCompanionRecoveryState(
  value: unknown,
): PicoCompanionRecoveryState {
  const record = requireRecord(value, 'invalid_companion_recovery_state');
  if (record.schema !== picoCompanionRecoveryStateSchema) {
    throw new Error('invalid_companion_recovery_state_schema');
  }
  if (record.status === 'pending') {
    assertExactKeys(record, ['schema', 'status', 'pending'], 'invalid_companion_recovery_state_shape');
    return Object.freeze({
      schema: picoCompanionRecoveryStateSchema,
      status: 'pending',
      pending: parsePending(record.pending),
    });
  }
  if (record.status === 'completed') {
    assertExactKeys(record, ['schema', 'status', 'receipt'], 'invalid_companion_recovery_state_shape');
    return Object.freeze({
      schema: picoCompanionRecoveryStateSchema,
      status: 'completed',
      receipt: parseReceipt(record.receipt),
    });
  }
  throw new Error('invalid_companion_recovery_state_status');
}

export function readPicoCompanionRecoveryState(
  path: string,
): PicoCompanionRecoveryState | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return parsePicoCompanionRecoveryState(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error(`unreadable_companion_recovery_state:${(error as Error).message}`);
  }
}

export function writePicoCompanionRecoveryState(
  path: string,
  state: PicoCompanionRecoveryState,
): void {
  const parsed = parsePicoCompanionRecoveryState(state);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(temporaryPath, 0o600);
  fsyncPath(temporaryPath, 'r+');
  renameSync(temporaryPath, path);
  fsyncPath(dirname(path), 'r');
}

export function clearPicoCompanionRecoveryState(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  unlinkSync(path);
  fsyncPath(dirname(path), 'r');
}

function parsePending(value: unknown): PicoHomeDeviceRecoveryPendingView {
  const record = requireRecord(value, 'invalid_companion_pending_recovery');
  assertExactKeys(record, [
    'recoveryId',
    'claimDigestHex',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'acceptedAt',
    'effectiveAt',
    'completionExpiresAt',
  ], 'invalid_companion_recovery_state_shape');
  assertToken(record.recoveryId, 'invalid_companion_recovery_id');
  assertHex32(record.claimDigestHex, 'invalid_companion_recovery_claim_digest');
  assertToken(record.targetDelegationId, 'invalid_companion_recovery_delegation');
  assertHex32(
    record.targetDeviceSigningKeyFingerprintHex,
    'invalid_companion_recovery_signing_fingerprint',
  );
  assertHex32(
    record.targetDeviceKeyAgreementKeyFingerprintHex,
    'invalid_companion_recovery_agreement_fingerprint',
  );
  const acceptedAt = picoInstantToEpochMs(record.acceptedAt, 'invalid_companion_recovery_instant');
  const effectiveAt = picoInstantToEpochMs(record.effectiveAt, 'invalid_companion_recovery_instant');
  const completionExpiresAt = picoInstantToEpochMs(record.completionExpiresAt, 'invalid_companion_recovery_instant');
  if (!(acceptedAt < effectiveAt && effectiveAt < completionExpiresAt)) {
    throw new Error('invalid_companion_recovery_timing');
  }
  return Object.freeze({ ...record }) as unknown as PicoHomeDeviceRecoveryPendingView;
}

function parseReceipt(value: unknown): PicoCompanionRecoveryReceiptSummary {
  const record = requireRecord(value, 'invalid_companion_recovery_receipt');
  assertExactKeys(record, [
    'recoveryId',
    'targetDelegationId',
    'targetDeviceSigningKeyFingerprintHex',
    'targetDeviceKeyAgreementKeyFingerprintHex',
    'completedAt',
    'leavesExactlyOneActiveDevice',
    'otherDevicesRevoked',
  ], 'invalid_companion_recovery_state_shape');
  assertToken(record.recoveryId, 'invalid_companion_recovery_id');
  assertToken(record.targetDelegationId, 'invalid_companion_recovery_delegation');
  assertHex32(
    record.targetDeviceSigningKeyFingerprintHex,
    'invalid_companion_recovery_signing_fingerprint',
  );
  assertHex32(
    record.targetDeviceKeyAgreementKeyFingerprintHex,
    'invalid_companion_recovery_agreement_fingerprint',
  );
  assertPicoInstant(record.completedAt, 'invalid_companion_recovery_instant');
  if (
    record.leavesExactlyOneActiveDevice !== true
    || record.otherDevicesRevoked !== true
  ) {
    throw new Error('invalid_companion_recovery_receipt_outcome');
  }
  return Object.freeze({ ...record }) as unknown as PicoCompanionRecoveryReceiptSummary;
}

function requireRecord(value: unknown, reason: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(reason);
  }
  return value as Record<string, unknown>;
}


function assertHex32(value: unknown, reason: string): asserts value is string {
  if (typeof value !== 'string' || !isHexOfBytes(value, 32)) {
    throw new Error(reason);
  }
}

function assertToken(value: unknown, reason: string): asserts value is string {
  if (
    typeof value !== 'string'
    || !isAsciiToken(value)
  ) {
    throw new Error(reason);
  }
}

function fsyncPath(path: string, flags: 'r' | 'r+'): void {
  const handle = openSync(path, flags);
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
