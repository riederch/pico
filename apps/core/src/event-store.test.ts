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
