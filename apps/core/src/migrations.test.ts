import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { describeMigrationState, listAppliedMigrations, listMigrationAuditRecords, runMigrations } from './migrations.js';

const tempDirs: string[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-migration-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('database migrations', () => {
  it('describes pending migrations without creating migration tables', () => {
    const db = new Database(createDatabasePath());

    expect(describeMigrationState(db)).toEqual({
      appliedMigrationIds: [],
      pendingMigrations: [
        {
          id: '0001_event_store',
          requiresBackup: false,
        },
        {
          id: '0002_schema_migration_audit',
          requiresBackup: false,
        },
        {
          id: '0003_schema_migration_audit_errors',
          requiresBackup: false,
        },
        {
          id: '0004_pico_home_claim_state',
          requiresBackup: false,
        },
        {
          id: '0005_event_payload_posture',
          requiresBackup: false,
        },
        {
          id: '0006_memory_item_store',
          requiresBackup: false,
        },
        {
          id: '0007_memory_item_content_posture',
          requiresBackup: false,
        },
        {
          id: '0008_memory_key_envelope',
          requiresBackup: false,
        },
        {
          id: '0009_memory_retention_policy',
          requiresBackup: false,
        },
        {
          id: '0010_foundation_operator',
          requiresBackup: false,
        },
        {
          id: '0011_memory_domain_custody',
          requiresBackup: false,
        },
        {
          id: '0012_pico_home_claim_metadata',
          requiresBackup: false,
        },
        {
          id: '0013_pico_home_founding_record',
          requiresBackup: false,
        },
      ],
      unknownMigrationIds: [],
      backupRequired: false,
    });

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all();

    expect(tables).toEqual([]);

    db.close();
  });

  it('applies the event store migration', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain('schema_migration');
    expect(tables).toContain('schema_migration_audit');
    expect(tables).toContain('pico_event');
    expect(tables).toContain('pico_home_claim_state');
    expect(tables).toContain('pico_home_founding_record');
    expect(tables).toContain('memory_domain_custody');
    expect(listAppliedMigrations(db)).toEqual([
      {
        id: '0001_event_store',
        appliedAt: expect.any(String),
      },
      {
        id: '0002_schema_migration_audit',
        appliedAt: expect.any(String),
      },
      {
        id: '0003_schema_migration_audit_errors',
        appliedAt: expect.any(String),
      },
      {
        id: '0004_pico_home_claim_state',
        appliedAt: expect.any(String),
      },
      {
        id: '0005_event_payload_posture',
        appliedAt: expect.any(String),
      },
      {
        id: '0006_memory_item_store',
        appliedAt: expect.any(String),
      },
      {
        id: '0007_memory_item_content_posture',
        appliedAt: expect.any(String),
      },
      {
        id: '0008_memory_key_envelope',
        appliedAt: expect.any(String),
      },
      {
        id: '0009_memory_retention_policy',
        appliedAt: expect.any(String),
      },
      {
        id: '0010_foundation_operator',
        appliedAt: expect.any(String),
      },
      {
        id: '0011_memory_domain_custody',
        appliedAt: expect.any(String),
      },
      {
        id: '0012_pico_home_claim_metadata',
        appliedAt: expect.any(String),
      },
      {
        id: '0013_pico_home_founding_record',
        appliedAt: expect.any(String),
      },
    ]);

    db.close();
  });

  it('creates an internal unclaimed Pico Home claim state skeleton', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);

    const rows = db
      .prepare(`
        SELECT
          id,
          state,
          host_admin_pico_id AS hostAdminPicoId,
          home_id AS homeId,
          host_signing_key_fingerprint_hex AS hostSigningKeyFingerprintHex,
          host_key_agreement_key_fingerprint_hex AS hostKeyAgreementKeyFingerprintHex,
          claimed_at AS claimedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pico_home_claim_state
      `)
      .all();

    expect(rows).toEqual([
      {
        id: 1,
        state: 'unclaimed',
        hostAdminPicoId: null,
        homeId: null,
        hostSigningKeyFingerprintHex: null,
        hostKeyAgreementKeyFingerprintHex: null,
        claimedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);

    expect(() => {
      db
        .prepare(`
          UPDATE pico_home_claim_state
          SET state = 'claimed',
              host_admin_pico_id = NULL,
              claimed_at = ?,
              updated_at = ?
          WHERE id = 1
        `)
        .run('2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z');
    }).toThrow();

    expect(() => {
      db
        .prepare(`
          INSERT INTO pico_home_claim_state (
            id,
            state,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?)
        `)
        .run(2, 'unclaimed', '2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z');
    }).toThrow();

    db.close();
  });

  it('runs idempotently', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    runMigrations(db);

    expect(describeMigrationState(db)).toEqual({
      appliedMigrationIds: [
        '0001_event_store',
        '0002_schema_migration_audit',
        '0003_schema_migration_audit_errors',
        '0004_pico_home_claim_state',
        '0005_event_payload_posture',
        '0006_memory_item_store',
        '0007_memory_item_content_posture',
        '0008_memory_key_envelope',
        '0009_memory_retention_policy',
        '0010_foundation_operator',
        '0011_memory_domain_custody',
        '0012_pico_home_claim_metadata',
        '0013_pico_home_founding_record',
      ],
      pendingMigrations: [],
      unknownMigrationIds: [],
      backupRequired: false,
    });
    expect(listAppliedMigrations(db)).toHaveLength(13);
    expect(listMigrationAuditRecords(db)).toHaveLength(1);

    db.close();
  });

  it('can require backup confirmation without blocking safe foundation migrations', () => {
    const db = new Database(createDatabasePath());

    expect(() => runMigrations(db, { requireBackupBeforeMigration: true })).not.toThrow();
    expect(listAppliedMigrations(db)).toHaveLength(13);

    db.close();
  });

  it('preserves existing event data when rerun', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    db.prepare(`
      INSERT INTO pico_event (
        event_id,
        device_id,
        session_id,
        lamport,
        wall_time,
        type,
        stream,
        payload_json,
        signature,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'event-1',
      'device-1',
      null,
      1,
      '2026-01-01T00:00:00.000Z',
      'message.created',
      'device:device-1',
      '{"role":"user","text":"Hallo"}',
      null,
      '2026-01-01T00:00:00.000Z',
    );

    runMigrations(db);

    const count = db.prepare('SELECT COUNT(*) AS count FROM pico_event').get() as { count: number };
    expect(count.count).toBe(1);
    expect(listAppliedMigrations(db)).toHaveLength(13);

    db.close();
  });

  it('records applied migrations in the schema migration audit log', () => {
    const db = new Database(createDatabasePath());

    const result = runMigrations(db);

    expect(result.appliedMigrationIds).toEqual([
      '0001_event_store',
      '0002_schema_migration_audit',
      '0003_schema_migration_audit_errors',
      '0004_pico_home_claim_state',
      '0005_event_payload_posture',
      '0006_memory_item_store',
      '0007_memory_item_content_posture',
      '0008_memory_key_envelope',
      '0009_memory_retention_policy',
      '0010_foundation_operator',
      '0011_memory_domain_custody',
      '0012_pico_home_claim_metadata',
      '0013_pico_home_founding_record',
    ]);
    expect(listMigrationAuditRecords(db)).toEqual([
      {
        id: 1,
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
        status: 'applied',
        migrationIds: [
          '0001_event_store',
          '0002_schema_migration_audit',
          '0003_schema_migration_audit_errors',
          '0004_pico_home_claim_state',
          '0005_event_payload_posture',
          '0006_memory_item_store',
          '0007_memory_item_content_posture',
          '0008_memory_key_envelope',
          '0009_memory_retention_policy',
          '0010_foundation_operator',
          '0011_memory_domain_custody',
          '0012_pico_home_claim_metadata',
          '0013_pico_home_founding_record',
        ],
      },
    ]);

    db.close();
  });

  it('rolls back migration registry changes when audit recording fails', () => {
    const db = new Database(createDatabasePath());

    db.exec(`
      CREATE TABLE schema_migration (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      INSERT INTO schema_migration (id, applied_at)
      VALUES ('0001_event_store', '2026-07-04T00:00:00.000Z');

      CREATE TABLE pico_event (
        event_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        session_id TEXT NULL,
        lamport INTEGER NOT NULL,
        wall_time TEXT NOT NULL,
        type TEXT NOT NULL,
        stream TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        signature TEXT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE schema_migration_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        migration_ids_json TEXT NOT NULL
      );

      CREATE TRIGGER reject_schema_migration_audit_insert
      BEFORE INSERT ON schema_migration_audit
      BEGIN
        SELECT RAISE(ABORT, 'schema migration audit insert blocked');
      END;
    `);

    expect(() => runMigrations(db)).toThrow('schema migration audit insert blocked');
    expect(listAppliedMigrations(db).map((migration) => migration.id)).toEqual([
      '0001_event_store',
    ]);
    expect(listMigrationAuditRecords(db)).toEqual([]);

    db.close();
  });

  it('records failed migration attempts when the audit table supports error messages', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    db.prepare('DELETE FROM schema_migration WHERE id = ?').run('0003_schema_migration_audit_errors');
    db.prepare('DELETE FROM schema_migration_audit').run();

    expect(() => runMigrations(db)).toThrow(/error_message/);
    expect(listAppliedMigrations(db).map((migration) => migration.id)).toEqual([
      '0001_event_store',
      '0002_schema_migration_audit',
      '0004_pico_home_claim_state',
      '0005_event_payload_posture',
      '0006_memory_item_store',
      '0007_memory_item_content_posture',
      '0008_memory_key_envelope',
      '0009_memory_retention_policy',
      '0010_foundation_operator',
      '0011_memory_domain_custody',
      '0012_pico_home_claim_metadata',
      '0013_pico_home_founding_record',
    ]);
    expect(listMigrationAuditRecords(db)).toEqual([
      {
        id: 2,
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
        status: 'failed',
        migrationIds: [
          '0003_schema_migration_audit_errors',
        ],
        errorMessage: expect.stringContaining('error_message'),
      },
    ]);

    db.close();
  });

  it('refuses to run when the database contains unknown future migrations', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    db
      .prepare('INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)')
      .run('9999_future_schema', '2026-07-04T00:00:00.000Z');

    expect(() => runMigrations(db)).toThrow(
      'Database contains unsupported migration(s): 9999_future_schema. Refusing to run with this Pico Core version.',
    );
    expect(describeMigrationState(db).unknownMigrationIds).toEqual([
      '9999_future_schema',
    ]);

    db.close();
  });
});
