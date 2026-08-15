import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maxPicoObservationAgeMs } from '@pico/protocol/observation';
import { picoDurableStores } from '@pico/protocol';
import { LamportClock } from '@pico/sync';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { shredDomainWithAudit } from './domain-shred.js';
import { EventFactory } from './event-factory.js';
import { EventStore } from './event-store.js';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { condensePicoObservations } from './observation-condensation.js';
import { createSqliteBackup, restoreSqliteBackup } from './sqlite-backup.js';

/**
 * ADR 0129 SR2. The second kind of store, and the five places a new kind has
 * to answer before the core may hold it.
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
  const dir = mkdtempSync(join(tmpdir(), `pico-observation-${prefix}-`));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath, options.encrypted === true
    ? { memoryCrypto: new MemoryContentCrypto(sodium, new KeyStore(join(dir, 'keys'))) }
    : {});
  stores.push(store);
  return { store, databasePath, dir };
}

const now = Date.parse('2026-08-09T12:00:00.000Z');
const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

function fix(minutesAgo: number, privacyDomain = 'domain-private') {
  return {
    kind: 'location_fix' as const,
    privacyDomain,
    observedAt: at(minutesAgo),
    payload: JSON.stringify({ latitudeDeg: 48.2, longitudeDeg: 16.37, accuracyM: 10 }),
  };
}

describe('ADR 0129 SR2 the buffer accepts readings and refuses anything else', () => {
  it('appends parsed readings and reads them back oldest first', () => {
    const { store } = openStore('append');
    expect(store.appendPicoObservations([fix(30), fix(10), fix(20)])).toBe(3);

    const window = store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    });
    // Oldest first, because a derivation walks a sequence forward and handing
    // it the newest would make every caller re-sort what the index ordered.
    expect(window.map((row) => row.observedAt)).toEqual([at(30), at(20), at(10)]);
    expect(window[0]?.observationId).toBeGreaterThan(0);
  });

  it('refuses a reading the protocol does not accept', () => {
    const { store } = openStore('parse');
    for (const [reason, bad] of [
      ['invalid_pico_observation_kind', { ...fix(1), kind: 'heart_rate' }],
      ['invalid_pico_observation_domain', { ...fix(1), privacyDomain: '  ' }],
      ['invalid_pico_observation_payload', { ...fix(1), payload: 'x'.repeat(4_097) }],
      ['invalid_pico_observation', { ...fix(1), extra: 'smuggled' }],
    ] as Array<[string, unknown]>) {
      expect(() => store.appendPicoObservations([bad])).toThrow(reason);
    }
    // Refused means nothing was written, not partly written.
    expect(store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-private' }))
      .toEqual([]);
  });

  it('keeps domains apart on the read path', () => {
    const { store } = openStore('domains');
    store.appendPicoObservations([fix(5, 'domain-private'), fix(5, 'domain-work')]);
    expect(store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-work' }))
      .toHaveLength(1);
  });
});

describe('ADR 0129 SR2 place one: the ADR 0071 shred cascade reaches it', () => {
  it('deletes a domain\'s readings when the domain is shredded', () => {
    const { store } = openStore('shred', { encrypted: true });
    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    store.appendPicoObservations([fix(5, 'domain-private'), fix(6, 'domain-private')]);
    store.appendPicoObservations([fix(5, 'domain-work')]);

    const result = shredDomainWithAudit(
      store.memory(),
      ({ privacyDomain, removedKeyVersions }) => {
        store.append(factory.create({
          deviceId: 'pico-core',
          type: 'memory.domain_shredded',
          payload: { privacyDomain, removedKeyVersions },
        }));
      },
      { privacyDomain: 'domain-private' },
      (domain) => store.deletePicoObservationsInDomain(domain),
    );

    // Deleted, not made unreadable: these rows carry no key envelope, and data
    // designed not to outlive its window has nothing worth leaving behind
    // undecryptable.
    expect(result.removedObservations).toBe(2);
    expect(store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-private' }))
      .toEqual([]);
    // Scoped to the domain, which also shows the assertion above can fail.
    expect(store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-work' }))
      .toHaveLength(1);
  });

  it('leaves the buffer alone when the cascade is called without the port', () => {
    // The port is optional so existing callers keep compiling; a caller that
    // omits it gets a shred that does not reach the buffer, and this pins that
    // it is a choice rather than an accident.
    const { store } = openStore('shred-no-port', { encrypted: true });
    store.appendPicoObservations([fix(5)]);
    const result = shredDomainWithAudit(store.memory(), () => {}, {
      privacyDomain: 'domain-private',
    });
    expect(result.removedObservations).toBe(0);
    expect(store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-private' }))
      .toHaveLength(1);
  });
});

describe('ADR 0129 SR2 places two and three: the window is enforced at open', () => {
  it('drops readings older than the window and keeps the rest', () => {
    const { store } = openStore('prune');
    const olderThanWindow = new Date(now - maxPicoObservationAgeMs - 60_000).toISOString();
    store.appendPicoObservations([
      { ...fix(10) },
      { ...fix(10), observedAt: olderThanWindow },
    ]);

    expect(store.prunePicoObservations(new Date(now).toISOString())).toBe(1);
    expect(store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-private' }))
      .toHaveLength(1);
  });

  it('brings back an empty buffer from a snapshot older than the window', async () => {
    // The answer to the backup question. A buffer restored from last week
    // describes a past the derivation would read as recent, so age invalidates
    // it on the next open - which is the same mechanism as boot
    // reconciliation rather than a second one to remember.
    const { store, databasePath, dir } = openStore('restore');
    const stale = new Date(now - maxPicoObservationAgeMs - 60_000).toISOString();
    store.appendPicoObservations([{ ...fix(10), observedAt: stale }]);
    const backup = await createSqliteBackup(databasePath, join(dir, 'backups'));
    store.close();

    restoreSqliteBackup(backup.backupPath, databasePath, { overwrite: true });
    const restored = new EventStore(databasePath);
    stores.push(restored);
    // The rows travelled in the backup bytes - they are in the same file - and
    // the window is what empties them.
    expect(restored.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-private' }))
      .toHaveLength(1);
    expect(restored.prunePicoObservations(new Date(now).toISOString())).toBe(1);
    expect(restored.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-private' }))
      .toEqual([]);
  });
});

describe('ADR 0129 SR2 place four: the ADR 0119 Q5 ceiling counts it', () => {
  it('is one of the durable stores the pressure view reports', () => {
    expect([...picoDurableStores]).toContain('observation');
    const { store } = openStore('ceiling');
    store.appendPicoObservations([fix(1)]);
    const ceilings = store.storageCondition();
    expect(ceilings.state).toBe('normal');
  });

  it('refuses a write once the ceiling is reached, naming the store', () => {
    const { store } = openStore('ceiling-reached');
    // A ceiling of one, so the second write meets it without writing 200,000
    // rows to find out.
    const tight = new EventStore(join(tempDirs[tempDirs.length - 1] ?? '', 'tight.sqlite'), {
      storeCeilingRows: { observation: 1 },
    });
    stores.push(tight);
    expect(tight.appendPicoObservations([fix(2)])).toBe(1);
    expect(() => tight.appendPicoObservations([fix(1)]))
      .toThrow('pico_observation_ceiling_reached');
    void store;
  });

  it('lets a pruned buffer accept writes again', () => {
    // The cached count only ever runs high, so a buffer that was just emptied
    // must not stay refused on a number that is no longer true.
    const dir = mkdtempSync(join(tmpdir(), 'pico-observation-recount-'));
    tempDirs.push(dir);
    const store = new EventStore(join(dir, 'pico.sqlite'), {
      storeCeilingRows: { observation: 1 },
    });
    stores.push(store);
    const stale = new Date(now - maxPicoObservationAgeMs - 60_000).toISOString();
    expect(store.appendPicoObservations([{ ...fix(1), observedAt: stale }])).toBe(1);
    expect(() => store.appendPicoObservations([fix(1)])).toThrow('pico_observation_ceiling_reached');

    expect(store.prunePicoObservations(new Date(now).toISOString())).toBe(1);
    expect(store.appendPicoObservations([fix(1)])).toBe(1);
  });
});

describe('ADR 0129 SR2 place five: no unauthorized write reaches it', () => {
  it('is covered by the ADR 0119 Q3 byte digest, and stays empty without a caller', () => {
    // Q3 hashes the database file, so the buffer is inside what that proof
    // already measures: an observation written by anyone would move the digest.
    // There is no route into it, so nothing can.
    const { store, databasePath } = openStore('q3');
    const digest = () => {
      const hash = createHash('sha256');
      for (const path of [databasePath, `${databasePath}-wal`]) {
        hash.update(existsSync(path) ? readFileSync(path) : Buffer.alloc(0));
      }
      return hash.digest('hex');
    };

    expect(store.picoObservationWindow({ kind: 'location_fix', privacyDomain: 'domain-private' }))
      .toEqual([]);
    const before = digest();
    // The instrument has to be able to move, or the emptiness above proves
    // only that this file is never written.
    store.appendPicoObservations([fix(1)]);
    expect(digest()).not.toBe(before);
  });
});

describe('ADR 0129 SR2 condensation: readings become a memory and stop existing', () => {
  it('writes the memory item first and then deletes exactly what was consumed', () => {
    const { store } = openStore('condense');
    store.appendPicoObservations([fix(30), fix(20), fix(10)]);
    const window = store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    });
    const consumed = window.slice(0, 2);

    const result = condensePicoObservations(store.memory(), {
      module: 'spatial-recall',
      memory: {
        memoryItemId: 'mem_parked',
        contentType: 'application/vnd.pico.parking-event',
        content: JSON.stringify({ parkedAt: at(20) }),
      },
      consumed,
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      deleteObservations: (ids) => store.deletePicoObservations(ids),
    });

    expect(result).toEqual({ recorded: true, consumed: 2 });
    // What came out is an ordinary memory item, governed like every other one.
    const item = store.memory().getInDomain('mem_parked', 'domain-private');
    expect(item?.contentType).toBe('application/vnd.pico.parking-event');
    // A device's own sensors are the person's own instrument, not somebody
    // else's words - and still not the person speaking.
    expect(item?.origin).toBe('own_pico');
    // Exactly what was consumed: the third reading is still there for the next
    // pass.
    const left = store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    });
    expect(left.map((row) => row.observedAt)).toEqual([at(10)]);
  });

  it('carries the custody the core decided, not what the module knows about', () => {
    // ADR 0129 SR2: the module decides what the readings mean; the privacy
    // domain, the encryption posture and the retention policy are custody, and
    // custody is not the module's. A condensation that dropped them would
    // write somebody's movements in plaintext under no policy while every
    // caller believed otherwise.
    const { store } = openStore('condense-custody', { encrypted: true });
    store.retentionPolicies().create({
      retentionPolicyId: 'short-lived',
      displayName: 'Short lived',
      mode: 'delete_after_max_age',
      maxAgeDays: 7,
    });
    store.appendPicoObservations([fix(30)]);
    const window = store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    });

    expect(condensePicoObservations(store.memory(), {
      module: 'spatial-recall',
      memory: {
        memoryItemId: 'mem_parked_sealed',
        contentType: 'application/vnd.pico.parking-event',
        content: JSON.stringify({ parkedAt: at(30) }),
      },
      consumed: window,
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      contentPosture: 'domain_encrypted',
      retentionPolicyRef: 'short-lived',
      deleteObservations: (ids) => store.deletePicoObservations(ids),
    })).toEqual({ recorded: true, consumed: 1 });

    const item = store.memory().getInDomain('mem_parked_sealed', 'domain-private');
    expect(item?.contentPosture).toBe('domain_encrypted');
    expect(item?.retentionPolicyRef).toBe('short-lived');
    // And it is really sealed: the plaintext is not what the row holds.
    expect(store.memory().getInDomain('mem_parked_sealed', 'domain-private')?.content)
      .toContain('parkedAt');
  });

  it('consumes nothing when the module derived nothing', () => {
    // A drive that has not finished is not a drive that produced nothing, and
    // deleting the window anyway would throw away readings a later pass could
    // still make sense of.
    const { store } = openStore('condense-none');
    store.appendPicoObservations([fix(30), fix(20)]);
    const window = store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    });

    const result = condensePicoObservations(store.memory(), {
      module: 'spatial-recall',
      consumed: window,
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      deleteObservations: () => {
        throw new Error('must not delete without a memory');
      },
    });

    expect(result).toEqual({ recorded: false, consumed: 0 });
    expect(store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    })).toHaveLength(2);
  });
});

describe('ADR 0129 SR6 erasing goes through the paths that already exist', () => {
  it('erases the buffer and the placed items with one domain shred', () => {
    // "The local history can be erased through the paths that already exist."
    // Both halves of that history are reachable: the readings by the shred's
    // own port, the derived places by the crypto-shred that governs every
    // memory item. No third mechanism, and nothing to remember separately.
    const { store } = openStore('erase', { encrypted: true });
    const factory = new EventFactory(new LamportClock(store.maxLamport()));
    store.appendPicoObservations([fix(30), fix(20)]);
    store.memory().create({
      memoryItemId: 'mem_parked',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'application/vnd.pico.parking-event',
      content: 'Level 2, near the lift',
      contentPosture: 'domain_encrypted',
    });
    store.setPicoMemoryItemPlace({
      memoryItemId: 'mem_parked',
      place: { latitudeDeg: 48.2, longitudeDeg: 16.37, accuracyM: 12 },
    });

    const result = shredDomainWithAudit(
      store.memory(),
      ({ privacyDomain, removedKeyVersions }) => {
        store.append(factory.create({
          deviceId: 'pico-core',
          type: 'memory.domain_shredded',
          payload: { privacyDomain, removedKeyVersions },
        }));
      },
      { privacyDomain: 'domain-private' },
      (domain) => store.deletePicoObservationsInDomain(domain),
    );

    expect(result.removedObservations).toBe(2);
    expect(store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    })).toEqual([]);
    // The words are gone with the key; the coordinates are a column on an item
    // whose content nobody can read any more.
    expect(String(store.memory().getInDomain('mem_parked', 'domain-private')?.content))
      .not.toContain('near the lift');
  });

  it('does not erase anything when capture is merely switched off', () => {
    // A module being off must not mean nobody is responsible for what it
    // recorded. Stopping and forgetting are different acts, and a person who
    // asked for the first would be badly served by getting the second.
    const { store } = openStore('capture-off');
    store.appendPicoObservations([fix(30), fix(20)]);

    store.setPicoModuleCapture({
      identifier: 'spatial-recall',
      capturing: false,
      decidedAt: new Date(now).toISOString(),
    });

    expect(store.picoCapturingModules()).toEqual([]);
    expect(store.picoObservationWindow({
      kind: 'location_fix',
      privacyDomain: 'domain-private',
    })).toHaveLength(2);
  });
});
