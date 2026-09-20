import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { MAX_PICO_LINK_DIRECT_REQUEST_BODY_BYTES } from './link-direct.js';
import {
  PICO_LINK_CONTINUITY_READ_PATH,
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

  it('forwards the unsealed continuity read as its second named target (ADR 0115 U4)', async () => {
    await withListener(async (baseUrl) => {
      // The fresh test Home is unfounded, so the route itself answers 409 -
      // which proves the request reached the real Foundation route through
      // this listener rather than being refused at the edge.
      const response = await fetch(`${baseUrl}${PICO_LINK_CONTINUITY_READ_PATH}`);
      expect(response.status).toBe(409);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        error: 'Pico Home continuity is not available before founding.',
      });

      for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
        const refused = await fetch(`${baseUrl}${PICO_LINK_CONTINUITY_READ_PATH}`, {
          method,
        });
        expect(refused.status, method).toBe(405);
        expect(refused.headers.get('allow')).toBe('GET');
        expect(refused.headers.get('cache-control')).toBe('no-store');
      }
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
        // The continuity read is deliberately parameterless: a query string
        // is a different target and never reaches routing (user decision,
        // ADR 0115 U4).
        { method: 'GET', path: `${PICO_LINK_CONTINUITY_READ_PATH}/` },
        { method: 'GET', path: `${PICO_LINK_CONTINUITY_READ_PATH}?from=abc` },
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

  /**
   * Was ein Fremder an diesem Port ueber dieses Home erfaehrt (Befund B224).
   *
   * Das Relay beantwortet auf seinem oeffentlichen Port eine unbekannte Route
   * **genau wie** eine falsche Methode, und ADR 0149 sagt warum: *„telling them
   * apart is a map of the relay's own surface"*. Die CI vergleicht die beiden
   * Antworten dort Byte fuer Byte.
   *
   * Dieser Eingang entscheidet es andersherum, und das steht in keinem ADR,
   * sondern nur in den beiden Tests darueber. Eine einzige Anfrage je Pfad
   * trennt die zwei bedienten Ziele von allem anderen, und `allow` nennt sogar
   * die Methode dazu.
   *
   * Dieser Test **beschreibt und billigt nicht** - dieselbe Form wie der
   * `connectionTimeout`-Test in `app.test.ts`. Solange niemand entschieden
   * hat, ob dieser Port so antworten soll, faellt hier jede Aenderung auf,
   * statt unbemerkt zu passieren.
   */
  it('tells a stranger which two paths it serves', async () => {
    await withListener(async (baseUrl) => {
      const unknown = await fetch(`${baseUrl}/nothing-here`, { method: 'GET' });
      const served = await fetch(`${baseUrl}${PICO_LINK_INTAKE_PATH}`, { method: 'GET' });

      // Verschiedener Status, verschiedener Rumpf, und eine Kopfzeile, die es
      // ausspricht: der Pfad existiert hier.
      expect(unknown.status).toBe(404);
      expect(served.status).toBe(405);
      expect(await unknown.json()).toEqual({ error: 'Not found.' });
      expect(await served.json()).toEqual({ error: 'Method not allowed.' });
      expect(unknown.headers.get('allow')).toBeNull();
      expect(served.headers.get('allow')).toBe('POST');
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
