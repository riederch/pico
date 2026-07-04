import type Database from 'better-sqlite3';
import type { SqliteBackupResult } from './sqlite-backup.js';
import { createSqliteBackup } from './sqlite-backup.js';

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}

export interface MigrationOptions {
  requireBackupBeforeMigration?: boolean;
  backupConfirmed?: boolean;
}

export interface BackupAwareMigrationOptions {
  databasePath: string;
  backupDirectory: string;
  requireBackupBeforeMigration?: boolean;
  createBackup?: (databasePath: string, backupDirectory: string) => Promise<SqliteBackupResult>;
}

export interface MigrationRunResult {
  appliedMigrationIds: string[];
  backup?: SqliteBackupResult;
}

interface Migration {
  id: string;
  requiresBackup: boolean;
  up(db: Database.Database): void;
}

const migrations: Migration[] = [
  {
    id: '0001_event_store',
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_event (
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

        CREATE INDEX IF NOT EXISTS idx_pico_event_lamport
        ON pico_event (lamport, wall_time, event_id);

        CREATE INDEX IF NOT EXISTS idx_pico_event_stream
        ON pico_event (stream, lamport);

        CREATE INDEX IF NOT EXISTS idx_pico_event_type
        ON pico_event (type, lamport);

        CREATE INDEX IF NOT EXISTS idx_pico_event_device
        ON pico_event (device_id, lamport);
      `);
    },
  },
];

export function runMigrations(db: Database.Database, options: MigrationOptions = {}): MigrationRunResult {
  ensureMigrationTable(db);

  const appliedMigrationIds = listAppliedMigrationIds(db);
  assertKnownAppliedMigrations(appliedMigrationIds);

  const pendingMigrations = listPendingMigrations(appliedMigrationIds);
  assertBackupContract(pendingMigrations, options);

  applyPendingMigrations(db, pendingMigrations);

  return {
    appliedMigrationIds: pendingMigrations.map((migration) => migration.id),
  };
}

export async function runMigrationsWithBackup(db: Database.Database, options: BackupAwareMigrationOptions): Promise<MigrationRunResult> {
  ensureMigrationTable(db);

  const appliedMigrationIds = listAppliedMigrationIds(db);
  assertKnownAppliedMigrations(appliedMigrationIds);

  const pendingMigrations = listPendingMigrations(appliedMigrationIds);
  const backupRequired = pendingMigrations.some((migration) => migration.requiresBackup);
  let backup: SqliteBackupResult | undefined;

  if (options.requireBackupBeforeMigration && backupRequired) {
    const backupProvider = options.createBackup ?? createSqliteBackup;
    backup = await backupProvider(options.databasePath, options.backupDirectory);
  }

  const result = runMigrations(db, {
    requireBackupBeforeMigration: options.requireBackupBeforeMigration,
    backupConfirmed: backupRequired ? backup !== undefined : false,
  });

  return {
    ...result,
    backup,
  };
}

export function listAppliedMigrations(db: Database.Database): AppliedMigration[] {
  ensureMigrationTable(db);

  return db
    .prepare('SELECT id, applied_at AS appliedAt FROM schema_migration ORDER BY id ASC')
    .all() as AppliedMigration[];
}

function listAppliedMigrationIds(db: Database.Database): string[] {
  return db
    .prepare('SELECT id FROM schema_migration ORDER BY id ASC')
    .all()
    .map((row) => (row as { id: string }).id);
}

function listPendingMigrations(appliedMigrationIds: string[]): Migration[] {
  const applied = new Set(appliedMigrationIds);

  return migrations.filter((migration) => !applied.has(migration.id));
}

function assertKnownAppliedMigrations(appliedMigrationIds: string[]): void {
  const knownMigrationIds = new Set(migrations.map((migration) => migration.id));
  const unknownMigrationIds = appliedMigrationIds.filter((migrationId) => !knownMigrationIds.has(migrationId));

  if (unknownMigrationIds.length > 0) {
    throw new Error(
      `Database contains unsupported migration(s): ${unknownMigrationIds.join(', ')}. Refusing to run with this Pico Core version.`,
    );
  }
}

function applyPendingMigrations(db: Database.Database, pendingMigrations: Migration[]): void {
  const applyMigration = db.transaction((migration: Migration) => {
    migration.up(db);
    db
      .prepare('INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)')
      .run(migration.id, new Date().toISOString());
  });

  for (const migration of pendingMigrations) {
    applyMigration(migration);
  }
}

function assertBackupContract(pendingMigrations: Migration[], options: MigrationOptions): void {
  if (!options.requireBackupBeforeMigration) {
    return;
  }

  const backupRequired = pendingMigrations.some((migration) => migration.requiresBackup);
  if (backupRequired && !options.backupConfirmed) {
    throw new Error('Backup confirmation is required before applying backup-requiring migrations.');
  }
}

function ensureMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}
