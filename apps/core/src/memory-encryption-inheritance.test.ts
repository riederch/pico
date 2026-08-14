import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';

/**
 * ADR 0104 S3's second half - the day the add-on option is gone.
 *
 * S3 moved the decision into Pico and left the host option as an inheritance
 * source for instances that had not yet booted under the new schema. The
 * retirement then rested on a release ordering nobody can enforce: ship the
 * schema first, remove the option in the release after, and hope that every
 * instance passes through the release where both exist.
 *
 * **An instance that upgrades late passes through nothing.** It arrives on a
 * release with no option, the Supervisor strips the value, and the variable is
 * absent - so what matters is what "absent" is read as. Read as `false`, a
 * Home with encrypted memories is told it has none of the machinery to read
 * them, and every item comes back `crypto_unavailable` for no reason anybody
 * chose.
 *
 * So absent is not false anywhere on this path: the parser omits the field
 * (ADR 0117 X1's construction), and the boot asks the content instead. What an
 * instance *has* is a better witness than what it was started with.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface AppWithInject {
  inject(request: {
    method: string;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ statusCode: number; json(): unknown }>;
  close(): Promise<void>;
}

function databasePath(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return join(dir, 'pico.sqlite');
}

async function boot(input: {
  databasePath: string;
  memoryEncryption?: boolean;
}): Promise<{ app: AppWithInject; operator: string }> {
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: input.databasePath,
    deviceId: 'pico-core',
    ...(input.memoryEncryption === undefined ? {} : { memoryEncryption: input.memoryEncryption }),
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  }) as unknown as AppWithInject;
  apps.push(app);

  const bootstrapCode = logLines
    .map((line) => JSON.parse(line) as { operatorBootstrapCode?: string })
    .find((line) => typeof line.operatorBootstrapCode === 'string')?.operatorBootstrapCode;
  if (bootstrapCode !== undefined) {
    await app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: { bootstrapCode, passphrase: 'memory encryption inheritance' },
    });
  }
  const session = (await app.inject({
    method: 'POST',
    url: '/api/auth/session',
    payload: { passphrase: 'memory encryption inheritance' },
  })).json() as { session: string };

  return { app, operator: `Bearer ${session.session}` };
}

async function record(
  app: AppWithInject,
  authorization: string,
  content: string,
): Promise<string> {
  const recorded = await app.inject({
    method: 'POST',
    url: '/api/events',
    headers: { authorization },
    payload: {
      deviceId: 'desktop-dev',
      type: 'memory.recorded',
      payload: {
        privacyDomain: 'domain-private',
        contentType: 'text/plain',
        content,
        summary: 'a note',
      },
    },
  });
  expect(recorded.statusCode).toBe(201);
  return (recorded.json() as { event: { payload: { memoryItemId: string } } })
    .event.payload.memoryItemId;
}

function postureOf(path: string, memoryItemId: string): string {
  const raw = new Database(path, { readonly: true });
  const row = raw
    .prepare('SELECT content_posture AS posture FROM memory_item WHERE memory_item_id = ?')
    .get(memoryItemId) as { posture: string };
  raw.close();
  return row.posture;
}

describe('ADR 0104 S3 - the store knows what it holds', () => {
  it('says nothing is encrypted in a store that has never encrypted anything', async () => {
    const store = await EventStore.open(databasePath('pico-encryption-empty-'), {});
    try {
      expect(store.holdsEncryptedMemoryContent()).toBe(false);
    } finally {
      store.close();
    }
  });

  it('sees content that only a key can read', async () => {
    const path = databasePath('pico-encryption-seen-');
    const { app, operator } = await boot({ databasePath: path, memoryEncryption: true });
    await record(app, operator, 'A private secret.');
    await app.close();
    apps.splice(apps.indexOf(app), 1);

    const store = await EventStore.open(path, {});
    try {
      // Not an opinion about a setting: a row that needs a key store to be
      // readable at all.
      expect(store.holdsEncryptedMemoryContent()).toBe(true);
    } finally {
      store.close();
    }
  });
});

describe('ADR 0104 S3 - an instance whose option is already gone', () => {
  it('keeps reading its own memories when the variable arrives absent', async () => {
    // The upgrade this exists for: a Home that ran with encryption on, on a
    // release where the option no longer exists. Nothing was passed, so its
    // own content answers - and the alternative is every memory coming back
    // as crypto_unavailable.
    const path = databasePath('pico-encryption-late-');
    const first = await boot({ databasePath: path, memoryEncryption: true });
    await record(first.app, first.operator, 'A private secret.');
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);

    const second = await boot({ databasePath: path });
    expect(((await second.app.inject({
      method: 'GET',
      url: '/api/memory/encryption',
      headers: { authorization: second.operator },
    })).json() as { enabled: boolean }).enabled).toBe(true);

    // And it is a working key store rather than a flag: what this boot writes
    // is encrypted too.
    expect(postureOf(path, await record(second.app, second.operator, 'Another private secret.')))
      .toBe('domain_encrypted');
  });

  it('stays off for a Home that never encrypted anything', async () => {
    // Absent means unknown, and the store is what resolves it. A Home with
    // plaintext foundation content has nothing that needs a key.
    const path = databasePath('pico-encryption-fresh-');
    const { app, operator } = await boot({ databasePath: path });
    expect(((await app.inject({
      method: 'GET',
      url: '/api/memory/encryption',
      headers: { authorization: operator },
    })).json() as { enabled: boolean }).enabled).toBe(false);
    expect(postureOf(path, await record(app, operator, 'An ordinary note.')))
      .toBe('plaintext_foundation');
  });

  it('still lets a deployment that says off be off', async () => {
    // A variable that is *there* decides, in both directions. This is the
    // Docker deployment that sets it explicitly, and inheriting anything else
    // would be Pico overruling a host that did answer.
    const path = databasePath('pico-encryption-explicit-off-');
    const first = await boot({ databasePath: path, memoryEncryption: true });
    await record(first.app, first.operator, 'A private secret.');
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);

    const second = await boot({ databasePath: path, memoryEncryption: false });
    expect(((await second.app.inject({
      method: 'GET',
      url: '/api/memory/encryption',
      headers: { authorization: second.operator },
    })).json() as { enabled: boolean }).enabled).toBe(false);
  });

  it('leaves a decided answer alone, whatever the content says', async () => {
    // The decision outranks both. A person who turned encryption off in Pico
    // has answered, and content that predates the answer is not a second vote.
    const path = databasePath('pico-encryption-decided-');
    const first = await boot({ databasePath: path, memoryEncryption: true });
    await record(first.app, first.operator, 'A private secret.');
    await first.app.close();
    apps.splice(apps.indexOf(first.app), 1);

    const store = await EventStore.open(path, {});
    store.decidePicoMemoryEncryption({
      enabled: false,
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: false,
    });
    store.close();

    const second = await boot({ databasePath: path });
    expect((await second.app.inject({
      method: 'GET',
      url: '/api/memory/encryption',
      headers: { authorization: second.operator },
    })).json()).toMatchObject({ enabled: false, decided: true });
  });
});
