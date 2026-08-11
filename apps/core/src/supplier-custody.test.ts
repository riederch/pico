import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { intakePicoSupplierContent } from './supplier-intake.js';

/**
 * ADR 0136 BR3. Content that arrived through a slot is under the core's
 * custody like anything else it holds.
 *
 * The proof is ADR 0128 H4's and ADR 0127 M1's, for the same reason both use
 * it: "no supplier-specific handling" is not something a comment can assert.
 * Every test below runs a supplier-sourced item and an ordinary memory item
 * through the same core path and requires the two outcomes to be *identical*.
 * If the core ever grew a branch for supplier data, the outcomes would diverge
 * and one of these would fail.
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

function openEncryptedStore(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `pico-supplier-custody-${label}-`));
  tempDirs.push(dir);
  const keyStore = new KeyStore(join(dir, 'keys'));
  const crypto = new MemoryContentCrypto(sodium, keyStore);
  const store = new EventStore(join(dir, 'pico.sqlite'), { memoryCrypto: crypto });
  stores.push(store);
  return store;
}

/** An ordinary memory item: the control. */
function createPlainItem(
  store: EventStore,
  memoryItemId: string,
  privacyDomain: string,
  retentionPolicyRef?: string,
): void {
  store.memory().create({
    memoryItemId,
    privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: `note ${memoryItemId}`,
    contentPosture: 'domain_encrypted',
    ...(retentionPolicyRef === undefined ? {} : { retentionPolicyRef }),
  });
}

/** The same item, arrived through a slot. That is the whole difference. */
function createSuppliedItem(
  store: EventStore,
  memoryItemId: string,
  privacyDomain: string,
  retentionPolicyRef?: string,
): void {
  const intake = intakePicoSupplierContent({
    slot: 'memory_item',
    supplierIdentifier: 'rchkb',
    contentType: 'text/plain',
    content: `note ${memoryItemId}`,
  });
  expect(intake.originClass).toBe('external_content');
  store.memory().create({
    memoryItemId,
    privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: intake.contentType,
    content: intake.content,
    contentPosture: 'domain_encrypted',
    // Carried into the row, not just asserted on the way past. An earlier
    // version of this helper dropped it, which left every comparison below
    // running over two rows that were identical in every column - so they
    // could not have caught a core branching on origin even in principle.
    origin: intake.originClass,
    ...(retentionPolicyRef === undefined ? {} : { retentionPolicyRef }),
  });
}

describe('ADR 0136 BR3 - the core assigns the class, without asking', () => {
  it('labels everything crossing a slot as external content', () => {
    expect(intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'a passage',
    }).originClass).toBe('external_content');
  });

  it('gives a supplier no field in which to claim provenance', () => {
    // A supplier that could say `person_present` about a line from a
    // stranger's mail would perform the laundering step ADR 0117 X2 exists to
    // break, through the field designed to prevent it.
    expect(() => intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'a passage',
      originClass: 'person_present',
    })).toThrow('pico_supplier_cannot_declare_origin');
  });

  it('labels a person\'s own knowledge base as external content too', () => {
    // Not a judgement about the author: an admission about what the core can
    // verify. It cannot tell a sentence the person wrote from one they pasted.
    expect(intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/markdown',
      content: 'my own note',
    }).originClass).toBe('external_content');
  });

  it('refuses a slot the core does not own', () => {
    expect(() => intakePicoSupplierContent({
      slot: 'event',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'x',
    })).toThrow('pico_supplier_slot_not_listed');
  });

  it('refuses an undeclared extra field rather than dropping it', () => {
    expect(() => intakePicoSupplierContent({
      slot: 'memory_item',
      supplierIdentifier: 'rchkb',
      contentType: 'text/plain',
      content: 'x',
      trusted: true,
    })).toThrow('invalid_pico_supplier_offering');
  });
});

describe('ADR 0136 BR3 - supplied content is shredded by the core, with no supplier handling', () => {
  it('destroys a supplied item and an ordinary item identically', () => {
    const store = openEncryptedStore('shred');
    const factory = new EventFactory(new LamportClock(store.maxLamport()));

    createSuppliedItem(store, 'mem_supplied', 'domain-private');
    createPlainItem(store, 'mem_note', 'domain-private');
    createSuppliedItem(store, 'mem_other_domain', 'domain-work');

    const memory = store.memory();
    const read = (id: string, domain: string): string | undefined =>
      memory.getInDomain(id, domain)?.content;
    expect(read('mem_supplied', 'domain-private')).toBe('note mem_supplied');
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
    const suppliedAfter = read('mem_supplied', 'domain-private');
    const noteAfter = read('mem_note', 'domain-private');
    expect(suppliedAfter).toBe(noteAfter);
    expect(suppliedAfter).not.toBe('note mem_supplied');

    // Scoped to a domain, not to a kind - which also shows the comparison
    // above can fail.
    expect(read('mem_other_domain', 'domain-work')).toBe('note mem_other_domain');
  });
});

describe('ADR 0136 BR3 - supplied content expires by the same rule, with no supplier handling', () => {
  it('expires a supplied item and an ordinary item identically', () => {
    const store = openEncryptedStore('retention');
    const memory = store.memory();
    const policies = store.retentionPolicies();
    policies.create({
      retentionPolicyId: 'ret-30',
      displayName: '30d',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
    });
    policies.create({
      retentionPolicyId: 'keep',
      displayName: 'keep',
      mode: 'keep_until_deleted',
    });

    createSuppliedItem(store, 'mem_supplied', 'domain-private', 'ret-30');
    createPlainItem(store, 'mem_note', 'domain-private', 'ret-30');
    createSuppliedItem(store, 'mem_supplied_kept', 'domain-private', 'keep');

    const tombstoned: string[] = [];
    const sweeper = new RetentionSweeper(
      memory,
      policies,
      ({ memoryItemId }) => tombstoned.push(memoryItemId),
      { now: () => new Date(Date.now() + 400 * 86_400_000) },
    );
    const result = sweeper.sweep();

    // Identical to each other rather than each on its own: two separate
    // assertions could both pass while the sweep treated the two kinds
    // differently in some way neither happened to look at.
    const supplied = memory.getInDomain('mem_supplied', 'domain-private');
    const note = memory.getInDomain('mem_note', 'domain-private');
    expect(supplied?.deletionState).toBe(note?.deletionState);
    expect(supplied?.content).toBe(note?.content);
    expect(supplied?.deletionState).toBe('tombstoned');

    expect([...tombstoned].sort()).toEqual(['mem_note', 'mem_supplied']);
    expect(result.expired).toBe(2);

    // A policy that keeps, kept - which shows the comparison above can fail
    // and that expiry followed the policy rather than the origin.
    expect(memory.getInDomain('mem_supplied_kept', 'domain-private')?.deletionState)
      .toBe('active');
    store.close();
  });

  it('gives the sweep nothing to tell the two kinds apart with', () => {
    // The structural reason the comparison above holds, and the one worth
    // pinning: retention decides from ids and dates. If the candidate
    // projection carried an origin or a supplier, retention could differ by
    // where content came from - which is the supplier-specific handling BR3
    // exists to rule out - and no test over two items would necessarily
    // notice.
    const store = openEncryptedStore('projection');
    store.retentionPolicies().create({
      retentionPolicyId: 'ret-30',
      displayName: '30d',
      mode: 'delete_after_max_age',
      maxAgeDays: 30,
    });
    createSuppliedItem(store, 'mem_supplied', 'domain-private', 'ret-30');

    const candidates = store.memory().listRetentionCandidates();
    expect(candidates).toHaveLength(1);
    expect(Object.keys(candidates[0]!).sort()).toEqual([
      'createdAt',
      'memoryItemId',
      'privacyDomain',
      'retentionPolicyRef',
    ]);
    store.close();
  });
});

describe('ADR 0136 BR3 - supplied content survives and dies with the backup, identically', () => {
  it('carries a supplied item and an ordinary item through backup and restore alike', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-custody-backup-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');
    const keyStore = new KeyStore(join(dir, 'keys'));
    const crypto = new MemoryContentCrypto(sodium, keyStore);

    const store = new EventStore(databasePath, { memoryCrypto: crypto });
    createSuppliedItem(store, 'mem_supplied', 'domain-private');
    createPlainItem(store, 'mem_note', 'domain-private');
    store.close();

    const backup = await createSqliteBackup(databasePath, join(dir, 'backups'));
    rmSync(databasePath, { force: true });
    restoreSqliteBackup(backup.backupPath, databasePath);

    const restored = new EventStore(databasePath, { memoryCrypto: crypto });
    stores.push(restored);
    const supplied = restored.memory().getInDomain('mem_supplied', 'domain-private');
    const note = restored.memory().getInDomain('mem_note', 'domain-private');
    expect(supplied?.content).toBe('note mem_supplied');
    expect(note?.content).toBe('note mem_note');
    expect(supplied?.deletionState).toBe(note?.deletionState);
    restored.close();
  });

  it('leaves both unreadable after a restore into a shredded domain', async () => {
    // The case where a supplier-specific path would actually show. The keys
    // live outside the database, so a backup carries ciphertext and never the
    // means to read it: restoring a pre-shred database does not undo the
    // shred. That has to be as true for content that arrived through a slot as
    // for content the person wrote.
    const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-custody-stale-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');
    const keyStore = new KeyStore(join(dir, 'keys'));
    const crypto = new MemoryContentCrypto(sodium, keyStore);

    const store = new EventStore(databasePath, { memoryCrypto: crypto });
    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    createSuppliedItem(store, 'mem_supplied', 'domain-private');
    createPlainItem(store, 'mem_note', 'domain-private');
    store.close();

    // The backup predates the shred, which is what makes it stale.
    const backup = await createSqliteBackup(databasePath, join(dir, 'backups'));

    const beforeShred = new EventStore(databasePath, { memoryCrypto: crypto });
    shredDomainWithAudit(beforeShred.memory(), ({ privacyDomain, removedKeyVersions }) => {
      beforeShred.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.domain_shredded',
        payload: { privacyDomain, removedKeyVersions },
      }));
    }, { privacyDomain: 'domain-private' });
    beforeShred.close();

    restoreSqliteBackup(backup.backupPath, databasePath, { overwrite: true });

    const restored = new EventStore(databasePath, { memoryCrypto: crypto });
    stores.push(restored);
    const supplied = restored.memory().getInDomain('mem_supplied', 'domain-private');
    const note = restored.memory().getInDomain('mem_note', 'domain-private');

    expect(supplied?.contentUnavailable).toBe(note?.contentUnavailable);
    expect(supplied?.contentUnavailable).toBe('key_shredded');
    expect(supplied?.content).toBe(note?.content);
    expect(supplied?.content).toBeUndefined();
    restored.close();
  });

  it('re-enforces a recorded deletion over a stale restore for both alike', async () => {
    // ADR 0070's restore direction, in the shape the retention sweeper
    // documents: record first, enforce second. A backup taken between those
    // two steps holds the tombstone *and* the still-active row, so restoring
    // it resurrects content whose deletion the log already records - and
    // reconciliation puts it back down.
    //
    // Asserted for both kinds, because a reconciliation that skipped supplied
    // items would resurrect exactly the content nobody can vouch for.
    const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-custody-tombstone-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');
    const keyStore = new KeyStore(join(dir, 'keys'));
    const crypto = new MemoryContentCrypto(sodium, keyStore);

    const store = new EventStore(databasePath, { memoryCrypto: crypto });
    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    createSuppliedItem(store, 'mem_supplied', 'domain-private');
    createPlainItem(store, 'mem_note', 'domain-private');
    for (const memoryItemId of ['mem_supplied', 'mem_note']) {
      store.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.tombstone',
        payload: { memoryItemId, privacyDomain: 'domain-private', reason: 'test' },
      }));
    }
    store.close();

    // Recorded but not yet enforced: exactly the window the sweeper's
    // record-then-enforce order exists to survive.
    const backup = await createSqliteBackup(databasePath, join(dir, 'backups'));

    const enforcing = new EventStore(databasePath, { memoryCrypto: crypto });
    for (const memoryItemId of ['mem_supplied', 'mem_note']) {
      enforcing.memory().enforceTombstone(memoryItemId, 'domain-private');
    }
    enforcing.close();

    restoreSqliteBackup(backup.backupPath, databasePath, { overwrite: true });

    const restored = new EventStore(databasePath, { memoryCrypto: crypto });
    stores.push(restored);
    // The restore brought both back as active, with content.
    expect(restored.memory().getInDomain('mem_supplied', 'domain-private')?.deletionState)
      .toBe('active');
    expect(restored.memory().getInDomain('mem_note', 'domain-private')?.deletionState)
      .toBe('active');

    const reconciled = restored.reconcileMemoryTombstones();

    const supplied = restored.memory().getInDomain('mem_supplied', 'domain-private');
    const note = restored.memory().getInDomain('mem_note', 'domain-private');
    expect(supplied?.deletionState).toBe(note?.deletionState);
    expect(supplied?.deletionState).toBe('tombstoned');
    expect(supplied?.content).toBe(note?.content);
    expect(supplied?.content).toBeUndefined();
    expect(reconciled.enforced).toBe(2);
    restored.close();
  });
});
