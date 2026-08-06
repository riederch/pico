import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { startPicoTimeBoundScheduler } from './time-bound-scheduler.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function openStore(): Promise<EventStore> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-time-bound-'));
  tempDirs.push(dir);
  return await EventStore.open(join(dir, 'pico.sqlite'));
}

function recordEntry(store: EventStore, id: string, dueAt: string): void {
  store.memory().create({
    memoryItemId: id,
    privacyDomain: 'domain-private',
    owner: 'person',
    controller: 'person',
    contentType: 'application/vnd.pico.reminder',
    content: 'Call the dentist',
  } as never);
  expect(store.setPicoTimeBoundEntryDue({ memoryItemId: id, dueAt })).toBe(true);
}

describe('ADR 0118 O1 recording a time-bound entry through the API', () => {
  it('names the event for what it is and schedules the instant', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-time-bound-api-'));
    tempDirs.push(dir);
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: join(dir, 'pico.sqlite'),
      deviceId: 'pico-core',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'memory.recorded',
          payload: {
            privacyDomain: 'domain-private',
            contentType: 'application/vnd.pico.reminder',
            content: 'Call the dentist',
            dueAt: '2026-08-10T09:00:00.000Z',
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const event = response.json().event as {
        type: string;
        payload: { memoryItemId: string; dueAt?: string };
      };
      // A commitment with an instant is a different thing from a note, and a
      // reader should not have to inspect the payload to find that out.
      expect(event.type).toBe('memory.time_bound_entry_recorded');
      expect(event.payload.dueAt).toBe('2026-08-10T09:00:00.000Z');

      // And it is schedulable, not merely recorded.
      const listed = await app.inject({ method: 'GET', url: '/api/events?limit=10' });
      expect((listed.json().events as Array<{ type: string; payload: { resolutionState?: string } }>)
        .find((stored) => stored.type === 'memory.time_bound_entry_recorded')
        ?.payload.resolutionState).toBe('resolvable');
    } finally {
      await app.close();
    }
  });

  it('projects the raised instant onto the event once it is raised', async () => {
    // Whether an entry reached the person changes after the event was written,
    // so the event cannot carry it - a surface reading only events would show
    // every reminder as forever pending.
    const dir = mkdtempSync(join(tmpdir(), 'pico-time-bound-raised-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath,
      deviceId: 'pico-core',
    });

    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'memory.recorded',
          payload: {
            privacyDomain: 'domain-private',
            contentType: 'application/vnd.pico.reminder',
            content: 'Call the dentist',
            dueAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
      });
      expect(created.statusCode).toBe(201);
      const memoryItemId = (created.json().event.payload as { memoryItemId: string }).memoryItemId;

      const before = await app.inject({ method: 'GET', url: '/api/events?limit=10' });
      const beforeRow = (before.json().events as Array<{ type: string; payload: Record<string, unknown> }>)
        .find((stored) => stored.type === 'memory.time_bound_entry_recorded');
      expect(beforeRow?.payload.raisedAt).toBeUndefined();

      // Raise it the way the scheduler would.
      const store = await EventStore.open(databasePath);
      try {
        expect(store.markPicoTimeBoundEntryRaised({
          memoryItemId,
          raisedAt: '2026-08-06T09:00:04.000Z',
        })).toBe(true);
      } finally {
        store.close();
      }

      const after = await app.inject({ method: 'GET', url: '/api/events?limit=10' });
      const afterRow = (after.json().events as Array<{ type: string; payload: Record<string, unknown> }>)
        .find((stored) => stored.type === 'memory.time_bound_entry_recorded');
      expect(afterRow?.payload.raisedAt).toBe('2026-08-06T09:00:04.000Z');
      // A projection, not a rewrite: everything else is what was stored.
      expect(afterRow?.payload.memoryItemId).toBe(memoryItemId);
    } finally {
      await app.close();
    }
  });

  it('stays an ordinary memory record without an instant', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-time-bound-plain-'));
    tempDirs.push(dir);
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: join(dir, 'pico.sqlite'),
      deviceId: 'pico-core',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'memory.recorded',
          payload: {
            privacyDomain: 'domain-private',
            contentType: 'text/plain',
            content: 'A note',
          },
        },
      });
      expect(response.json().event.type).toBe('memory.recorded');
    } finally {
      await app.close();
    }
  });

  it('refuses an instant it cannot compare exactly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-time-bound-bad-'));
    tempDirs.push(dir);
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: join(dir, 'pico.sqlite'),
      deviceId: 'pico-core',
    });

    try {
      for (const dueAt of ['2026-08-10T09:00:00Z', 'tomorrow', 42]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/events',
          payload: {
            deviceId: 'desktop-dev',
            type: 'memory.recorded',
            payload: {
              privacyDomain: 'domain-private',
              contentType: 'application/vnd.pico.reminder',
              content: 'Call the dentist',
              dueAt,
            },
          },
        });
        expect(response.statusCode, String(dueAt)).toBe(400);
      }
    } finally {
      await app.close();
    }
  });
});

describe('ADR 0118 O1 time-bound entries', () => {
  it('records an instant on a memory item and lists it while it waits', async () => {
    const store = await openStore();
    try {
      recordEntry(store, 'entry-1', '2026-08-10T09:00:00.000Z');
      const entries = store.picoTimeBoundEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0]?.dueAt).toBe('2026-08-10T09:00:00.000Z');
      expect(entries[0]?.raisedAt).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it('raises exactly once however often it is ticked', async () => {
    // A restart, a double tick or two schedulers racing must not re-raise.
    const store = await openStore();
    try {
      recordEntry(store, 'entry-1', '2020-01-01T00:00:00.000Z');
      const raised: string[] = [];
      const scheduler = startPicoTimeBoundScheduler({
        store,
        raise: (entry) => {
          raised.push(entry.memoryItemId);
        },
        setTimer: () => ({ unref: () => {} }) as never,
        clearTimer: () => {},
      });

      expect(await scheduler.tick()).toBe(1);
      expect(await scheduler.tick()).toBe(0);
      expect(raised).toEqual(['entry-1']);
      scheduler.stop();
    } finally {
      store.close();
    }
  });

  it('still raises an instant that passed while the Home was off', async () => {
    // Skipping it would be the silent failure this family exists to prevent:
    // the person stopped carrying the appointment when they wrote it down.
    const store = await openStore();
    try {
      recordEntry(store, 'entry-old', '2019-05-05T08:00:00.000Z');
      const raised: string[] = [];
      const scheduler = startPicoTimeBoundScheduler({
        store,
        raise: (entry) => {
          raised.push(entry.memoryItemId);
        },
        setTimer: () => ({ unref: () => {} }) as never,
        clearTimer: () => {},
      });

      expect(await scheduler.tick()).toBe(1);
      expect(raised).toEqual(['entry-old']);
      scheduler.stop();
    } finally {
      store.close();
    }
  });

  it('leaves an entry that is not due yet alone', async () => {
    const store = await openStore();
    try {
      recordEntry(store, 'entry-future', '2099-01-01T00:00:00.000Z');
      const raised: string[] = [];
      const scheduler = startPicoTimeBoundScheduler({
        store,
        raise: (entry) => {
          raised.push(entry.memoryItemId);
        },
        setTimer: () => ({ unref: () => {} }) as never,
        clearTimer: () => {},
      });

      expect(await scheduler.tick()).toBe(0);
      expect(raised).toEqual([]);
      expect(store.picoTimeBoundEntries()).toHaveLength(1);
      scheduler.stop();
    } finally {
      store.close();
    }
  });

  it('does not let one failing surface stop the others', async () => {
    const store = await openStore();
    try {
      recordEntry(store, 'entry-a', '2020-01-01T00:00:00.000Z');
      recordEntry(store, 'entry-b', '2020-01-02T00:00:00.000Z');
      const raised: string[] = [];
      const scheduler = startPicoTimeBoundScheduler({
        store,
        raise: (entry) => {
          if (entry.memoryItemId === 'entry-a') {
            throw new Error('surface_gone');
          }
          raised.push(entry.memoryItemId);
        },
        setTimer: () => ({ unref: () => {} }) as never,
        clearTimer: () => {},
      });

      await scheduler.tick();
      expect(raised).toEqual(['entry-b']);
      // And the failed one is not re-raised forever: one prompt the person
      // never saw beats an endless loop of them.
      expect(store.picoTimeBoundEntries()).toHaveLength(0);
      scheduler.stop();
    } finally {
      store.close();
    }
  });

  it('sleeps to the next instant rather than polling', async () => {
    const store = await openStore();
    try {
      const setTimer = vi.fn((_handler: () => void, _delayMs: number) => ({ unref: () => {} }) as never);
      recordEntry(store, 'entry-future', '2099-01-01T00:00:00.000Z');
      const scheduler = startPicoTimeBoundScheduler({
        store,
        raise: () => {},
        setTimer,
        clearTimer: () => {},
      });

      // Capped rather than unbounded: a distant instant exceeds what one timer
      // can express, so a long wait becomes several short ones.
      expect(setTimer).toHaveBeenCalled();
      expect(setTimer.mock.calls[0]?.[1]).toBe(60 * 60 * 1_000);
      scheduler.stop();
    } finally {
      store.close();
    }
  });

  it('arms nothing when nothing waits', async () => {
    const store = await openStore();
    try {
      const setTimer = vi.fn(() => ({ unref: () => {} }) as never);
      const scheduler = startPicoTimeBoundScheduler({
        store,
        raise: () => {},
        setTimer,
        clearTimer: () => {},
      });

      expect(setTimer).not.toHaveBeenCalled();
      scheduler.stop();
    } finally {
      store.close();
    }
  });
});
