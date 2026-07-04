import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { listAppliedMigrations, runMigrations } from './migrations.js';

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
    expect(tables).toContain('pico_event');
    expect(listAppliedMigrations(db)).toEqual([
      {
        id: '0001_event_store',
        appliedAt: expect.any(String),
      },
    ]);

    db.close();
  });

  it('runs idempotently', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    runMigrations(db);

    expect(listAppliedMigrations(db)).toHaveLength(1);

    db.close();
  });

  it('can require backup confirmation without blocking safe foundation migrations', () => {
    const db = new Database(createDatabasePath());

    expect(() => runMigrations(db, { requireBackupBeforeMigration: true })).not.toThrow();
    expect(listAppliedMigrations(db)).toHaveLength(1);

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
    expect(listAppliedMigrations(db)).toHaveLength(1);

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
