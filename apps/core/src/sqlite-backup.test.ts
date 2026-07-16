import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { listAppliedMigrations, runMigrations } from './migrations.js';
import { createSqliteBackup, restoreSqliteBackup } from './sqlite-backup.js';

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-sqlite-backup-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('createSqliteBackup', () => {
  it('creates a readable SQLite backup with the same data', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'pico.sqlite');
    const backupDirectory = join(dir, 'backups');

    const source = new Database(databasePath);
    source.exec(`
      CREATE TABLE sample (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    source.prepare('INSERT INTO sample (id, value) VALUES (?, ?)').run('row-1', 'Hallo Pico');
    source.close();

    const result = await createSqliteBackup(
      databasePath,
      backupDirectory,
      new Date('2026-07-03T12:34:56.789Z'),
    );

    expect(result.sourcePath).toBe(databasePath);
    expect(result.backupPath).toBe(join(backupDirectory, 'pico.sqlite.2026-07-03T12-34-56-789Z.bak'));
    expect(result.createdAt).toBe('2026-07-03T12:34:56.789Z');
    expect(existsSync(result.backupPath)).toBe(true);

    const backup = new Database(result.backupPath, { readonly: true, fileMustExist: true });
    const row = backup.prepare('SELECT id, value FROM sample').get() as { id: string; value: string };
    backup.close();

    expect(row).toEqual({
      id: 'row-1',
      value: 'Hallo Pico',
    });
  });

  it('creates the backup directory when it does not exist', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'pico.sqlite');
    const backupDirectory = join(dir, 'nested', 'backups');

    const source = new Database(databasePath);
    source.exec('CREATE TABLE sample (id TEXT PRIMARY KEY);');
    source.close();

    const result = await createSqliteBackup(databasePath, backupDirectory);

    expect(existsSync(result.backupPath)).toBe(true);
  });

  it('does not overwrite an existing backup with the same timestamp', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'pico.sqlite');
    const backupDirectory = join(dir, 'backups');
    const createdAt = new Date('2026-07-03T12:34:56.789Z');

    const source = new Database(databasePath);
    source.exec(`
      CREATE TABLE sample (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    source.prepare('INSERT INTO sample (id, value) VALUES (?, ?)').run('row-1', 'first');
    source.close();

    const firstBackup = await createSqliteBackup(databasePath, backupDirectory, createdAt);

    const changed = new Database(databasePath);
    changed.prepare('UPDATE sample SET value = ? WHERE id = ?').run('second', 'row-1');
    changed.close();

    const secondBackup = await createSqliteBackup(databasePath, backupDirectory, createdAt);

    expect(firstBackup.backupPath).toBe(join(backupDirectory, 'pico.sqlite.2026-07-03T12-34-56-789Z.bak'));
    expect(secondBackup.backupPath).toBe(join(backupDirectory, 'pico.sqlite.2026-07-03T12-34-56-789Z.1.bak'));

    const first = new Database(firstBackup.backupPath, { readonly: true, fileMustExist: true });
    const firstRow = first.prepare('SELECT value FROM sample WHERE id = ?').get('row-1') as { value: string };
    first.close();

    const second = new Database(secondBackup.backupPath, { readonly: true, fileMustExist: true });
    const secondRow = second.prepare('SELECT value FROM sample WHERE id = ?').get('row-1') as { value: string };
    second.close();

    expect(firstRow.value).toBe('first');
    expect(secondRow.value).toBe('second');
  });

  it('rejects missing source databases', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'missing.sqlite');
    const backupDirectory = join(dir, 'backups');

    await expect(createSqliteBackup(databasePath, backupDirectory)).rejects.toThrow(
      `SQLite database does not exist: ${databasePath}`,
    );
  });
});

describe('restoreSqliteBackup', () => {
  it('restores a backup over an existing database and keeps migrations idempotent', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'pico.sqlite');
    const backupDirectory = join(dir, 'backups');

    const source = new Database(databasePath);
    runMigrations(source);
    source.prepare(`
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
      'event-before-backup',
      'device-1',
      null,
      1,
      '2026-07-03T12:00:00.000Z',
      'message.created',
      'device:device-1',
      '{"role":"user","text":"before backup"}',
      null,
      '2026-07-03T12:00:00.000Z',
    );
    source.close();

    const backup = await createSqliteBackup(databasePath, backupDirectory);

    const changed = new Database(databasePath);
    changed.prepare('DELETE FROM pico_event').run();
    changed.prepare(`
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
      'event-after-backup',
      'device-1',
      null,
      2,
      '2026-07-03T12:05:00.000Z',
      'message.created',
      'device:device-1',
      '{"role":"user","text":"after backup"}',
      null,
      '2026-07-03T12:05:00.000Z',
    );
    changed.close();
    writeFileSync(`${databasePath}-wal`, 'old wal sidecar');
    writeFileSync(`${databasePath}-shm`, 'old shm sidecar');

    const result = restoreSqliteBackup(backup.backupPath, databasePath, {
      overwrite: true,
      now: new Date('2026-07-03T12:10:00.000Z'),
    });

    expect(result).toEqual({
      backupPath: backup.backupPath,
      restoredPath: databasePath,
      restoredAt: '2026-07-03T12:10:00.000Z',
    });

    const restored = new Database(databasePath);
    runMigrations(restored);

    const rows = restored
      .prepare('SELECT event_id AS eventId, payload_json AS payloadJson FROM pico_event ORDER BY lamport ASC')
      .all() as Array<{ eventId: string; payloadJson: string }>;

    expect(rows).toEqual([
      {
        eventId: 'event-before-backup',
        payloadJson: '{"role":"user","text":"before backup"}',
      },
    ]);
    expect(listAppliedMigrations(restored)).toEqual([
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
    ]);

    restored.close();
    expect(existsSync(`${databasePath}-wal`)).toBe(false);
    expect(existsSync(`${databasePath}-shm`)).toBe(false);
  });

  it('refuses to replace an existing database without explicit overwrite', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'pico.sqlite');
    const backupDirectory = join(dir, 'backups');

    const source = new Database(databasePath);
    source.exec('CREATE TABLE sample (id TEXT PRIMARY KEY);');
    source.close();

    const backup = await createSqliteBackup(databasePath, backupDirectory);

    expect(() => restoreSqliteBackup(backup.backupPath, databasePath)).toThrow(
      `SQLite database already exists: ${databasePath}`,
    );
  });

  it('rejects missing backup files', () => {
    const dir = createTempDir();
    const backupPath = join(dir, 'missing.bak');
    const databasePath = join(dir, 'pico.sqlite');

    expect(() => restoreSqliteBackup(backupPath, databasePath)).toThrow(
      `SQLite backup does not exist: ${backupPath}`,
    );
  });

  it('keeps the existing database when a replacement backup is invalid', () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'pico.sqlite');
    const backupPath = join(dir, 'invalid.bak');

    const source = new Database(databasePath);
    source.exec('CREATE TABLE sample (id TEXT PRIMARY KEY, value TEXT NOT NULL);');
    source.prepare('INSERT INTO sample (id, value) VALUES (?, ?)').run('row-1', 'live value');
    source.close();
    writeFileSync(backupPath, 'not a sqlite database');

    expect(() => restoreSqliteBackup(backupPath, databasePath, { overwrite: true })).toThrow();

    const live = new Database(databasePath, { readonly: true, fileMustExist: true });
    const row = live.prepare('SELECT value FROM sample WHERE id = ?').get('row-1') as { value: string };
    live.close();

    expect(row.value).toBe('live value');
    expect(readdirSync(dir).some((entry) => entry.includes('.restore'))).toBe(false);
  });

  it('does not overwrite an existing temporary restore file', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'pico.sqlite');
    const backupDirectory = join(dir, 'backups');
    const reservedTemporaryPath = join(dir, '.pico.sqlite.restore.tmp');

    const source = new Database(databasePath);
    source.exec('CREATE TABLE sample (id TEXT PRIMARY KEY, value TEXT NOT NULL);');
    source.prepare('INSERT INTO sample (id, value) VALUES (?, ?)').run('row-1', 'backup value');
    source.close();

    const backup = await createSqliteBackup(databasePath, backupDirectory);

    const changed = new Database(databasePath);
    changed.prepare('UPDATE sample SET value = ? WHERE id = ?').run('live value', 'row-1');
    changed.close();
    writeFileSync(reservedTemporaryPath, 'reserved temp file');

    restoreSqliteBackup(backup.backupPath, databasePath, { overwrite: true });

    const restored = new Database(databasePath, { readonly: true, fileMustExist: true });
    const row = restored.prepare('SELECT value FROM sample WHERE id = ?').get('row-1') as { value: string };
    restored.close();

    expect(row.value).toBe('backup value');
    expect(readFileSync(reservedTemporaryPath, 'utf8')).toBe('reserved temp file');
    expect(readdirSync(dir).filter((entry) => entry.includes('.restore'))).toEqual(['.pico.sqlite.restore.tmp']);
  });
});
