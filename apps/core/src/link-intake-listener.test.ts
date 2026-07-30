import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MAX_PICO_LINK_DIRECT_REQUEST_BODY_BYTES } from './link-direct.js';
import {
  PICO_LINK_INTAKE_PATH,
  startPicoLinkIntakeListener,
} from './link-intake-listener.js';

describe('restricted Pico Link intake listener (ADR 0107 D4)', () => {
  it('routes the one exact Link target through the real Foundation intake', async () => {
    await withListener(async (baseUrl) => {
      const response = await fetch(`${baseUrl}${PICO_LINK_INTAKE_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      expect(response.status).toBe(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ error: 'invalid_envelope' });
    });
  });

  it('cannot expose Foundation routes, diagnostics, static files or target variants', async () => {
    await withListener(async (baseUrl) => {
      for (const probe of [
        { method: 'GET', path: '/' },
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/api/system/status' },
        { method: 'GET', path: '/api/home/setup' },
        { method: 'POST', path: '/api/events' },
        { method: 'POST', path: `${PICO_LINK_INTAKE_PATH}/` },
        { method: 'POST', path: `${PICO_LINK_INTAKE_PATH}?operation=status` },
      ]) {
        const response = await fetch(`${baseUrl}${probe.path}`, {
          method: probe.method,
          headers: probe.method === 'POST' ? { 'content-type': 'application/json' } : undefined,
          body: probe.method === 'POST' ? '{}' : undefined,
        });
        expect(response.status, `${probe.method} ${probe.path}`).toBe(404);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(await response.json()).toEqual({ error: 'Not found.' });
      }

      for (const method of ['GET', 'PUT', 'OPTIONS']) {
        const response = await fetch(`${baseUrl}${PICO_LINK_INTAKE_PATH}`, { method });
        expect(response.status, method).toBe(405);
        expect(response.headers.get('allow')).toBe('POST');
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    });
  });

  it('applies the Link-specific body limit before envelope cryptography', async () => {
    await withListener(async (baseUrl) => {
      const response = await fetch(`${baseUrl}${PICO_LINK_INTAKE_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'pico.link.direct.request.v1',
          sealedRequestHex: 'a'.repeat(MAX_PICO_LINK_DIRECT_REQUEST_BODY_BYTES),
        }),
      });

      expect(response.status).toBe(413);
      expect(response.headers.get('cache-control')).toBe('no-store');
    });
  });
});

async function withListener(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'pico-link-intake-'));
  const logDestination = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: join(directory, 'pico.sqlite'),
    deviceId: 'link-intake-test',
    logDestination,
  });
  const listener = await startPicoLinkIntakeListener(app, {
    host: '127.0.0.1',
    port: 0,
  });

  try {
    await run(`http://127.0.0.1:${listener.port}`);
  } finally {
    await listener.close();
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
