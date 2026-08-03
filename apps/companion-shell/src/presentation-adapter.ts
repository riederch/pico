import {
  type PicoCompanionNotificationAdapter,
  type PicoCompanionPendingRecoveryAlarm,
} from '@pico/companion/alarm-carrier';
import {
  type PicoCompanionHostContinuityAlarm,
  type PicoCompanionHostContinuityNotifications,
  type PicoCompanionHostRotationNotice,
} from '@pico/companion/host-repin';
import {
  renderPicoCompanionHostContinuityAlarm,
  renderPicoCompanionHostRotationNotice,
  renderPicoCompanionPendingRecoveryAlarm,
} from '@pico/companion/notify';
import {
  type PicoCompanionRecoveryNotifications,
} from '@pico/companion/recovery-controller';
import {
  parsePicoCompanionPresentation,
  picoCompanionIdlePresentation,
  type PicoCompanionPresentation,
} from './contract.js';

export interface PicoCompanionPresentationPort {
  present(state: PicoCompanionPresentation): void | Promise<void>;
  notify(state: PicoCompanionPresentation): void | Promise<void>;
}

export type PicoCompanionShellNotifications = PicoCompanionNotificationAdapter
  & PicoCompanionHostContinuityNotifications
  & PicoCompanionRecoveryNotifications;

export function createPicoCompanionPresentationAdapter(
  port: PicoCompanionPresentationPort,
  now: () => Date = () => new Date(),
): PicoCompanionShellNotifications {
  let currentKind: PicoCompanionPresentation['kind'] = 'starting';

  const publish = async (
    state: PicoCompanionPresentation,
    notify: boolean,
  ): Promise<void> => {
    const parsed = parsePicoCompanionPresentation(state);
    currentKind = parsed.kind;
    await port.present(parsed);
    if (notify) {
      await port.notify(parsed);
    }
  };

  return {
    notifyPendingRecovery: async (alarm: PicoCompanionPendingRecoveryAlarm) => {
      const rendered = renderPicoCompanionPendingRecoveryAlarm(alarm);
      await publish({
        kind: 'pending_recovery',
        severity: 'blocked',
        symbol: '×',
        decision: 'veto_recovery',
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
    clearPendingRecovery: async () => {
      if (currentKind === 'pending_recovery' || currentKind === 'starting') {
        await publish(picoCompanionIdlePresentation(now()), false);
      }
    },
    notifyHostKeysRotated: async (notice: PicoCompanionHostRotationNotice) => {
      const rendered = renderPicoCompanionHostRotationNotice(notice);
      await publish({
        kind: 'host_keys_rotated',
        severity: 'warning',
        symbol: '!',
        decision: 'none',
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
    notifyHostContinuityUnverified: async (
      alarm: PicoCompanionHostContinuityAlarm,
    ) => {
      const rendered = renderPicoCompanionHostContinuityAlarm(alarm);
      await publish({
        kind: 'host_continuity_unverified',
        severity: 'blocked',
        symbol: '×',
        decision: 'none',
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
    presentRecoveryWaiting: async ({ picoIdentityFingerprintHex, pending }) => {
      await publish({
        kind: 'recovery_waiting',
        severity: 'warning',
        symbol: '!',
        decision: 'none',
        title: 'Pico recovery is waiting for the time lock',
        body: `Recovery ${pending.recoveryId} for identity ${shortFingerprint(picoIdentityFingerprintHex)} becomes effective at ${pending.effectiveAt}. Nothing can hurry this wait. Completion will revoke every other device of this identity.`,
        observedAt: now().toISOString(),
      }, false);
    },
    notifyRecoveryCompleted: async ({ picoIdentityFingerprintHex, receipt }) => {
      await publish({
        kind: 'recovery_completed',
        severity: 'active',
        symbol: '●',
        decision: 'none',
        title: 'Pico recovery completed',
        body: `Recovery ${receipt.recoveryId} for identity ${shortFingerprint(picoIdentityFingerprintHex)} completed at ${receipt.completedAt}. Exactly one active device remains: ${shortFingerprint(receipt.targetDeviceSigningKeyFingerprintHex)}. Every other device was revoked and surviving hardware must re-enroll.`,
        observedAt: now().toISOString(),
      }, true);
    },
    notifyRecoveryCompletionBlocked: async ({ pending, reason }) => {
      const explanation = reason === 'vault_locked'
        ? 'Unlock this device\'s Pico Vault; Pico will retry automatically on the next check.'
        : reason === 'completion_window_lapsed'
          ? 'The completion window has lapsed. Recovery must be started again from the Recovery Card.'
          : 'Completion failed safely. The pending recovery remains unchanged and Pico will retry on the next check.';
      await publish({
        kind: 'recovery_completion_blocked',
        severity: 'blocked',
        symbol: '×',
        decision: 'none',
        title: 'Pico recovery needs attention',
        body: `Recovery ${pending.recoveryId} could not complete. ${explanation}`,
        observedAt: now().toISOString(),
      }, true);
    },
  };
}

function shortFingerprint(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}
