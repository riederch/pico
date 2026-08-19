import { tmpdir } from 'node:os';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPicoCompanionRecoveryState,
  parsePicoCompanionRecoveryState,
  picoCompanionRecoveryStateSchema,
  readPicoCompanionRecoveryState,
  writePicoCompanionRecoveryState,
  type PicoCompanionRecoveryState,
} from './recovery-state.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('ADR 0112 S3 companion recovery continuation state', () => {
  it('round-trips a pending view privately and atomically', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pico-companion-recovery-state-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'nested', 'recovery-state.json');
    const state = pendingState();

    writePicoCompanionRecoveryState(path, state);
    expect(readPicoCompanionRecoveryState(path)).toEqual(state);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(path, '..')).mode & 0o777).toBe(0o700);

    writePicoCompanionRecoveryState(path, completedState());
    expect(readPicoCompanionRecoveryState(path)).toEqual(completedState());
    expect(readdirSync(join(path, '..'))).toEqual(['recovery-state.json']);

    clearPicoCompanionRecoveryState(path);
    expect(readPicoCompanionRecoveryState(path)).toBeNull();
    clearPicoCompanionRecoveryState(path);
  });

  it('rejects extensions, malformed timing and non-exact receipt outcomes', () => {
    expect(() => parsePicoCompanionRecoveryState({
      ...pendingState(),
      recoveryPhrase: 'never allowed here',
    })).toThrow('invalid_companion_recovery_state_shape');
    expect(() => parsePicoCompanionRecoveryState({
      ...pendingState(),
      pending: {
        ...pendingState().pending,
        effectiveAt: '2026-08-01T10:00:00.000Z',
      },
    })).toThrow('invalid_companion_recovery_timing');
    expect(() => parsePicoCompanionRecoveryState({
      ...completedState(),
      receipt: {
        ...completedState().receipt,
        otherDevicesRevoked: false,
      },
    })).toThrow('invalid_companion_recovery_receipt_outcome');
  });
});

function pendingState(): Extract<PicoCompanionRecoveryState, { status: 'pending' }> {
  return {
    schema: picoCompanionRecoveryStateSchema,
    status: 'pending',
    pending: {
      recoveryId: 'recovery_product_1',
      claimDigestHex: '11'.repeat(32),
      targetDelegationId: 'delegation_product_1',
      targetDeviceSigningKeyFingerprintHex: '22'.repeat(32),
      targetDeviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      acceptedAt: '2026-08-01T10:00:00.000Z',
      effectiveAt: '2026-08-03T10:00:00.000Z',
      completionExpiresAt: '2026-08-10T10:00:00.000Z',
    },
  };
}

function completedState(): Extract<PicoCompanionRecoveryState, { status: 'completed' }> {
  return {
    schema: picoCompanionRecoveryStateSchema,
    status: 'completed',
    receipt: {
      recoveryId: 'recovery_product_1',
      targetDelegationId: 'delegation_product_1',
      targetDeviceSigningKeyFingerprintHex: '22'.repeat(32),
      targetDeviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      completedAt: '2026-08-03T10:00:01.000Z',
      leavesExactlyOneActiveDevice: true,
      otherDevicesRevoked: true,
    },
  };
}
