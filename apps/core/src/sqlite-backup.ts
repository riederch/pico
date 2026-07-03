import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

export interface SqliteBackupResult {
  sourcePath: string;
  backupPath: string;
  createdAt: string;
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

function toSafeTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}
