import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  picoHomeClaimResponseRecordSchema,
  picoHomeFoundingRecordSchema,
  buildPicoIdentityKeyRecordSignatureInput,
  picoHomeMembershipScopes,
  type PicoEvent,
  type PicoHomeFoundingRecord,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import { createPicoTestFirstDeviceEvidence } from './test-first-device-evidence.js';
import { EventStore } from './event-store.js';
import { openPicoHomeRecoveryAnchor } from './recovery-anchor.js';
import {
  decidePicoLinkPush,
  picoLinkPushLedgerHorizonMs,
} from './link-push-floor.js';
import type { MigrationDefinition } from './migrations.js';

const tempDirs: string[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-event-store-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeAll(async () => {
  await sodium.ready;
});

describe('EventStore', () => {
  it('opens through the backup-aware migration path', async () => {
    const databasePath = createDatabasePath();
    const backupDirectory = join(dirname(databasePath), 'backups');
    const migrationDefinitions = backupAwareTestMigrations();
    const source = new Database(databasePath);
    source.exec(`
      CREATE TABLE schema_migration (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE sample (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_migration (id, applied_at)
      VALUES ('0001_base', '2026-07-10T00:00:00.000Z');
      INSERT INTO sample (id, value)
      VALUES ('row-1', 'before migration');
    `);
    source.close();
    const backupCalls: string[] = [];

    const store = await EventStore.open(databasePath, {
      backupDirectory,
      migrationDefinitions,
      createBackup: async (backupDatabasePath, requestedBackupDirectory) => {
        backupCalls.push(`${backupDatabasePath}:${requestedBackupDirectory}`);
        const beforeMigration = new Database(backupDatabasePath, { readonly: true, fileMustExist: true });

        try {
          expect(beforeMigration.prepare('SELECT value FROM sample WHERE id = ?').get('row-1')).toEqual({
            value: 'before migration',
          });
          expect(beforeMigration.prepare('PRAGMA table_info(sample)').all().map((row) => (row as { name: string }).name)).toEqual([
            'id',
            'value',
          ]);
        } finally {
          beforeMigration.close();
        }

        return {
          sourcePath: backupDatabasePath,
          backupPath: join(requestedBackupDirectory, 'pico.sqlite.test-backup.bak'),
          createdAt: '2026-07-10T00:01:00.000Z',
        };
      },
    });

    store.close();

    expect(backupCalls).toEqual([`${databasePath}:${backupDirectory}`]);

    const migrated = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      expect(migrated.prepare('PRAGMA table_info(sample)').all().map((row) => (row as { name: string }).name)).toEqual([
        'id',
        'value',
        'migrated_at',
      ]);
      expect(migrated.prepare('SELECT id FROM schema_migration ORDER BY id').all()).toEqual([
        { id: '0001_base' },
        { id: '0002_requires_backup' },
      ]);
    } finally {
      migrated.close();
    }
  });

  it('refuses backup-requiring startup migrations when backup creation fails', async () => {
    const databasePath = createDatabasePath();
    const migrationDefinitions = backupAwareTestMigrations();
    const source = new Database(databasePath);
    source.exec(`
      CREATE TABLE schema_migration (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE sample (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO schema_migration (id, applied_at)
      VALUES ('0001_base', '2026-07-10T00:00:00.000Z');
    `);
    source.close();

    await expect(EventStore.open(databasePath, {
      migrationDefinitions,
      createBackup: async () => {
        throw new Error('backup failed');
      },
    })).rejects.toThrow('backup failed');

    const unchanged = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      expect(unchanged.prepare('PRAGMA table_info(sample)').all().map((row) => (row as { name: string }).name)).toEqual([
        'id',
        'value',
      ]);
      expect(unchanged.prepare('SELECT id FROM schema_migration ORDER BY id').all()).toEqual([
        { id: '0001_base' },
      ]);
    } finally {
      unchanged.close();
    }
  });

  it('treats an identical event id and envelope as an idempotent duplicate', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent();

    expect(store.append(event)).toBe('inserted');
    expect(store.append(event)).toBe('duplicate_same_payload');
    expect(store.list()).toEqual([event]);

    store.close();
  });

  it('treats semantically equal payload objects with different key order as idempotent duplicates', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent({
      payload: {
        role: 'user',
        text: 'Hallo Pico',
        metadata: {
          source: 'test',
          priority: 'normal',
        },
      },
    });

    expect(store.append(event)).toBe('inserted');
    expect(store.append({
      ...event,
      payload: {
        metadata: {
          priority: 'normal',
          source: 'test',
        },
        text: 'Hallo Pico',
        role: 'user',
      },
    })).toBe('duplicate_same_payload');

    store.close();
  });

  it('treats the same event id with a changed envelope as a duplicate conflict', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent();

    expect(store.append(event)).toBe('inserted');
    expect(store.append({
      ...event,
      lamport: 2,
    })).toBe('duplicate_conflict');
    expect(store.list()).toEqual([event]);

    store.close();
  });

  it('round-trips an explicit payload posture and omits it when absent', () => {
    const store = new EventStore(createDatabasePath());

    const withPosture = createEvent({ eventId: 'event-posture', payloadPosture: 'inline_operational' });
    const withoutPosture = createEvent({ eventId: 'event-plain', lamport: 2 });

    expect(store.append(withPosture)).toBe('inserted');
    expect(store.append(withoutPosture)).toBe('inserted');

    const listed = store.list();
    const stored = listed.find((event) => event.eventId === 'event-posture');
    const plain = listed.find((event) => event.eventId === 'event-plain');

    expect(stored?.payloadPosture).toBe('inline_operational');
    expect(plain?.payloadPosture).toBeUndefined();
    expect(plain !== undefined && 'payloadPosture' in plain).toBe(false);

    store.close();
  });

  it('treats a changed payload posture on the same event id as a duplicate conflict', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent({ payloadPosture: 'inline_operational' });

    expect(store.append(event)).toBe('inserted');
    expect(store.append(event)).toBe('duplicate_same_payload');
    expect(store.append({ ...event, payloadPosture: 'inline_test' })).toBe('duplicate_conflict');

    store.close();
  });

  it('rejects an unknown payload posture at the store boundary', () => {
    const store = new EventStore(createDatabasePath());
    const event = createEvent();

    expect(() => store.append({ ...event, payloadPosture: 'not_a_posture' as never })).toThrow('payloadPosture must be a known posture.');

    store.close();
  });

  it('lists events in stable Lamport order and applies the requested limit', () => {
    const store = new EventStore(createDatabasePath());

    /**
     * Der Gleichstand auf Lamport 2 steht zwischen **zwei Geraeten**, und seit
     * Nutzerentscheidung 18 kann er nur noch dort stehen: ein Geraet vergibt
     * eine Zahl genau einmal. Das ist auch der Fall, fuer den diese Ordnung
     * ihren Tiebreak ueberhaupt braucht - ADR 0014s Log wird repliziert, und
     * zwei Geraete wissen nichts voneinander.
     */
    store.append(createEvent({
      eventId: 'event-3',
      deviceId: 'device-2',
      lamport: 2,
      wallTime: '2026-07-04T12:02:00.000Z',
    }));
    store.append(createEvent({
      eventId: 'event-1',
      lamport: 1,
      wallTime: '2026-07-04T12:00:00.000Z',
    }));
    store.append(createEvent({
      eventId: 'event-2',
      lamport: 2,
      wallTime: '2026-07-04T12:01:00.000Z',
    }));

    expect(store.list().map((event) => event.eventId)).toEqual(['event-1', 'event-2', 'event-3']);
    expect(store.list(2).map((event) => event.eventId)).toEqual(['event-1', 'event-2']);

    store.close();
  });

  it('returns stable cursor pages using Lamport, wall time and event id ordering', () => {
    const store = new EventStore(createDatabasePath());

    for (const event of [
      // Drei Ereignisse auf Lamport 2, also drei Geraete: seit
      // Nutzerentscheidung 18 vergibt eines seine Zahl genau einmal, und ein
      // Gleichstand ist damit immer einer zwischen Geraeten.
      createEvent({ eventId: 'event-1', lamport: 1, wallTime: '2026-07-04T12:00:00.000Z' }),
      createEvent({ eventId: 'event-2', lamport: 2, wallTime: '2026-07-04T12:00:00.000Z' }),
      createEvent({ eventId: 'event-3', deviceId: 'device-2', lamport: 2, wallTime: '2026-07-04T12:00:00.000Z' }),
      createEvent({ eventId: 'event-4', deviceId: 'device-3', lamport: 2, wallTime: '2026-07-04T12:01:00.000Z' }),
    ]) {
      store.append(event);
    }

    const firstPage = store.listPage({ limit: 2 });
    expect(firstPage.events.map((event) => event.eventId)).toEqual(['event-1', 'event-2']);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toEqual({ lamport: 2, wallTime: '2026-07-04T12:00:00.000Z', eventId: 'event-2' });

    const secondPage = store.listPage({ limit: 2, after: firstPage.nextCursor });
    expect(secondPage.events.map((event) => event.eventId)).toEqual(['event-3', 'event-4']);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toEqual({ lamport: 2, wallTime: '2026-07-04T12:01:00.000Z', eventId: 'event-4' });

    const emptyPage = store.listPage({ limit: 2, after: secondPage.nextCursor });
    expect(emptyPage).toEqual({ events: [], nextCursor: null, hasMore: false });

    store.close();
  });

  it('returns the latest tail page in ascending event order', () => {
    const store = new EventStore(createDatabasePath());

    for (const event of [
      createEvent({ eventId: 'event-1', lamport: 1, wallTime: '2026-07-04T12:00:00.000Z' }),
      createEvent({ eventId: 'event-2', lamport: 2, wallTime: '2026-07-04T12:00:00.000Z' }),
      // Der Gleichstand auf 2 steht zwischen zwei Geraeten (Entscheidung 18).
      createEvent({ eventId: 'event-3', deviceId: 'device-2', lamport: 2, wallTime: '2026-07-04T12:01:00.000Z' }),
      createEvent({ eventId: 'event-4', lamport: 3, wallTime: '2026-07-04T12:02:00.000Z' }),
    ]) {
      store.append(event);
    }

    const tail = store.listTail(2);

    expect(tail.events.map((event) => event.eventId)).toEqual(['event-3', 'event-4']);
    expect(tail.nextCursor).toBeNull();
    expect(tail.hasMore).toBe(true);

    store.close();
  });

  it('returns an empty tail page for an empty store', () => {
    const store = new EventStore(createDatabasePath());

    expect(store.listTail(2)).toEqual({ events: [], nextCursor: null, hasMore: false });

    store.close();
  });

  it('rejects invalid list limits at the store boundary', () => {
    const store = new EventStore(createDatabasePath());

    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => store.list(limit)).toThrow('EventStore list limit must be a positive safe integer.');
      expect(() => store.listPage({ limit })).toThrow('EventStore list limit must be a positive safe integer.');
      expect(() => store.listTail(limit)).toThrow('EventStore list limit must be a positive safe integer.');
    }

    store.close();
  });

  it('rejects invalid stored event envelopes', () => {
    const invalidEvents: Array<[Partial<PicoEvent>, string]> = [
      [{ eventId: '   ' }, 'Event eventId must be a non-empty string.'],
      [{ deviceId: '   ' }, 'Event deviceId must be a non-empty string.'],
      [{ sessionId: '   ' }, 'Event sessionId must be a non-empty string.'],
      [{ lamport: -1 }, 'Event lamport must be a non-negative safe integer.'],
      [{ lamport: Number.MAX_SAFE_INTEGER + 1 }, 'Event lamport must be a non-negative safe integer.'],
      [{ wallTime: '   ' }, 'Event wallTime must be a non-empty string.'],
      [{ stream: '   ' }, 'Event stream must be a non-empty string.'],
      [{ signature: '   ' }, 'Event signature must be a non-empty string.'],
    ];

    for (const [overrides, error] of invalidEvents) {
      const store = new EventStore(createDatabasePath());

      expect(() => store.append(createEvent(overrides))).toThrow(error);

      store.close();
    }
  });

  it('reads the initial internal Pico Home claim state', () => {
    const store = new EventStore(createDatabasePath());

    expect(store.picoHomeClaimState()).toEqual({
      state: 'unclaimed',
      hostAdminPicoId: null,
      homeId: null,
      hostSigningKeyFingerprintHex: null,
      hostKeyAgreementKeyFingerprintHex: null,
      claimedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    store.close();
  });

  it('reads a claimed internal Pico Home claim state without providing a write API', () => {
    const databasePath = createDatabasePath();
    const store = new EventStore(databasePath);
    store.close();

    const claimedAt = '2026-07-05T12:00:00.000Z';
    const db = new Database(databasePath);
    db
      .prepare(`
        UPDATE pico_home_claim_state
        SET state = ?,
            host_admin_pico_id = ?,
            home_id = ?,
            host_signing_key_fingerprint_hex = ?,
            host_key_agreement_key_fingerprint_hex = ?,
            claimed_at = ?,
            updated_at = ?
        WHERE id = 1
      `)
      .run(
        'claimed',
        'pico:home-host',
        'home_20260718',
        '1'.repeat(64),
        '2'.repeat(64),
        claimedAt,
        claimedAt,
      );
    db.close();

    const reopenedStore = new EventStore(databasePath);

    expect(reopenedStore.picoHomeClaimState()).toEqual({
      state: 'claimed',
      hostAdminPicoId: 'pico:home-host',
      homeId: 'home_20260718',
      hostSigningKeyFingerprintHex: '1'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
      claimedAt,
      createdAt: expect.any(String),
      updatedAt: claimedAt,
    });

    reopenedStore.close();
  });

  it('claims and resets a Pico Home through the store boundary', () => {
    const store = new EventStore(createDatabasePath());

    const claimed = store.claimPicoHome({
      homeId: 'home_20260718',
      hostAdminPicoId: 'pico:home-host',
      hostSigningKeyFingerprintHex: '1'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
      claimedAt: '2026-07-18T09:00:00.000Z',
      sodium,
    });

    expect(claimed).toEqual({
      state: 'claimed',
      hostAdminPicoId: 'pico:home-host',
      homeId: 'home_20260718',
      hostSigningKeyFingerprintHex: '1'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
      claimedAt: '2026-07-18T09:00:00.000Z',
      createdAt: expect.any(String),
      updatedAt: '2026-07-18T09:00:00.000Z',
    });
    expect(() => store.claimPicoHome({
      homeId: 'home_20260719',
      hostAdminPicoId: 'pico:other-host',
      hostSigningKeyFingerprintHex: '3'.repeat(64),
      hostKeyAgreementKeyFingerprintHex: '4'.repeat(64),
    })).toThrow('Pico Home is already claimed.');

    expect(store.resetPicoHome('2026-07-18T10:00:00.000Z')).toEqual({
      state: 'unclaimed',
      hostAdminPicoId: null,
      homeId: null,
      hostSigningKeyFingerprintHex: null,
      hostKeyAgreementKeyFingerprintHex: null,
      claimedAt: null,
      createdAt: expect.any(String),
      updatedAt: '2026-07-18T10:00:00.000Z',
    });

    store.close();
  });

  it('refuses a founding record under the collapsed v2 name instead of founding unverified', () => {
    /**
     * ADR 0134 F2 collapsed `pico.home.founding-record.v1`/`v2` into the
     * surviving `v1` name on 2026-08-10, and the baseline's CHECK constraint
     * still admits the `v2` spelling - deliberately, because a migration
     * describes what a database already holds. What keeps such a record out is
     * this refusal, and no test named it until 2026-09-17 (B183).
     *
     * It matters which guard fires: the claim path also carried a *dispatch*
     * on the same comparison, whose false branch skipped the first device's
     * lifecycle evidence and reader-key registration entirely. That branch was
     * already unreachable behind this refusal - measured, not assumed - and is
     * gone now.
     */
    const store = new EventStore(createDatabasePath());
    const collapsed = {
      ...createPicoHomeFoundingRecord(),
      schema: 'pico.home.founding-record.v2' as never,
    };

    expect(() => store.claimPicoHome({
      homeId: collapsed.founding.homeId,
      hostAdminPicoId: `pico:identity:${collapsed.founding.homeHostPicoIdentityFingerprintHex}`,
      hostSigningKeyFingerprintHex: collapsed.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: collapsed.founding.hostKeyAgreementKeyFingerprintHex,
      foundingRecord: collapsed,
      sodium,
    })).toThrow('Pico Home founding record schema is invalid.');

    expect(store.picoHomeClaimState().state).toBe('unclaimed');
    expect(store.picoHomeFoundingRecord()).toBeUndefined();
    store.close();
  });

  it('persists and clears the current Pico Home founding record through the store boundary', () => {
    const store = new EventStore(createDatabasePath());
    const foundingRecord = createPicoHomeFoundingRecord();

    const claimed = store.claimPicoHome({
      homeId: foundingRecord.founding.homeId,
      hostAdminPicoId: `pico:identity:${foundingRecord.founding.homeHostPicoIdentityFingerprintHex}`,
      hostSigningKeyFingerprintHex: foundingRecord.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: foundingRecord.founding.hostKeyAgreementKeyFingerprintHex,
      foundingRecord,
      sodium,
    });

    expect(claimed.homeId).toBe(foundingRecord.founding.homeId);
    expect(claimed.claimedAt).toBe(foundingRecord.founding.foundedAt);
    expect(store.picoHomeFoundingRecord()).toEqual(foundingRecord);
    expect(store.picoHomeMemberships()).toEqual([
      {
        membershipId: `founding:${foundingRecord.founding.foundingId}:home_host`,
        homeId: foundingRecord.founding.homeId,
        picoIdentityFingerprintHex: foundingRecord.founding.homeHostPicoIdentityFingerprintHex,
        role: 'home_host',
        status: 'active',
        scopes: [...picoHomeMembershipScopes],
        source: 'founding_record',
        sourceRef: foundingRecord.founding.foundingId,
        validFrom: foundingRecord.founding.foundedAt,
        validUntil: null,
        createdAt: foundingRecord.createdAt,
        updatedAt: foundingRecord.createdAt,
      },
    ]);
    expect(store.hasActivePicoHomeMembership(foundingRecord.founding.homeHostPicoIdentityFingerprintHex)).toBe(true);
    expect(store.hasActivePicoHomeMembership('b'.repeat(64))).toBe(false);

    store.resetPicoHome('2026-07-19T11:00:00.000Z');
    expect(store.picoHomeFoundingRecord()).toBeUndefined();
    expect(store.picoHomeMemberships()).toEqual([]);

    store.close();
  });

  it('reconciles restored Pico Home membership projection from founding evidence', async () => {
    const databasePath = createDatabasePath();
    const store = new EventStore(databasePath);
    const foundingRecord = createPicoHomeFoundingRecord();

    store.claimPicoHome({
      homeId: foundingRecord.founding.homeId,
      hostAdminPicoId: `pico:identity:${foundingRecord.founding.homeHostPicoIdentityFingerprintHex}`,
      hostSigningKeyFingerprintHex: foundingRecord.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: foundingRecord.founding.hostKeyAgreementKeyFingerprintHex,
      foundingRecord,
      sodium,
    });
    store.close();

    const stale = new Database(databasePath);
    stale.prepare('DELETE FROM pico_home_membership').run();
    stale.close();

    const reopened = await EventStore.open(databasePath);

    expect(reopened.picoHomeMemberships()).toEqual([
      {
        membershipId: `founding:${foundingRecord.founding.foundingId}:home_host`,
        homeId: foundingRecord.founding.homeId,
        picoIdentityFingerprintHex: foundingRecord.founding.homeHostPicoIdentityFingerprintHex,
        role: 'home_host',
        status: 'active',
        scopes: [...picoHomeMembershipScopes],
        source: 'founding_record',
        sourceRef: foundingRecord.founding.foundingId,
        validFrom: foundingRecord.founding.foundedAt,
        validUntil: null,
        createdAt: foundingRecord.createdAt,
        updatedAt: expect.any(String),
      },
    ]);
    expect(reopened.reconcilePicoHomeMembershipsFromFoundingEvidence('2026-07-19T12:05:00.000Z')).toEqual({
      foundingRecordPresent: true,
      restoredMembership: false,
    });

    reopened.close();
  });

  it('drops restored memberships from a superseded founding instead of failing to open', async () => {
    const databasePath = createDatabasePath();
    const store = new EventStore(databasePath);
    const foundingRecord = createPicoHomeFoundingRecord();

    store.claimPicoHome({
      homeId: foundingRecord.founding.homeId,
      hostAdminPicoId: `pico:identity:${foundingRecord.founding.homeHostPicoIdentityFingerprintHex}`,
      hostSigningKeyFingerprintHex: foundingRecord.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: foundingRecord.founding.hostKeyAgreementKeyFingerprintHex,
      foundingRecord,
      sodium,
    });
    store.close();

    // A restore brings back the membership root of an earlier founding: same
    // Home, same role, different founding. It occupies the current row's unique
    // key and would otherwise stay active forever.
    const stale = new Database(databasePath);
    stale.prepare('DELETE FROM pico_home_membership').run();
    stale
      .prepare(`
        INSERT INTO pico_home_membership (
          membership_id, home_id, pico_identity_fingerprint_hex, role, status,
          scopes_json, source, source_ref, valid_from, valid_until, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        'founding:founding_20260101:home_host',
        foundingRecord.founding.homeId,
        foundingRecord.founding.homeHostPicoIdentityFingerprintHex,
        'home_host',
        'active',
        JSON.stringify([...picoHomeMembershipScopes]),
        'founding_record',
        'founding_20260101',
        '2026-01-01T10:00:00.000Z',
        null,
        '2026-01-01T10:00:00.000Z',
        '2026-01-01T10:00:00.000Z',
      );
    stale.close();

    const reopened = await EventStore.open(databasePath);

    expect(reopened.picoHomeMemberships().map((membership) => membership.membershipId)).toEqual([
      `founding:${foundingRecord.founding.foundingId}:home_host`,
    ]);
    expect(reopened.picoHomeMemberships()[0]?.sourceRef).toBe(foundingRecord.founding.foundingId);
    expect(reopened.reconcilePicoHomeMembershipsFromFoundingEvidence('2026-07-19T12:05:00.000Z')).toEqual({
      foundingRecordPresent: true,
      restoredMembership: false,
    });

    reopened.close();
  });

  it('scopes active membership lookups to the claimed Home', () => {
    const databasePath = createDatabasePath();
    const store = new EventStore(databasePath);
    const foundingRecord = createPicoHomeFoundingRecord();

    store.claimPicoHome({
      homeId: foundingRecord.founding.homeId,
      hostAdminPicoId: `pico:identity:${foundingRecord.founding.homeHostPicoIdentityFingerprintHex}`,
      hostSigningKeyFingerprintHex: foundingRecord.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: foundingRecord.founding.hostKeyAgreementKeyFingerprintHex,
      foundingRecord,
      sodium,
    });

    const fingerprint = foundingRecord.founding.homeHostPicoIdentityFingerprintHex;
    expect(store.hasActivePicoHomeMembership(fingerprint)).toBe(true);
    expect(store.hasActivePicoHomeMembership(fingerprint, foundingRecord.founding.homeId)).toBe(true);
    expect(store.hasActivePicoHomeMembership(fingerprint, 'home_other')).toBe(false);

    // An unclaimed Home has no member at all, so the lookup must fail closed.
    store.resetPicoHome('2026-07-19T11:00:00.000Z');
    expect(store.hasActivePicoHomeMembership(fingerprint)).toBe(false);

    store.close();
  });

  it('reconciles restored Pico Home claim state from founding evidence', async () => {
    const databasePath = createDatabasePath();
    const store = new EventStore(databasePath);
    const foundingRecord = createPicoHomeFoundingRecord();

    store.claimPicoHome({
      homeId: foundingRecord.founding.homeId,
      hostAdminPicoId: `pico:identity:${foundingRecord.founding.homeHostPicoIdentityFingerprintHex}`,
      hostSigningKeyFingerprintHex: foundingRecord.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: foundingRecord.founding.hostKeyAgreementKeyFingerprintHex,
      foundingRecord,
      sodium,
    });
    store.close();

    const stale = new Database(databasePath);
    stale.prepare(`
      UPDATE pico_home_claim_state
      SET state = 'unclaimed',
          host_admin_pico_id = NULL,
          home_id = NULL,
          host_signing_key_fingerprint_hex = NULL,
          host_key_agreement_key_fingerprint_hex = NULL,
          claimed_at = NULL,
          updated_at = '2026-07-19T12:00:00.000Z'
      WHERE id = 1
    `).run();
    stale.close();

    const reopened = await EventStore.open(databasePath);

    expect(reopened.picoHomeClaimState()).toEqual({
      state: 'claimed',
      hostAdminPicoId: `pico:identity:${foundingRecord.founding.homeHostPicoIdentityFingerprintHex}`,
      homeId: foundingRecord.founding.homeId,
      hostSigningKeyFingerprintHex: foundingRecord.founding.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: foundingRecord.founding.hostKeyAgreementKeyFingerprintHex,
      claimedAt: foundingRecord.founding.foundedAt,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(reopened.reconcilePicoHomeFoundingEvidence('2026-07-19T12:05:00.000Z')).toEqual({
      foundingRecordPresent: true,
      restoredClaimState: false,
    });

    reopened.close();
  });

  it('closes the SQLite connection idempotently', () => {
    const store = new EventStore(createDatabasePath());

    expect(store.maxLamport()).toBe(0);
    expect(store.picoHomeClaimState().state).toBe('unclaimed');

    store.close();
    expect(() => store.close()).not.toThrow();
    expect(() => store.maxLamport()).toThrow('EventStore is closed.');
    expect(() => store.picoHomeClaimState()).toThrow('EventStore is closed.');
  });

  it('reconciles memory tombstones onto the store, idempotently', () => {
    const store = new EventStore(createDatabasePath());

    // A resurrected active item plus an append-only tombstone referencing it.
    store.memory().create({
      memoryItemId: 'mem-1',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'a note',
    });
    store.append(createEvent({
      eventId: 'tomb-1',
      type: 'memory.tombstone',
      payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private' },
    }));

    // Appending the event does not touch the store; the item is still active.
    expect(store.memory().getInDomain('mem-1', 'domain-private')?.deletionState).toBe('active');

    expect(store.reconcileMemoryTombstones()).toEqual({ enforced: 1 });
    const reconciled = store.memory().getInDomain('mem-1', 'domain-private');
    expect(reconciled?.deletionState).toBe('tombstoned');
    expect(reconciled !== undefined && 'content' in reconciled).toBe(false);

    expect(store.reconcileMemoryTombstones()).toEqual({ enforced: 0 });

    store.close();
  });

  it('enforces recorded deletions on open', async () => {
    const databasePath = createDatabasePath();

    const seed = new EventStore(databasePath);
    seed.memory().create({
      memoryItemId: 'mem-1',
      privacyDomain: 'domain-private',
      owner: 'pico-owner',
      controller: 'pico-owner',
      contentType: 'text/plain',
      content: 'a note',
    });
    seed.append(createEvent({
      eventId: 'tomb-1',
      type: 'memory.tombstone',
      payload: { memoryItemId: 'mem-1', privacyDomain: 'domain-private' },
    }));
    seed.close();

    const reopened = await EventStore.open(databasePath);
    const item = reopened.memory().getInDomain('mem-1', 'domain-private');
    expect(item?.deletionState).toBe('tombstoned');
    expect(item !== undefined && 'content' in item).toBe(false);
    reopened.close();
  });
});

function createEvent(overrides: Partial<PicoEvent> = {}): PicoEvent {
  return {
    eventId: 'event-1',
    deviceId: 'device-1',
    sessionId: 'session-1',
    lamport: 1,
    wallTime: '2026-07-04T12:00:00.000Z',
    type: 'message.created',
    stream: 'session:session-1',
    payload: {
      role: 'user',
      text: 'Hallo Pico',
    },
    ...overrides,
  };
}

function createPicoHomeFoundingRecord(): PicoHomeFoundingRecord {
  const claimant = sodium.crypto_sign_keypair();
  const claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: 'pico.suite.id.v1',
    keyRole: 'pico_identity',
    publicKeyHex: hex(claimant.publicKey),
  };
  const homeHostPicoIdentityFingerprintHex = hex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(claimantIdentityKeyRecord),
    null,
  ));
  const evidence = createPicoTestFirstDeviceEvidence({
    sodium,
    claimantIdentityPrivateKey: claimant.privateKey,
    claimantIdentityKeyFingerprintHex: homeHostPicoIdentityFingerprintHex,
  });
  const homeId = 'home_20260719';
  const foundingId = 'founding_20260719';
  const claimId = 'claim_20260719';
  const hostSigningKeyFingerprintHex = '1'.repeat(64);
  const hostKeyAgreementKeyFingerprintHex = '2'.repeat(64);
  const claimantNonceHex = '4'.repeat(64);
  const hostNonceHex = '5'.repeat(64);
  const foundedAt = '2026-07-19T10:00:00.000Z';

  return {
    schema: picoHomeFoundingRecordSchema,
    founding: {
      suite: 'pico.suite.id.v1',
      foundingId,
      homeId,
      hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex,
      homeHostPicoIdentityFingerprintHex,
      claimantNonceHex,
      hostNonceHex,
      foundedAt,
      lifecycleOrder: 'seq:0000000000000001',
      ...evidence.foundingFields,
    },
    firstDeviceSigningKeyRecord: evidence.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: evidence.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: evidence.firstDeviceDelegation,
    firstDeviceRevocations: evidence.firstDeviceRevocations,
    claimantIdentityKeyRecord,
    claimantFoundingSignatureHex: '8'.repeat(128),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: {
        suite: 'pico.suite.id.v1',
        claimId,
        homeId,
        hostSigningKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex,
        claimantIdentityKeyFingerprintHex: homeHostPicoIdentityFingerprintHex,
        claimantNonceHex,
        hostNonceHex,
        foundingRecordId: foundingId,
      },
      hostSignatureHex: '9'.repeat(128),
    },
    hostFoundingSignatureHex: 'a'.repeat(128),
    createdAt: foundedAt,
  };
}

/**
 * ADR 0150 PU5 auf dem Weg, den das Produkt geht (Befund B150, 2026-09-11).
 *
 * **Die Regel gegen das zweite Wecken war nur gegen ein Modell bewiesen.**
 * `link-push-floor.test.ts` zeigt sie an einer reinen Funktion ueber einem
 * Array - und die hat keinen Produktaufrufer: das Home haengt an SQLite an und
 * raeumt getrennt auf. Auf *dieser* Seite hielt sie nichts. Die Pflanzung
 * „`isPicoUniqueConstraintViolation` erkennt nichts mehr" liess alle 1.153
 * Pruefungen des Kerns gruen, obwohl damit jede Bedingungsverletzung des
 * Speichers ungefangen entkommt.
 *
 * Was PU5 verhindert, ist ein Home, das dasselbe Ereignis wieder und wieder
 * auf das Geraet einer Person schiebt - der Batterieangriff, von ihm selbst
 * ausgefuehrt. Die Regel dagegen haelt allein das Schema.
 */
describe('deletions on a wall clock nobody can trust (B225)', () => {
  /**
   * ADR 0120 N5 sagt, warum der Aufbewahrungs-Sweeper auf einer unglaubhaften
   * Uhr **nichts** loescht: *„being able to run is not permission to act on
   * nonsense"*. In demselben Takt liefen zwei weitere Loeschungen, die dieselbe
   * Uhr lesen und nie gefragt haben - das Push-Register und der
   * Beobachtungspuffer. Beide fragen jetzt dieselbe Funktion.
   *
   * Der Boden kommt aus dem Wiederherstellungsanker; ohne Anker gibt es keinen
   * Boden, und „kein Boden ist kein Beweis fuer Unsinn" - dann wird geloescht
   * wie zuvor. Genau das haelt der erste Fall fest, damit die Regel keine
   * Aufbewahrungsstoerung aus einer fehlenden Datei macht.
   */
  it('prunes as before when there is no floor to compare against', async () => {
    const databasePath = createDatabasePath();
    const store = await EventStore.open(databasePath, {
      backupDirectory: join(dirname(databasePath), 'backups'),
    });
    expect(store.recoveryAnchorFloorMs()).toBeNull();
    // Ohne Boden faellt keine Entscheidung aus, und ein Lauf ueber eine leere
    // Tabelle loescht null Zeilen statt zu verweigern - der Unterschied ist,
    // dass hier nichts refused wird.
    expect(store.prunePicoObservations(new Date('2036-01-01T00:00:00.000Z').toISOString()))
      .toBe(0);
    store.close();
  });

  it('deletes nothing once the clock sits a year past the durable floor', async () => {
    const databasePath = createDatabasePath();
    const floorAt = '2026-09-20T00:00:00.000Z';
    const anchor = openPicoHomeRecoveryAnchor(
      join(dirname(databasePath), 'recovery-anchor', 'anchor.json'),
      { now: () => new Date(floorAt) },
    );
    if (anchor.isEmpty()) {
      anchor.seed({ homeId: null, entries: [] });
    }
    const store = await EventStore.open(databasePath, {
      backupDirectory: join(dirname(databasePath), 'backups'),
      recoveryAnchor: anchor,
    });
    // Nicht auf die Millisekunde: der Boden nimmt die beobachtete Zeit dieses
    // Prozesses mit (ADR 0120 N2), also steht er knapp hinter `floorAt`.
    const floor = store.recoveryAnchorFloorMs();
    expect(floor).not.toBeNull();
    expect(Math.abs((floor ?? 0) - Date.parse(floorAt))).toBeLessThan(60_000);

    // **Mit Gegenstand**, sonst prueft der Fall nichts: beide Tabellen
    // bekommen je eine Zeile, die auf einer glaubhaften Uhr faellig waere.
    const old = '2026-09-10T00:00:00.000Z';
    expect(store.appendPicoObservations([{
      kind: 'location_fix',
      privacyDomain: 'home',
      observedAt: old,
      payload: 'x',
    }])).toBe(1);
    store.recordPicoLinkPush({
      deviceSigningKeyFingerprintHex: 'ab'.repeat(32),
      occasion: 'objection_window_closing',
      eventId: 'cccccccc-1111-4111-8111-000000000001',
      pushedAt: old,
    });

    // Eine Uhr, die zwei Jahre vor dem Boden steht - der Fall, gegen den N5
    // geschrieben ist. Beide Loeschungen melden null, und zwar weil sie
    // verweigern: die Zeilen sind faellig und bleiben.
    const nonsense = '2028-09-20T00:00:00.000Z';
    expect(store.prunePicoObservations(nonsense)).toBe(0);
    expect(store.prunePicoLinkPushLedger(nonsense)).toBe(0);

    // Und auf einer glaubhaften Uhr laufen beide wieder - sonst waere die
    // Regel eine Aufbewahrungsstoerung statt einer Weigerung.
    const sane = '2026-09-21T00:00:00.000Z';
    expect(store.prunePicoObservations(sane)).toBe(1);
    expect(store.prunePicoLinkPushLedger(sane)).toBe(1);
    store.close();
  });
});

describe('what a second Home on one database does (B222)', () => {
  /**
   * Nichts hindert einen zweiten Kern daran, dieselbe Datei zu oeffnen, und
   * zwei Zaehler in diesem Baum vertragen das unterschiedlich gut.
   *
   * **Die Auditkette vertraegt es**, weil sie ihren Kopf **bei jedem** Anhaengen
   * frisch liest: zwei Prozesse verschraenken ihre Positionen und die Kette
   * bleibt eine. **Die Lamport-Uhr vertraegt es nicht**, weil sie beim Start
   * einmal aus `maxLamport()` gesetzt und danach nie wieder abgeglichen wird.
   *
   * Bis zum 2026-09-22 nahm der Log darum zwei Ereignisse desselben Geraets
   * mit derselben Zahl an, und dieser Test hielt das fest, ohne es zu
   * billigen. **Nutzerentscheidung 18** hat es entschieden: dieselbe Form,
   * mit der `pico_audit_record` es eine Tabelle weiter schon verhindert.
   * Sie faellt am Speicher, nicht an einer Absicht - eine Sperre kann
   * fehlschlagen, ein Index nicht.
   */
  it('refuses the second core by name instead of taking its number', async () => {
    const databasePath = createDatabasePath();
    const backupDirectory = join(dirname(databasePath), 'backups');

    const first = await EventStore.open(databasePath, { backupDirectory });
    const second = await EventStore.open(databasePath, { backupDirectory });

    // Der Startwert, den beide beim Hochfahren lesen wuerden.
    expect(first.maxLamport()).toBe(0);
    expect(second.maxLamport()).toBe(0);

    const event = (eventId: string, note: string) => ({
      eventId,
      deviceId: 'pico-core',
      lamport: 1,
      wallTime: '2026-09-19T10:00:00.000Z',
      type: 'device.seen' as const,
      stream: 'probe',
      payload: { note },
    });

    expect(first.append(event('aaaaaaaa-1111-4111-8111-000000000001', 'A'))).toBe('inserted');

    // Dasselbe Geraet, dieselbe Lamport-Zahl, ein anderes Ereignis. Der Satz
    // gehoert zum Fund: ohne ihn laese ein Mensch den rohen SQLite-Text und
    // suchte den Fehler in seinen Daten statt in seiner Aufstellung.
    let refused: Error | undefined;
    try {
      second.append(event('bbbbbbbb-2222-4222-8222-000000000002', 'B'));
    } catch (error) {
      refused = error as Error;
    }
    expect(refused?.message).toContain('pico_event_lamport_already_used');
    expect(refused?.message).toContain('another Pico core is writing to this database');
    expect(refused?.message).toContain('Run one core per database');

    // Und nichts ist liegengeblieben: die Zahl gehoert weiterhin dem ersten.
    expect(first.maxLamport()).toBe(1);
    expect(
      (first as unknown as { db: { prepare(q: string): { all(...a: unknown[]): unknown[] } } })
        .db.prepare('SELECT event_id FROM pico_event WHERE lamport = 1').all(),
    ).toHaveLength(1);
    first.close();
    second.close();
  });

  it('lets the same core keep counting, because the rule is about two clocks', async () => {
    /**
     * Die Gegenseite, damit die Regel nicht mehr verbietet als sie soll: ein
     * einzelner Kern vergibt fortlaufende Zahlen und wird von nichts
     * aufgehalten. Und ein *zweites* Geraet darf dieselbe Zahl haben - die
     * Eindeutigkeit gilt je Geraet, nicht global, weil ADR 0014s Log
     * repliziert wird und eine globale Kette den einen Schreiber behaupten
     * wuerde, den es nicht gibt.
     */
    const store = await EventStore.open(createDatabasePath(), {});
    const event = (eventId: string, deviceId: string, lamport: number) => ({
      eventId,
      deviceId,
      lamport,
      wallTime: '2026-09-19T10:00:00.000Z',
      type: 'device.seen' as const,
      stream: 'probe',
      payload: { note: eventId },
    });

    expect(store.append(event('cccccccc-1111-4111-8111-000000000001', 'pico-core', 1))).toBe('inserted');
    expect(store.append(event('cccccccc-1111-4111-8111-000000000002', 'pico-core', 2))).toBe('inserted');
    // Dasselbe Paar, anderes Geraet: erlaubt.
    expect(store.append(event('dddddddd-2222-4222-8222-000000000001', 'other-device', 1))).toBe('inserted');
    store.close();
  });
});

describe('the probe a watchdog stands on (B217)', () => {
  it('answers while the store is open and throws once it is not', async () => {
    const databasePath = createDatabasePath();
    const store = await EventStore.open(databasePath, {
      backupDirectory: join(dirname(databasePath), 'backups'),
    });

    // Healthy is the uninteresting half, and it has to be asserted anyway:
    // a probe that threw on a good store would take down every Home.
    expect(() => store.probe()).not.toThrow();

    store.close();

    // The failure a watchdog exists for. Without this the health route could
    // report on a store it never touches and nothing would notice - which is
    // exactly the state B217 found it in.
    expect(() => store.probe()).toThrow();
  });
});

describe('ADR 0150 PU5 - the push ledger the Home actually writes', () => {
  const device = 'a'.repeat(64);
  const pushedAt = '2026-09-11T12:00:00.000Z';

  it('refuses a second row for the same device, occasion and event', () => {
    const store = new EventStore(createDatabasePath());
    store.recordPicoLinkPush({
      deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending',
      eventId: 'recovery-1',
      pushedAt,
    });
    expect(() => store.recordPicoLinkPush({
      deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending',
      eventId: 'recovery-1',
      pushedAt: '2026-09-11T12:30:00.000Z',
    })).toThrow('pico_link_push_already_recorded');
    expect(store.picoLinkPushLedger()).toHaveLength(1);

    // Ein anderes Ereignis ist ein anderer Push, und eine andere Gelegenheit
    // ebenso - die Bedingung ist das Tripel und nicht das Geraet.
    store.recordPicoLinkPush({
      deviceSigningKeyFingerprintHex: device,
      occasion: 'objection_window_closing',
      eventId: 'recovery-1',
      pushedAt,
    });
    expect(store.picoLinkPushLedger()).toHaveLength(2);
    store.close();
  });

  it('keeps the row long enough that the decision still refuses a retry', () => {
    const store = new EventStore(createDatabasePath());
    store.recordPicoLinkPush({
      deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending',
      eventId: 'recovery-1',
      pushedAt,
    });
    const twelveHoursLater = Date.parse(pushedAt) + 12 * 60 * 60 * 1_000;
    expect(decidePicoLinkPush({
      ledger: store.picoLinkPushLedger(),
      deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending',
      eventId: 'recovery-1',
      nowMs: twelveHoursLater,
    }).reason).toBe('already_pushed_for_this_event');
    store.close();
  });

  it('forgets only past the horizon, and the refusal goes with it', () => {
    const store = new EventStore(createDatabasePath());
    store.recordPicoLinkPush({
      deviceSigningKeyFingerprintHex: device,
      occasion: 'device_recovery_pending',
      eventId: 'recovery-1',
      pushedAt,
    });
    // Der Stichtag ist der, den `app.ts` rechnet: jetzt minus Horizont. Mit
    // dieser Formel geschrieben, damit der Test den Ausdruck prueft, den das
    // Produkt benutzt, und nicht einen daneben.
    const cutoffAt = (nowMs: number): string =>
      new Date(nowMs - picoLinkPushLedgerHorizonMs).toISOString();

    const twelveHours = Date.parse(pushedAt) + 12 * 60 * 60 * 1_000;
    expect(store.prunePicoLinkPushLedger(cutoffAt(twelveHours))).toBe(0);
    expect(store.picoLinkPushLedger()).toHaveLength(1);

    const pastTheHorizon = Date.parse(pushedAt) + picoLinkPushLedgerHorizonMs + 1_000;
    expect(store.prunePicoLinkPushLedger(cutoffAt(pastTheHorizon))).toBe(1);
    expect(store.picoLinkPushLedger()).toEqual([]);
    store.close();
  });
});

function backupAwareTestMigrations(): readonly MigrationDefinition[] {
  return [
    {
      id: '0001_base',
      requiresBackup: false,
      up(db) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS sample (
            id TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
        `);
      },
    },
    {
      id: '0002_requires_backup',
      requiresBackup: true,
      up(db) {
        db.exec('ALTER TABLE sample ADD COLUMN migrated_at TEXT NULL;');
      },
    },
  ];
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}
