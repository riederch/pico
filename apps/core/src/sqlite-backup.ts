import { constants, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';

export interface SqliteBackupResult {
  sourcePath: string;
  backupPath: string;
  createdAt: string;
}

export interface SqliteRestoreOptions {
  overwrite?: boolean;
  now?: Date;
}

export interface SqliteRestoreResult {
  backupPath: string;
  restoredPath: string;
  restoredAt: string;
}

export async function createSqliteBackup(databasePath: string, backupDirectory: string, now = new Date()): Promise<SqliteBackupResult> {
  if (!existsSync(databasePath)) {
    throw new Error(`SQLite database does not exist: ${databasePath}`);
  }

  mkdirSync(backupDirectory, { recursive: true });

  const createdAt = now.toISOString();
  const sourceName = basename(databasePath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const backupName = `${sourceName}.${toSafeTimestamp(createdAt)}.bak`;
  const backupPath = join(backupDirectory, backupName);

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });

  try {
    await db.backup(backupPath);
  } finally {
    db.close();
  }

  return {
    sourcePath: databasePath,
    backupPath,
    createdAt,
  };
}

export function restoreSqliteBackup(backupPath: string, databasePath: string, options: SqliteRestoreOptions = {}): SqliteRestoreResult {
  if (!existsSync(backupPath)) {
    throw new Error(`SQLite backup does not exist: ${backupPath}`);
  }

  assertReadableSqliteDatabase(backupPath);

  if (existsSync(databasePath) && options.overwrite !== true) {
    throw new Error(`SQLite database already exists: ${databasePath}`);
  }

  mkdirSync(dirname(databasePath), { recursive: true });

  if (options.overwrite === true) {
    removeSqliteDatabaseFiles(databasePath);
  }

  copyFileSync(backupPath, databasePath, constants.COPYFILE_EXCL);
  assertReadableSqliteDatabase(databasePath);

  return {
    backupPath,
    restoredPath: databasePath,
    restoredAt: (options.now ?? new Date()).toISOString(),
  };
}

function toSafeTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

function removeSqliteDatabaseFiles(databasePath: string): void {
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
}

function assertReadableSqliteDatabase(databasePath: string): void {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });

  try {
    const row = db.prepare('PRAGMA quick_check').get() as { quick_check: string };

    if (row.quick_check !== 'ok') {
      throw new Error(`SQLite database failed integrity check: ${databasePath}`);
    }
  } finally {
    db.close();
  }
}
