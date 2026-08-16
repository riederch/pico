import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultPicoRelayHealthHost,
  defaultPicoRelayHealthPort,
  defaultPicoRelayPort,
  loadPicoRelayConfig,
} from './config.js';
import { startPicoRelayHealthListener } from './health.js';
import { startPicoRelayServer } from './server.js';
import { PicoRelayStore } from './store.js';
import { picoLinkRelayRoutes } from '@pico/protocol/link-relay-surface';

/**
 * ADR 0153 PK2/PK3. The difference between a server and a deliverable.
 *
 * Everything the relay does was already tested. What was untested is the part
 * that decides whether anybody can run it: what it needs to be told, what it
 * refuses to guess, and how an operator finds out it is alive without the
 * public port growing a sixth route.
 */
const dirs: string[] = [];
const closers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) {
    await close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function store(): PicoRelayStore {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-deliverable-'));
  dirs.push(dir);
  const opened = new PicoRelayStore(join(dir, 'relay.sqlite'), 'relay.example');
  closers.push(() => opened.close());
  return opened;
}

describe('ADR 0153 PK2 - what a relay refuses to guess', () => {
  it('will not start without the operator it answers as', () => {
    // The hostname senders resolve to reach this machine (ADR 0147 RY3). A
    // relay that guessed it would hand out addresses pointing somewhere else
    // and then refuse every packet delivered to it - a configuration fault
    // wearing the shape of a network one.
    expect(() => loadPicoRelayConfig({})).toThrow('PICO_RELAY_OPERATOR is required');
    expect(() => loadPicoRelayConfig({ PICO_RELAY_OPERATOR: '   ' }))
      .toThrow('PICO_RELAY_OPERATOR is required');
  });

  it('refuses an operator that is not a hostname', () => {
    expect(() => loadPicoRelayConfig({ PICO_RELAY_OPERATOR: 'not a host' }))
      .toThrow('not a valid operator hostname');
  });

  it('defaults the ports and the data path, because being wrong there is visible', () => {
    const config = loadPicoRelayConfig({ PICO_RELAY_OPERATOR: 'relay.example' });
    expect(config.port).toBe(defaultPicoRelayPort);
    expect(config.healthPort).toBe(defaultPicoRelayHealthPort);
    expect(config.healthHost).toBe(defaultPicoRelayHealthHost);
    expect(config.databasePath).toBe('/data/relay.sqlite');
  });

  it('refuses port 0, which means "any free port" and never means a relay', () => {
    // Right for a test, never right for a machine other machines have to find.
    expect(() => loadPicoRelayConfig({ PICO_RELAY_OPERATOR: 'relay.example', PICO_RELAY_PORT: '0' }))
      .toThrow('must be a port number');
  });

  it('refuses to put the health signal back on the public port', () => {
    // PK3 is that these are two listeners. One port for both would undo it
    // through configuration rather than through code - and pass every test.
    expect(() => loadPicoRelayConfig({
      PICO_RELAY_OPERATOR: 'relay.example',
      PICO_RELAY_PORT: '3200',
      PICO_RELAY_HEALTH_PORT: '3200',
    })).toThrow('must differ from PICO_RELAY_PORT');
  });
});

describe('ADR 0153 PK3 - the health signal, and where it is not', () => {
  it('answers on its own listener and asks the store rather than the event loop', async () => {
    const opened = store();
    const health = await startPicoRelayHealthListener({
      store: opened,
      host: '127.0.0.1',
      port: 0,
    });
    closers.push(() => health.close());

    const answer = await fetch(`http://127.0.0.1:${health.port}/health`);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ status: 'ok' });
  });

  it('says unavailable when the store cannot answer', async () => {
    // A store-and-forward whose disk has gone is still a running process, and
    // that is the failure nobody sees until the packets were needed.
    const opened = store();
    const health = await startPicoRelayHealthListener({
      store: opened,
      host: '127.0.0.1',
      port: 0,
    });
    closers.push(() => health.close());
    opened.close();

    const answer = await fetch(`http://127.0.0.1:${health.port}/health`);
    expect(answer.status).toBe(503);
    expect(await answer.json()).toEqual({ status: 'unavailable' });
  });

  it('tells the health reader nothing about the relay\'s customers', async () => {
    const opened = store();
    opened.createAccount({ credential: 'a'.repeat(32), mailboxQuota: 4, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
    const health = await startPicoRelayHealthListener({
      store: opened,
      host: '127.0.0.1',
      port: 0,
    });
    closers.push(() => health.close());

    const body = await (await fetch(`http://127.0.0.1:${health.port}/health`)).text();
    // Whether, never how much. ADR 0031's prohibition list does not stop
    // applying because the port is on loopback.
    expect(body).toBe(JSON.stringify({ status: 'ok' }));
  });

  it('offers nothing but /health, and nothing on the wrong method', async () => {
    const opened = store();
    const health = await startPicoRelayHealthListener({
      store: opened,
      host: '127.0.0.1',
      port: 0,
    });
    closers.push(() => health.close());

    expect((await fetch(`http://127.0.0.1:${health.port}/`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${health.port}/relay/collect`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${health.port}/health`, { method: 'POST' })).status)
      .toBe(404);
  });

  it('keeps the public port free of a health route', async () => {
    // The reason the listener above exists. ADR 0149 made an unknown route and
    // a wrong method answer identically, so the surface carries no map of
    // itself; a `/health` that answered differently would be a map with one
    // entry, and the entry says "a Pico relay lives here".
    const opened = store();
    const server = await startPicoRelayServer({ store: opened, host: '127.0.0.1', port: 0 });
    closers.push(() => server.close());

    const unknown = await fetch(`http://127.0.0.1:${server.port}/nothing-here`);
    const healthOnPublic = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(healthOnPublic.status).toBe(unknown.status);
    expect(await healthOnPublic.text()).toBe(await unknown.text());

    // And a route that does exist still answers as itself, so the comparison
    // above is not just "everything 404s".
    const known = await fetch(`http://127.0.0.1:${server.port}${picoLinkRelayRoutes.collect}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(known.status).not.toBe(unknown.status);
  });
});

describe('ADR 0153 PK7 - a relay ships with no accounts', () => {
  it('knows whether anybody may register at all', () => {
    const opened = store();
    expect(opened.hasAccounts()).toBe(false);
    opened.createAccount({ credential: 'b'.repeat(32), mailboxQuota: 2, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
    expect(opened.hasAccounts()).toBe(true);
  });

  it('refuses registration until an account exists', () => {
    // The honest state of an unprovisioned machine, and indistinguishable at
    // the door from a wrong credential - which is why the boot log says it.
    const opened = store();
    expect(opened.register({
      accountId: 'c'.repeat(32),
      mailbox: '0'.repeat(32),
      capacity: 8,
      registeredAt: '2026-08-16T12:00:00.000Z',
    })).toEqual({ ok: false, refusal: 'unknown_account' });
  });
});
