import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { timeBoundEntriesFromEvents } from './render.js';
import type { PicoEvent } from './types.js';

function event(overrides: Record<string, unknown> = {}): PicoEvent {
  return {
    eventId: 'e1',
    deviceId: 'desktop-dev',
    lamport: 1,
    wallTime: '2026-08-01T00:00:00.000Z',
    type: 'memory.time_bound_entry_recorded',
    stream: 'default',
    payload: {
      memoryItemId: 'mem_1',
      privacyDomain: 'domain-private',
      contentType: 'application/vnd.pico.reminder',
      dueAt: '2026-08-10T09:00:00.000Z',
    },
    ...overrides,
  } as unknown as PicoEvent;
}

describe('ADR 0118 O1 appointment list', () => {
  it('takes only entries that carry an instant', () => {
    const rows = timeBoundEntriesFromEvents([
      event(),
      event({ eventId: 'e2', type: 'memory.recorded' }),
      event({ eventId: 'e3', type: 'message.created', payload: { role: 'user', text: 'hi' } }),
    ], '2026-08-06T00:00:00.000Z');

    expect(rows.map((row) => row.memoryItemId)).toEqual(['mem_1']);
  });

  it('sorts by instant so the next thing to deal with is first', () => {
    const rows = timeBoundEntriesFromEvents([
      event({ eventId: 'a', payload: { memoryItemId: 'later', privacyDomain: 'd', contentType: 'application/vnd.pico.reminder', dueAt: '2026-09-01T00:00:00.000Z' } }),
      event({ eventId: 'b', payload: { memoryItemId: 'sooner', privacyDomain: 'd', contentType: 'application/vnd.pico.reminder', dueAt: '2026-08-08T00:00:00.000Z' } }),
    ], '2026-08-06T00:00:00.000Z');

    expect(rows.map((row) => row.memoryItemId)).toEqual(['sooner', 'later']);
  });

  it('computes overdue against the clock rather than storing it', () => {
    // Whether something is late changes without anything being written.
    const [row] = timeBoundEntriesFromEvents([event()], '2026-08-06T00:00:00.000Z');
    expect(row?.overdue).toBe(false);

    const [later] = timeBoundEntriesFromEvents([event()], '2026-08-11T00:00:00.000Z');
    expect(later?.overdue).toBe(true);
  });

  it('tells an appointment from a reminder', () => {
    const [row] = timeBoundEntriesFromEvents([event({
      payload: {
        memoryItemId: 'mem_1',
        privacyDomain: 'd',
        contentType: 'application/vnd.pico.appointment',
        dueAt: '2026-08-10T09:00:00.000Z',
      },
    })], '2026-08-06T00:00:00.000Z');

    expect(row?.kind).toBe('appointment');
  });

  it('skips an entry whose payload it cannot read', () => {
    // A malformed row is dropped rather than rendered as a blank line the
    // person would have to interpret.
    const rows = timeBoundEntriesFromEvents([
      event({ payload: { memoryItemId: 'mem_1', privacyDomain: 'd', contentType: 'x' } }),
      event({ eventId: 'e2', payload: { privacyDomain: 'd', dueAt: '2026-08-10T09:00:00.000Z' } }),
    ], '2026-08-06T00:00:00.000Z');

    expect(rows).toEqual([]);
  });
});

describe('ADR 0118 O1 the appointment surface exists in the shell', () => {
  it('offers a form and a list, with the fields the core requires', () => {
    const html = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

    expect(html).toContain('id="entry-form"');
    expect(html).toContain('id="entry-title"');
    expect(html).toContain('id="entry-kind"');
    expect(html).toContain('id="entry-domain"');
    expect(html).toContain('id="entries-body"');
    // Three states need their own column.
    expect(html).toContain('<th>State</th>');

    // A picker rather than a free-text instant: the core refuses anything but
    // a canonical one, and a person should not have to spell ISO-8601.
    expect(html).toContain('id="entry-due"');
    expect(html).toContain('type="datetime-local"');

    // Both kinds are offerable, because the protocol names both.
    expect(html).toContain('value="reminder"');
    expect(html).toContain('value="appointment"');
  });
});

describe('ADR 0118 O1 the raised state', () => {
  const raised = (raisedAt: string) => event({
    payload: {
      memoryItemId: 'mem_1',
      privacyDomain: 'domain-private',
      contentType: 'application/vnd.pico.reminder',
      dueAt: '2026-08-01T09:00:00.000Z',
      raisedAt,
    },
  });

  it('carries the instant the entry reached the person', () => {
    const [row] = timeBoundEntriesFromEvents(
      [raised('2026-08-01T09:00:04.000Z')],
      '2026-08-06T00:00:00.000Z',
    );

    expect(row?.raisedAt).toBe('2026-08-01T09:00:04.000Z');
  });

  it('never calls a raised entry overdue', () => {
    // It is done. Calling it late would keep nagging about something already
    // delivered, which is how a list stops being worth reading.
    const [row] = timeBoundEntriesFromEvents(
      [raised('2026-08-01T09:00:04.000Z')],
      '2026-08-06T00:00:00.000Z',
    );

    expect(row?.overdue).toBe(false);
  });

  it('still calls an unraised past entry overdue', () => {
    const [row] = timeBoundEntriesFromEvents([event({
      payload: {
        memoryItemId: 'mem_1',
        privacyDomain: 'domain-private',
        contentType: 'application/vnd.pico.reminder',
        dueAt: '2026-08-01T09:00:00.000Z',
      },
    })], '2026-08-06T00:00:00.000Z');

    expect(row?.overdue).toBe(true);
    expect(row?.raisedAt).toBeUndefined();
  });

  it('keeps a raised entry in the list', () => {
    // A person looking for what they asked for should find it whether or not
    // it has already arrived.
    expect(timeBoundEntriesFromEvents(
      [raised('2026-08-01T09:00:04.000Z')],
      '2026-08-06T00:00:00.000Z',
    )).toHaveLength(1);
  });
});
