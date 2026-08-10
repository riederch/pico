import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { PicoSystemStatusResponse } from '@pico/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';

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
        .toEqual(['calendar:true', 'home-assistant:true', 'spatial-recall:true']);
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

describe('ADR 0127 M4 deactivation is loud where promises stand', () => {
  async function recordEntry(
    app: Awaited<ReturnType<typeof openApp>>,
    session: string,
    content: string,
    dueAt: string,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { authorization: `Bearer ${session}` },
      payload: {
        deviceId: 'desktop-dev',
        type: 'memory.recorded',
        payload: {
          privacyDomain: 'domain-private',
          contentType: 'application/vnd.pico.reminder',
          content,
          dueAt,
        },
      },
    });
    expect(response.statusCode).toBe(201);
    return (response.json().event.payload as { memoryItemId: string }).memoryItemId;
  }

  it('names what will not happen, and names the commitments rather than the module', async () => {
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      const later = await recordEntry(app, session, 'Call the dentist', '2026-09-02T09:00:00.000Z');
      const oldest = await recordEntry(app, session, 'Collect the parcel', '2026-08-30T09:00:00.000Z');

      const response = await setModuleActive(app, session, 'calendar', false);
      expect(response.statusCode).toBe(200);

      const dropped = response.json().dropped as Array<{
        module: string;
        total: number;
        shown: Array<{ kind: string; dueAt: string; reference: string }>;
      }>;
      expect(dropped).toHaveLength(1);
      expect(dropped[0]?.module).toBe('calendar');
      expect(dropped[0]?.total).toBe(2);
      // The commitments, oldest first - not "the calendar has two things".
      expect(dropped[0]?.shown.map((item) => item.reference)).toEqual([oldest, later]);
      expect(dropped[0]?.shown[0]?.kind).toBe('calendar.time_bound_entry');
      expect(dropped[0]?.shown[0]?.dueAt).toBe('2026-08-30T09:00:00.000Z');
    } finally {
      await app.close();
    }
  });

  it('does not leak the words to an administrator who may not read them', async () => {
    // ADR 0075 A7: administration is not readership. Switching a module off is
    // an instance-management act; it does not entitle anyone to its content.
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      await recordEntry(app, session, 'Oncology appointment', '2026-09-02T09:00:00.000Z');

      const response = await setModuleActive(app, session, 'calendar', false);
      expect(response.body).not.toContain('Oncology');
      expect(response.body).not.toContain('appointment');
    } finally {
      await app.close();
    }
  });

  it('says nothing when nothing is outstanding', async () => {
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      const response = await setModuleActive(app, session, 'spatial-recall', false);
      expect(response.statusCode).toBe(200);
      expect(response.json().dropped).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('does not gate the stop on the statement', async () => {
    // ADR 0128: deactivation must stay immediate - stopping the world changing
    // is sometimes the point - so this is told, never asked. One call, no
    // confirmation field, and the module is off when it returns.
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      await recordEntry(app, session, 'Call the dentist', '2026-09-02T09:00:00.000Z');

      const response = await setModuleActive(app, session, 'calendar', false);
      expect(response.statusCode).toBe(200);
      expect((response.json().dropped as unknown[]).length).toBe(1);
      // Off already, on the same call that reported what it dropped.
      expect((await readModules(app, session)).modules
        .find((entry) => entry.identifier === 'calendar')?.active).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('drops nothing when a raised entry is all there is', async () => {
    const databasePath = createDatabasePath();
    const app = await openApp(databasePath);
    try {
      const session = await hostAdminSession(app);
      const memoryItemId = await recordEntry(app, session, 'Call the dentist', '2026-09-02T09:00:00.000Z');
      // Raised means kept. Reporting it would tell someone they are losing
      // something they already have.
      //
      // Marked through a second handle on the same file rather than through an
      // API, because nothing starts the scheduler in the product yet - a gap
      // recorded in progress.md, and not one this test should paper over by
      // pretending a route exists.
      const marker = new EventStore(databasePath);
      try {
        expect(marker.markPicoTimeBoundEntryRaised({
          memoryItemId,
          raisedAt: '2026-09-02T09:00:01.000Z',
        })).toBe(true);
      } finally {
        marker.close();
      }

      const response = await setModuleActive(app, session, 'calendar', false);
      expect(response.json().dropped).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('reports nothing dropped when a module is switched on', async () => {
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      await recordEntry(app, session, 'Call the dentist', '2026-09-02T09:00:00.000Z');
      await setModuleActive(app, session, 'calendar', false);
      const response = await setModuleActive(app, session, 'calendar', true);
      expect(response.json().dropped).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

describe('ADR 0118 O1 delivery semantics, end to end', () => {
  async function recordDue(
    app: Awaited<ReturnType<typeof openApp>>,
    session: string,
    dueAt: string,
  ): Promise<string> {
    const response = await app.inject({
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
          dueAt,
        },
      },
    });
    expect(response.statusCode).toBe(201);
    return (response.json().event.payload as { memoryItemId: string }).memoryItemId;
  }

  it('records that an entry came due, and does not claim anybody was told', async () => {
    const databasePath = createDatabasePath();
    const app = await openApp(databasePath);
    try {
      const session = await hostAdminSession(app);
      // Already past, so the scheduler has work the moment it is asked.
      const memoryItemId = await recordDue(app, session, '2020-01-01T09:00:00.000Z');

      // The scheduler runs on its own timer; a direct tick is the same code
      // path without waiting for a clock.
      const marker = new EventStore(databasePath);
      let announced = false;
      try {
        announced = marker.markPicoTimeBoundEntryAnnounced({
          memoryItemId,
          announcedAt: '2020-01-01T09:00:01.000Z',
        });
      } finally {
        marker.close();
      }
      expect(announced).toBe(true);

      // The promise is still outstanding, because nobody has said they told
      // the person. Starting the scheduler must not empty what the device is
      // offered - that was the reason this could not simply be switched on.
      const due = await app.inject({
        method: 'GET',
        url: '/api/events?limit=50',
        headers: { authorization: `Bearer ${session}` },
      });
      expect(due.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('clears an entry only when a surface acknowledges it', async () => {
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      const memoryItemId = await recordDue(app, session, '2020-01-01T09:00:00.000Z');

      const acknowledge = async () => app.inject({
        method: 'POST',
        url: `/api/memory/time-bound-entries/${memoryItemId}/acknowledge`,
        headers: { authorization: `Bearer ${session}` },
      });

      const first = await acknowledge();
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ memoryItemId, acknowledged: true });

      // Idempotent, and a second one is not an error: a device that retried
      // after a dropped response should not have to reason about whether it
      // already succeeded.
      const second = await acknowledge();
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual({ memoryItemId, acknowledged: false });
    } finally {
      await app.close();
    }
  });

  it('refuses an unauthenticated acknowledgement', async () => {
    // Clearing someone's outstanding promise is a claim about their life.
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      const memoryItemId = await recordDue(app, session, '2020-01-01T09:00:00.000Z');
      expect((await app.inject({
        method: 'POST',
        url: `/api/memory/time-bound-entries/${memoryItemId}/acknowledge`,
      })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('ADR 0129 SR6 capture is a second decision, and it starts off', () => {
  it('is off for every module until somebody says otherwise', async () => {
    // The opposite default from activation, for the opposite reason: a Home
    // whose calendar was off would look broken; a Home that began writing
    // down its person's movements because they installed it would be wrong.
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      const view = await readModules(app, session);
      expect(view.modules.map((entry) => `${entry.identifier}:${entry.active}:${entry.capturing}`))
        .toEqual([
          'calendar:true:false',
          'home-assistant:true:false',
          'spatial-recall:true:false',
        ]);
    } finally {
      await app.close();
    }
  });

  it('turns capture on and off without touching activation', async () => {
    // The separation is the point: someone who stops recording for an
    // afternoon still wants to be told where they parked this morning.
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      const setCapture = (capturing: boolean) => app.inject({
        method: 'POST',
        url: '/api/home/modules/capture',
        headers: { authorization: `Bearer ${session}` },
        payload: { identifier: 'spatial-recall', capturing },
      });

      expect((await setCapture(true)).statusCode).toBe(200);
      let entry = (await readModules(app, session)).modules
        .find((row) => row.identifier === 'spatial-recall');
      expect(entry?.capturing).toBe(true);
      expect(entry?.active).toBe(true);

      expect((await setCapture(false)).statusCode).toBe(200);
      entry = (await readModules(app, session)).modules
        .find((row) => row.identifier === 'spatial-recall');
      expect(entry?.capturing).toBe(false);
      // Still on. "Stop recording" and "remove the feature" are different acts.
      expect(entry?.active).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('does not turn capture on when a module is switched on', async () => {
    // ADR 0127 M3 says it in words; this is the mechanism.
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      await setModuleActive(app, session, 'spatial-recall', false);
      await setModuleActive(app, session, 'spatial-recall', true);
      expect((await readModules(app, session)).modules
        .find((row) => row.identifier === 'spatial-recall')?.capturing).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('survives a restart, and records the change as a content-free event', async () => {
    const databasePath = createDatabasePath();
    const app = await openApp(databasePath);
    try {
      const session = await hostAdminSession(app);
      expect((await app.inject({
        method: 'POST',
        url: '/api/home/modules/capture',
        headers: { authorization: `Bearer ${session}` },
        payload: { identifier: 'spatial-recall', capturing: true },
      })).statusCode).toBe(200);

      const change = (await readEvents(app, session))
        .find((event) => event.type === 'home.module_capture_changed');
      expect(change?.payload).toEqual({ identifier: 'spatial-recall', capturing: true });
    } finally {
      await app.close();
    }

    const restarted = await openApp(databasePath);
    try {
      const session = await login(restarted);
      expect((await readModules(restarted, session)).modules
        .find((row) => row.identifier === 'spatial-recall')?.capturing).toBe(true);
    } finally {
      await restarted.close();
    }
  });

  it('refuses an unauthenticated change and a module nobody ships', async () => {
    const app = await openApp(createDatabasePath());
    try {
      const session = await hostAdminSession(app);
      expect((await app.inject({
        method: 'POST',
        url: '/api/home/modules/capture',
        payload: { identifier: 'spatial-recall', capturing: true },
      })).statusCode).toBe(401);
      expect((await app.inject({
        method: 'POST',
        url: '/api/home/modules/capture',
        headers: { authorization: `Bearer ${session}` },
        payload: { identifier: 'nonsense', capturing: true },
      })).statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

/**
 * ADR 0139 AC4. The consent record beside the activation decision.
 *
 * A module declares its own risk class because only it knows what its effects
 * do. Pinning name, description and risk at the moment a person agrees is what
 * stops that from being a privilege escalation an update can take.
 */
describe('ADR 0139 AC4 module effect consent', () => {
  const effect = (over: Partial<{ name: string; description: string; risk: string }> = {}) => ({
    name: 'calendar.raise-entry',
    description: 'Tells you an appointment is due.',
    risk: 'local_write' as const,
    ...over,
  });

  function openStore() {
    return new EventStore(createDatabasePath());
  }

  it('records what was consented to when a module is switched on', () => {
    const store = openStore();
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T10:00:00.000Z',
      changes: [{ identifier: 'calendar', active: true, effects: [effect()] as never }],
    });

    expect(store.picoModuleEffectConsent('calendar')).toEqual([effect()]);
    store.close();
  });

  it('sees no drift while the declaration matches what was agreed to', () => {
    const store = openStore();
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T10:00:00.000Z',
      changes: [{ identifier: 'calendar', active: true, effects: [effect()] as never }],
    });

    expect(store.picoModulesAwaitingConsent([
      { identifier: 'calendar', effects: [effect()] as never },
    ])).toEqual([]);
    store.close();
  });

  it('names a raised risk class instead of inheriting the answer', () => {
    // The escalation this exists for: declare local_write today, ship
    // destructive in an update, keep the consent a person already gave.
    const store = openStore();
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T10:00:00.000Z',
      changes: [{ identifier: 'calendar', active: true, effects: [effect()] as never }],
    });

    expect(store.picoModulesAwaitingConsent([
      { identifier: 'calendar', effects: [effect({ risk: 'destructive' })] as never },
    ])).toEqual([
      { identifier: 'calendar', drift: { added: [], removed: [], changed: ['calendar.raise-entry'] } },
    ]);
    store.close();
  });

  it('treats a rewritten description as a changed effect', () => {
    // It is the sentence a person read when they agreed, and ADR 0141 RN3
    // renders the consented one in the approval statement for that reason.
    const store = openStore();
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T10:00:00.000Z',
      changes: [{ identifier: 'calendar', active: true, effects: [effect()] as never }],
    });

    const awaiting = store.picoModulesAwaitingConsent([
      { identifier: 'calendar', effects: [effect({ description: 'Also tells other people.' })] as never },
    ]);
    expect(awaiting[0]?.drift.changed).toEqual(['calendar.raise-entry']);
    store.close();
  });

  it('keeps consent while a module is switched off, so re-enabling is not an interrogation', () => {
    // ADR 0127 M3: deactivation stops behaviour, never custody, and
    // re-enabling restores everything.
    const store = openStore();
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T10:00:00.000Z',
      changes: [{ identifier: 'calendar', active: true, effects: [effect()] as never }],
    });
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T11:00:00.000Z',
      changes: [{ identifier: 'calendar', active: false, effects: [] }],
    });

    expect(store.picoModuleEffectConsent('calendar')).toEqual([effect()]);
    store.close();
  });

  it('replaces the whole set on re-consent, so a withdrawn effect goes', () => {
    const store = openStore();
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T10:00:00.000Z',
      changes: [{
        identifier: 'calendar',
        active: true,
        effects: [effect(), effect({ name: 'calendar.gone' })] as never,
      }],
    });
    store.setPicoModuleActivation({
      decidedAt: '2026-08-10T12:00:00.000Z',
      changes: [{ identifier: 'calendar', active: true, effects: [effect()] as never }],
    });

    expect(store.picoModuleEffectConsent('calendar').map((e) => e.name))
      .toEqual(['calendar.raise-entry']);
    store.close();
  });

  it('reads a module nobody has activated as current rather than drifted', () => {
    // Nothing was lost; nothing has been asked yet. A module declaring no
    // effects - which every shipped module does today - is the same case.
    const store = openStore();
    expect(store.picoModulesAwaitingConsent([
      { identifier: 'calendar', effects: [] },
    ])).toEqual([]);
    store.close();
  });

  it('survives a restart, because consent is a durable decision', () => {
    const path = createDatabasePath();
    const first = new EventStore(path);
    first.setPicoModuleActivation({
      decidedAt: '2026-08-10T10:00:00.000Z',
      changes: [{ identifier: 'calendar', active: true, effects: [effect()] as never }],
    });
    first.close();

    const second = new EventStore(path);
    expect(second.picoModuleEffectConsent('calendar')).toEqual([effect()]);
    second.close();
  });
});
