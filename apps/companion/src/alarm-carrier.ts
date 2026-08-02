import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';

/**
 * ADR 0113 C1: the ADR 0112 S2 alarm carrier as shell-free service core.
 *
 * The contract it implements: check the authenticated lifecycle read on
 * start and at least every six hours while running, re-check immediately on
 * wake/network-regain (the shell calls {@link PicoCompanionAlarmCarrier.checkNow}),
 * and while a pending recovery exists raise the loud alarm on every check -
 * the alarm stays armed, a dismissed notification re-raises. Read failures
 * never stop the carrier; they are counted and visible.
 */

export interface PicoCompanionLifecycleSnapshot {
  /**
   * The identity the read was performed as. ADR 0112 requires the alarm to
   * state *which* identity is being recovered, and carrying it on the
   * snapshot keeps that answer tied to the read it came from instead of to a
   * separate setting that could drift.
   */
  picoIdentityFingerprintHex: string;
  pendingRecovery: PicoHomeDeviceRecoveryPendingView | null;
}

export interface PicoCompanionPendingRecoveryAlarm {
  picoIdentityFingerprintHex: string;
  pending: PicoHomeDeviceRecoveryPendingView;
}

export type PicoCompanionLifecycleReader =
  () => Promise<PicoCompanionLifecycleSnapshot>;

export interface PicoCompanionNotificationAdapter {
  notifyPendingRecovery(
    alarm: PicoCompanionPendingRecoveryAlarm,
  ): void | Promise<void>;
  /**
   * Optional shell presentation hook. It is deliberately narrower than a
   * generic state channel: a successful lifecycle read may disarm only the
   * pending-recovery presentation it previously raised.
   */
  clearPendingRecovery?(): void | Promise<void>;
}

export interface StartPicoCompanionAlarmCarrierInput {
  readLifecycle: PicoCompanionLifecycleReader;
  notifications: PicoCompanionNotificationAdapter;
  /** Defaults to the pinned six hours; anything longer violates ADR 0112. */
  checkIntervalMs?: number;
  now?: () => Date;
}

export interface PicoCompanionAlarmCheck {
  status: 'pending_recovery' | 'clear' | 'read_failed' | 'notify_failed';
  pendingRecovery: PicoHomeDeviceRecoveryPendingView | null;
  checkedAt: string;
}

export interface PicoCompanionAlarmCarrierStatus {
  alarmActive: boolean;
  lastCheck: PicoCompanionAlarmCheck | null;
  checks: number;
  readFailures: number;
  consecutiveReadFailures: number;
  notifyFailures: number;
}

export interface PicoCompanionAlarmCarrier {
  /** The wake/network-regain hook; joins an in-flight check instead of stacking. */
  checkNow(): Promise<PicoCompanionAlarmCheck>;
  status(): PicoCompanionAlarmCarrierStatus;
  stop(): void;
}

export const picoCompanionAlarmCheckIntervalMs = 6 * 60 * 60 * 1_000;

export async function startPicoCompanionAlarmCarrier(
  input: StartPicoCompanionAlarmCarrierInput,
): Promise<PicoCompanionAlarmCarrier> {
  const intervalMs = input.checkIntervalMs ?? picoCompanionAlarmCheckIntervalMs;
  if (
    !Number.isSafeInteger(intervalMs)
    || intervalMs <= 0
    || intervalMs > picoCompanionAlarmCheckIntervalMs
  ) {
    throw new Error('invalid_alarm_check_interval');
  }
  const now = input.now ?? (() => new Date());

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<PicoCompanionAlarmCheck> | null = null;
  const status: PicoCompanionAlarmCarrierStatus = {
    alarmActive: false,
    lastCheck: null,
    checks: 0,
    readFailures: 0,
    consecutiveReadFailures: 0,
    notifyFailures: 0,
  };

  const performCheck = async (): Promise<PicoCompanionAlarmCheck> => {
    const checkedAt = now().toISOString();
    let snapshot: PicoCompanionLifecycleSnapshot;
    try {
      snapshot = await input.readLifecycle();
    } catch {
      status.readFailures += 1;
      status.consecutiveReadFailures += 1;
      const check: PicoCompanionAlarmCheck = {
        status: 'read_failed',
        pendingRecovery: null,
        checkedAt,
      };
      status.lastCheck = check;
      return check;
    }
    status.consecutiveReadFailures = 0;

    const pending = snapshot.pendingRecovery;
    if (pending === null) {
      status.alarmActive = false;
      try {
        await input.notifications.clearPendingRecovery?.();
      } catch {
        // Clearing presentation state is notification work too. A failed
        // shell adapter is visible and retried on the next successful read;
        // it must not turn a clear signed lifecycle view into an active alarm.
        status.notifyFailures += 1;
      }
      const check: PicoCompanionAlarmCheck = {
        status: 'clear',
        pendingRecovery: null,
        checkedAt,
      };
      status.lastCheck = check;
      return check;
    }

    status.alarmActive = true;
    let notified = true;
    try {
      await input.notifications.notifyPendingRecovery({
        picoIdentityFingerprintHex: snapshot.picoIdentityFingerprintHex,
        pending,
      });
    } catch {
      // A broken notifier must not stop the carrier; the failure stays
      // visible and the next check tries again.
      status.notifyFailures += 1;
      notified = false;
    }
    const check: PicoCompanionAlarmCheck = {
      status: notified ? 'pending_recovery' : 'notify_failed',
      pendingRecovery: pending,
      checkedAt,
    };
    status.lastCheck = check;
    return check;
  };

  const runCheck = async (): Promise<PicoCompanionAlarmCheck> => {
    if (inFlight !== null) {
      return await inFlight;
    }
    inFlight = performCheck().finally(() => {
      inFlight = null;
    });
    status.checks += 1;
    return await inFlight;
  };

  const schedule = (): void => {
    if (stopped) {
      return;
    }
    timer = setTimeout(() => {
      void runCheck().finally(schedule);
    }, intervalMs);
    // The companion must never keep a process alive on its own account.
    timer.unref();
  };

  await runCheck();
  schedule();

  return {
    checkNow: async () => await runCheck(),
    status: () => ({ ...status, lastCheck: status.lastCheck }),
    stop: () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
