import { describe, expect, it } from 'vitest';
import {
  duePicoTimeBoundEntries,
  nextPicoTimeBoundEntryDueAt,
  parsePicoTimeBoundEntry,
  picoTimeBoundEntryKinds,
} from './time-bound-entry.js';

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    memoryItemId: 'entry-1',
    kind: 'reminder',
    title: 'Call the dentist',
    dueAt: '2026-08-10T09:00:00.000Z',
    ...overrides,
  };
}

describe('ADR 0118 O1 time-bound entry shape', () => {
  it('names both kinds', () => {
    expect([...picoTimeBoundEntryKinds]).toEqual(['appointment', 'reminder']);
  });

  it('requires a canonical instant, not merely a parseable one', () => {
    // Two spellings of the same instant compare unequal and sort apart, and
    // this value decides when something reaches the person.
    expect(() => parsePicoTimeBoundEntry(entry({ dueAt: '2026-08-10T09:00:00Z' })))
      .toThrow(/invalid_pico_time_bound_entry_due/u);
    expect(() => parsePicoTimeBoundEntry(entry({ dueAt: 'tomorrow' })))
      .toThrow(/invalid_pico_time_bound_entry_due/u);
  });

  it('refuses an empty title, an unknown kind and a stray field', () => {
    expect(() => parsePicoTimeBoundEntry(entry({ title: '   ' })))
      .toThrow(/invalid_pico_time_bound_entry_title/u);
    expect(() => parsePicoTimeBoundEntry(entry({ kind: 'alarm' })))
      .toThrow(/invalid_pico_time_bound_entry_kind/u);
    expect(() => parsePicoTimeBoundEntry(entry({ extra: 1 })))
      .toThrow(/invalid_pico_time_bound_entry/u);
  });
});

describe('ADR 0118 O1 which entries are due', () => {
  const waiting = parsePicoTimeBoundEntry(entry({ dueAt: '2099-01-01T00:00:00.000Z' }));
  const overdue = parsePicoTimeBoundEntry(
    entry({ memoryItemId: 'entry-old', dueAt: '2019-01-01T00:00:00.000Z' }),
  );
  const raised = parsePicoTimeBoundEntry(entry({
    memoryItemId: 'entry-done',
    dueAt: '2019-01-01T00:00:00.000Z',
    raisedAt: '2019-01-01T00:00:01.000Z',
  }));

  it('includes an instant that passed while the Home was off', () => {
    // Raising it late is a bad outcome; raising it never is a broken promise.
    const due = duePicoTimeBoundEntries({
      entries: [waiting, overdue, raised],
      nowIso: '2026-08-06T00:00:00.000Z',
    });

    expect(due.map((item) => item.memoryItemId)).toEqual(['entry-old']);
  });

  it('orders by instant, oldest first', () => {
    const older = parsePicoTimeBoundEntry(
      entry({ memoryItemId: 'older', dueAt: '2018-01-01T00:00:00.000Z' }),
    );
    const due = duePicoTimeBoundEntries({
      entries: [overdue, older],
      nowIso: '2026-08-06T00:00:00.000Z',
    });

    expect(due.map((item) => item.memoryItemId)).toEqual(['older', 'entry-old']);
  });

  it('reports the next instant without clamping it to now', () => {
    // The caller decides how to treat overdue work; clamping would hide how
    // late it already is.
    expect(nextPicoTimeBoundEntryDueAt([waiting, overdue]))
      .toBe('2019-01-01T00:00:00.000Z');
    expect(nextPicoTimeBoundEntryDueAt([raised])).toBeNull();
    expect(nextPicoTimeBoundEntryDueAt([])).toBeNull();
  });

  it('refuses a now it cannot compare exactly', () => {
    expect(() => duePicoTimeBoundEntries({ entries: [], nowIso: 'now' }))
      .toThrow(/invalid_pico_time_bound_entry_now/u);
  });
});
