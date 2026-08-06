import { readFileSync } from 'node:fs';
import { parsePicoHomeDueEntriesView } from '@pico/protocol/time-bound-entry';
import { parsePicoModuleManifest } from '@pico/protocol/module';
import { describe, expect, it } from 'vitest';
import {
  picoCalendarAgenda,
  picoCalendarDueEntriesView,
  picoCalendarEntryState,
  type PicoCalendarEntryCandidate,
  type PicoCalendarPorts,
} from './calendar.js';
import { picoCalendarModuleManifest } from './manifest.js';

const now = new Date('2026-08-06T09:00:00.000Z');

function candidate(
  overrides: Partial<PicoCalendarEntryCandidate> & { memoryItemId: string; dueAt: string },
): PicoCalendarEntryCandidate {
  return {
    kind: 'appointment',
    title: 'placeholder',
    privacyDomain: 'domain-private',
    ...overrides,
  };
}

function ports(overrides: Partial<PicoCalendarPorts> = {}): PicoCalendarPorts {
  return {
    timeBoundEntries: () => [],
    readTitle: () => undefined,
    now: () => now,
    ...overrides,
  };
}

describe('ADR 0127 M1 the calendar module declares itself', () => {
  it('ships a manifest the protocol accepts', () => {
    const parsed = parsePicoModuleManifest(picoCalendarModuleManifest);
    expect(parsed.identifier).toBe('calendar');
    expect(parsed.kind).toBe('product');
    expect(parsed.packageName).toBe('@pico/module-calendar');
    expect(parsed.dependencies).toEqual([]);
  });

  it('publishes every subpath it names and no barrel', () => {
    // The manifest is a claim about this package. If it drifts from
    // package.json the declaration has stopped meaning anything, and M2's
    // check would be enforcing a boundary nobody actually exports.
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports).sort())
      .toEqual([...picoCalendarModuleManifest.publishedSubpaths].sort());
    expect(Object.keys(manifest.exports)).not.toContain('.');
  });
});

describe('ADR 0127 M1 the calendar composes, it does not decide', () => {
  it('asks the core per entry and keeps the entry when the answer is no', () => {
    const asked: string[] = [];
    const view = picoCalendarDueEntriesView(ports({
      timeBoundEntries: () => [
        candidate({ memoryItemId: 'mem_a', dueAt: '2026-08-06T08:00:00.000Z', privacyDomain: 'domain-a' }),
        candidate({ memoryItemId: 'mem_b', dueAt: '2026-08-06T08:30:00.000Z', privacyDomain: 'domain-b' }),
      ],
      readTitle: (input) => {
        asked.push(input.privacyDomain);
        return input.privacyDomain === 'domain-a' ? 'Dentist' : undefined;
      },
    }));

    // Per entry, not per request: ADR 0077 keeps membership and readership
    // apart, so one caller can hold a grant on one domain and none on another.
    expect(asked).toEqual(['domain-a', 'domain-b']);
    expect(view.entries).toHaveLength(2);
    expect(view.entries[0]).toEqual({
      memoryItemId: 'mem_a',
      kind: 'appointment',
      dueAt: '2026-08-06T08:00:00.000Z',
      title: 'Dentist',
    });
    // Never dropped for an unreadable title: that something is due is the fact
    // this family delivers.
    expect(view.entries[1]).toEqual({
      memoryItemId: 'mem_b',
      kind: 'appointment',
      dueAt: '2026-08-06T08:30:00.000Z',
    });
    expect(view.entries[1]).not.toHaveProperty('title');
  });

  it('produces a view the protocol parser accepts', () => {
    const view = picoCalendarDueEntriesView(ports({
      timeBoundEntries: () => [
        candidate({ memoryItemId: 'mem_a', dueAt: '2026-08-06T08:00:00.000Z' }),
      ],
      readTitle: () => 'Dentist',
    }));
    // The module builds what the Link sends. If it can build something the
    // protocol refuses, the two have drifted.
    expect(parsePicoHomeDueEntriesView(view).entries).toHaveLength(1);
  });

  it('caps a title at the protocol length rather than sending what it was given', () => {
    const view = picoCalendarDueEntriesView(ports({
      timeBoundEntries: () => [
        candidate({ memoryItemId: 'mem_a', dueAt: '2026-08-06T08:00:00.000Z' }),
      ],
      readTitle: () => 'x'.repeat(500),
    }));
    expect(view.entries[0]?.title).toHaveLength(200);
    expect(() => parsePicoHomeDueEntriesView(view)).not.toThrow();
  });

  it('leaves out entries that are not yet due and ones already raised', () => {
    const view = picoCalendarDueEntriesView(ports({
      timeBoundEntries: () => [
        candidate({ memoryItemId: 'mem_future', dueAt: '2026-08-06T10:00:00.000Z' }),
        candidate({
          memoryItemId: 'mem_raised',
          dueAt: '2026-08-06T07:00:00.000Z',
          raisedAt: '2026-08-06T07:00:01.000Z',
        }),
        candidate({ memoryItemId: 'mem_due', dueAt: '2026-08-06T08:00:00.000Z' }),
      ],
      readTitle: () => undefined,
    }));
    expect(view.entries.map((entry) => entry.memoryItemId)).toEqual(['mem_due']);
  });

  it('does not ask about a title for an entry it is not going to send', () => {
    const asked: string[] = [];
    picoCalendarDueEntriesView(ports({
      timeBoundEntries: () => [
        candidate({ memoryItemId: 'mem_future', dueAt: '2026-08-06T23:00:00.000Z' }),
      ],
      readTitle: (input) => {
        asked.push(input.memoryItemId);
        return undefined;
      },
    }));
    // Reading domain content costs a decryption and a readership decision. An
    // entry nobody is being told about should cost neither.
    expect(asked).toEqual([]);
  });
});

describe('ADR 0127 M1 the three states a person sees', () => {
  const entry = (dueAt: string, raisedAt?: string) => ({
    memoryItemId: 'mem_a',
    kind: 'appointment' as const,
    title: 'Dentist',
    dueAt,
    ...(raisedAt === undefined ? {} : { raisedAt }),
  });

  it('calls a future entry waiting and a passed one overdue', () => {
    const nowIso = now.toISOString();
    expect(picoCalendarEntryState({ entry: entry('2026-08-06T10:00:00.000Z'), nowIso }))
      .toBe('waiting');
    expect(picoCalendarEntryState({ entry: entry('2026-08-06T08:00:00.000Z'), nowIso }))
      .toBe('overdue');
  });

  it('calls a long-passed but raised entry raised, not overdue', () => {
    // The promise was kept. Checking lateness first would show every kept
    // promise as a failure, which is the wrong answer in the loudest way.
    expect(picoCalendarEntryState({
      entry: entry('2020-01-01T00:00:00.000Z', '2020-01-01T00:00:01.000Z'),
      nowIso: now.toISOString(),
    })).toBe('raised');
  });

  it('treats the due instant itself as overdue rather than waiting', () => {
    expect(picoCalendarEntryState({
      entry: entry(now.toISOString()),
      nowIso: now.toISOString(),
    })).toBe('overdue');
  });

  it('orders overdue first, then waiting, then raised, oldest first within each', () => {
    const agenda = picoCalendarAgenda({
      nowIso: now.toISOString(),
      entries: [
        { ...entry('2026-08-06T12:00:00.000Z'), memoryItemId: 'later' },
        { ...entry('2026-08-06T07:00:00.000Z', '2026-08-06T07:00:01.000Z'), memoryItemId: 'done' },
        { ...entry('2026-08-06T10:00:00.000Z'), memoryItemId: 'soon' },
        { ...entry('2026-08-06T06:00:00.000Z'), memoryItemId: 'oldest_overdue' },
        { ...entry('2026-08-06T08:00:00.000Z'), memoryItemId: 'newer_overdue' },
      ],
    });
    expect(agenda.map((item) => item.memoryItemId))
      .toEqual(['oldest_overdue', 'newer_overdue', 'soon', 'later', 'done']);
  });

  it('does not mutate what it was given', () => {
    const entries = [
      { ...entry('2026-08-06T12:00:00.000Z'), memoryItemId: 'later' },
      { ...entry('2026-08-06T06:00:00.000Z'), memoryItemId: 'earlier' },
    ];
    picoCalendarAgenda({ entries, nowIso: now.toISOString() });
    expect(entries.map((item) => item.memoryItemId)).toEqual(['later', 'earlier']);
  });
});
