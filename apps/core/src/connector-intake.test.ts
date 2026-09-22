import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoHomeAssistantModuleManifest } from '@pico/module-home-assistant/manifest';
import { toPicoHomeAssistantObservations } from '@pico/module-home-assistant/observation';
import { picoConnectorOriginClass } from '@pico/protocol/home-assistant';
import { parsePicoModuleManifest, picoModuleIdentifiers } from '@pico/protocol/module';
import { LamportClock } from '@pico/sync';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { recordPicoConnectorObservations } from './connector-intake.js';
import { shredDomainWithAudit } from './domain-shred.js';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { RetentionSweeper } from './retention-sweep.js';
import { createSqliteBackup, restoreSqliteBackup } from './sqlite-backup.js';

/**
 * ADR 0128 H4. The Home Assistant integration is a module, and its data is
 * shredded, retained and restored by the core's existing paths with no
 * integration-specific handling - proven the way ADR 0127 M1 was proven, as a
 * comparison rather than an assertion.
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

function openStore(prefix: string): { store: EventStore; databasePath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), `pico-connector-${prefix}-`));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const crypto = new MemoryContentCrypto(sodium, new KeyStore(join(dir, 'keys')));
  const store = new EventStore(databasePath, { memoryCrypto: crypto });
  stores.push(store);
  return { store, databasePath, dir };
}

const entities = [
  {
    entityId: 'light.kitchen',
    state: 'on',
    friendlyName: 'Kitchen ceiling',
    changedAt: '2026-08-07T18:00:00.000Z',
  },
] as const;

function record(
  store: EventStore,
  privacyDomain: string,
  ids: string[],
  options: { encrypted?: boolean; retentionPolicyRef?: string } = {},
) {
  let next = 0;
  return recordPicoConnectorObservations(store.memory(), {
    module: 'home-assistant',
    observations: toPicoHomeAssistantObservations([...entities]),
    privacyDomain,
    owner: 'pico-owner',
    ...(options.encrypted === true ? { contentPosture: 'domain_encrypted' as const } : {}),
    ...(options.retentionPolicyRef === undefined
      ? {}
      : { retentionPolicyRef: options.retentionPolicyRef }),
    newMemoryItemId: () => {
      const id = ids[next];
      next += 1;
      if (id === undefined) {
        throw new Error('ran out of ids');
      }
      return id;
    },
  });
}

/** An ordinary memory item in the same domain: the control. */
function createPlainItem(store: EventStore, input: {
  memoryItemId: string;
  privacyDomain: string;
  encrypted?: boolean;
  retentionPolicyRef?: string;
}): void {
  store.memory().create({
    memoryItemId: input.memoryItemId,
    privacyDomain: input.privacyDomain,
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'text/plain',
    content: `note ${input.memoryItemId}`,
    ...(input.encrypted === true ? { contentPosture: 'domain_encrypted' as const } : {}),
    ...(input.retentionPolicyRef === undefined
      ? {}
      : { retentionPolicyRef: input.retentionPolicyRef }),
  });
}

describe('ADR 0128 H4 the integration is placed as a module', () => {
  it('is in the core\'s closed list and declares itself a connector', () => {
    expect([...picoModuleIdentifiers]).toContain('home-assistant');
    expect(parsePicoModuleManifest(picoHomeAssistantModuleManifest).kind).toBe('connector');
  });
});

describe('ADR 0116 W1/W2 the class is assigned at the threshold', () => {
  it('stamps external_content, whatever the module brought', () => {
    // The interesting failure is never a module deciding to lie - it is one
    // that parsed a field wrong and passed a value along. So the class is
    // assigned here and nothing upstream is consulted about it.
    const { store } = openStore('origin');
    const result = record(store, 'domain-private', ['mem_light']);

    expect(result.recorded).toBe(1);
    expect(result.originClass).toBe('external_content');
    expect(picoConnectorOriginClass).toBe('external_content');

    const item = store.memory().getInDomain('mem_light', 'domain-private');
    expect(item?.origin).toBe('external_content');
    // Never the instruction threshold, and never the class an authenticated
    // person's own write would get.
    expect(item?.origin).not.toBe('person_present');
    expect(item?.origin).not.toBe('home_member');
  });
});

describe('ADR 0128 H4 custody is the core\'s, with no integration-specific handling', () => {
  it('shreds a connector item exactly as an ordinary one', () => {
    const { store } = openStore('shred');
    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    record(store, 'domain-private', ['mem_light'], { encrypted: true });
    createPlainItem(store, { memoryItemId: 'mem_note', privacyDomain: 'domain-private', encrypted: true });
    // A connector item in another domain, so the comparison below can fail.
    record(store, 'domain-work', ['mem_other_domain'], { encrypted: true });

    const memory = store.memory();
    const read = (id: string) => memory.getInDomain(id, 'domain-private')?.content;
    expect(read('mem_light')).toContain('Kitchen ceiling');
    expect(read('mem_note')).toBe('note mem_note');

    shredDomainWithAudit(memory, ({ privacyDomain, removedKeyVersions }) => {
      store.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.domain_shredded',
        payload: { privacyDomain, removedKeyVersions },
      }));
    }, { privacyDomain: 'domain-private' });

    // Identical outcomes, asserted as identical. Two separate assertions could
    // both pass while the core treated the kinds differently in some way
    // neither happened to look at.
    expect(read('mem_light')).toBe(read('mem_note'));
    expect(String(read('mem_light'))).not.toContain('Kitchen ceiling');

    // The shred is scoped to a domain, not to a kind: a connector item
    // elsewhere is untouched, which also shows the equality above can fail.
    expect(memory.getInDomain('mem_other_domain', 'domain-work')?.content)
      .toContain('Kitchen ceiling');
  });

  it('expires a connector item on the same retention policy', () => {
    const { store } = openStore('retention');
    const policies = store.retentionPolicies();
    policies.create({
      retentionPolicyId: 'short',
      displayName: 'Short',
      mode: 'delete_after_max_age',
      maxAgeDays: 1,
    });

    // The policy is supplied by the core on both paths, because which policy
    // governs foreign text is a custody decision and custody is the core's.
    record(store, 'domain-private', ['mem_light'], { retentionPolicyRef: 'short' });
    createPlainItem(store, {
      memoryItemId: 'mem_note',
      privacyDomain: 'domain-private',
      retentionPolicyRef: 'short',
    });

    const tombstoned: string[] = [];
    const sweeper = new RetentionSweeper(
      store.memory(),
      policies,
      ({ memoryItemId }) => {
        tombstoned.push(memoryItemId);
      },
      { now: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1_000) },
    );
    const result = sweeper.sweep();

    expect([...tombstoned].sort()).toEqual(['mem_light', 'mem_note']);
    expect(result.expired).toBe(2);
  });

  it('restores a connector item with the core\'s backup, class and all', async () => {
    const { store, databasePath, dir } = openStore('restore');
    record(store, 'domain-private', ['mem_light']);
    createPlainItem(store, { memoryItemId: 'mem_note', privacyDomain: 'domain-private' });

    const backup = await createSqliteBackup(databasePath, join(dir, 'backups'));
    record(store, 'domain-private', ['mem_after_backup']);
    store.close();

    restoreSqliteBackup(backup.backupPath, databasePath, { overwrite: true });
    /**
     * Mit demselben Schluesselordner, der neben der Datenbank lag und nie
     * angefasst wurde: seit Befund B254 schreibt ein Store mit Krypto
     * verschluesselt, und dieser Test fragt, ob ein Konnektor-Stueck die
     * Sicherung des Kerns mitfaehrt - nicht, ob es einen Schluesselverlust
     * ueberlebt.
     */
    const restored = new EventStore(databasePath, {
      memoryCrypto: new MemoryContentCrypto(sodium, new KeyStore(join(dir, 'keys'))),
    });
    stores.push(restored);
    const memory = restored.memory();

    // The class rides the backup: a restore that lost it would turn foreign
    // text into unlabelled provenance, which ADR 0116 W2 calls fatal.
    expect(memory.getInDomain('mem_light', 'domain-private')?.origin).toBe('external_content');
    // Identical treatment again: what was written after the backup is gone for
    // both kinds.
    expect(memory.getInDomain('mem_after_backup', 'domain-private')).toBeUndefined();
    expect(memory.getInDomain('mem_note', 'domain-private')?.content).toBe('note mem_note');
  });
});
