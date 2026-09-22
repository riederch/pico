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
        expect(refused.status, method).toBe(404);
        expect(refused.headers.get('allow')).toBeNull();
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
        expect(response.status, method).toBe(404);
        expect(response.headers.get('allow')).toBeNull();
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
   * Dieser Eingang entschied es bis zum 2026-09-22 andersherum, und das stand
   * in keinem ADR, sondern nur in den Tests darueber: eine einzige Anfrage je
   * Pfad trennte die zwei bedienten Ziele von allem anderen, und `allow`
   * nannte sogar die Methode dazu.
   *
   * **Nutzerentscheidung 19 hat es zusammengelegt.** Jetzt gilt hier dasselbe
   * Argument wie im Relay, und diese Tests halten es: eine unbekannte Adresse
   * und ein bedienter Pfad mit falscher Methode sind von aussen nicht mehr zu
   * unterscheiden - nicht im Status, nicht im Rumpf und nicht in den
   * Kopfzeilen.
   */
  it('tells a stranger nothing about which two paths it serves', async () => {
    /**
     * Befund B224, entschieden am 2026-09-22 (Nutzerentscheidung 19). Vorher
     * stand hier das Gegenteil: verschiedener Status, verschiedener Rumpf und
     * eine `allow`-Kopfzeile, die es aussprach. Eine Anfrage je Pfad trennte
     * damit die zwei echten Ziele von allem anderen - auf einem Port, den ein
     * Fremder erreicht.
     *
     * Das Relay legt beides zusammen und ADR 0149 sagt warum; jetzt gilt hier
     * dasselbe Argument. Gemessen wird die Ununterscheidbarkeit, nicht nur der
     * Status: Rumpf und Kopfzeilen muessen ebenfalls gleich sein, sonst ist
     * die Fläche über einen anderen Kanal wieder lesbar.
     */
    await withListener(async (baseUrl) => {
      const unknown = await fetch(`${baseUrl}/nothing-here`, { method: 'GET' });
      const served = await fetch(`${baseUrl}${PICO_LINK_INTAKE_PATH}`, { method: 'GET' });

      expect(unknown.status).toBe(404);
      expect(served.status).toBe(404);
      expect(await served.json()).toEqual(await unknown.json());
      expect(served.headers.get('allow')).toBeNull();
      expect(unknown.headers.get('allow')).toBeNull();
      expect(served.headers.get('content-type')).toBe(unknown.headers.get('content-type'));
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
