import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { PicoDepotWorkspace } from './depot-workspace.js';
import { EventStore } from './event-store.js';

/**
 * ADR 0143 DP8. What a start does to depot working copies, against the real
 * boot path rather than against the class in isolation.
 *
 * The claim is ADR 0070's: the durable record decides and the filesystem is
 * brought to it. A unit test of `removeOrphans` proves the method; only a
 * booted app proves that a start actually calls it, which is the half that
 * would silently not happen.
 */
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-depot-boot-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

const attached = 'https://git.example.invalid/rch/attached.git';
const detached = 'https://git.example.invalid/rch/detached.git';
const commit = 'a'.repeat(40);

/** A working copy with a file in it, so removal is not vacuously true. */
function materialise(workspace: PicoDepotWorkspace, remote: string): string {
  const path = workspace.ensure(remote);
  writeFileSync(join(path, 'index.js'), 'export default 1;\n');
  return path;
}

async function boot(databasePath: string) {
  return await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  });
}

describe('ADR 0143 DP8 depot workspace at boot', () => {
  it('keeps what an attachment stands behind and removes what nothing does', async () => {
    const databasePath = createDatabasePath();
    const store = new EventStore(databasePath);
    store.attachPicoDepot({
      pin: { remote: attached, commit },
      acceptedAt: new Date().toISOString(),
    });
    store.close();

    const workspace = new PicoDepotWorkspace(
      PicoDepotWorkspace.defaultRoot(databasePath),
    );
    const keptPath = materialise(workspace, attached);
    const droppedPath = materialise(workspace, detached);

    const app = await boot(databasePath);
    try {
      expect(existsSync(keptPath)).toBe(true);
      expect(existsSync(droppedPath)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('defaults the root beside the database, so a start finds what a fetch wrote', async () => {
    // Two spellings of the same path would be the whole feature silently not
    // working: one place writes, another reconciles, and neither is wrong.
    const databasePath = createDatabasePath();
    const workspace = new PicoDepotWorkspace(
      join(dirname(databasePath), 'depots'),
    );
    const orphan = materialise(workspace, detached);

    const app = await boot(databasePath);
    try {
      expect(existsSync(orphan)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('honours a configured root instead of the default', async () => {
    const databasePath = createDatabasePath();
    const elsewhere = join(dirname(databasePath), 'somewhere-else');
    const configured = new PicoDepotWorkspace(elsewhere);
    const beside = new PicoDepotWorkspace(
      PicoDepotWorkspace.defaultRoot(databasePath),
    );
    const orphanElsewhere = materialise(configured, detached);
    const untouchedBeside = materialise(beside, detached);

    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath,
      depotRoot: elsewhere,
      deviceId: 'pico-core',
      logDestination: new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      }),
    });
    try {
      expect(existsSync(orphanElsewhere)).toBe(false);
      // The default root is not swept when another one was configured, which
      // is what makes the setting a setting rather than an addition.
      expect(existsSync(untouchedBeside)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('starts cleanly when the root does not exist, and does not create one', async () => {
    // The ordinary case: no depot has ever been attached. A boot that made an
    // empty directory would leave every installation carrying a place for
    // something it does not use.
    const databasePath = createDatabasePath();
    const root = PicoDepotWorkspace.defaultRoot(databasePath);

    const app = await boot(databasePath);
    try {
      expect(existsSync(root)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('removes a directory no remote could hash to', async () => {
    const databasePath = createDatabasePath();
    const root = PicoDepotWorkspace.defaultRoot(databasePath);
    mkdirSync(join(root, 'hand-written'), { recursive: true });

    const app = await boot(databasePath);
    try {
      expect(existsSync(join(root, 'hand-written'))).toBe(false);
    } finally {
      await app.close();
    }
  });
});
