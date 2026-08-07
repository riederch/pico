import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { PicoSystemStatusResponse } from '@pico/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

/**
 * ADR 0127 M3. Activation is a durable Pico-side decision, and switching a
 * module off stops behaviour without touching what it recorded.
 */
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-module-activation-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

const OPERATOR_PASSPHRASE = 'a long enough operator passphrase';
const bootstrapCodes = new WeakMap<object, string[]>();

/**
 * An app whose host log is captured, because that is the only place the ADR
 * 0076 bootstrap code is surfaced - and reading it the way an operator does is
 * the point, rather than reaching past the ceremony through a back door.
 */
async function openApp(databasePath: string) {
  const lines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk));
        callback();
      },
    }),
  });
  bootstrapCodes.set(app, lines);
  return app;
}

/**
 * A host-admin session. Activation is a decision about the Home, so the route
 * carries `host-admin` and a caller without a session gets 401 - which is
 * asserted below rather than assumed.
 */
async function hostAdminSession(
  app: Awaited<ReturnType<typeof openApp>>,
): Promise<string> {
  const lines = bootstrapCodes.get(app) ?? [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as { operatorBootstrapCode?: unknown };
    if (typeof parsed.operatorBootstrapCode === 'string') {
      const bootstrapped = await app.inject({
        method: 'POST',
        url: '/api/auth/bootstrap',
        payload: { bootstrapCode: parsed.operatorBootstrapCode, passphrase: OPERATOR_PASSPHRASE },
      });
      expect(bootstrapped.statusCode).toBe(201);
      return bootstrapped.json().session as string;
    }
  }
  throw new Error('No operator bootstrap code was surfaced on the host log.');
}

async function setModuleActive(
  app: Awaited<ReturnType<typeof openApp>>,
  session: string,
  identifier: string,
  active: unknown,
) {
  return app.inject({
    method: 'POST',
    url: '/api/home/modules',
    headers: { authorization: `Bearer ${session}` },
    payload: active === undefined ? { identifier } : { identifier, active },
  });
}

/**
 * ADR 0076: once an operator exists, the diagnostic surface stops answering
 * unauthenticated callers. So reading the status needs a session too - which is
 * the product behaving correctly, not a detour around it.
 */
async function login(app: Awaited<ReturnType<typeof openApp>>): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/session',
    payload: { passphrase: OPERATOR_PASSPHRASE },
  });
  expect(response.statusCode).toBe(201);
  return response.json().session as string;
}

async function readEvents(app: Awaited<ReturnType<typeof openApp>>, session: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/events?limit=50',
    headers: { authorization: `Bearer ${session}` },
  });
  expect(response.statusCode).toBe(200);
  return response.json().events as Array<{ type: string; payload: Record<string, unknown> }>;
}

async function readModules(app: Awaited<ReturnType<typeof openApp>>, session?: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/system/status',
    ...(session === undefined ? {} : { headers: { authorization: `Bearer ${session}` } }),
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as PicoSystemStatusResponse).modules;
}

/** Store and log as bytes, the ADR 0119 Q3 instrument reused. */
function storeDigest(databasePath: string): string {
  const hash = createHash('sha256');
  for (const path of [databasePath, `${databasePath}-wal`]) {
    hash.update(path);
    hash.update(existsSync(path) ? readFileSync(path) : Buffer.alloc(0));
  }
  return hash.digest('hex');
}

describe('ADR 0127 M3 activation is readable and durable', () => {
  it('reports every shipped module in the system status, on by default', async () => {
    // A Home that has decided nothing is not a Home that switched everything
    // off, and a fresh install must not look broken.
    const app = await openApp(createDatabasePath());
    try {
      const view = await readModules(app);
      expect(view.modules.map((entry) => `${entry.identifier}:${entry.active}`))
        .toEqual(['calendar:true', 'spatial-recall:true']);
      // A capability missing on purpose must not present as one that is broken,
      // so the surface gets the kind and what the module can cause too.
      expect(view.modules[0]?.kind).toBe('product');
      expect(view.modules[0]?.effectBearing).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('survives a restart, because the decision is in the database and not in memory', async () => {
    const databasePath = createDatabasePath();
    const app = await openApp(databasePath);
    try {
      const session = await hostAdminSession(app);
      expect((await setModuleActive(app, session, 'calendar', false)).statusCode).toBe(200);
    } finally {
      await app.close();
    }

    const restarted = await openApp(databasePath);
    try {
      // A login, not a bootstrap: the operator already exists, and a second
      // bootstrap is exactly what ADR 0076 refuses.
      const view = await readModules(restarted, await login(restarted));
      expect(view.modules.find((entry) => entry.identifier === 'calendar')?.active).toBe(false);
      // Untouched modules keep the shipped default rather than being dragged
      // along by someone else's decision.
      expect(view.modules.find((entry) => entry.identifier === 'spatial-recall')?.active)
        .toBe(true);
    } finally {
      await restarted.close();
    }
  });

  it('records the change as a content-free event on the audit family', async () => {
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      await setModuleActive(app, session, 'calendar', false);
      const events = await readEvents(app, session);
      const change = events.find((event) => event.type === 'home.module_activation_changed');
      expect(change).toBeDefined();
      // Identifiers and a direction. Nothing about what the modules hold.
      expect(change?.payload).toEqual({ enabled: [], disabled: ['calendar'] });
    } finally {
      await app.close();
    }
  });

  it('appends nothing when the request changes nothing', async () => {
    // A log that filled with no-ops would bury the changes that mattered.
    const databasePath = createDatabasePath();
    const app = await openApp(databasePath);
    try {
      const session = await hostAdminSession(app);
      // Settle everything a healthy boot and the bootstrap itself write before
      // taking the baseline, or the digest would be measuring those.
      await readModules(app, session);
      const before = storeDigest(databasePath);
      const response = await setModuleActive(app, session, 'calendar', true);
      expect(response.statusCode).toBe(200);
      expect(storeDigest(databasePath)).toBe(before);
    } finally {
      await app.close();
    }
  });

  it('refuses a module nobody ships and a request without a direction', async () => {
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      for (const [identifier, active] of [
        ['nonsense', true],
        ['calendar', undefined],
        ['calendar', 'yes'],
      ] as Array<[string, unknown]>) {
        expect((await setModuleActive(app, session, identifier, active)).statusCode).toBe(400);
      }
    } finally {
      await app.close();
    }
  });
});

describe('ADR 0127 M3 the decision belongs to whoever administers the Home', () => {
  it('refuses an unauthenticated change', async () => {
    // ADR 0104: activation is a durable Pico-side decision, not a host
    // configuration option - which only means anything if the Pico surface
    // that carries it is authenticated.
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      expect((await app.inject({
        method: 'POST',
        url: '/api/home/modules',
        payload: { identifier: 'calendar', active: false },
      })).statusCode).toBe(401);
      expect((await readModules(app, session)).modules
        .find((entry) => entry.identifier === 'calendar')?.active).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe('ADR 0127 M3 deactivation stops behaviour and touches no stored data', () => {
  it('leaves a disabled module\'s items exactly where they were', async () => {
    const databasePath = createDatabasePath();
    const app = await openApp(databasePath);
    try {
      // A calendar entry, recorded while the module was on.
      const session = await hostAdminSession(app);
      const recorded = await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: `Bearer ${session}` },
        payload: {
          deviceId: 'desktop-dev',
          type: 'memory.recorded',
          payload: {
            privacyDomain: 'domain-private',
            contentType: 'application/vnd.pico.reminder',
            content: 'Call the dentist',
            dueAt: '2026-09-01T09:00:00.000Z',
          },
        },
      });
      expect(recorded.statusCode).toBe(201);
      const memoryItemId = (recorded.json().event.payload as { memoryItemId: string }).memoryItemId;

      expect((await setModuleActive(app, session, 'calendar', false)).statusCode).toBe(200);

      // Custody did not move. The item is still there, still readable, still
      // carrying its instant - retention, shredding and the Q5 ceilings keep
      // running over it. A module being off must never mean nobody is
      // responsible for what it recorded.
      const events = await readEvents(app, session);
      const entry = events.find((event) => event.payload.memoryItemId === memoryItemId);
      expect(entry?.type).toBe('memory.time_bound_entry_recorded');
      expect(entry?.payload.dueAt).toBe('2026-09-01T09:00:00.000Z');
    } finally {
      await app.close();
    }
  });

  it('switches back on without having lost anything', async () => {
    const databasePath = createDatabasePath();
    const app = await openApp(databasePath);
    try {
      const session = await hostAdminSession(app);
      await app.inject({
        method: 'POST',
        url: '/api/events',
        headers: { authorization: `Bearer ${session}` },
        payload: {
          deviceId: 'desktop-dev',
          type: 'memory.recorded',
          payload: {
            privacyDomain: 'domain-private',
            contentType: 'application/vnd.pico.reminder',
            content: 'Call the dentist',
            dueAt: '2026-09-01T09:00:00.000Z',
          },
        },
      });

      for (const active of [false, true]) {
        expect((await setModuleActive(app, session, 'calendar', active)).statusCode).toBe(200);
      }

      const view = await readModules(app, session);
      expect(view.modules.find((entry) => entry.identifier === 'calendar')?.active).toBe(true);
      // The entry is still an entry. Deactivation stopped behaviour, and
      // behaviour is the only thing it stopped.
      const events = await readEvents(app, session);
      expect(events.some((event) => event.type === 'memory.time_bound_entry_recorded')).toBe(true);
    } finally {
      await app.close();
    }
  });
});
