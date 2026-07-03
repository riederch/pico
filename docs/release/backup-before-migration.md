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

## Current limitation

Pico does not yet create backup files automatically.

The current contract only prevents future backup-requiring migrations from silently running in runtimes that enforce backup confirmation. Automatic backup creation, restore verification and rollback documentation must be added before Pico stores production personal data.
