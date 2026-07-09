import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const tempDirs: string[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-event-cursor-api-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('event cursor API', () => {
  it('returns additive cursor metadata on event lists', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      events: [expect.objectContaining({ type: 'message.created' })],
      nextCursor: expect.any(String),
      hasMore: false,
    });

    await app.close();
  });

  it('paginates events using nextCursor', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    for (const text of ['one', 'two', 'three']) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text } },
      });
      expect(created.statusCode).toBe(201);
    }

    const firstPage = await app.inject({ method: 'GET', url: '/api/events?limit=2' });
    expect(firstPage.statusCode).toBe(200);
    const firstPageBody = firstPage.json();
    expect(firstPageBody.events.map(eventText)).toEqual(['one', 'two']);
    expect(firstPageBody.nextCursor).toEqual(expect.any(String));
    expect(firstPageBody.hasMore).toBe(true);

    const secondPage = await app.inject({ method: 'GET', url: `/api/events?limit=2&after=${encodeURIComponent(firstPageBody.nextCursor)}` });
    expect(secondPage.statusCode).toBe(200);
    const secondPageBody = secondPage.json();
    expect(secondPageBody.events.map(eventText)).toEqual(['three']);
    expect(secondPageBody.hasMore).toBe(false);

    await app.close();
  });

  it('accepts cursors issued for Lamport values above the incoming event cap', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const highLamport = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        lamport: 1_000_000_000,
        payload: { role: 'user', text: 'high lamport' },
      },
    });
    expect(highLamport.statusCode).toBe(201);

    const next = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'next event' } },
    });
    expect(next.statusCode).toBe(201);

    const firstPage = await app.inject({ method: 'GET', url: '/api/events?limit=1' });
    expect(firstPage.statusCode).toBe(200);
    const firstPageBody = firstPage.json();
    expect(firstPageBody.events.map(eventText)).toEqual(['high lamport']);
    expect(firstPageBody.nextCursor).toEqual(expect.any(String));
    expect(firstPageBody.hasMore).toBe(true);

    const secondPage = await app.inject({ method: 'GET', url: `/api/events?limit=1&after=${encodeURIComponent(firstPageBody.nextCursor)}` });
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json().events.map(eventText)).toEqual(['next event']);

    await app.close();
  });

  it('rejects invalid cursors', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const response = await app.inject({ method: 'GET', url: '/api/events?after=not-a-cursor' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'after cursor is invalid.' });

    await app.close();
  });

  it('returns the latest events from the tail endpoint without changing the cursor list', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    for (const text of ['one', 'two', 'three']) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text } },
      });
      expect(created.statusCode).toBe(201);
    }

    const tail = await app.inject({ method: 'GET', url: '/api/events/tail?limit=2' });
    expect(tail.statusCode).toBe(200);
    expect(tail.json()).toMatchObject({
      nextCursor: null,
      hasMore: true,
    });
    expect(tail.json().events.map(eventText)).toEqual(['two', 'three']);

    const cursorList = await app.inject({ method: 'GET', url: '/api/events?limit=2' });
    expect(cursorList.statusCode).toBe(200);
    expect(cursorList.json().events.map(eventText)).toEqual(['one', 'two']);
    expect(cursorList.json().nextCursor).toEqual(expect.any(String));

    await app.close();
  });

  it('returns an empty tail response for an empty event store', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const tail = await app.inject({ method: 'GET', url: '/api/events/tail?limit=2' });
    expect(tail.statusCode).toBe(200);
    expect(tail.json()).toEqual({ events: [], nextCursor: null, hasMore: false });

    await app.close();
  });
});

function eventText(event: { payload: { text: string } }): string {
  return event.payload.text;
}
