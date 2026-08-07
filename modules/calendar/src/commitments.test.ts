import {
  maxPicoModuleCommitmentsShown,
  picoModuleCommitmentFields,
  toPicoModuleDeactivationStatement,
} from '@pico/protocol/module';
import type { PicoTimeBoundEntry } from '@pico/protocol/time-bound-entry';
import { describe, expect, it } from 'vitest';
import { picoCalendarStandingCommitments } from './commitments.js';

function entry(
  memoryItemId: string,
  dueAt: string,
  raisedAt?: string,
): PicoTimeBoundEntry {
  return {
    memoryItemId,
    kind: 'appointment',
    title: 'Call the dentist about the thing',
    dueAt,
    ...(raisedAt === undefined ? {} : { raisedAt }),
  };
}

describe('ADR 0127 M4 what the calendar has promised and not yet done', () => {
  it('counts an entry that still waits', () => {
    const commitments = picoCalendarStandingCommitments([
      entry('mem_a', '2026-09-01T09:00:00.000Z'),
    ]);
    expect(commitments).toEqual([{
      module: 'calendar',
      kind: 'calendar.time_bound_entry',
      dueAt: '2026-09-01T09:00:00.000Z',
      reference: 'mem_a',
    }]);
  });

  it('counts an overdue entry too', () => {
    // Not stale - the promise already broken by the longest, and the one a
    // person would most want to hear about.
    expect(picoCalendarStandingCommitments([entry('mem_a', '2020-01-01T00:00:00.000Z')]))
      .toHaveLength(1);
  });

  it('does not count one that was raised', () => {
    // It happened. Listing it would tell someone they are losing something
    // they already have.
    expect(picoCalendarStandingCommitments([
      entry('mem_a', '2026-09-01T09:00:00.000Z', '2026-09-01T09:00:01.000Z'),
    ])).toEqual([]);
  });

  it('never carries the words, only that something is outstanding', () => {
    // ADR 0075 A7: whoever may switch this module off is not thereby entitled
    // to read what it holds. Asserted on the shape rather than trusted to a
    // reviewer noticing a title being added later.
    const commitments = picoCalendarStandingCommitments([
      entry('mem_a', '2026-09-01T09:00:00.000Z'),
    ]);
    expect(Object.keys(commitments[0] ?? {}).sort())
      .toEqual([...picoModuleCommitmentFields]);
    expect(JSON.stringify(commitments)).not.toContain('dentist');
  });
});

describe('ADR 0127 M4 the statement a surface is handed', () => {
  it('puts the oldest promise first', () => {
    const statement = toPicoModuleDeactivationStatement({
      module: 'calendar',
      commitments: picoCalendarStandingCommitments([
        entry('later', '2026-09-02T09:00:00.000Z'),
        entry('oldest', '2026-08-30T09:00:00.000Z'),
        entry('middle', '2026-09-01T09:00:00.000Z'),
      ]),
    });
    expect(statement.shown.map((item) => item.reference))
      .toEqual(['oldest', 'middle', 'later']);
  });

  it('reports the full count even when it shows only a few', () => {
    // A truncated list that reports its own truncated length is worse than no
    // list at all: "and 9,987 more" is information, a quiet cut is a lie.
    const many = Array.from({ length: maxPicoModuleCommitmentsShown + 12 }, (_value, index) =>
      entry(`mem_${index}`, new Date(Date.parse('2026-09-01T09:00:00.000Z') + index * 60_000).toISOString()));
    const statement = toPicoModuleDeactivationStatement({
      module: 'calendar',
      commitments: picoCalendarStandingCommitments(many),
    });
    expect(statement.total).toBe(maxPicoModuleCommitmentsShown + 12);
    expect(statement.shown).toHaveLength(maxPicoModuleCommitmentsShown);
    expect(statement.shown[0]?.reference).toBe('mem_0');
  });

  it('says nothing when nothing is outstanding', () => {
    const statement = toPicoModuleDeactivationStatement({ module: 'calendar', commitments: [] });
    expect(statement.total).toBe(0);
    expect(statement.shown).toEqual([]);
  });
});
