import { describe, expect, it } from 'vitest';
import {
  assertKnownPicoProtectiveEventTypes,
  defaultPicoStorageReserveBytes,
  defaultPicoStoreCeilingRows,
  evaluatePicoStorageCondition,
  evaluatePicoStoragePressure,
  isPicoProtectiveEventType,
  mayAppendUnderPicoStoragePressure,
  picoDurableStores,
  picoProtectiveEventTypes,
  picoStoragePressureStates,
} from './index.js';

describe('ADR 0119 Q1 reserve floor', () => {
  it('keeps the three states and refuses room it cannot measure', () => {
    expect(picoStoragePressureStates)
      .toEqual(['normal', 'reserved', 'exhausted']);

    const reserveBytes = 1_000;
    expect(evaluatePicoStoragePressure({ availableBytes: 5_000, reserveBytes }))
      .toBe('normal');
    // Refused while there is still room, which is the whole idea: the
    // protective paths need space to commit and checkpoint.
    expect(evaluatePicoStoragePressure({ availableBytes: 999, reserveBytes }))
      .toBe('reserved');
    expect(evaluatePicoStoragePressure({ availableBytes: 0, reserveBytes }))
      .toBe('exhausted');

    // An unreadable reading is not evidence of room. Reading it as `normal`
    // would leave the one case we cannot measure the one case we do not
    // protect.
    for (const unreadable of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(evaluatePicoStoragePressure({
        availableBytes: unreadable,
        reserveBytes,
      })).toBe('exhausted');
    }

    expect(defaultPicoStorageReserveBytes).toBe(64 * 1_024 * 1_024);
    expect(() => evaluatePicoStoragePressure({
      availableBytes: 1,
      reserveBytes: Number.NaN,
    })).toThrow('invalid_pico_storage_reserve');
  });
});

describe('ADR 0119 Q2 protective paths', () => {
  it('names only real event types', () => {
    expect(() => assertKnownPicoProtectiveEventTypes()).not.toThrow();
    expect(picoProtectiveEventTypes).toContain('memory.tombstone');
    expect(picoProtectiveEventTypes).toContain('home.device_recovery_vetoed');
    // Carries both grants and revocations, so it cannot be classified by
    // type - and the safe reading of an ambiguous type is "creating".
    expect(isPicoProtectiveEventType('home.membership_changed')).toBe(false);
    expect(isPicoProtectiveEventType('memory.recorded')).toBe(false);
  });

  it('refuses creating writes in reserved and lets protective ones through', () => {
    for (const eventType of ['memory.recorded', 'message.created', 'home.claimed']) {
      expect(mayAppendUnderPicoStoragePressure({ state: 'normal', eventType }))
        .toBe(true);
      expect(mayAppendUnderPicoStoragePressure({ state: 'reserved', eventType }))
        .toBe(false);
    }
    for (const eventType of picoProtectiveEventTypes) {
      expect(mayAppendUnderPicoStoragePressure({ state: 'reserved', eventType }))
        .toBe(true);
    }
  });

  it('stops everything that writes once the reserve itself is gone', () => {
    // `exhausted` is what the reserve exists to prevent. Letting a protective
    // write through here would produce a torn write, not a rescue.
    for (const eventType of [...picoProtectiveEventTypes, 'memory.recorded']) {
      expect(mayAppendUnderPicoStoragePressure({ state: 'exhausted', eventType }))
        .toBe(false);
    }
  });
});

describe('ADR 0119 Q5 storage condition', () => {
  it('lists every reason that applies, not only the most severe', () => {
    // A person who frees disk space while a store is also at its ceiling would
    // otherwise fix one condition and meet the next one with no warning.
    const condition = evaluatePicoStorageCondition({
      // Nothing left at all, which is what `exhausted` means; a byte still
      // free is `reserved`.
      availableBytes: 0,
      reserveBytes: 1_024,
      ceilings: [
        { store: 'event_log', rows: 10, ceilingRows: 10 },
        { store: 'memory_item', rows: 1, ceilingRows: 1_000 },
      ],
    });

    // Disk exhaustion wins the state, but the ceiling is still reported.
    expect(condition.state).toBe('exhausted');
    expect(condition.reasons.map((reason) => reason.cause))
      .toEqual(['low_disk', 'store_ceiling']);
  });
  it('never escalates a ceiling to exhausted', () => {
    // A ceiling means the person has stored a lot, not that the filesystem has
    // run out - so the protective paths still have room to commit, which is
    // exactly what `reserved` means and `exhausted` does not.
    const condition = evaluatePicoStorageCondition({
      availableBytes: 1_000_000_000,
      reserveBytes: 1_024,
      ceilings: [{ store: 'audit_record', rows: 99, ceilingRows: 10 }],
    });

    expect(condition.state).toBe('reserved');
  });
  it('carries a default for every declared store', () => {
    for (const store of picoDurableStores) {
      expect(defaultPicoStoreCeilingRows[store]).toBeGreaterThan(0);
    }
  });
});
