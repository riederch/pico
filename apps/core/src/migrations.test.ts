import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { listAppliedMigrations, listMigrationAuditRecords, runMigrations } from './migrations.js';

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
    ]);

    db.close();
  });

  it('runs idempotently', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    runMigrations(db);

    expect(listAppliedMigrations(db)).toHaveLength(3);
    expect(listMigrationAuditRecords(db)).toHaveLength(1);

    db.close();
  });

  it('can require backup confirmation without blocking safe foundation migrations', () => {
    const db = new Database(createDatabasePath());

    expect(() => runMigrations(db, { requireBackupBeforeMigration: true })).not.toThrow();
    expect(listAppliedMigrations(db)).toHaveLength(3);

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
    expect(listAppliedMigrations(db)).toHaveLength(3);

    db.close();
  });

  it('records applied migrations in the schema migration audit log', () => {
    const db = new Database(createDatabasePath());

    const result = runMigrations(db);

    expect(result.appliedMigrationIds).toEqual([
      '0001_event_store',
      '0002_schema_migration_audit',
      '0003_schema_migration_audit_errors',
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

    db.close();
  });
});
