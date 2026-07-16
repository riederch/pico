import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionEventTypes,
  avatarIntensities,
  avatarModes,
  avatarStates,
  avatarStatusColors,
  deviceSeenStatuses,
  legacyToolPolicyEventTypes,
  messageCreatedRoles,
  picoHomeEventTypes,
  protocolCapabilities,
  realtimeMessageType,
} from '@pico/protocol';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';

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
  vi.useRealTimers();

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
    expect(response.headers['cache-control']).toBe('no-store');
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
    expect(response.headers['cache-control']).toBe('no-store');
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
          { id: '0005_event_payload_posture', appliedAt: expect.any(String) },
          { id: '0006_memory_item_store', appliedAt: expect.any(String) },
          { id: '0007_memory_item_content_posture', appliedAt: expect.any(String) },
          { id: '0008_memory_key_envelope', appliedAt: expect.any(String) },
          { id: '0009_memory_retention_policy', appliedAt: expect.any(String) },
        ],
      },
    });

    await app.close();
  });

  it('keeps the dashboard shell and health endpoint open when a foundation token is configured', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    const dashboard = await app.inject({ method: 'GET', url: '/' });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain('Pico Home Foundation Dashboard');

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      ok: true,
      service: 'pico-home-core',
      deviceId: 'test-core',
    });

    await app.close();
  });

  it('requires the configured foundation token for direct Foundation API access', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    for (const request of [
      { method: 'GET', url: '/api/system/version' },
      { method: 'GET', url: '/api/system/status' },
      { method: 'GET', url: '/api/events' },
      { method: 'GET', url: '/api/events/tail' },
      { method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } },
    ] as const) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer realm="Pico Foundation"');
      expect(response.json()).toEqual({ error: 'Foundation token is required.' });
    }

    const oversizedPost = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', padding: 'x'.repeat(50_000) },
      }),
    });

    expect(oversizedPost.statusCode).toBe(401);
    expect(oversizedPost.json()).toEqual({ error: 'Foundation token is required.' });

    await app.close();
  });

  it('accepts a bearer foundation token for protected Foundation API access', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    const headers = { authorization: 'Bearer dev-token' };

    const version = await app.inject({ method: 'GET', url: '/api/system/version', headers });
    expect(version.statusCode).toBe(200);

    const created = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers,
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } },
    });
    expect(created.statusCode).toBe(201);

    const listed = await app.inject({ method: 'GET', url: '/api/events', headers });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().events).toHaveLength(1);

    await app.close();
  });

  it('mints realtime tickets only through protected Foundation API access', async () => {
    const unprotectedApp = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
    });

    const disabled = await unprotectedApp.inject({ method: 'POST', url: '/api/realtime/tickets' });
    expect(disabled.statusCode).toBe(404);
    expect(disabled.json()).toEqual({ error: 'Realtime tickets are not enabled.' });
    await unprotectedApp.close();

    const protectedApp = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });

    const missingToken = await protectedApp.inject({ method: 'POST', url: '/api/realtime/tickets' });
    expect(missingToken.statusCode).toBe(401);
    expect(missingToken.headers['www-authenticate']).toBe('Bearer realm="Pico Foundation"');
    expect(missingToken.json()).toEqual({ error: 'Foundation token is required.' });

    const ticketResponse = await protectedApp.inject({
      method: 'POST',
      url: '/api/realtime/tickets',
      headers: { authorization: 'Bearer dev-token' },
    });
    expect(ticketResponse.statusCode).toBe(201);
    expect(ticketResponse.headers['cache-control']).toBe('no-store');
    expect(ticketResponse.json()).toEqual({
      ticket: expect.any(String),
      expiresAt: expect.any(String),
    });

    await protectedApp.close();
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

  it('accepts writable payload postures and rejects reserved or unknown ones', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' }, payloadPosture: 'inline_operational' },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().event.payloadPosture).toBe('inline_operational');

    const reserved = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' }, payloadPosture: 'reference_only' },
    });
    expect(reserved.statusCode).toBe(400);
    expect(reserved.json()).toEqual({ error: 'This payloadPosture is reserved for future memory-referencing events and is not writable yet.' });

    const unknown = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' }, payloadPosture: 'not_a_posture' },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ error: 'payloadPosture must be a known posture.' });

    const withoutPosture = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } },
    });
    expect(withoutPosture.statusCode).toBe(201);
    expect('payloadPosture' in withoutPosture.json().event).toBe(false);

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    const postures = listed.json().events.map((event: { payloadPosture?: string }) => event.payloadPosture);
    expect(postures).toContain('inline_operational');
    expect(postures).toContain(undefined);

    await app.close();
  });

  it('splits memory.recorded content into the store and records a reference-only event', async () => {
    const databasePath = createDatabasePath();
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: { privacyDomain: 'domain-private', contentType: 'text/markdown', content: 'A private note.', summary: 'a note' },
      },
    });
    expect(recorded.statusCode).toBe(201);

    const event = recorded.json().event;
    expect(event.type).toBe('memory.recorded');
    expect(event.payloadPosture).toBe('reference_only');
    expect(event.payload).toEqual({
      memoryItemId: expect.stringMatching(/^mem_/),
      privacyDomain: 'domain-private',
      contentType: 'text/markdown',
      summary: 'a note',
    });
    expect('content' in event.payload).toBe(false);

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.recorded', payload: { privacyDomain: 'domain-private', contentType: 'text/markdown' } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'memory.recorded payload requires privacyDomain, contentType and content.' });

    await app.close();

    const verify = new EventStore(databasePath);
    const stored = verify.memory().getInDomain(event.payload.memoryItemId, 'domain-private');
    expect(stored?.content).toBe('A private note.');
    expect(stored?.deletionState).toBe('active');
    verify.close();
  });

  it('encrypts recorded memory content at rest when memory encryption is enabled', async () => {
    await sodium.ready;
    const databasePath = createDatabasePath();
    const keyStorePath = join(dirname(databasePath), 'keys');
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core', memoryEncryption: true });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: { privacyDomain: 'domain-private', contentType: 'text/plain', content: 'A private secret.', summary: 'a note' },
      },
    });
    expect(recorded.statusCode).toBe(201);
    const memoryItemId = recorded.json().event.payload.memoryItemId;
    // The reference-only event still never carries the content.
    expect('content' in recorded.json().event.payload).toBe(false);

    // A privacy domain that is not a valid key-store domain id is rejected at write time.
    const badDomain = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.recorded', payload: { privacyDomain: 'domain.private', contentType: 'text/plain', content: 'x' } },
    });
    expect(badDomain.statusCode).toBe(400);
    expect(badDomain.json()).toEqual({ error: 'privacyDomain must match [a-zA-Z0-9_-]{1,128} when memory encryption is enabled.' });

    await app.close();

    // At rest the content is ciphertext, not the plaintext.
    const raw = new Database(databasePath, { readonly: true });
    const row = raw.prepare('SELECT content, content_posture FROM memory_item WHERE memory_item_id = ?').get(memoryItemId) as { content: string; content_posture: string };
    raw.close();
    expect(row.content_posture).toBe('domain_encrypted');
    expect(row.content).not.toContain('A private secret.');

    // A crypto-enabled store reading the same key store recovers the plaintext.
    const crypto = new MemoryContentCrypto(sodium, new KeyStore(keyStorePath));
    const verify = new EventStore(databasePath, { memoryCrypto: crypto });
    expect(verify.memory().getInDomain(memoryItemId, 'domain-private')?.content).toBe('A private secret.');
    verify.close();
  });

  it('runs the retention sweep on boot and expires an aged item through a tombstone', async () => {
    const databasePath = createDatabasePath();

    // Pre-seed a policy and an aged item that references it.
    const seed = new EventStore(databasePath);
    seed.retentionPolicies().create({ retentionPolicyId: 'ret-1', displayName: '1 day', mode: 'delete_after_max_age', maxAgeDays: 1 });
    seed.memory().create({
      memoryItemId: 'mem-old',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'stale note',
      retentionPolicyRef: 'ret-1',
    });
    seed.close();
    const aged = new Database(databasePath);
    aged.prepare("UPDATE memory_item SET created_at = ? WHERE memory_item_id = 'mem-old'")
      .run(new Date(Date.now() - 10 * 86_400_000).toISOString());
    aged.close();

    // Booting the app runs the retention sweep.
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    await app.close();

    const verify = new EventStore(databasePath);
    const item = verify.memory().getInDomain('mem-old', 'domain-private');
    expect(item?.deletionState).toBe('tombstoned');
    expect(item?.content).toBeUndefined();
    const tombstones = verify.list().filter((event) => event.type === 'memory.tombstone');
    expect(tombstones).toHaveLength(1);
    expect((tombstones[0].payload as { reason?: string }).reason).toBe('retention:ret-1');
    verify.close();
  });

  it('adds read-time resolution state to listed memory.recorded events', async () => {
    const databasePath = createDatabasePath();
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });

    const recorded = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.recorded', payload: { privacyDomain: 'domain-private', contentType: 'text/plain', content: 'a note' } },
    });
    const memoryItemId = recorded.json().event.payload.memoryItemId;

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    const active = listed.json().events.find((event: { type: string }) => event.type === 'memory.recorded');
    expect(active.payload.resolutionState).toBe('resolvable');
    expect('content' in active.payload).toBe(false);

    const mutate = new EventStore(databasePath);
    mutate.memory().deleteInDomain(memoryItemId, 'domain-private');
    mutate.close();

    const relisted = await app.inject({ method: 'GET', url: '/api/events' });
    const resolved = relisted.json().events.find((event: { type: string }) => event.type === 'memory.recorded');
    expect(resolved.payload.resolutionState).toBe('deleted');

    await app.close();
  });

  it('accepts a memory.tombstone event and rejects an invalid tombstone payload', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.tombstone', payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private', reason: 'user request' } },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().event.type).toBe('memory.tombstone');

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.tombstone', payload: { memoryItemId: 'mem-1' } },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: 'memory.tombstone payload requires memoryItemId and privacyDomain.' });

    await app.close();
  });

  it('projects a memory.tombstone event onto the deleted memory item', async () => {
    const databasePath = createDatabasePath();

    const seed = new EventStore(databasePath);
    seed.memory().create({ memoryItemId: 'mem-1', privacyDomain: 'domain-private', owner: 'pico-owner', controller: 'pico-owner', contentType: 'text/plain', content: 'a note' });
    seed.memory().deleteInDomain('mem-1', 'domain-private');
    seed.close();

    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath, deviceId: 'test-core' });
    const posted = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.tombstone', payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private' } },
    });
    expect(posted.statusCode).toBe(201);
    await app.close();

    const verify = new EventStore(databasePath);
    expect(verify.memory().getInDomain('mem-1', 'domain-private')?.deletionState).toBe('tombstoned');
    verify.close();
  });

  it('accepts legitimate event bodies below the request body limit', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'x'.repeat(7_900) },
      },
    });

    expect(response.statusCode).toBe(201);

    await app.close();
  });

  it('rejects unexpected Foundation payload fields', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const message = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', memory: 'secret' },
      },
    });
    expect(message.statusCode).toBe(400);
    expect(message.headers['cache-control']).toBe('no-store');
    expect(message.json()).toEqual({ error: 'message.created payload has unexpected field: memory.' });

    const avatar = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'avatar.state_changed',
        payload: { mode: 'everyday', state: 'thinking', intensity: 'normal', statusColor: 'violet', privateNote: 'hidden' },
      },
    });
    expect(avatar.statusCode).toBe(400);
    expect(avatar.json()).toEqual({ error: 'avatar.state_changed payload has unexpected field: privateNote.' });

    const registered = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'device.registered',
        payload: { label: 'dev laptop' },
      },
    });
    expect(registered.statusCode).toBe(400);
    expect(registered.json()).toEqual({ error: 'device.registered payload has unexpected field: label.' });

    await app.close();
  });

  it('keeps the semantic payload size check separate from the request body limit', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', padding: 'x'.repeat(33_000) },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'payload is too large.' });

    await app.close();
  });

  it('rejects oversized request bodies before event validation', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        deviceId: 'desktop-dev',
        type: 'message.created',
        payload: { role: 'user', text: 'Hallo Pico', padding: 'x'.repeat(50_000) },
      }),
    });

    expect(response.statusCode).toBe(413);

    await app.close();
  });

  it('accepts foundation payload values exported by the protocol package', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });

    const registered = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'device.registered',
        payload: {},
      },
    });
    expect(registered.statusCode).toBe(201);

    const session = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        deviceId: 'desktop-dev',
        type: 'session.created',
        payload: {},
      },
    });
    expect(session.statusCode).toBe(201);

    for (const status of deviceSeenStatuses) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'device.seen',
          payload: { status },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const role of messageCreatedRoles) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'message.created',
          payload: { role, text: `Message role ${role}` },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const mode of avatarModes) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode, state: 'idle', intensity: 'normal', statusColor: 'neutral' },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const state of avatarStates) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode: 'everyday', state, intensity: 'normal', statusColor: 'neutral' },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const intensity of avatarIntensities) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode: 'everyday', state: 'idle', intensity, statusColor: 'neutral' },
        },
      });

      expect(response.statusCode).toBe(201);
    }

    for (const statusColor of avatarStatusColors) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'avatar.state_changed',
          payload: { mode: 'everyday', state: 'idle', intensity: 'normal', statusColor },
        },
      });

      expect(response.statusCode).toBe(201);
    }

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

    // The server-synthesized crypto-shred audit event cannot be forged by a client.
    const shredForge = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { deviceId: 'desktop-dev', type: 'memory.domain_shredded', payload: { privacyDomain: 'domain-private', removedKeyVersions: 1 } },
    });
    expect(shredForge.statusCode).toBe(400);
    expect(shredForge.json()).toEqual({ error: RESERVED_EVENT_ERROR });

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
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
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
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
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
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('requires a realtime credential for websocket connections when a foundation token is configured', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    await expect(app.injectWS('/ws')).rejects.toThrow('Unexpected server response: 401');
    await expect(app.injectWS('/ws?ticket=dev-token')).rejects.toThrow('Unexpected server response: 401');

    await app.close();
  });

  it('accepts non-browser bearer websocket upgrades when a foundation token is configured', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS('/ws', {
      headers: {
        authorization: 'Bearer dev-token',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });

    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('accepts a minted realtime ticket for one websocket upgrade only', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    const ticket = await mintRealtimeTicket(app);
    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`, {}, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });

    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
    } finally {
      socket.terminate();
    }

    await expect(app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`)).rejects.toThrow('Unexpected server response: 401');
    await app.close();
  });

  it('rejects expired realtime tickets before websocket upgrade', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-09T12:00:00.000Z'));

    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    const ticket = await mintRealtimeTicket(app);
    vi.setSystemTime(new Date('2026-07-09T12:00:31.000Z'));

    await expect(app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`)).rejects.toThrow('Unexpected server response: 401');
    await app.close();
  });

  it('keeps the websocket Origin check ahead of realtime ticket validation', async () => {
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: createDatabasePath(),
      deviceId: 'test-core',
      foundationToken: 'dev-token',
    });
    await app.ready();

    const ticket = await mintRealtimeTicket(app);
    await expect(app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`, {
      headers: {
        host: 'localhost:3100',
        origin: 'http://evil.example.test',
      },
    })).rejects.toThrow('Unexpected server response: 403');

    let initialMessage: Promise<unknown> | null = null;
    const socket = await app.injectWS(`/ws?ticket=${encodeURIComponent(ticket)}`, {
      headers: {
        host: 'localhost:3100',
        origin: 'http://localhost:3100',
      },
    }, { onInit(ws) { initialMessage = readSocketJson(ws as unknown as TestWebSocket); } });

    try {
      const message = await requireMessagePromise(initialMessage);
      expect(message).toEqual({ type: realtimeMessageType.coreConnected, deviceId: 'test-core' });
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
      expect(broadcast).toEqual({ type: realtimeMessageType.eventCreated, event: createdBody.event });
    } finally {
      socket.terminate();
      await app.close();
    }
  });

  it('creates and lists events', async () => {
    const app = await buildApp({ host: '127.0.0.1', port: 0, databasePath: createDatabasePath(), deviceId: 'test-core' });
    const created = await app.inject({ method: 'POST', url: '/api/events', payload: { deviceId: 'desktop-dev', sessionId: 'session-1', type: 'message.created', payload: { role: 'user', text: 'Hallo Pico' } } });
    expect(created.statusCode).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const createdBody = created.json();
    expect(createdBody.appendResult).toBe('inserted');
    expect(createdBody.event.deviceId).toBe('desktop-dev');
    expect(createdBody.event.type).toBe('message.created');
    expect(createdBody.event.lamport).toBe(1);
    expect(createdBody.event.stream).toBe('session:session-1');

    const listed = await app.inject({ method: 'GET', url: '/api/events' });
    expect(listed.statusCode).toBe(200);
    expect(listed.headers['cache-control']).toBe('no-store');
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

async function mintRealtimeTicket(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/realtime/tickets',
    headers: { authorization: 'Bearer dev-token' },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { ticket?: unknown };
  if (typeof body.ticket !== 'string') {
    throw new Error('Realtime ticket response did not include a string ticket.');
  }
  return body.ticket;
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
