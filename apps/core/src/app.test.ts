import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const tempDirs: string[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-core-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Pico Core app', () => {
  it('returns health information', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: 'pico-core',
      deviceId: 'test-core',
    });

    await app.close();
  });

  it('rejects invalid event creation requests', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'deviceId, type and payload are required.',
    });

    await app.close();
  });

  it('creates and lists events', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        sessionId: 'session-1',
        type: 'message.created',
        payload: {
          role: 'user',
          text: 'Hallo Pico',
        },
      },
    });

    expect(created.statusCode).toBe(201);
    const createdBody = created.json();
    expect(createdBody.event.deviceId).toBe('desktop-dev');
    expect(createdBody.event.type).toBe('message.created');
    expect(createdBody.event.lamport).toBe(1);
    expect(createdBody.event.stream).toBe('session:session-1');

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    expect(listed.statusCode).toBe(200);
    const listedBody = listed.json();
    expect(listedBody.events).toHaveLength(1);
    expect(listedBody.events[0].payload.text).toBe('Hallo Pico');

    await app.close();
  });

  it('continues Lamport order from persisted events', async () => {
    const databasePath = createDatabasePath();

    const firstApp = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    await firstApp.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'First' },
      },
    });
    await firstApp.close();

    const secondApp = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    const response = await secondApp.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Second' },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().event.lamport).toBe(2);

    await secondApp.close();
  });
});
