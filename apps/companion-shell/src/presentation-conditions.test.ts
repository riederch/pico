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
