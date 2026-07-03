import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function createWebRootPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-web-test-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head><title>Pico Foundation Dashboard</title></head><body><script type="module" src="./dist/main.js"></script></body></html>',
  );
  writeFileSync(join(dir, 'dist', 'main.js'), 'console.log("pico dashboard");');
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Pico Core app', () => {
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
    expect(response.body).toContain('Pico Foundation Dashboard');

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
    expect(index.body).toContain('Pico Foundation Dashboard');

    const script = await app.inject({ method: 'GET', url: '/dist/main.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('application/javascript');
    expect(script.body).toContain('pico dashboard');

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
      service: 'pico-core',
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
      service: 'pico-core',
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
      service: 'pico-core',
      version: '0.1.7',
      protocolVersion: '0.1.7',
      deviceId: 'test-core',
      database: {
        maxLamport: 0,
        migrations: [
          {
            id: '0001_event_store',
            appliedAt: expect.any(String),
          },
        ],
      },
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

  it('rejects reserved policy and executor event types on the foundation API', async () => {
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
        type: 'tool.call_requested',
        payload: {
          toolName: 'homeassistant.get_entity_state',
          riskLevel: 'read_only',
          arguments: { entityId: 'sensor.pico_status' },
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'This event type is reserved for a later policy-gated API.',
    });

    await app.close();
  });

  it('rejects invalid list limits', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const response = await app.inject({ method: 'GET', url: '/api/events?limit=-1' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: 'limit must be a positive integer.',
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
