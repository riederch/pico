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
  parsePicoCompanionPresentation,
  picoCompanionIdlePresentation,
  type PicoCompanionPresentation,
} from './contract.js';

export interface PicoCompanionPresentationPort {
  present(state: PicoCompanionPresentation): void | Promise<void>;
  notify(state: PicoCompanionPresentation): void | Promise<void>;
}

export type PicoCompanionShellNotifications = PicoCompanionNotificationAdapter
  & PicoCompanionHostContinuityNotifications;

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
        ...rendered,
        observedAt: now().toISOString(),
      }, true);
    },
  };
}
