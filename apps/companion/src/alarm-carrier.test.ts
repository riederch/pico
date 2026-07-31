import type { PicoHomeDeviceRecoveryPendingView } from '@pico/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  picoCompanionAlarmCheckIntervalMs,
  startPicoCompanionAlarmCarrier,
  type PicoCompanionLifecycleSnapshot,
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

interface RecordingAdapter {
  alarms: PicoHomeDeviceRecoveryPendingView[];
  failNext: boolean;
  notifyPendingRecovery(pending: PicoHomeDeviceRecoveryPendingView): void;
}

function recordingAdapter(): RecordingAdapter {
  return {
    alarms: [],
    failNext: false,
    notifyPendingRecovery(pending) {
      if (this.failNext) {
        this.failNext = false;
        throw new Error('adapter_down');
      }
      this.alarms.push(pending);
    },
  };
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
      { pendingRecovery: null },
      { pendingRecovery: pendingView('recovery_0001') },
      { pendingRecovery: pendingView('recovery_0001') },
      { pendingRecovery: null },
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
    expect(adapter.alarms.map((alarm) => alarm.recoveryId))
      .toEqual(['recovery_0001', 'recovery_0001']);
    expect(carrier.status().alarmActive).toBe(true);

    // Pendency resolved (vetoed, lapsed or consumed): the alarm disarms.
    await vi.advanceTimersByTimeAsync(picoCompanionAlarmCheckIntervalMs);
    expect(carrier.status().alarmActive).toBe(false);
    expect(adapter.alarms).toHaveLength(2);

    carrier.stop();
    await vi.advanceTimersByTimeAsync(10 * picoCompanionAlarmCheckIntervalMs);
    expect(reads).toBe(4);
  });

  it('rejects an interval above the pinned six hours or otherwise invalid', async () => {
    const input = {
      readLifecycle: async () => ({ pendingRecovery: null }),
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

  it('survives read and notify failures, counts them and recovers on the next tick', async () => {
    let failReads = 2;
    const adapter = recordingAdapter();
    const carrier = await startPicoCompanionAlarmCarrier({
      readLifecycle: async () => {
        if (failReads > 0) {
          failReads -= 1;
          throw new Error('network_down');
        }
        return { pendingRecovery: pendingView('recovery_0002') };
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
    expect(adapter.alarms.map((alarm) => alarm.recoveryId)).toEqual(['recovery_0002']);
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
    resolveRead!({ pendingRecovery: null });
    const carrier = await carrierPromise;
    expect(reads).toBe(1);

    // Wake hook: an immediate read without waiting for the cadence.
    const first = carrier.checkNow();
    await vi.advanceTimersByTimeAsync(0);
    const second = carrier.checkNow();
    resolveRead!({ pendingRecovery: pendingView('recovery_0003') });
    const [firstCheck, secondCheck] = await Promise.all([first, second]);
    expect(reads).toBe(2);
    expect(firstCheck).toBe(secondCheck);
    expect(adapter.alarms).toHaveLength(1);
    carrier.stop();
  });
});
