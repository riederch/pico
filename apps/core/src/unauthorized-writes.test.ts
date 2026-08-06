import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { picoLinkDirectRequestEnvelopeSchema } from '@pico/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS } from './link-direct.js';
import {
  PICO_LINK_CONTINUITY_READ_PATH,
  PICO_LINK_INTAKE_PATH,
  startPicoLinkIntakeListener,
} from './link-intake-listener.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-unauthorized-writes-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

/**
 * The store and the log, as bytes. `-shm` is deliberately excluded: it is
 * shared-memory coordination that a reader touches, and this gate is about
 * what survives a restart.
 */
function storeDigest(databasePath: string): string {
  const hash = createHash('sha256');
  for (const path of [databasePath, `${databasePath}-wal`]) {
    hash.update(path);
    hash.update(existsSync(path) ? readFileSync(path) : Buffer.alloc(0));
  }
  return hash.digest('hex');
}

describe('ADR 0119 Q3 no durable write without authorization', () => {
  it('leaves store and log byte-identical across a refused-request burst', async () => {
    const databasePath = createDatabasePath();
    // A token makes the surface authenticated, which is what a deployment
    // looks like; the trusted-local development path has no credential to
    // fail against.
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath,
      deviceId: 'pico-core',
      foundationToken: 'the-real-token',
    });

    try {
      // Settle everything a healthy boot writes before taking the baseline.
      expect((await app.inject({
        method: 'GET',
        url: '/api/system/version',
        headers: { authorization: 'Bearer the-real-token' },
      })).statusCode).toBe(200);
      const before = storeDigest(databasePath);

      const wrongToken = { authorization: 'Bearer not-the-token' };
      const bursts: Array<{
        method: 'POST' | 'PUT' | 'DELETE';
        url: string;
        payload?: Record<string, unknown>;
      }> = [
        { method: 'POST', url: '/api/events', payload: { deviceId: 'attacker', type: 'message.created', payload: { role: 'user', text: 'flood' } } },
        { method: 'POST', url: '/api/events', payload: { deviceId: 'attacker', type: 'memory.recorded', payload: { privacyDomain: 'd', contentType: 'text/plain', content: 'flood' } } },
        { method: 'POST', url: '/api/memory/retention-policies', payload: { retentionPolicyId: 'r', displayName: 'r', mode: 'keep_until_deleted' } },
        { method: 'POST', url: '/api/memory/domains/domain-private/shred', payload: {} },
        { method: 'POST', url: '/api/home/claim', payload: {} },
        { method: 'POST', url: '/api/home/memberships', payload: {} },
        { method: 'POST', url: '/api/home/domain-read-grants', payload: {} },
        { method: 'POST', url: '/api/home/share-envelopes', payload: {} },
        { method: 'POST', url: '/api/home/reader-custody/items', payload: {} },
        { method: 'POST', url: '/api/auth/session', payload: { passphrase: 'wrong-passphrase' } },
        { method: 'POST', url: '/api/auth/bootstrap', payload: { code: 'wrong', passphrase: 'wrong-passphrase-long' } },
        { method: 'POST', url: '/api/realtime/tickets', payload: {} },
        { method: 'PUT', url: '/api/auth/credential', payload: { passphrase: 'wrong', newPassphrase: 'alsowrong' } },
        { method: 'DELETE', url: '/api/auth/sessions' },
      ];

      for (let round = 0; round < 4; round += 1) {
        for (const attempt of bursts) {
          const response = await app.inject({
            method: attempt.method,
            url: attempt.url,
            headers: wrongToken,
            payload: attempt.payload,
          });
          // Every one of these must be refused. A 2xx here would mean the
          // burst is not testing what it claims to.
          expect(response.statusCode).toBeGreaterThanOrEqual(400);
        }
      }

      // Nothing an attacker sent survives a restart: no event, no row, no
      // audit record, no on-disk counter. Refusal counters live in memory,
      // where LoginThrottle already keeps them - the accepted cost is that
      // failed attempts are not forensically reconstructable, which ADR 0076
      // already chose.
      expect(storeDigest(databasePath)).toBe(before);

      const events = await app.inject({
        method: 'GET',
        url: '/api/events?limit=100',
        headers: { authorization: 'Bearer the-real-token' },
      });
      expect(events.statusCode).toBe(200);
      expect((events.json().events as Array<{ deviceId: string }>)
        .some((stored) => stored.deviceId === 'attacker')).toBe(false);

      // The instrument has to be able to fail. One authorized write must
      // move the digest, or the comparison above proves only that nothing
      // ever reaches the file.
      expect((await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: 'Bearer the-real-token' },
        payload: {
          deviceId: 'desktop-dev',
          type: 'message.created',
          payload: { role: 'user', text: 'authorized' },
        },
      })).statusCode).toBe(201);
      expect(storeDigest(databasePath)).not.toBe(before);
    } finally {
      await app.close();
    }
  });

  it('leaves them byte-identical across a refused burst on the published Link intake port', async () => {
    // Q3 binds the Link intake port publication, so proving the Foundation
    // surface alone would be proving the wrong door. This is the listener a
    // person actually exposes to a network, and it carries no credential by
    // design: authorization here is the sealed envelope, nothing else.
    const databasePath = createDatabasePath();
    const logDestination = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath,
      deviceId: 'pico-core',
      logDestination,
    });
    const listener = await startPicoLinkIntakeListener(app, {
      host: '127.0.0.1',
      port: 0,
    });
    const baseUrl = `http://127.0.0.1:${listener.port}`;

    try {
      expect((await app.inject({ method: 'GET', url: '/api/system/version' })).statusCode).toBe(200);
      const before = storeDigest(databasePath);

      const bursts: Array<{
        method: string;
        path: string;
        body?: string;
        contentType?: string;
      }> = [
        // Refused at the listener edge, before Fastify routing.
        { method: 'GET', path: '/' },
        { method: 'POST', path: '/api/events', body: '{}', contentType: 'application/json' },
        { method: 'POST', path: `${PICO_LINK_INTAKE_PATH}?operation=status`, body: '{}', contentType: 'application/json' },
        { method: 'GET', path: PICO_LINK_INTAKE_PATH },
        { method: 'DELETE', path: PICO_LINK_CONTINUITY_READ_PATH },
        // Refused by the real intake route: parser, then envelope shape.
        { method: 'POST', path: PICO_LINK_INTAKE_PATH, body: 'not json', contentType: 'application/json' },
        { method: 'POST', path: PICO_LINK_INTAKE_PATH, body: '{}', contentType: 'application/json' },
        { method: 'POST', path: PICO_LINK_INTAKE_PATH, body: JSON.stringify({ schema: 'pico.link.direct.request-envelope.v0' }), contentType: 'application/json' },
        { method: 'POST', path: PICO_LINK_INTAKE_PATH, body: JSON.stringify({ schema: picoLinkDirectRequestEnvelopeSchema, sealedRequestHex: 42 }), contentType: 'application/json' },
        // Over the Link body limit.
        {
          method: 'POST',
          path: PICO_LINK_INTAKE_PATH,
          body: JSON.stringify({
            schema: picoLinkDirectRequestEnvelopeSchema,
            sealedRequestHex: 'a'.repeat(MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS + 2),
          }),
          contentType: 'application/json',
        },
        // Well-formed enough to reach the private-key work and fail there.
        // This is the deepest an unauthorized caller gets, and the case that
        // matters most: refusal after crypto must still write nothing.
        {
          method: 'POST',
          path: PICO_LINK_INTAKE_PATH,
          body: JSON.stringify({
            schema: picoLinkDirectRequestEnvelopeSchema,
            sealedRequestHex: 'ff'.repeat(512),
          }),
          contentType: 'application/json',
        },
        // The unsealed continuity read, which is a read and must stay one.
        { method: 'GET', path: PICO_LINK_CONTINUITY_READ_PATH },
      ];

      for (let round = 0; round < 4; round += 1) {
        for (const attempt of bursts) {
          const response = await fetch(`${baseUrl}${attempt.path}`, {
            method: attempt.method,
            headers: attempt.contentType === undefined
              ? undefined
              : { 'content-type': attempt.contentType },
            body: attempt.body,
          });
          expect(
            response.status,
            `${attempt.method} ${attempt.path}`,
          ).toBeGreaterThanOrEqual(400);
          await response.text();
        }
      }

      // The depth claim above has to be checked, not asserted in a comment:
      // if the deep payload were refused as `invalid_envelope` it would never
      // have reached the seal-open, and this burst would be proving something
      // shallower than it says. These two reasons only exist past the shape
      // check.
      const deep = await fetch(`${baseUrl}${PICO_LINK_INTAKE_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: 'ff'.repeat(512),
        }),
      });
      expect(deep.status).toBe(400);
      expect(await deep.json()).toEqual({ error: 'sealed_request_unreadable' });

      const oversized = await fetch(`${baseUrl}${PICO_LINK_INTAKE_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: 'a'.repeat(MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS + 2),
        }),
      });
      expect(await oversized.json()).toEqual({ error: 'envelope_too_large' });

      // No row, no event, no audit record, no on-disk counter - across every
      // refusal depth from the edge to a failed unseal.
      expect(storeDigest(databasePath)).toBe(before);

      const events = await app.inject({ method: 'GET', url: '/api/events?limit=100' });
      expect(events.statusCode).toBe(200);
      // Not "the log is empty": a first boot records its own version (ADR 0122
      // Y6), and that is the Home writing about itself. What must be absent is
      // anything the burst authored.
      expect((events.json().events as Array<{ deviceId: string; type: string }>)
        .every((stored) => stored.type === 'home.version_changed')).toBe(true);

      // Same sensitivity check as above: the digest has to be able to move,
      // or byte-identity proves only that this database is never written.
      expect((await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'message.created',
          payload: { role: 'user', text: 'authorized' },
        },
      })).statusCode).toBe(201);
      expect(storeDigest(databasePath)).not.toBe(before);
    } finally {
      await listener.close();
      await app.close();
    }
  });
});
