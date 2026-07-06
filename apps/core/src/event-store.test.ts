import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import type { PicoEvent } from '@pico/protocol';
import { EventStore } from './event-store.js';

const tempDirs: string[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-event-store-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('EventStore', () => {
  it('treats an identical event id and envelope as an idempotent duplicate', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent();

    expect(store.append(event)).toBe('inserted');
    expect(store.append(event)).toBe('duplicate_same_payload');
    expect(store.list()).toEqual([event]);

    store.close();
  });

  it('treats semantically equal payload objects with different key order as idempotent duplicates', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent({
      payload: {
        role: 'user',
        text: 'Hallo Pico',
        metadata: {
          source: 'test',
          priority: 'normal',
        },
      },
    });

    expect(store.append(event)).toBe('inserted');
    expect(store.append({
      ...event,
      payload: {
        metadata: {
          priority: 'normal',
          source: 'test',
        },
        text: 'Hallo Pico',
        role: 'user',
      },
    })).toBe('duplicate_same_payload');

    store.close();
  });

  it('treats the same event id with a changed envelope as a duplicate conflict', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent();

    expect(store.append(event)).toBe('inserted');
    expect(store.append({
      ...event,
      lamport: 2,
    })).toBe('duplicate_conflict');
    expect(store.list()).toEqual([event]);

    store.close();
  });

  it('lists events in stable Lamport order and applies the requested limit', () => {
    const store = new EventStore(createDatabasePath());

    store.append(createEvent({
      eventId: 'event-3',
      lamport: 2,
      wallTime: '2026-07-04T12:02:00.000Z',
    }));
    store.append(createEvent({
      eventId: 'event-1',
      lamport: 1,
      wallTime: '2026-07-04T12:00:00.000Z',
    }));
    store.append(createEvent({
      eventId: 'event-2',
      lamport: 2,
      wallTime: '2026-07-04T12:01:00.000Z',
    }));

    expect(store.list().map((event) => event.eventId)).toEqual(['event-1', 'event-2', 'event-3']);
    expect(store.list(2).map((event) => event.eventId)).toEqual(['event-1', 'event-2']);

    store.close();
  });

  it('returns stable cursor pages using Lamport, wall time and event id ordering', () => {
    const store = new EventStore(createDatabasePath());

    for (const event of [
      createEvent({ eventId: 'event-1', lamport: 1, wallTime: '2026-07-04T12:00:00.000Z' }),
      createEvent({ eventId: 'event-2', lamport: 2, wallTime: '2026-07-04T12:00:00.000Z' }),
      createEvent({ eventId: 'event-3', lamport: 2, wallTime: '2026-07-04T12:00:00.000Z' }),
      createEvent({ eventId: 'event-4', lamport: 2, wallTime: '2026-07-04T12:01:00.000Z' }),
    ]) {
      store.append(event);
    }

    const firstPage = store.listPage({ limit: 2 });
    expect(firstPage.events.map((event) => event.eventId)).toEqual(['event-1', 'event-2']);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toEqual({ lamport: 2, wallTime: '2026-07-04T12:00:00.000Z', eventId: 'event-2' });

    const secondPage = store.listPage({ limit: 2, after: firstPage.nextCursor });
    expect(secondPage.events.map((event) => event.eventId)).toEqual(['event-3', 'event-4']);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toEqual({ lamport: 2, wallTime: '2026-07-04T12:01:00.000Z', eventId: 'event-4' });

    const emptyPage = store.listPage({ limit: 2, after: secondPage.nextCursor });
    expect(emptyPage).toEqual({ events: [], nextCursor: null, hasMore: false });

    store.close();
  });

  it('rejects invalid list limits at the store boundary', () => {
    const store = new EventStore(createDatabasePath());

    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => store.list(limit)).toThrow('EventStore list limit must be a positive safe integer.');
      expect(() => store.listPage({ limit })).toThrow('EventStore list limit must be a positive safe integer.');
    }

    store.close();
  });

  it('rejects invalid stored event envelopes', () => {
    const invalidEvents: Array<[Partial<PicoEvent>, string]> = [
      [{ eventId: '   ' }, 'Event eventId must be a non-empty string.'],
      [{ deviceId: '   ' }, 'Event deviceId must be a non-empty string.'],
      [{ sessionId: '   ' }, 'Event sessionId must be a non-empty string.'],
      [{ lamport: -1 }, 'Event lamport must be a non-negative safe integer.'],
      [{ lamport: Number.MAX_SAFE_INTEGER + 1 }, 'Event lamport must be a non-negative safe integer.'],
      [{ wallTime: '   ' }, 'Event wallTime must be a non-empty string.'],
      [{ stream: '   ' }, 'Event stream must be a non-empty string.'],
      [{ signature: '   ' }, 'Event signature must be a non-empty string.'],
    ];

    for (const [overrides, error] of invalidEvents) {
      const store = new EventStore(createDatabasePath());

      expect(() => store.append(createEvent(overrides))).toThrow(error);

      store.close();
    }
  });

  it('reads the initial internal Pico Home claim state', () => {
    const store = new EventStore(createDatabasePath());

    expect(store.picoHomeClaimState()).toEqual({
      state: 'unclaimed',
      hostAdminPicoId: null,
      claimedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    store.close();
  });

  it('reads a claimed internal Pico Home claim state without providing a write API', () => {
    const databasePath = createDatabasePath();
    const store = new EventStore(databasePath);
    store.close();

    const claimedAt = '2026-07-05T12:00:00.000Z';
    const db = new Database(databasePath);
    db
      .prepare(`
        UPDATE pico_home_claim_state
        SET state = ?,
            host_admin_pico_id = ?,
            claimed_at = ?,
            updated_at = ?
        WHERE id = 1
      `)
      .run('claimed', 'pico:home-host', claimedAt, claimedAt);
    db.close();

    const reopenedStore = new EventStore(databasePath);

    expect(reopenedStore.picoHomeClaimState()).toEqual({
      state: 'claimed',
      hostAdminPicoId: 'pico:home-host',
      claimedAt,
      createdAt: expect.any(String),
      updatedAt: claimedAt,
    });

    reopenedStore.close();
  });

  it('closes the SQLite connection idempotently', () => {
    const store = new EventStore(createDatabasePath());

    expect(store.maxLamport()).toBe(0);
    expect(store.picoHomeClaimState().state).toBe('unclaimed');

    store.close();
    expect(() => store.close()).not.toThrow();
    expect(() => store.maxLamport()).toThrow('EventStore is closed.');
    expect(() => store.picoHomeClaimState()).toThrow('EventStore is closed.');
  });
});

function createEvent(overrides: Partial<PicoEvent> = {}): PicoEvent {
  return {
    eventId: 'event-1',
    deviceId: 'device-1',
    sessionId: 'session-1',
    lamport: 1,
    wallTime: '2026-07-04T12:00:00.000Z',
    type: 'message.created',
    stream: 'session:session-1',
    payload: {
      role: 'user',
      text: 'Hallo Pico',
    },
    ...overrides,
  };
}
