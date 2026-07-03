import type Database from 'better-sqlite3';

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}

export interface MigrationOptions {
  requireBackupBeforeMigration?: boolean;
  backupConfirmed?: boolean;
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

export function runMigrations(db: Database.Database, options: MigrationOptions = {}): void {
  ensureMigrationTable(db);

  const applied = new Set(
    db
      .prepare('SELECT id FROM schema_migration')
      .all()
      .map((row) => (row as { id: string }).id),
  );

  const pendingMigrations = migrations.filter((migration) => !applied.has(migration.id));
  assertBackupContract(pendingMigrations, options);

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

export function listAppliedMigrations(db: Database.Database): AppliedMigration[] {
  ensureMigrationTable(db);

  return db
    .prepare('SELECT id, applied_at AS appliedAt FROM schema_migration ORDER BY id ASC')
    .all() as AppliedMigration[];
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
