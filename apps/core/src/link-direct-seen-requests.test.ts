import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_PICO_LINK_DIRECT_SEEN_REQUESTS,
  PicoLinkDirectSeenRequests,
} from './link-direct-seen-requests.js';
import { migrations, picoLinkDirectSeenRequestMigrationId, runMigrations } from './migrations.js';

/**
 * ADR 0107 D2. The two bounds this table carries, and who leaves when it is
 * full - the half that changed when the replay memory moved out of the
 * process on 2026-09-10.
 */

const openDatabases: Database.Database[] = [];

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.close();
  }
});

function store(maxRows = MAX_PICO_LINK_DIRECT_SEEN_REQUESTS): PicoLinkDirectSeenRequests {
  const db = new Database(':memory:');
  openDatabases.push(db);
  const migration = migrations.find((candidate) => candidate.id === picoLinkDirectSeenRequestMigrationId);
  if (migration === undefined) {
    throw new Error('the seen-request migration is gone, so this test has no subject.');
  }
  runMigrations(db, { migrationDefinitions: [migration] });
  return new PicoLinkDirectSeenRequests(db, maxRows);
}

describe('what the Pico Link replay memory remembers, and what it drops', () => {
  it('remembers an id until its own expiry and not past it', () => {
    const seen = store();
    seen.remember('linkreq_a', 2_000);

    expect(seen.hasSeen('linkreq_a', 1_999)).toBe(true);
    // At its expiry the id is gone, and the request it belonged to is refused
    // one step earlier on freshness rather than here on replay.
    expect(seen.hasSeen('linkreq_a', 2_000)).toBe(false);
    expect(seen.hasSeen('linkreq_a', 1_999)).toBe(false);
  });

  it('does not confuse two ids, and forgets nothing that is still live', () => {
    const seen = store();
    seen.remember('linkreq_a', 5_000);
    seen.remember('linkreq_b', 9_000);

    expect(seen.hasSeen('linkreq_a', 6_000)).toBe(false);
    expect(seen.hasSeen('linkreq_b', 6_000)).toBe(true);
    expect(seen.hasSeen('linkreq_c', 6_000)).toBe(false);
  });

  it('evicts the row closest to expiring, not merely the oldest inserted', () => {
    /**
     * The half that is new. The map this replaced dropped in insertion order,
     * so a long-lived entry could be evicted while a nearly expired one
     * stayed - and the evicted one is replayable for whatever is left of its
     * window. Ordering by expiry first hands out the shortest remaining
     * replayability there is.
     */
    const seen = store(2);
    seen.remember('linkreq_long', 60_000);
    seen.remember('linkreq_short', 1_000);
    seen.remember('linkreq_new', 60_000);

    expect(seen.hasSeen('linkreq_short', 500)).toBe(false);
    expect(seen.hasSeen('linkreq_long', 500)).toBe(true);
    expect(seen.hasSeen('linkreq_new', 500)).toBe(true);
  });

  it('breaks a tie by insertion order, which is what the map did', () => {
    const seen = store(2);
    seen.remember('linkreq_first', 60_000);
    seen.remember('linkreq_second', 60_000);
    seen.remember('linkreq_third', 60_000);

    expect(seen.hasSeen('linkreq_first', 500)).toBe(false);
    expect(seen.hasSeen('linkreq_second', 500)).toBe(true);
    expect(seen.hasSeen('linkreq_third', 500)).toBe(true);
  });

  it('stays at its ceiling however many ids arrive', () => {
    const db = new Database(':memory:');
    openDatabases.push(db);
    const migration = migrations.find((candidate) => candidate.id === picoLinkDirectSeenRequestMigrationId);
    runMigrations(db, { migrationDefinitions: [migration as never] });
    const seen = new PicoLinkDirectSeenRequests(db, 4);

    for (let index = 0; index < 50; index += 1) {
      seen.remember(`linkreq_${index}`, 60_000);
    }

    const { rows } = db
      .prepare('SELECT COUNT(*) AS rows FROM pico_link_direct_seen_request')
      .get() as { rows: number };
    expect(rows).toBe(4);
  });

  it('keeps the evicted id when the insert that justified evicting it fails', () => {
    // B163. At capacity `remember` is two writes - evict, then insert - and
    // the head of that file says so in prose. If the insert fails on its own,
    // the eviction has still happened: the id closest to expiring is gone and
    // the new one was never written, so two requests are replayable where one
    // should have been.
    //
    // The failure is the database's own, through a trigger, because a stubbed
    // insert would test the arrangement of this test.
    const db = new Database(':memory:');
    openDatabases.push(db);
    const migration = migrations.find((candidate) => candidate.id === picoLinkDirectSeenRequestMigrationId);
    runMigrations(db, { migrationDefinitions: [migration as never] });
    const seen = new PicoLinkDirectSeenRequests(db, 2);

    seen.remember('linkreq_soonest', 10_000);
    seen.remember('linkreq_later', 60_000);

    db.exec(`
      CREATE TRIGGER planted_seen_insert_fails
      BEFORE INSERT ON pico_link_direct_seen_request
      BEGIN SELECT RAISE(ABORT, 'planted_seen_insert_fails'); END
    `);
    expect(() => seen.remember('linkreq_new', 90_000)).toThrow('planted_seen_insert_fails');

    // The one that would have made room is still remembered. A replay guard
    // that drops an id in exchange for nothing is weaker after the failure
    // than before it, which is the one direction it must never move.
    expect(seen.hasSeen('linkreq_soonest', 1)).toBe(true);
    expect(seen.hasSeen('linkreq_later', 1)).toBe(true);
    expect(seen.hasSeen('linkreq_new', 1)).toBe(false);

    db.exec('DROP TRIGGER planted_seen_insert_fails');
    seen.remember('linkreq_new', 90_000);
    expect(seen.hasSeen('linkreq_soonest', 1)).toBe(false);
    expect(seen.hasSeen('linkreq_new', 1)).toBe(true);
  });

  it('refuses a ceiling that is not a positive whole number', () => {
    // A ceiling of zero would evict what it just wrote and remember nothing,
    // which reads as a working replay guard and is none.
    for (const ceiling of [0, -1, 1.5, Number.NaN]) {
      expect(() => store(ceiling)).toThrow(/invalid_pico_link_direct_seen_request_ceiling/u);
    }
  });
});
