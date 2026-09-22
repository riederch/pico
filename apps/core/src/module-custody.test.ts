import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoCalendarModuleManifest } from '@pico/module-calendar/manifest';
import { parsePicoModuleManifest, picoModuleIdentifiers } from '@pico/protocol/module';
import { LamportClock } from '@pico/sync';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shredDomainWithAudit } from './domain-shred.js';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { RetentionSweeper } from './retention-sweep.js';
import { createSqliteBackup, restoreSqliteBackup } from './sqlite-backup.js';

/**
 * ADR 0127 M1. A module owns no storage, so the core cannot tell its data apart
 * from anything else it holds.
 *
 * The gate asks for exactly one proof and it is a negative one: a module's data
 * is shredded, retained and restored by the core's existing paths **with no
 * module-specific handling**. "No module-specific handling" is not something a
 * comment can assert, so every test below runs a calendar entry and an ordinary
 * memory item through the same core path and requires the two outcomes to be
 * *identical*. If the core ever grew a branch for calendar data, the outcomes
 * would diverge and one of these would fail.
 *
 * This is the property that makes the ADR's exclusion worth having. A
 * module-private table would have to be added to the shred cascade, the backup
 * exclusions, the boot reconciliation, the ADR 0119 Q5 ceilings and the Q3
 * byte-identity proof - five places that can be forgotten, against zero for a
 * column on an item the core already covers.
 */
const tempDirs: string[] = [];
const stores: EventStore[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // Already closed by the test that opened it.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openEncryptedStore(prefix: string): {
  store: EventStore;
  databasePath: string;
  keyDirectory: string;
} {
  const dir = mkdtempSync(join(tmpdir(), `pico-module-custody-${prefix}-`));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const keyDirectory = join(dir, 'keys');
  const crypto = new MemoryContentCrypto(sodium, new KeyStore(keyDirectory));
  const store = new EventStore(databasePath, { memoryCrypto: crypto });
  stores.push(store);
  return { store, databasePath, keyDirectory };
}

/** An ordinary memory item: the control. */
function createPlainItem(store: EventStore, input: {
  memoryItemId: string;
  privacyDomain: string;
  retentionPolicyRef?: string;
  encrypted?: boolean;
}): void {
  store.memory().create({
    memoryItemId: input.memoryItemId,
    privacyDomain: input.privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: `note ${input.memoryItemId}`,
    ...(input.retentionPolicyRef === undefined
      ? {}
      : { retentionPolicyRef: input.retentionPolicyRef }),
    ...(input.encrypted === true ? { contentPosture: 'domain_encrypted' as const } : {}),
  });
}

/**
 * A calendar entry: the same item with a due instant on it.
 *
 * That is the whole difference, and it is the point. The calendar module adds
 * meaning to a core column; it does not add a place for the core to look.
 */
function createCalendarEntry(store: EventStore, input: {
  memoryItemId: string;
  privacyDomain: string;
  dueAt: string;
  retentionPolicyRef?: string;
  encrypted?: boolean;
}): void {
  store.memory().create({
    memoryItemId: input.memoryItemId,
    privacyDomain: input.privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'application/vnd.pico.reminder',
    content: `appointment ${input.memoryItemId}`,
    ...(input.retentionPolicyRef === undefined
      ? {}
      : { retentionPolicyRef: input.retentionPolicyRef }),
    ...(input.encrypted === true ? { contentPosture: 'domain_encrypted' as const } : {}),
  });
  expect(store.setPicoTimeBoundEntryDue({
    memoryItemId: input.memoryItemId,
    dueAt: input.dueAt,
  })).toBe(true);
}

describe('ADR 0127 M1 the calendar is declared where the core can read it', () => {
  it('is in the core\'s closed list and parses against the core\'s vocabulary', () => {
    // Listed, not discovered. A module the core has not been told about is not
    // a module, whatever its directory contains.
    expect([...picoModuleIdentifiers]).toContain(picoCalendarModuleManifest.identifier);
    expect(parsePicoModuleManifest(picoCalendarModuleManifest).identifier).toBe('calendar');
  });
});

describe('ADR 0127 M1 module data is shredded by the core, with no module handling', () => {
  it('destroys a calendar entry and an ordinary item identically', () => {
    const { store } = openEncryptedStore('shred');
    const factory = new EventFactory(new LamportClock(store.maxLamport()));

    createCalendarEntry(store, {
      memoryItemId: 'mem_entry',
      privacyDomain: 'domain-private',
      dueAt: '2026-08-10T09:00:00.000Z',
      encrypted: true,
    });
    createPlainItem(store, {
      memoryItemId: 'mem_note',
      privacyDomain: 'domain-private',
      encrypted: true,
    });
    createCalendarEntry(store, {
      memoryItemId: 'mem_other_domain_entry',
      privacyDomain: 'domain-work',
      dueAt: '2026-08-11T09:00:00.000Z',
      encrypted: true,
    });

    const memory = store.memory();
    const read = (memoryItemId: string, privacyDomain: string): string | undefined =>
      memory.getInDomain(memoryItemId, privacyDomain)?.content;
    expect(read('mem_entry', 'domain-private')).toBe('appointment mem_entry');
    expect(read('mem_note', 'domain-private')).toBe('note mem_note');

    shredDomainWithAudit(memory, ({ privacyDomain, removedKeyVersions }) => {
      store.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.domain_shredded',
        payload: { privacyDomain, removedKeyVersions },
      }));
    }, { privacyDomain: 'domain-private' });

    // Identical outcomes, asserted as identical rather than each on its own.
    // Two separate assertions could both pass while the core treated the two
    // kinds differently in some way neither happened to look at.
    const entryAfter = read('mem_entry', 'domain-private');
    const noteAfter = read('mem_note', 'domain-private');
    expect(entryAfter).toBe(noteAfter);
    expect(entryAfter).not.toBe('appointment mem_entry');

    // The shred is scoped to a domain, not to a kind. An entry in another
    // domain is untouched - which also shows the comparison above can fail.
    expect(read('mem_other_domain_entry', 'domain-work'))
      .toBe('appointment mem_other_domain_entry');
  });
});

describe('ADR 0127 M1 module data is retained by the core, with no module handling', () => {
  it('expires a calendar entry and an ordinary item on the same policy', () => {
    const { store } = openEncryptedStore('retention');
    const policies = store.retentionPolicies();
    policies.create({
      retentionPolicyId: 'short',
      displayName: 'Short',
      mode: 'delete_after_max_age',
      maxAgeDays: 1,
    });

    createCalendarEntry(store, {
      memoryItemId: 'mem_entry',
      privacyDomain: 'domain-private',
      dueAt: '2026-08-10T09:00:00.000Z',
      retentionPolicyRef: 'short',
    });
    createPlainItem(store, {
      memoryItemId: 'mem_note',
      privacyDomain: 'domain-private',
      retentionPolicyRef: 'short',
    });
    createCalendarEntry(store, {
      memoryItemId: 'mem_kept_entry',
      privacyDomain: 'domain-private',
      dueAt: '2026-08-12T09:00:00.000Z',
    });

    const tombstoned: string[] = [];
    const sweeper = new RetentionSweeper(
      store.memory(),
      policies,
      ({ memoryItemId }) => {
        tombstoned.push(memoryItemId);
      },
      // Far enough past the one-day policy that both items are equally expired.
      { now: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000) },
    );

    const result = sweeper.sweep();

    expect([...tombstoned].sort()).toEqual(['mem_entry', 'mem_note']);
    expect(result.expired).toBe(2);
    // No policy, no expiry - for a calendar entry exactly as for anything else.
    expect(tombstoned).not.toContain('mem_kept_entry');
    expect(store.memory().getInDomain('mem_kept_entry', 'domain-private')?.content)
      .toBe('appointment mem_kept_entry');
  });
});

describe('ADR 0127 M1 module data is restored by the core, with no module handling', () => {
  it('brings a calendar entry back with its due instant and its raised state', async () => {
    const { store, databasePath, keyDirectory } = openEncryptedStore('restore');
    const backupDirectory = join(dirnameOf(databasePath), 'backups');

    createCalendarEntry(store, {
      memoryItemId: 'mem_entry',
      privacyDomain: 'domain-private',
      dueAt: '2026-08-10T09:00:00.000Z',
    });
    createCalendarEntry(store, {
      memoryItemId: 'mem_raised',
      privacyDomain: 'domain-private',
      dueAt: '2026-08-01T09:00:00.000Z',
    });
    expect(store.markPicoTimeBoundEntryRaised({
      memoryItemId: 'mem_raised',
      raisedAt: '2026-08-01T09:00:01.000Z',
    })).toBe(true);
    createPlainItem(store, { memoryItemId: 'mem_note', privacyDomain: 'domain-private' });

    const backup = await createSqliteBackup(databasePath, backupDirectory);

    // Everything after the backup is what a restore is supposed to undo.
    createCalendarEntry(store, {
      memoryItemId: 'mem_after_backup',
      privacyDomain: 'domain-private',
      dueAt: '2026-08-20T09:00:00.000Z',
    });
    createPlainItem(store, { memoryItemId: 'mem_note_after', privacyDomain: 'domain-private' });
    store.close();

    restoreSqliteBackup(backup.backupPath, databasePath, { overwrite: true });

    /**
     * Mit demselben Schluesselordner, denn der lag neben der Datenbank und
     * wurde nie angefasst. Seit Befund B254 schreibt ein Store mit Krypto
     * verschluesselt, also ist ein Wiederherstellen *ohne* Schluessel ein
     * anderer Fall als der, den dieser Test stellt - er fragt, ob Moduldaten
     * die Sicherung des Kerns mitfahren, nicht ob sie einen Schluesselverlust
     * ueberleben.
     */
    const restored = new EventStore(databasePath, {
      memoryCrypto: new MemoryContentCrypto(sodium, new KeyStore(keyDirectory)),
    });
    stores.push(restored);
    const entries = restored.picoTimeBoundEntries();
    const byId = new Map(entries.map((entry) => [entry.memoryItemId, entry]));

    // The due instant and the raised mark are core columns, so they ride the
    // core's backup. Nothing here knows the word "calendar".
    expect(byId.get('mem_entry')?.dueAt).toBe('2026-08-10T09:00:00.000Z');
    // Read through the memory store rather than the entry list: that list is
    // the scheduler's working set and deliberately excludes what has already
    // been raised. A promise that was kept still has to survive a restore, or
    // a restore would make it look unkept.
    expect(restored.memory().raisedAt('mem_raised')).toBe('2026-08-01T09:00:01.000Z');
    expect(byId.has('mem_raised')).toBe(false);

    // Identical treatment again: the entry written after the backup is gone
    // exactly as the ordinary item written after it is.
    expect(byId.has('mem_after_backup')).toBe(false);
    const restoredMemory = restored.memory();
    expect(restoredMemory.getInDomain('mem_after_backup', 'domain-private')).toBeUndefined();
    expect(restoredMemory.getInDomain('mem_note_after', 'domain-private')).toBeUndefined();
    expect(restoredMemory.getInDomain('mem_note', 'domain-private')?.content)
      .toBe('note mem_note');
  });
});

function dirnameOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}
