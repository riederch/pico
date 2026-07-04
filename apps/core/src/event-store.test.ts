import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('rejects invalid list limits at the store boundary', () => {
    const store = new EventStore(createDatabasePath());

    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => store.list(limit)).toThrow('EventStore list limit must be a positive safe integer.');
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

  it('closes the SQLite connection idempotently', () => {
    const store = new EventStore(createDatabasePath());

    expect(store.maxLamport()).toBe(0);

    store.close();
    expect(() => store.close()).not.toThrow();
    expect(() => store.maxLamport()).toThrow('EventStore is closed.');
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
