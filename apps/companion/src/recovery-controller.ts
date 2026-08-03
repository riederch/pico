import type {
  PicoHomeDeviceRecoveryPendingView,
  PicoHomeDeviceRecoveryRecord,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import {
  completePicoHomeDeviceRecovery,
  vetoPicoHomeDeviceRecovery,
  type PicoVaultDaemonClient,
} from '@pico/vault-daemon';
import {
  createPicoLinkDirectClient,
  type PicoLinkDirectClient,
} from '@pico/vault-daemon/link-direct-client';
import type { PicoCompanionProfile } from './profile.js';
import {
  picoCompanionRecoveryStateSchema,
  readPicoCompanionRecoveryState,
  writePicoCompanionRecoveryState,
  type PicoCompanionRecoveryReceiptSummary,
} from './recovery-state.js';

export interface PicoCompanionRecoveryNotifications {
  presentRecoveryWaiting(input: {
    picoIdentityFingerprintHex: string;
    pending: PicoHomeDeviceRecoveryPendingView;
  }): void | Promise<void>;
  notifyRecoveryCompleted(input: {
    picoIdentityFingerprintHex: string;
    receipt: PicoCompanionRecoveryReceiptSummary;
  }): void | Promise<void>;
  notifyRecoveryCompletionBlocked(input: {
    picoIdentityFingerprintHex: string;
    pending: PicoHomeDeviceRecoveryPendingView;
    reason: 'vault_locked' | 'completion_failed' | 'completion_window_lapsed';
  }): void | Promise<void>;
}

export type PicoCompanionRecoveryCheck =
  | { status: 'none' | 'already_completed' }
  | { status: 'waiting'; pending: PicoHomeDeviceRecoveryPendingView }
  | { status: 'completed'; receipt: PicoCompanionRecoveryReceiptSummary }
  | {
    status: 'blocked';
    pending: PicoHomeDeviceRecoveryPendingView;
    reason: 'vault_locked' | 'completion_failed' | 'completion_window_lapsed';
  };

/**
 * ADR 0112 S3 pull-completion. It is called from the same serialized cadence
 * as the lifecycle read: before effectiveAt it only renders the honest wait;
 * afterwards the exact target automatically attempts completion. Failure
 * never discards the durable pending state, so the next check can retry.
 */
export async function checkPicoCompanionRecoveryCompletion(input: {
  statePath: string;
  profile: PicoCompanionProfile;
  targetLinkClient: PicoLinkDirectClient;
  notifications: PicoCompanionRecoveryNotifications;
  now?: () => Date;
}): Promise<PicoCompanionRecoveryCheck> {
  const state = readPicoCompanionRecoveryState(input.statePath);
  if (state === null) {
    return { status: 'none' };
  }
  if (state.status === 'completed') {
    return { status: 'already_completed' };
  }
  const pending = state.pending;
  assertTargetBinding(input.profile, pending);
  const now = (input.now ?? (() => new Date()))();
  if (!Number.isFinite(now.getTime())) {
    throw new Error('invalid_companion_recovery_check_time');
  }
  const nowMs = now.getTime();
  if (nowMs < Date.parse(pending.effectiveAt)) {
    await input.notifications.presentRecoveryWaiting({
      picoIdentityFingerprintHex: input.profile.identity.keyFingerprintHex,
      pending,
    });
    return { status: 'waiting', pending };
  }
  if (nowMs >= Date.parse(pending.completionExpiresAt)) {
    await input.notifications.notifyRecoveryCompletionBlocked({
      picoIdentityFingerprintHex: input.profile.identity.keyFingerprintHex,
      pending,
      reason: 'completion_window_lapsed',
    });
    return { status: 'blocked', pending, reason: 'completion_window_lapsed' };
  }

  let record: PicoHomeDeviceRecoveryRecord;
  try {
    const completed = await completePicoHomeDeviceRecovery({
      targetLinkClient: input.targetLinkClient,
      pending,
    });
    record = completed.record;
  } catch (error) {
    const reason = recoveryCompletionFailureReason(error);
    await input.notifications.notifyRecoveryCompletionBlocked({
      picoIdentityFingerprintHex: input.profile.identity.keyFingerprintHex,
      pending,
      reason,
    });
    return { status: 'blocked', pending, reason };
  }

  const receipt = receiptSummary(record, pending);
  writePicoCompanionRecoveryState(input.statePath, {
    schema: picoCompanionRecoveryStateSchema,
    status: 'completed',
    receipt,
  });
  await input.notifications.notifyRecoveryCompleted({
    picoIdentityFingerprintHex: input.profile.identity.keyFingerprintHex,
    receipt,
  });
  return { status: 'completed', receipt };
}

/** A living device's one-decision alarm action; Home/admin never enters it. */
export async function vetoPicoCompanionPendingRecovery(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
  pending: PicoHomeDeviceRecoveryPendingView;
}): Promise<{ status: 'vetoed' }> {
  return await vetoPicoHomeDeviceRecovery({
    livingDeviceLinkClient: input.livingDeviceLinkClient,
    recoveryId: input.pending.recoveryId,
  });
}

export async function createPicoCompanionLinkClient(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  sodium: VaultSodium;
  fetch?: typeof fetch;
}): Promise<PicoLinkDirectClient> {
  return await createPicoLinkDirectClient({
    sodium: input.sodium,
    daemonClient: input.daemonClient,
    coreUrl: input.profile.coreUrl,
    host: {
      signingPublicKeyHex: input.profile.host.signingPublicKeyHex,
      signingKeyFingerprintHex: input.profile.host.signingKeyFingerprintHex,
      keyAgreementPublicKeyHex: input.profile.host.keyAgreementPublicKeyHex,
      keyAgreementKeyFingerprintHex:
        input.profile.host.keyAgreementKeyFingerprintHex,
    },
    sender: {
      identityKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
      identityPublicKeyHex: input.profile.identity.publicKeyHex,
      deviceSigningKeyFingerprintHex:
        input.profile.device.signingKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex:
        input.profile.device.keyAgreementKeyFingerprintHex,
      delegationId: input.profile.device.delegationId,
    },
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });
}

function assertTargetBinding(
  profile: PicoCompanionProfile,
  pending: PicoHomeDeviceRecoveryPendingView,
): void {
  if (
    profile.device.delegationId !== pending.targetDelegationId
    || profile.device.signingKeyFingerprintHex
      !== pending.targetDeviceSigningKeyFingerprintHex
    || profile.device.keyAgreementKeyFingerprintHex
      !== pending.targetDeviceKeyAgreementKeyFingerprintHex
  ) {
    throw new Error('companion_recovery_state_target_mismatch');
  }
}

function receiptSummary(
  record: PicoHomeDeviceRecoveryRecord,
  pending: PicoHomeDeviceRecoveryPendingView,
): PicoCompanionRecoveryReceiptSummary {
  const receipt = record.receipt;
  if (
    receipt.recoveryId !== pending.recoveryId
    || receipt.targetDelegationId !== pending.targetDelegationId
    || receipt.targetDeviceSigningKeyFingerprintHex
      !== pending.targetDeviceSigningKeyFingerprintHex
    || receipt.targetDeviceKeyAgreementKeyFingerprintHex
      !== pending.targetDeviceKeyAgreementKeyFingerprintHex
    || receipt.leavesExactlyOneActiveDevice !== true
  ) {
    throw new Error('companion_recovery_receipt_binding_mismatch');
  }
  return {
    recoveryId: receipt.recoveryId,
    targetDelegationId: receipt.targetDelegationId,
    targetDeviceSigningKeyFingerprintHex:
      receipt.targetDeviceSigningKeyFingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      receipt.targetDeviceKeyAgreementKeyFingerprintHex,
    completedAt: receipt.completedAt,
    leavesExactlyOneActiveDevice: true,
    otherDevicesRevoked: true,
  };
}

function recoveryCompletionFailureReason(
  error: unknown,
): 'vault_locked' | 'completion_failed' {
  if (
    error instanceof Error
    && (
      error.message === 'vault_locked'
      || error.message === 'unknown_unlocked_key'
      || error.message === 'link_device_signing_key_not_unlocked'
      || error.message === 'link_device_agreement_key_not_unlocked'
    )
  ) {
    return 'vault_locked';
  }
  return 'completion_failed';
}
