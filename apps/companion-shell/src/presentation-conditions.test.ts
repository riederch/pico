import { describe, expect, it } from 'vitest';
import { createPicoCompanionPresentationAdapter } from './presentation-adapter.js';
import type { PicoCompanionPresentation } from './contract.js';

function adapter() {
  const presented: PicoCompanionPresentation[] = [];
  const notifications = createPicoCompanionPresentationAdapter({
    present: (state) => {
      presented.push(state);
    },
    notify: () => {},
  });
  return { notifications, presented };
}

describe('ADR 0118 O4 conditions ride every presentation', () => {
  it('re-publishes what the person is already looking at', async () => {
    // A condition that only appeared at the next unrelated notification would
    // reach the person late - or, on a quiet Home, never.
    const { notifications, presented } = adapter();

    await notifications.reportStorageCondition?.({ state: 'reserved', causes: ['low_disk'] });

    expect(presented).toHaveLength(1);
    expect(presented[0]?.conditions.map((condition) => condition.kind))
      .toEqual(['storage_reserved']);
  });

  it('stamps the standing condition onto later presentations', async () => {
    // Conditions are ambient: true between notifications, not at one. A
    // builder that knows nothing about storage still publishes the truth.
    const { notifications, presented } = adapter();

    await notifications.reportStorageCondition?.({ state: 'exhausted', causes: ['low_disk'] });
    await notifications.notifyPendingRecovery({
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      pending: {
        recoveryId: 'recovery-1',
        effectiveAt: new Date().toISOString(),
        targetDeviceSigningKeyFingerprintHex: 'bb'.repeat(32),
      } as never,
    });

    const last = presented.at(-1);
    expect(last?.kind).toBe('pending_recovery');
    expect(last?.conditions.map((condition) => condition.kind)).toEqual(['storage_exhausted']);
  });

  it('says nothing again when nothing changed', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportStorageCondition?.({ state: 'reserved', causes: ['low_disk'] });
    await notifications.reportStorageCondition?.({ state: 'reserved', causes: ['low_disk'] });

    expect(presented).toHaveLength(1);
  });

  it('clears the condition when a successful read says normal', async () => {
    // Only a read that succeeded may clear it. The carrier is what makes sure
    // a failed read never gets this far.
    const { notifications, presented } = adapter();

    await notifications.reportStorageCondition?.({ state: 'reserved', causes: ['low_disk'] });
    await notifications.reportStorageCondition?.({ state: 'normal', causes: [] });

    expect(presented).toHaveLength(2);
    expect(presented.at(-1)?.conditions).toEqual([]);
  });
});

describe('ADR 0118 O4 absences compose instead of replacing', () => {
  it('keeps a standing network condition when storage reports', async () => {
    // A reporter that replaced the whole list would let one absence erase
    // another, and the person would watch a real problem disappear.
    const { notifications, presented } = adapter();

    await notifications.reportNetworkState(false);
    await notifications.reportStorageCondition?.({ state: 'reserved', causes: ['low_disk'] });

    expect(presented.at(-1)?.conditions.map((condition) => condition.kind))
      .toEqual(['no_network', 'storage_reserved']);
  });

  it('clears one without clearing the other', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportNetworkState(false);
    await notifications.reportStorageCondition?.({ state: 'exhausted', causes: ['low_disk'] });
    await notifications.reportNetworkState(true);

    expect(presented.at(-1)?.conditions.map((condition) => condition.kind))
      .toEqual(['storage_exhausted']);
  });

  it('says nothing about a fact nobody has reported', async () => {
    // Unset is not "all is well": nobody looked yet.
    const { notifications, presented } = adapter();

    await notifications.reportNetworkState(true);
    expect(presented).toHaveLength(0);
  });
});

describe('ADR 0118 O1 due entries reach the person', () => {
  const due = (dueAt: string, memoryItemId = 'mem_1') =>
    ({ memoryItemId, kind: 'reminder' as const, dueAt });

  it('says that something is due and points at the Home for what', async () => {
    // The title is domain content the Link read does not carry, so this
    // surface must not pretend to be the reminder itself.
    const { notifications, presented } = adapter();

    await notifications.reportDueEntries({ entries: [due('2026-08-06T09:00:00.000Z')] });

    const state = presented.at(-1);
    expect(state?.kind).toBe('time_bound_entry_due');
    expect(state?.severity).toBe('warning');
    expect(state?.body).toContain('2026-08-06T09:00:00.000Z');
    expect(state?.body).toContain('not what it says');
  });

  it('names the oldest instant when several are waiting', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportDueEntries({
      entries: [
        due('2026-08-06T12:00:00.000Z', 'later'),
        due('2026-08-06T07:00:00.000Z', 'oldest'),
      ],
    });

    expect(presented.at(-1)?.title).toBe('2 entries are due');
    expect(presented.at(-1)?.body).toContain('2026-08-06T07:00:00.000Z');
  });

  it('clears only its own presentation when nothing is due', async () => {
    // Overwriting an approval because nothing is due would replace something
    // that needs a decision with something that does not.
    const { notifications, presented } = adapter();

    await notifications.notifyPendingRecovery({
      picoIdentityFingerprintHex: 'aa'.repeat(32),
      pending: {
        recoveryId: 'recovery-1',
        effectiveAt: new Date().toISOString(),
        targetDeviceSigningKeyFingerprintHex: 'bb'.repeat(32),
      } as never,
    });
    const before = presented.length;

    await notifications.reportDueEntries({ entries: [] });
    expect(presented).toHaveLength(before);
    expect(presented.at(-1)?.kind).toBe('pending_recovery');
  });

  it('goes back to idle once its own entries are gone', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportDueEntries({ entries: [due('2026-08-06T09:00:00.000Z')] });
    await notifications.reportDueEntries({ entries: [] });

    expect(presented.at(-1)?.kind).toBe('idle');
  });
});
