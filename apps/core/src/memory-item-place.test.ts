import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LamportClock } from '@pico/sync';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { shredDomainWithAudit } from './domain-shred.js';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { createSqliteBackup, restoreSqliteBackup } from './sqlite-backup.js';

/**
 * ADR 0129 SR3. A place is a core capability, in the shape a due instant
 * already has - generically named, migrated by the core, and governed by the
 * paths that already govern a memory item.
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

function openStore(prefix: string, options: { encrypted?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `pico-place-${prefix}-`));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath, options.encrypted === true
    ? { memoryCrypto: new MemoryContentCrypto(sodium, new KeyStore(join(dir, 'keys'))) }
    : {});
  stores.push(store);
  return { store, databasePath, dir };
}

const place = { latitudeDeg: 48.2, longitudeDeg: 16.37, accuracyM: 12 };

function createItem(store: EventStore, memoryItemId: string, options: {
  privacyDomain?: string;
  encrypted?: boolean;
} = {}): void {
  store.memory().create({
    memoryItemId,
    privacyDomain: options.privacyDomain ?? 'domain-private',
    owner: 'pico-owner',
    controller: 'pico-owner',
    contentType: 'application/vnd.pico.parking-event',
    content: `parked ${memoryItemId}`,
    ...(options.encrypted === true ? { contentPosture: 'domain_encrypted' as const } : {}),
  });
}

describe('ADR 0129 SR3 the column is generic and attaches to an item', () => {
  it('records and reads a place back', () => {
    const { store } = openStore('roundtrip');
    createItem(store, 'mem_a');
    expect(store.setPicoMemoryItemPlace({ memoryItemId: 'mem_a', place })).toBe(true);
    expect(store.picoMemoryItemPlace('mem_a')).toEqual(place);
  });

  it('reports no place for an item that has none', () => {
    const { store } = openStore('none');
    createItem(store, 'mem_a');
    expect(store.picoMemoryItemPlace('mem_a')).toBeUndefined();
    expect(store.picoMemoryItemPlace('mem_missing')).toBeUndefined();
  });

  it('refuses a position that is not usable, naming which part', () => {
    // The protocol owns the meaning, so this and a location fix cannot drift
    // into disagreeing about what a usable position is.
    const { store } = openStore('invalid');
    createItem(store, 'mem_a');
    for (const [reason, bad] of [
      ['invalid_pico_place_accuracy', { ...place, accuracyM: 0 }],
      ['invalid_pico_place_latitude', { ...place, latitudeDeg: 91 }],
      ['invalid_pico_place_longitude', { ...place, longitudeDeg: -181 }],
    ] as Array<[string, typeof place]>) {
      expect(() => store.setPicoMemoryItemPlace({ memoryItemId: 'mem_a', place: bad }))
        .toThrow(reason);
    }
    // Refused means nothing was written.
    expect(store.picoMemoryItemPlace('mem_a')).toBeUndefined();
  });

  it('lists placed items most recent first, bounded, and skips the unplaced', () => {
    const { store } = openStore('list');
    for (const id of ['mem_a', 'mem_b', 'mem_c']) {
      createItem(store, id);
    }
    store.setPicoMemoryItemPlace({ memoryItemId: 'mem_a', place });
    store.setPicoMemoryItemPlace({ memoryItemId: 'mem_c', place });

    const placed = store.picoPlacedMemoryItems({ privacyDomain: 'domain-private' });
    expect(placed.map((row) => row.memoryItemId).sort()).toEqual(['mem_a', 'mem_c']);
    expect(placed[0]?.accuracyM).toBe(12);
    expect(store.picoPlacedMemoryItems({ privacyDomain: 'domain-private', limit: 1 }))
      .toHaveLength(1);
    // Domains stay apart, as they do everywhere else on this table.
    expect(store.picoPlacedMemoryItems({ privacyDomain: 'domain-work' })).toEqual([]);
  });
});

describe('ADR 0129 SR3 a place is governed by the paths that govern the item', () => {
  it('is destroyed with the item when the domain is shredded', () => {
    const { store } = openStore('shred', { encrypted: true });
    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    createItem(store, 'mem_placed', { encrypted: true });
    createItem(store, 'mem_plain', { encrypted: true });
    store.setPicoMemoryItemPlace({ memoryItemId: 'mem_placed', place });

    const memory = store.memory();
    const read = (id: string) => memory.getInDomain(id, 'domain-private')?.content;
    expect(read('mem_placed')).toBe('parked mem_placed');

    shredDomainWithAudit(memory, ({ privacyDomain, removedKeyVersions }) => {
      store.append(factory.create({
        deviceId: 'pico-core',
        type: 'memory.domain_shredded',
        payload: { privacyDomain, removedKeyVersions },
      }));
    }, { privacyDomain: 'domain-private' });

    // Identical outcomes, asserted as identical: a placed item is a memory
    // item, so it must not survive a shred any differently from one without a
    // place.
    expect(read('mem_placed')).toBe(read('mem_plain'));
    expect(String(read('mem_placed'))).not.toContain('parked mem_placed');
  });

  it('rides the core backup and comes back with the item', async () => {
    const { store, databasePath, dir } = openStore('restore');
    createItem(store, 'mem_placed');
    store.setPicoMemoryItemPlace({ memoryItemId: 'mem_placed', place });

    const backup = await createSqliteBackup(databasePath, join(dir, 'backups'));
    createItem(store, 'mem_after');
    store.setPicoMemoryItemPlace({ memoryItemId: 'mem_after', place });
    store.close();

    restoreSqliteBackup(backup.backupPath, databasePath, { overwrite: true });
    const restored = new EventStore(databasePath);
    stores.push(restored);

    // The place travels with the item, because it is a column on the item and
    // not a store of its own.
    expect(restored.picoMemoryItemPlace('mem_placed')).toEqual(place);
    expect(restored.picoMemoryItemPlace('mem_after')).toBeUndefined();
  });
});

describe('ADR 0129 SR3 the manual path issue #3 asks for', () => {
  it('records a place through the ordinary write path', async () => {
    // A person confirming where they left the car is recording a place, and
    // that must not need a sensor.
    const dir = mkdtempSync(join(tmpdir(), 'pico-place-api-'));
    tempDirs.push(dir);
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: join(dir, 'pico.sqlite'),
      deviceId: 'pico-core',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/events',
        payload: {
          deviceId: 'desktop-dev',
          type: 'memory.recorded',
          payload: {
            privacyDomain: 'domain-private',
            contentType: 'application/vnd.pico.parking-event',
            content: 'Level 2, near the lift',
            place,
          },
        },
      });
      expect(response.statusCode).toBe(201);

      for (const bad of [
        { ...place, accuracyM: 0 },
        { latitudeDeg: 48.2, longitudeDeg: 16.37 },
        { ...place, altitudeM: 190 },
      ]) {
        const refused = await app.inject({
          method: 'POST',
          url: '/api/events',
          payload: {
            deviceId: 'desktop-dev',
            type: 'memory.recorded',
            payload: {
              privacyDomain: 'domain-private',
              contentType: 'application/vnd.pico.parking-event',
              content: 'Level 2',
              place: bad,
            },
          },
        });
        expect(refused.statusCode).toBe(400);
        expect(refused.json().error).toContain('place is not a usable position');
      }
    } finally {
      await app.close();
    }
  });
});
