import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { actionEventTypes, legacyToolPolicyEventTypes, picoHomeEventTypes, protocolCapabilities } from '@pico/protocol';
import { buildApp } from './app.js';

const tempDirs: string[] = [];
const RESERVED_EVENT_ERROR = 'This event type is reserved for a later Pico Rules, Action Runner or Pico Home API.';

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-core-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

function createWebRootPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-web-test-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head><title>Pico Home Foundation Dashboard</title></head><body><script type="module" src="./dist/main.js"></script></body></html>',
  );
  writeFileSync(join(dir, 'dist', 'main.js'), 'console.log("pico dashboard");');
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Pico Home Core app', () => {
  it('serves the dashboard shell from the default web root', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Pico Home Foundation Dashboard');

    await app.close();
  });

  it('serves the foundation dashboard shell and built assets', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      webRootPath: createWebRootPath(),
    });

    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.body).toContain('Pico Home Foundation Dashboard');

    const script = await app.inject({ method: 'GET', url: '/dist/main.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('application/javascript');
    expect(script.headers['x-content-type-options']).toBe('nosniff');
    expect(script.body).toContain('pico dashboard');

    await app.close();
  });

  it('returns 404 for missing dashboard assets and directories', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      webRootPath: createWebRootPath(),
    });

    const missingAsset = await app.inject({ method: 'GET', url: '/dist/missing.js' });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.json()).toEqual({ error: 'Not found.' });

    const directory = await app.inject({ method: 'GET', url: '/dist/.' });
    expect(directory.statusCode).toBe(404);
    expect(directory.json()).toEqual({ error: 'Not found.' });

    const traversal = await app.inject({ method: 'GET', url: '/dist/%2e%2e%2findex.html' });
    expect(traversal.statusCode).toBe(404);
    expect(traversal.body).not.toContain('Pico Home Foundation Dashboard');

    await app.close();
  });

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
      service: 'pico-home-core',
      deviceId: 'test-core',
    });

    await app.close();
  });

  it('returns system version information', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/api/system/version' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'pico-home-core',
      version: '0.1.7',
      protocolVersion: '0.1.7',
    });

    await app.close();
  });

  it('returns system status information', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/api/system/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'pico-home-core',
      version: '0.1.7',
      protocolVersion: '0.1.7',
      deviceId: 'test-core',
      capabilities: protocolCapabilities,
      picoHome: {
        claimState: {
          state: 'unclaimed',
        },
      },
      database: {
        maxLamport: 0,
        migrations: [
          { id: '0001_event_store', appliedAt: expect.any(String) },
          { id: '0002_schema_migration_audit', appliedAt: expect.any(String) },
          { id: '0003_schema_migration_audit_errors', appliedAt: expect.any(String) },
          { id: '0004_pico_home_claim_state', appliedAt: expect.any(String) },
        ],
      },
    });

    await app.close();
  });

  it('rejects invalid event creation requests', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    const response = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'deviceId, type and payload are required.' });
    await app.close();
  });

  it('rejects blank event identifiers and text fields', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const blankDeviceId = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: '   ', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(blankDeviceId.statusCode).toBe(400);
    expect(blankDeviceId.json()).toEqual({ error: 'deviceId, type and payload are required.' });

    const blankSessionId = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', sessionId: '   ', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(blankSessionId.statusCode).toBe(400);
    expect(blankSessionId.json()).toEqual({ error: 'sessionId must be a non-empty string when provided.' });

    const blankStream = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', stream: '   ', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(blankStream.statusCode).toBe(400);
    expect(blankStream.json()).toEqual({ error: 'stream must be a non-empty string when provided.' });

    const blankMessageText = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: '   ' } } });
    expect(blankMessageText.statusCode).toBe(400);
    expect(blankMessageText.json()).toEqual({ error: 'message.created payload requires role and text.' });

    await app.close();
  });

  it('rejects reserved legacy and product event types on the foundation API', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    for (const type of [...actionEventTypes, ...legacyToolPolicyEventTypes, ...picoHomeEventTypes]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type,
          payload: { actionName: 'homeassistant.get_entity_state', risk: 'read_only', input: { entityId: 'sensor.pico_status' } },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: RESERVED_EVENT_ERROR });
    }

    await app.close();
  });

  it('rejects invalid list limits', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    for (const limit of ['-1', '1abc', '1.5']) {
      const response = await app.inject({ method: 'GET', url: `/api/events?limit=${limit}` });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'limit must be a positive integer.' });
    }
    await app.close();
  });

  it('sends a websocket connection message', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {}, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: 'pico.core.connected', deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('allows same-origin websocket browser connections', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {
      headers: {
        host: 'localhost:3100',
        origin: 'http://localhost:3100',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: 'pico.core.connected', deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('rejects cross-origin websocket browser connections', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    await expect(app.injectWS('/ws', {
      headers: {
        host: 'localhost:3100',
        origin: 'http://evil.example.test',
      },
    })).rejects.toThrow('Unexpected server response: 403');
    await app.close();
  });

  it('allows explicitly configured websocket browser origins', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      wsAllowedOrigins: ['https://dev.example.test'],
    });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {
      headers: {
        host: 'localhost:3100',
        origin: 'https://dev.example.test',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: 'pico.core.connected', deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('broadcasts inserted events to websocket clients', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {}, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });
    try {
      await requireMessagePromise(initialMessage);
      const broadcastPromise = readSocketJson(socket as unknown as TestWebSocket);
      const created = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', sessionId: 'session-1', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
      expect(created.statusCode).toBe(201);
      const broadcast = await broadcastPromise;
      const createdBody = created.json();
      expect(broadcast).toEqual({ type: 'pico.event.created', event: createdBody.event });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('creates and lists events', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', sessionId: 'session-1', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json();
    expect(createdBody.appendResult).toBe('inserted');
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
    await firstApp.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'First' } } });
    await firstApp.close();

    const secondApp = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    const response = await secondApp.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Second' } } });
    expect(response.statusCode).toBe(201);
    expect(response.json().event.lamport).toBe(2);
    await secondApp.close();
  });
});

interface TestWebSocket {
  terminate(): void;
  once(event: 'message', listener: (data: unknown) => void): void;
}

async function readSocketJson(socket: TestWebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error('Timed out waiting for websocket message.')); }, 1_000);
    socket.once('message', (data) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(socketMessageToString(data)) as unknown);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function requireMessagePromise(messagePromise: Promise<unknown> | null): Promise<unknown> {
  if (messagePromise === null) {
    throw new Error('WebSocket message listener was not initialized.');
  }
  return messagePromise;
}

function socketMessageToString(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof Buffer) {
    return data.toString('utf8');
  }
  return String(data);
}
