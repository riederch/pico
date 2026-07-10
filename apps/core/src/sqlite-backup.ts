import { constants, copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
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

interface MovedSqliteSidecarFile {
  originalPath: string;
  movedPath: string;
}

export async function createSqliteBackup(databasePath: string, backupDirectory: string, now = new Date()): Promise<SqliteBackupResult> {
  if (!existsSync(databasePath)) {
    throw new Error(`SQLite database does not exist: ${databasePath}`);
  }

  mkdirSync(backupDirectory, { recursive: true });

  const createdAt = now.toISOString();
  const sourceName = basename(databasePath).replace(/[^a-zA-Z0-9._-]/g, '_');
  const backupBaseName = `${sourceName}.${toSafeTimestamp(createdAt)}`;
  const backupPath = nextAvailableBackupPath(backupDirectory, backupBaseName);

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

  const temporaryRestorePath = nextAvailableRestorePath(databasePath);
  let movedSidecars: MovedSqliteSidecarFile[] = [];

  try {
    copyFileSync(backupPath, temporaryRestorePath, constants.COPYFILE_EXCL);
    assertReadableSqliteDatabase(temporaryRestorePath);

    if (existsSync(databasePath) && options.overwrite !== true) {
      throw new Error(`SQLite database already exists: ${databasePath}`);
    }

    movedSidecars = moveSqliteSidecarFilesAside(databasePath);
    renameSync(temporaryRestorePath, databasePath);
    removeMovedSqliteSidecarFiles(movedSidecars);
    movedSidecars = [];
  } catch (error) {
    rmSync(temporaryRestorePath, { force: true });
    restoreMovedSqliteSidecarFiles(movedSidecars);
    throw error;
  }

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

function nextAvailableBackupPath(backupDirectory: string, backupBaseName: string): string {
  let backupPath = join(backupDirectory, `${backupBaseName}.bak`);
  let suffix = 1;

  while (existsSync(backupPath)) {
    backupPath = join(backupDirectory, `${backupBaseName}.${suffix}.bak`);
    suffix += 1;
  }

  return backupPath;
}

function nextAvailableRestorePath(databasePath: string): string {
  const restoreDirectory = dirname(databasePath);
  const restoreName = basename(databasePath).replace(/[^a-zA-Z0-9._-]/g, '_');
  let restorePath = join(restoreDirectory, `.${restoreName}.restore.tmp`);
  let suffix = 1;

  while (existsSync(restorePath)) {
    restorePath = join(restoreDirectory, `.${restoreName}.restore.${suffix}.tmp`);
    suffix += 1;
  }

  return restorePath;
}

function moveSqliteSidecarFilesAside(databasePath: string): MovedSqliteSidecarFile[] {
  const movedFiles: MovedSqliteSidecarFile[] = [];

  for (const sidecarPath of [`${databasePath}-wal`, `${databasePath}-shm`]) {
    if (!existsSync(sidecarPath)) {
      continue;
    }

    const movedPath = nextAvailableRestorePath(sidecarPath);
    renameSync(sidecarPath, movedPath);
    movedFiles.push({ originalPath: sidecarPath, movedPath });
  }

  return movedFiles;
}

function removeMovedSqliteSidecarFiles(movedFiles: MovedSqliteSidecarFile[]): void {
  for (const movedFile of movedFiles) {
    rmSync(movedFile.movedPath, { force: true });
  }
}

function restoreMovedSqliteSidecarFiles(movedFiles: MovedSqliteSidecarFile[]): void {
  for (const movedFile of [...movedFiles].reverse()) {
    if (existsSync(movedFile.movedPath) && !existsSync(movedFile.originalPath)) {
      renameSync(movedFile.movedPath, movedFile.originalPath);
    }
  }
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
