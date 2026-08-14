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
      readDueEntries: async () => ({ entries: [], total: 0 }),
      notifications: { notifyPendingRecovery: () => {}, reportDueEntries },
    });

    try {
      await started.checkNow();
      expect(reportDueEntries).toHaveBeenCalledWith({ entries: [], total: 0 });
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

/**
 * ADR 0118 O1's other half. An entry nobody acknowledges keeps being offered,
 * and until now nothing ever acknowledged one: the Home cannot see a
 * notification appear, so the device has to say it showed one.
 */
describe('ADR 0118 O1 - the device says it told the person', () => {
  const due = {
    entries: [
      { memoryItemId: 'item_older', dueAt: '2026-08-14T09:00:00.000Z', kind: 'reminder' },
      { memoryItemId: 'item_newer', dueAt: '2026-08-14T11:00:00.000Z', kind: 'reminder' },
    ],
    total: 2,
  };

  it('acknowledges exactly what the surface says it showed', async () => {
    // Not the list. Fifty entries arrive and one is named; acknowledging the
    // rest would retire entries whose identity nobody ever saw.
    const acknowledgeDueEntry = vi.fn(async (_memoryItemId: string) => {});
    const started = await carrier({
      readDueEntries: async () => due,
      acknowledgeDueEntry,
      notifications: {
        notifyPendingRecovery: () => {},
        reportDueEntries: async () => ({ told: ['item_older'] }),
      },
    });

    try {
      await started.checkNow();
      // Once per check, and never the entry that was only counted: this stub
      // keeps answering the same list, which is what a Home does until the
      // acknowledgement lands.
      expect(new Set(acknowledgeDueEntry.mock.calls.map(([id]) => id)))
        .toEqual(new Set(['item_older']));
      expect(acknowledgeDueEntry).toHaveBeenCalledTimes(started.status().checks);
      expect(started.status().dueEntryAcknowledgeFailures).toBe(0);
    } finally {
      started.stop();
    }
  });

  it('acknowledges nothing when the surface could not take the presentation', async () => {
    // The trap this family already fell into once: an earlier scheduler marked
    // an entry raised and then called a surface, so a surface that refused left
    // the entry marked and nobody told.
    const acknowledgeDueEntry = vi.fn(async (_memoryItemId: string) => {});
    const started = await carrier({
      readDueEntries: async () => due,
      acknowledgeDueEntry,
      notifications: {
        notifyPendingRecovery: () => {},
        reportDueEntries: async () => {
          throw new Error('screen_unavailable');
        },
      },
    });

    try {
      await started.checkNow();
      expect(acknowledgeDueEntry).not.toHaveBeenCalled();
      expect(started.status().notifyFailures).toBeGreaterThan(0);
    } finally {
      started.stop();
    }
  });

  it('counts a refused acknowledgement and leaves the alarm alone', async () => {
    // The entry stays outstanding and comes back on the next check, which is a
    // retry that costs nothing and cannot lose it if this device never runs
    // again.
    const started = await carrier({
      readDueEntries: async () => due,
      acknowledgeDueEntry: async () => {
        throw new Error('due_entry_acknowledge_rejected:unknown_operation');
      },
      notifications: {
        notifyPendingRecovery: () => {},
        reportDueEntries: async () => ({ told: ['item_older'] }),
      },
    });

    try {
      const check = await started.checkNow();
      expect(started.status().dueEntryAcknowledgeFailures)
        .toBe(started.status().checks);
      expect(check.status).toBe('clear');
    } finally {
      started.stop();
    }
  });

  it('works against a Home that does not answer the operation', async () => {
    // Optional like the reads: a companion that cannot acknowledge still shows
    // what is due, and pays for it in repetition.
    const started = await carrier({
      readDueEntries: async () => due,
      notifications: {
        notifyPendingRecovery: () => {},
        reportDueEntries: async () => ({ told: ['item_older'] }),
      },
    });

    try {
      await started.checkNow();
      expect(started.status().dueEntryAcknowledgeFailures).toBe(0);
    } finally {
      started.stop();
    }
  });
});

/**
 * ADR 0118 O4's second half. `no_model` had a name, a remedy sentence and no
 * source: the absence vocabulary was written before a model existed and nobody
 * came back once one did.
 */
describe('ADR 0118 O4 - whether the decided model answers', () => {
  it('reports it on the same check, not on a schedule of its own', async () => {
    const reportModelReachability = vi.fn();
    const started = await carrier({
      readModelReachability: async () => false,
      notifications: { notifyPendingRecovery: () => {}, reportModelReachability },
    });

    try {
      await started.checkNow();
      expect(reportModelReachability).toHaveBeenCalledWith(false);
      expect(started.status().modelReadFailures).toBe(0);
    } finally {
      started.stop();
    }
  });

  it('carries not-knowable as itself rather than as good health', async () => {
    // A Home that has never asked its provider anything is not a Home whose
    // provider is fine, and only one of those may clear a standing condition.
    const reportModelReachability = vi.fn();
    const started = await carrier({
      readModelReachability: async () => undefined,
      notifications: { notifyPendingRecovery: () => {}, reportModelReachability },
    });

    try {
      await started.checkNow();
      expect(reportModelReachability).toHaveBeenCalledWith(undefined);
    } finally {
      started.stop();
    }
  });

  it('says nothing when the read broke, and never fails the alarm', async () => {
    const reportModelReachability = vi.fn();
    const started = await carrier({
      readModelReachability: async () => {
        throw new Error('link_unreachable');
      },
      notifications: { notifyPendingRecovery: () => {}, reportModelReachability },
    });

    try {
      const check = await started.checkNow();
      expect(reportModelReachability).not.toHaveBeenCalled();
      expect(started.status().modelReadFailures).toBe(started.status().checks);
      expect(check.status).toBe('clear');
      expect(started.status().readFailures).toBe(0);
    } finally {
      started.stop();
    }
  });
});
