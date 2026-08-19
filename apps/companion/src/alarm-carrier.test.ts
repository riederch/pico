import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  picoCompanionAlarmCheckIntervalMs,
  startPicoCompanionAlarmCarrier,
  type PicoCompanionClockDivergenceAlarm,
  type PicoCompanionLifecycleSnapshot,
  type PicoCompanionPendingRecoveryAlarm,
} from './alarm-carrier.js';

function pendingView(recoveryId: string): PicoHomeDeviceRecoveryPendingView {
  return {
    recoveryId,
    claimDigestHex: 'aa'.repeat(32),
    targetDelegationId: 'delegation_recovery_target',
    targetDeviceSigningKeyFingerprintHex: 'bb'.repeat(32),
    targetDeviceKeyAgreementKeyFingerprintHex: 'cc'.repeat(32),
    acceptedAt: '2026-07-31T10:00:00.000Z',
    effectiveAt: '2026-08-02T10:00:00.000Z',
    completionExpiresAt: '2026-08-09T10:00:00.000Z',
  };
}

const identityFingerprintHex = 'ab'.repeat(32);

interface RecordingAdapter {
  alarms: PicoCompanionPendingRecoveryAlarm[];
  clears: number;
  failNext: boolean;
  homeReachable: (boolean | undefined)[];
  notifyPendingRecovery(alarm: PicoCompanionPendingRecoveryAlarm): void;
  clearPendingRecovery(): void;
  reportHomeReachable(reachable: boolean | undefined): void;
}

function recordingAdapter(): RecordingAdapter {
  return {
    alarms: [],
    clears: 0,
    failNext: false,
    homeReachable: [],
    reportHomeReachable(reachable) {
      this.homeReachable.push(reachable);
    },
    notifyPendingRecovery(alarm) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error('adapter_down');
      }
      this.alarms.push(alarm);
    },
    clearPendingRecovery() {
      this.clears += 1;
    },
  };
}

function snapshot(
  pendingRecovery: PicoHomeDeviceRecoveryPendingView | null,
): PicoCompanionLifecycleSnapshot {
  return { picoIdentityFingerprintHex: identityFingerprintHex, pendingRecovery };
}

describe('Companion alarm carrier (ADR 0113 C1 over the ADR 0112 contract)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks on start, keeps the six-hour cadence and re-raises while pendency lasts', async () => {
    const responses: PicoCompanionLifecycleSnapshot[] = [
      snapshot(null),
      snapshot(pendingView('recovery_0001')),
      snapshot(pendingView('recovery_0001')),
      snapshot(null),
    ];
    let reads = 0;
    const adapter = recordingAdapter();
    const carrier = await startPicoCompanionAlarmCarrier({
      readLifecycle: async () => {
        const response = responses[Math.min(reads, responses.length - 1)];
        reads += 1;
        return response;
      },
      notifications: adapter,
    });

    // Start check already happened and was clear.
    expect(reads).toBe(1);
    expect(carrier.status().alarmActive).toBe(false);

    // Two cadence ticks with the same pendency: the alarm re-raises each time.
    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);
    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);
    expect(reads).toBe(3);
    expect(adapter.alarms.map((alarm) => alarm.pending.recoveryId))
      .toEqual(['recovery_0001', 'recovery_0001']);
    // ADR 0112: the alarm must say which identity is being recovered.
    expect(adapter.alarms.every(
      (alarm) => alarm.picoIdentityFingerprintHex === identityFingerprintHex,
    )).toBe(true);
    expect(carrier.status().alarmActive).toBe(true);

    // Pendency resolved (vetoed, lapsed or consumed): the alarm disarms.
    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);
    expect(carrier.status().alarmActive).toBe(false);
    expect(adapter.alarms).toHaveLength(2);
    expect(adapter.clears).toBe(2);

    carrier.stop();
    await vi.advanceTimersByTimeAsync(10 * picoCompanionAlarmCheckIntervalMs);
    expect(reads).toBe(4);
  });

  it('rejects an interval above the pinned six hours or otherwise invalid', async () => {
    const input = {
      readLifecycle: async () => snapshot(null),
      notifications: recordingAdapter(),
    };
    await expect(startPicoCompanionAlarmCarrier({
      ...input,
      checkIntervalMs: picoCompanionAlarmCheckIntervalMs + 1,
    })).rejects.toThrow('invalid_alarm_check_interval');
    await expect(startPicoCompanionAlarmCarrier({ ...input, checkIntervalMs: 0 }))
      .rejects.toThrow('invalid_alarm_check_interval');
    await expect(startPicoCompanionAlarmCarrier({ ...input, checkIntervalMs: 0.5 }))
      .rejects.toThrow('invalid_alarm_check_interval');
  });

  it('says the Home could not be reached, rather than letting it look quiet', async () => {
    /**
     * ADR 0131 A7, and ADR 0118 O4's rule applied to the read that carries
     * the ADR 0112 alarm. A failed lifecycle read was counted in the
     * carrier's status and read by nobody: the tray, the window and the
     * condition list all looked exactly as they do when the Home answered
     * and had nothing to report. On a desktop in the house that is rare; on
     * a phone it is what leaving the house looks like.
     *
     * `undefined` is not tested as an input here because the carrier always
     * knows: it either completed a read or it did not.
     */
    let failReads = 1;
    const adapter = recordingAdapter();
    const carrier = await startPicoCompanionAlarmCarrier({
      readLifecycle: async () => {
        if (failReads > 0) {
          failReads -= 1;
          throw new Error('network_down');
        }
        return snapshot(null);
      },
      notifications: adapter,
    });

    expect(carrier.status().lastCheck?.status).toBe('read_failed');
    expect(adapter.homeReachable).toEqual([false]);

    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);

    // And the recovery is stated too: a condition that never clears is a
    // condition the person learns to ignore.
    expect(adapter.homeReachable).toEqual([false, true]);
  });

  it('survives read and notify failures, counts them and recovers on the next tick', async () => {
    let failReads = 2;
    const adapter = recordingAdapter();
    const carrier = await startPicoCompanionAlarmCarrier({
      readLifecycle: async () => {
        if (failReads > 0) {
          failReads -= 1;
          throw new Error('network_down');
        }
        return snapshot(pendingView('recovery_0002'));
      },
      notifications: adapter,
    });

    expect(carrier.status().lastCheck?.status).toBe('read_failed');
    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);
    expect(carrier.status().consecutiveReadFailures).toBe(2);

    // Reads recover, but the notifier fails once: still counted, never fatal.
    adapter.failNext = true;
    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);
    expect(carrier.status()).toMatchObject({
      alarmActive: true,
      readFailures: 2,
      consecutiveReadFailures: 0,
      notifyFailures: 1,
    });
    expect(carrier.status().lastCheck?.status).toBe('notify_failed');

    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);
    expect(adapter.alarms.map((alarm) => alarm.pending.recoveryId)).toEqual(['recovery_0002']);
    expect(carrier.status().lastCheck?.status).toBe('pending_recovery');
    carrier.stop();
  });

  it('checkNow reads immediately and joins an in-flight check instead of stacking', async () => {
    let resolveRead: ((snapshot: PicoCompanionLifecycleSnapshot) => void) | null = null;
    let reads = 0;
    const adapter = recordingAdapter();
    const carrierPromise = startPicoCompanionAlarmCarrier({
      readLifecycle: async () => {
        reads += 1;
        return await new Promise<PicoCompanionLifecycleSnapshot>((resolvePromise) => {
          resolveRead = resolvePromise;
        });
      },
      notifications: adapter,
    });
    // Let the start check begin, then complete it.
    await vi.advanceTimersByTimeAsync(0);
    resolveRead!(snapshot(null));
    const carrier = await carrierPromise;
    expect(reads).toBe(1);

    // Wake hook: an immediate read without waiting for the cadence.
    const first = carrier.checkNow();
    await vi.advanceTimersByTimeAsync(0);
    const second = carrier.checkNow();
    resolveRead!(snapshot(pendingView('recovery_0003')));
    const [firstCheck, secondCheck] = await Promise.all([first, second]);
    expect(reads).toBe(2);
    expect(firstCheck).toBe(secondCheck);
    expect(adapter.alarms).toHaveLength(1);
    carrier.stop();
  });

  it('raises detected clock movement only where it touches an objection window (ADR 0120 N5)', async () => {
    const divergences: PicoCompanionClockDivergenceAlarm[] = [];
    const adapter = {
      ...recordingAdapter(),
      notifyClockDivergence(alarm: PicoCompanionClockDivergenceAlarm) {
        divergences.push(alarm);
      },
    };
    const divergence = {
      kind: 'wall_ahead_of_monotonic' as const,
      differenceMs: 48 * 60 * 60 * 1_000,
    };
    let snapshotToReturn: PicoCompanionLifecycleSnapshot = {
      ...snapshot(null),
      clockDivergence: divergence,
    };
    const carrier = await startPicoCompanionAlarmCarrier({
      readLifecycle: async () => snapshotToReturn,
      notifications: adapter,
    });

    // A clock that moved while nothing was waiting on it is a log line, not
    // an interruption.
    expect(divergences).toHaveLength(0);

    snapshotToReturn = {
      ...snapshot(pendingView('recovery_clock')),
      clockDivergence: divergence,
    };
    await carrier.checkNow();
    expect(divergences).toEqual([{
      picoIdentityFingerprintHex: identityFingerprintHex,
      divergence,
      pending: pendingView('recovery_clock'),
    }]);

    // A pending window with an honest clock says nothing extra.
    snapshotToReturn = snapshot(pendingView('recovery_clock'));
    await carrier.checkNow();
    expect(divergences).toHaveLength(1);
    carrier.stop();
  });
});
