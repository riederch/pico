import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqliteBackup } from './sqlite-backup.js';

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

  it('rejects missing source databases', async () => {
    const dir = createTempDir();
    const databasePath = join(dir, 'missing.sqlite');
    const backupDirectory = join(dir, 'backups');

    await expect(createSqliteBackup(databasePath, backupDirectory)).rejects.toThrow(
      `SQLite database does not exist: ${databasePath}`,
    );
  });
});
