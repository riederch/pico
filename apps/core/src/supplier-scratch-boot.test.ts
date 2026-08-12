import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { PicoSupplierScratch } from './supplier-scratch.js';

/**
 * ADR 0143 DP8. What a start does to supplier scratch areas.
 *
 * The scratch class landed on 2026-08-11 and nothing in the product
 * constructed it, so "removed when the attachment is removed" was a property
 * of a class rather than of a running Pico. These tests are the difference.
 */
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-scratch-boot-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

const attachedIdentifier = 'kept-library';
const detachedIdentifier = 'dropped-library';

function materialise(scratch: PicoSupplierScratch, identifier: string): string {
  const path = scratch.ensure(identifier);
  writeFileSync(join(path, 'chunk-0001.bin'), 'partial\n');
  return path;
}

async function boot(databasePath: string, supplierScratchRoot?: string) {
  return await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    ...(supplierScratchRoot === undefined ? {} : { supplierScratchRoot }),
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  });
}

function attachSupplier(databasePath: string, identifier: string): void {
  const store = new EventStore(databasePath);
  store.attachPicoSupplier({
    manifest: {
      identifier,
      kind: 'library' as const,
      slots: ['memory_item' as const],
      coverage: ['knowledge_base'],
      privacyDomain: 'domain_private',
    },
    attachedAt: new Date().toISOString(),
  });
  store.close();
}

describe('ADR 0143 DP8 supplier scratch at boot', () => {
  it('keeps a scratch area its attachment still stands behind', async () => {
    // Orphans only, not an empty sweep. The ADR removes a scratch area when
    // the attachment is removed, which is a different sentence from
    // discarding it at every start - a supplier that unpacked and indexed a
    // large corpus would otherwise pay for that again on every restart.
    const databasePath = createDatabasePath();
    attachSupplier(databasePath, attachedIdentifier);

    const scratch = new PicoSupplierScratch(
      PicoSupplierScratch.defaultRoot(databasePath),
    );
    const kept = materialise(scratch, attachedIdentifier);
    const dropped = materialise(scratch, detachedIdentifier);

    const app = await boot(databasePath);
    try {
      expect(existsSync(kept)).toBe(true);
      expect(existsSync(dropped)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('defaults beside the database, so a start finds what a run wrote', async () => {
    const databasePath = createDatabasePath();
    const scratch = new PicoSupplierScratch(join(dirname(databasePath), 'scratch'));
    const orphan = materialise(scratch, detachedIdentifier);

    const app = await boot(databasePath);
    try {
      expect(existsSync(orphan)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('honours a configured root and leaves the default one alone', async () => {
    const databasePath = createDatabasePath();
    const elsewhere = join(dirname(databasePath), 'scratch-elsewhere');
    const configured = new PicoSupplierScratch(elsewhere);
    const beside = new PicoSupplierScratch(
      PicoSupplierScratch.defaultRoot(databasePath),
    );
    const orphanElsewhere = materialise(configured, detachedIdentifier);
    const untouchedBeside = materialise(beside, detachedIdentifier);

    const app = await boot(databasePath, elsewhere);
    try {
      expect(existsSync(orphanElsewhere)).toBe(false);
      expect(existsSync(untouchedBeside)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('starts cleanly with no scratch root, and does not create one', async () => {
    const databasePath = createDatabasePath();
    const root = PicoSupplierScratch.defaultRoot(databasePath);

    const app = await boot(databasePath);
    try {
      expect(existsSync(root)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('keeps the depot root and the scratch root apart', async () => {
    // Two reconciliations over one directory would have each removing what
    // the other put there, and the symptom would be intermittent.
    const databasePath = createDatabasePath();
    expect(PicoSupplierScratch.defaultRoot(databasePath))
      .not.toBe(join(dirname(databasePath), 'depots'));
  });
});
