import { describe, expect, it } from 'vitest';
import { picoDisplayInstant } from '@pico/protocol/when-display';
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

  it('names an unreachable Home instead of showing a quiet one', async () => {
    // ADR 0131 A7. The Home not answering and the Home having nothing to say
    // produced identical surfaces until 2026-08-19.
    const { notifications, presented } = adapter();

    await notifications.reportHomeReachable?.(false);

    expect(presented.at(-1)?.conditions.map((condition) => condition.kind))
      .toEqual(['home_unreachable']);

    await notifications.reportHomeReachable?.(true);
    expect(presented.at(-1)?.conditions).toEqual([]);
  });

  it('does not say the Home is unreachable twice over one broken link', async () => {
    /**
     * A refusal must not be an inventory (ADR 0077 C4). With no network, the
     * Home being unreachable is the same fact told a second time - and two
     * rows for one cause teach the person to read neither.
     */
    const { notifications, presented } = adapter();

    await notifications.reportNetworkState?.(false);
    await notifications.reportHomeReachable?.(false);

    expect(presented.at(-1)?.conditions.map((condition) => condition.kind))
      .toEqual(['no_network']);
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

    await notifications.reportDueEntries({ entries: [due('2026-08-06T09:00:00.000Z')], total: 1 });

    const state = presented.at(-1);
    expect(state?.kind).toBe('time_bound_entry_due');
    expect(state?.severity).toBe('warning');
    expect(state?.body).toContain(picoDisplayInstant('2026-08-06T09:00:00.000Z'));
    // Not the raw instant: what a person is shown is their own day and
    // minute, and a fixture pinned to the ISO string would pass only where
    // the two happen to look alike.
    expect(state?.body).not.toContain('2026-08-06T09:00:00.000Z');
    expect(state?.body).toContain('not given the words');
  });

  it('names the oldest instant when several are waiting', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportDueEntries({
      entries: [
        due('2026-08-06T12:00:00.000Z', 'later'),
        due('2026-08-06T07:00:00.000Z', 'oldest'),
      ],
      total: 2,
    });

    expect(presented.at(-1)?.title).toBe('2 entries are due');
    expect(presented.at(-1)?.body).toContain(picoDisplayInstant('2026-08-06T07:00:00.000Z'));
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

    await notifications.reportDueEntries({ entries: [], total: 0 });
    expect(presented).toHaveLength(before);
    expect(presented.at(-1)?.kind).toBe('pending_recovery');
  });

  it('goes back to idle once its own entries are gone', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportDueEntries({ entries: [due('2026-08-06T09:00:00.000Z')], total: 1 });
    await notifications.reportDueEntries({ entries: [], total: 0 });

    expect(presented.at(-1)?.kind).toBe('idle');
  });
});

describe('ADR 0118 O1 the title only where custody allowed it', () => {
  it('names the entry when the Home was allowed to send the words', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportDueEntries({
      entries: [{
        memoryItemId: 'mem_1',
        kind: 'reminder',
        dueAt: '2026-08-06T09:00:00.000Z',
        title: 'Call the dentist',
      }],
      total: 1,
    });

    expect(presented.at(-1)?.title).toBe('Call the dentist');
    expect(presented.at(-1)?.body).toContain(picoDisplayInstant('2026-08-06T09:00:00.000Z'));
  });

  it('does not invent a placeholder when the words were withheld', async () => {
    // A stand-in that read like a title would misrepresent what this device
    // was actually told.
    const { notifications, presented } = adapter();

    await notifications.reportDueEntries({
      entries: [{ memoryItemId: 'mem_1', kind: 'reminder', dueAt: '2026-08-06T09:00:00.000Z' }],
      total: 1,
    });

    expect(presented.at(-1)?.title).toBe('Something you asked for is due');
    expect(presented.at(-1)?.body).toContain('not given the words');
  });
});

describe('ADR 0118 O4 - no_model finally has a source', () => {
  it('raises the absence when the decided provider did not answer', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportModelReachability(false);

    expect(presented.at(-1)?.conditions.map((condition) => condition.kind))
      .toEqual(['no_model']);
    // The remedy names what still works: no absence renders a working thing
    // as broken.
    expect(presented.at(-1)?.conditions[0]?.remedy).toContain('Capture, entry, recall and decide');
  });

  it('states nothing when reachability is not knowable', async () => {
    // An unset field states nothing, which is not the same as stating that all
    // is well - and a Home that never asked its provider anything must not
    // stand under a condition because of it.
    const { notifications, presented } = adapter();

    await notifications.reportModelReachability(undefined);

    expect(presented).toHaveLength(0);
  });

  it('composes with the other absences instead of replacing them', async () => {
    // Each reporter knows one fact. A report that replaced the list would let
    // one absence erase another while the person watched.
    const { notifications, presented } = adapter();

    await notifications.reportNetworkState(false);
    await notifications.reportModelReachability(false);

    expect(presented.at(-1)?.conditions.map((condition) => condition.kind))
      .toEqual(['no_network', 'no_model']);
  });

  it('clears the absence when the provider answers again', async () => {
    const { notifications, presented } = adapter();

    await notifications.reportModelReachability(false);
    await notifications.reportModelReachability(true);

    expect(presented.at(-1)?.conditions).toEqual([]);
  });
});
