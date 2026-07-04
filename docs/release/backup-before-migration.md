# Backup-before-migration contract

Pico is still in the foundation phase, but database migrations must already follow a clear safety model.

## Rule

Before a migration can change, remove, rewrite or reinterpret existing user-relevant data, the migration must be marked as backup-requiring.

A backup-requiring migration must not run in a protected runtime unless backup confirmation has been provided to the migration runner.

## Current implementation

The migration runner accepts:

```ts
{
  requireBackupBeforeMigration?: boolean;
  backupConfirmed?: boolean;
}
```

The default foundation runtime currently calls the migration runner without requiring backup confirmation because the initial schema migration only creates empty foundation tables.

The core package also provides SQLite backup and restore helpers:

```ts
await createSqliteBackup(databasePath, backupDirectory);
restoreSqliteBackup(backupPath, databasePath, { overwrite: true });
```

The restore helper validates the backup as a readable SQLite database before replacing an existing database path. Replacement is explicit: callers must set `overwrite: true`, and the service must be stopped before restoring a live Home Assistant add-on database.

The core package can inspect migration state without applying migrations:

```ts
describeMigrationState(db);
```

This diagnostic path reports applied migration IDs, pending migration IDs, unknown future migration IDs and whether the pending migrations require backup. It must not be treated as a public API or a policy decision point.

The migration runner refuses to run when the database contains applied migration IDs that are not known to the current Pico Core build. This protects downgrade and rollback cases from silently running older code against a newer schema.

Applied and failed schema update attempts are recorded in `schema_migration_audit` when the audit table is available. This is a foundation update-safety log, not the future product audit trail for policy or tool execution.

Pending migrations and their schema migration audit record are written in one SQLite transaction. Pico must not leave `schema_migration` claiming that a migration succeeded when the matching migration audit record could not be written.

Future production runtimes should call the runner with:

```ts
{
  requireBackupBeforeMigration: true
}
```

For a backup-requiring migration, the runtime must only set `backupConfirmed: true` after a backup step has completed successfully.

## Migration classification

Each migration has an explicit backup classification.

| Classification | Meaning | Backup required |
|---|---|---|
| `requiresBackup: false` | Creates additive foundation structures or idempotent indexes without changing existing user data. | No |
| `requiresBackup: true` | Changes, removes, rewrites, compacts, reinterprets, encrypts, decrypts, exports or relocates existing user-relevant data. | Yes |

When unsure, classify the migration as backup-requiring.

## Examples

Generally safe without backup confirmation:

- Creating a new empty table.
- Creating an index with `CREATE INDEX IF NOT EXISTS`.
- Creating the migration registry table.
- Creating the additive schema migration audit table.
- Adding nullable diagnostic columns to the schema migration audit table.

Backup-requiring:

- Dropping a table or column.
- Rewriting event payloads.
- Moving data between tables.
- Changing stream, event, memory or audit semantics.
- Changing encryption, retention or deletion behaviour.
- Changing how existing payloads are interpreted.

## Release rule

A release containing backup-requiring migrations must document:

1. Which migration requires backup.
2. What data can be affected.
3. How the backup is created.
4. How restore is expected to work.
5. How the migration behaves if backup confirmation is missing.

If a rollback crosses a migration boundary, restore the database backup that matches the target Pico Core version. An older Core must not delete or reinterpret unknown future migrations.

Current migration classifications:

| Migration | Backup required | Reason |
|---|---:|---|
| `0001_event_store` | No | Creates the initial foundation event store tables and indexes. |
| `0002_schema_migration_audit` | No | Creates an additive migration audit table and index without rewriting existing data. |
| `0003_schema_migration_audit_errors` | No | Adds nullable migration failure diagnostics to the migration audit table. |

## Current limitation

Pico can create and restore SQLite backup files through explicit helper calls, and the restore path is covered by tests.

The default runtime does not yet perform automatic backup creation, restore verification, or rollback during startup.

The current contract only prevents future backup-requiring migrations from silently running in runtimes that enforce backup confirmation. Automatic backup orchestration and production rollback behaviour must be added before Pico stores production personal data.
