import { describe, expect, it, vi } from 'vitest';
import { startPicoCompanionAlarmCarrier } from './alarm-carrier.js';

const clearSnapshot = {
  picoIdentityFingerprintHex: 'aa'.repeat(32),
  pendingRecovery: null,
};

async function carrier(overrides: Record<string, unknown> = {}) {
  return await startPicoCompanionAlarmCarrier({
    readLifecycle: async () => clearSnapshot,
    notifications: { notifyPendingRecovery: () => {} },
    checkIntervalMs: 60_000,
    ...overrides,
  } as never);
}

describe('ADR 0119 Q5 storage rides the ADR 0112 cadence', () => {
  it('reports the condition on the same check, not on a second schedule', async () => {
    const reportStorageCondition = vi.fn();
    const started = await carrier({
      readStorageCondition: async () => ({ state: 'reserved', causes: ['low_disk'] }),
      notifications: { notifyPendingRecovery: () => {}, reportStorageCondition },
    });

    try {
      await started.checkNow();
      expect(reportStorageCondition).toHaveBeenCalledWith({
        state: 'reserved',
        causes: ['low_disk'],
      });
    } finally {
      started.stop();
    }
  });

  it('never clears a standing condition because the read broke', async () => {
    // A failed read is not evidence the problem went away. Saying nothing
    // leaves whatever the person was last told standing; reporting would
    // clear it on nothing more than a broken channel.
    const reportStorageCondition = vi.fn();
    const started = await carrier({
      readStorageCondition: async () => {
        throw new Error('link_unreachable');
      },
      notifications: { notifyPendingRecovery: () => {}, reportStorageCondition },
    });

    try {
      const check = await started.checkNow();
      expect(reportStorageCondition).not.toHaveBeenCalled();
      // ADR 0112: the carrier checks on start, so this is the second run.
      // Anchoring on the run count keeps the assertion about the behaviour
      // rather than about a number that would drift with the schedule.
      expect(started.status().checks).toBe(2);
      expect(started.status().storageReadFailures).toBe(started.status().checks);
      // And the alarm itself is untouched: storage is secondary to it.
      expect(check.status).toBe('clear');
      expect(started.status().readFailures).toBe(0);
    } finally {
      started.stop();
    }
  });

  it('lets the alarm run on a Home that does not answer the operation', async () => {
    const started = await carrier();
    try {
      expect((await started.checkNow()).status).toBe('clear');
      expect(started.status().storageReadFailures).toBe(0);
    } finally {
      started.stop();
    }
  });

  it('does not let a failing storage report suppress the alarm', async () => {
    const notifyPendingRecovery = vi.fn();
    const started = await carrier({
      readLifecycle: async () => ({
        picoIdentityFingerprintHex: 'aa'.repeat(32),
        pendingRecovery: {
          recoveryId: 'recovery-1',
          effectiveAt: new Date().toISOString(),
        },
      }),
      readStorageCondition: async () => ({ state: 'normal', causes: [] }),
      notifications: {
        notifyPendingRecovery,
        reportStorageCondition: () => {
          throw new Error('shell_gone');
        },
      },
    });

    try {
      await started.checkNow();
      // The alarm is the reason this carrier exists: it fires on every check,
      // including the one at start, however badly the storage report goes.
      expect(started.status().checks).toBe(2);
      expect(notifyPendingRecovery).toHaveBeenCalledTimes(started.status().checks);
      expect(started.status().notifyFailures).toBe(started.status().checks);
    } finally {
      started.stop();
    }
  });
});

describe('ADR 0118 O1 due entries ride the same cadence', () => {
  it('reports them on the check, and never fails the alarm', async () => {
    const reportDueEntries = vi.fn();
    const started = await carrier({
      readDueEntries: async () => ({ entries: [] }),
      notifications: { notifyPendingRecovery: () => {}, reportDueEntries },
    });

    try {
      await started.checkNow();
      expect(reportDueEntries).toHaveBeenCalledWith({ entries: [] });
      expect(started.status().dueEntriesReadFailures).toBe(0);
    } finally {
      started.stop();
    }
  });

  it('says nothing when the read broke', async () => {
    // An empty list from a failed read would tell the person nothing is
    // waiting when nobody looked.
    const reportDueEntries = vi.fn();
    const started = await carrier({
      readDueEntries: async () => {
        throw new Error('link_unreachable');
      },
      notifications: { notifyPendingRecovery: () => {}, reportDueEntries },
    });

    try {
      const check = await started.checkNow();
      expect(reportDueEntries).not.toHaveBeenCalled();
      expect(started.status().dueEntriesReadFailures).toBe(started.status().checks);
      // The alarm is untouched: due entries are secondary to it.
      expect(check.status).toBe('clear');
      expect(started.status().readFailures).toBe(0);
    } finally {
      started.stop();
    }
  });
});
