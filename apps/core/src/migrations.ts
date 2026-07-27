import type Database from 'better-sqlite3';
import type { SqliteBackupResult } from './sqlite-backup.js';
import { createSqliteBackup } from './sqlite-backup.js';

export interface AppliedMigration {
  id: string;
  appliedAt: string;
}

export interface MigrationAuditRecord {
  id: number;
  startedAt: string;
  finishedAt: string;
  status: MigrationAuditStatus;
  migrationIds: string[];
  errorMessage?: string;
}

type MigrationAuditStatus = 'applied' | 'failed';

export interface MigrationState {
  appliedMigrationIds: string[];
  pendingMigrations: MigrationPlanItem[];
  unknownMigrationIds: string[];
  backupRequired: boolean;
}

export interface MigrationPlanItem {
  id: string;
  requiresBackup: boolean;
}

export interface MigrationOptions {
  requireBackupBeforeMigration?: boolean;
  backupConfirmed?: boolean;
  migrationDefinitions?: readonly MigrationDefinition[];
}

export interface BackupAwareMigrationOptions {
  databasePath: string;
  backupDirectory: string;
  requireBackupBeforeMigration?: boolean;
  createBackup?: (databasePath: string, backupDirectory: string) => Promise<SqliteBackupResult>;
  migrationDefinitions?: readonly MigrationDefinition[];
}

export interface MigrationRunResult {
  appliedMigrationIds: string[];
  backup?: SqliteBackupResult;
}

export interface MigrationDefinition {
  id: string;
  requiresBackup: boolean;
  up(db: Database.Database): void;
}

const migrations: readonly MigrationDefinition[] = [
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
  {
    id: '0002_schema_migration_audit',
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migration_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          finished_at TEXT NOT NULL,
          status TEXT NOT NULL,
          migration_ids_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_schema_migration_audit_finished_at
        ON schema_migration_audit (finished_at);
      `);
    },
  },
  {
    id: '0003_schema_migration_audit_errors',
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE schema_migration_audit
        ADD COLUMN error_message TEXT NULL;
      `);
    },
  },
  {
    id: '0004_pico_home_claim_state',
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_home_claim_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state TEXT NOT NULL CHECK (state IN ('unclaimed', 'claimed')),
          host_admin_pico_id TEXT NULL,
          claimed_at TEXT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (
            (
              state = 'unclaimed'
              AND host_admin_pico_id IS NULL
              AND claimed_at IS NULL
            )
            OR (
              state = 'claimed'
              AND host_admin_pico_id IS NOT NULL
              AND length(trim(host_admin_pico_id)) > 0
              AND claimed_at IS NOT NULL
            )
          )
        );
      `);

      const now = new Date().toISOString();
      db
        .prepare(`
          INSERT OR IGNORE INTO pico_home_claim_state (
            id,
            state,
            host_admin_pico_id,
            claimed_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(1, 'unclaimed', null, null, now, now);
    },
  },
  {
    id: '0005_event_payload_posture',
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE pico_event
        ADD COLUMN payload_posture TEXT NULL;
      `);
    },
  },
  {
    id: '0006_memory_item_store',
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_item (
          memory_item_id TEXT PRIMARY KEY,
          privacy_domain TEXT NOT NULL,
          owner TEXT NOT NULL,
          controller TEXT NOT NULL,
          content_type TEXT NOT NULL,
          content TEXT NULL,
          retention_policy_ref TEXT NULL,
          deletion_state TEXT NOT NULL CHECK (deletion_state IN ('active', 'deleted', 'tombstoned')),
          source_ref TEXT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memory_item_domain
        ON memory_item (privacy_domain, deletion_state);
      `);
    },
  },
  {
    id: '0007_memory_item_content_posture',
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE memory_item
        ADD COLUMN content_posture TEXT NOT NULL DEFAULT 'plaintext_foundation'
        CHECK (content_posture IN ('plaintext_foundation', 'domain_encrypted'));

        ALTER TABLE memory_item
        ADD COLUMN key_envelope_ref TEXT NULL;
      `);
    },
  },
  {
    id: '0008_memory_key_envelope',
    requiresBackup: false,
    up(db) {
      // Per-item DEK wrapped by the per-domain KEK (ADR 0071 R2, ADR 0032 key
      // envelope). Holds ciphertext of the DEK plus the wrap nonce, suite and
      // KEK version. Never holds a KEK: unwrapping needs the KEK from the
      // separate key store (ADR 0072 R6), so this table stays in the database
      // and its backups without weakening crypto-shredding.
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_key_envelope (
          key_envelope_id TEXT PRIMARY KEY,
          memory_item_id TEXT NOT NULL,
          domain_id TEXT NOT NULL,
          suite TEXT NOT NULL,
          kek_version INTEGER NOT NULL,
          wrap_nonce TEXT NOT NULL,
          wrapped_dek TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_memory_key_envelope_domain
        ON memory_key_envelope (domain_id);
      `);
    },
  },
  {
    id: '0009_memory_retention_policy',
    requiresBackup: false,
    up(db) {
      // Named, editable retention policies (ADR 0074) referenced by a memory
      // item's retention_policy_ref. mode keep_until_deleted has no max age;
      // delete_after_max_age carries a positive whole-day maximum age. A missing
      // or unresolvable policy never deletes (fail-safe keep, enforced in code).
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_retention_policy (
          retention_policy_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('keep_until_deleted', 'delete_after_max_age')),
          max_age_days INTEGER NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    id: '0010_foundation_operator',
    requiresBackup: false,
    up(db) {
      // The Foundation Operator credential (ADR 0075 principal, ADR 0076
      // mechanics). This table holds a *verifier* only: an Argon2id hash string
      // whose parameters and salt are embedded in the string itself. It is never
      // a key and never content, so it may live in the database and its backups
      // without touching the ADR 0072 key/backup separation.
      //
      // Sessions are deliberately absent: they are in-memory only, so no backup
      // can resurrect a revoked session (ADR 0076).
      //
      // A single operator exists at most; the CHECK pins the row identity so a
      // second operator cannot be inserted by accident.
      db.exec(`
        CREATE TABLE IF NOT EXISTS foundation_operator (
          operator_id TEXT PRIMARY KEY CHECK (operator_id = 'operator'),
          credential_verifier TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    id: '0011_memory_domain_custody',
    requiresBackup: false,
    up(db) {
      // ADR 0078 K1/K6: make custody explicit per memory domain. Existing
      // implicit domains are today's ADR 0071/0072 single-host model.
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_domain_custody (
          privacy_domain TEXT PRIMARY KEY,
          custody_class TEXT NOT NULL DEFAULT 'host_custody'
            CHECK (custody_class IN ('host_custody', 'reader_custody')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT OR IGNORE INTO memory_domain_custody (
          privacy_domain,
          custody_class,
          created_at,
          updated_at
        )
        SELECT DISTINCT
          privacy_domain,
          'host_custody',
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        FROM memory_item;
      `);
    },
  },
  {
    id: '0012_pico_home_claim_metadata',
    requiresBackup: false,
    up(db) {
      // ADR 0080 M2: keep the existing claim-state seat but add the minimum
      // public metadata needed to make a successful setup-mode claim durable.
      // Existing claimed rows from earlier foundation builds may have NULLs
      // here; the runtime treats that as incomplete evidence and never reopens
      // setup mode because of it.
      db.exec(`
        ALTER TABLE pico_home_claim_state
        ADD COLUMN home_id TEXT NULL;

        ALTER TABLE pico_home_claim_state
        ADD COLUMN host_signing_key_fingerprint_hex TEXT NULL;

        ALTER TABLE pico_home_claim_state
        ADD COLUMN host_key_agreement_key_fingerprint_hex TEXT NULL;
      `);
    },
  },
  {
    id: '0013_pico_home_founding_record',
    requiresBackup: false,
    up(db) {
      // ADR 0080 M2: the current Home authority root is public signed evidence,
      // not a reusable secret. Keep exactly one current founding record; an
      // explicit local home reset clears it before a new Home is founded.
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_home_founding_record (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema TEXT NOT NULL CHECK (schema = 'pico.home.founding-record.v1'),
          founding_id TEXT NOT NULL UNIQUE,
          home_id TEXT NOT NULL UNIQUE,
          claim_id TEXT NOT NULL UNIQUE,
          home_host_pico_identity_fingerprint_hex TEXT NOT NULL,
          host_signing_key_fingerprint_hex TEXT NOT NULL,
          host_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          founded_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          claim_response_json TEXT NOT NULL,
          founding_json TEXT NOT NULL,
          claimant_identity_key_record_json TEXT NOT NULL,
          claimant_claim_signature_hex TEXT NOT NULL,
          claimant_founding_signature_hex TEXT NOT NULL,
          host_claim_response_signature_hex TEXT NOT NULL,
          host_founding_signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    id: '0014_pico_home_membership',
    requiresBackup: false,
    up(db) {
      // ADR 0080 M3 first runtime slice: persist the current Home membership
      // projection as public state. The founding record projects the Home Host
      // Pico's own active membership root; future signed member credentials and
      // lifecycle records reconcile into this table instead of being inferred
      // from operator sessions or spoofable memory provenance.
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_home_membership (
          membership_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('home_host', 'home_member')),
          status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'revoked', 'expired', 'evicted', 'transferred_or_reissued')),
          scopes_json TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source = 'founding_record'),
          source_ref TEXT NOT NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (home_id, pico_identity_fingerprint_hex, role)
        );

        CREATE INDEX IF NOT EXISTS idx_pico_home_membership_identity
        ON pico_home_membership (pico_identity_fingerprint_hex, status);

        CREATE INDEX IF NOT EXISTS idx_pico_home_membership_home
        ON pico_home_membership (home_id, status);
      `);
    },
  },
  {
    id: '0015_pico_home_founding_record_drop_claim_signature',
    requiresBackup: false,
    up(db) {
      // The claimant's signature over the claim was stored but could never be
      // checked again: its signed bytes carry the Move-In Code and the host
      // setup nonce, and neither is kept. A field that looks like evidence and
      // cannot be verified is worse than no field, so it goes. What remains is
      // fully checkable - both founding signatures cover the stored `founding`,
      // and the host claim-response signature covers the stored response.
      if (columnExists(db, 'pico_home_founding_record', 'claimant_claim_signature_hex')) {
        db.exec('ALTER TABLE pico_home_founding_record DROP COLUMN claimant_claim_signature_hex;');
      }
    },
  },
  {
    id: '0016_pico_home_membership_credentials',
    requiresBackup: false,
    up(db) {
      // ADR 0080 Gate M3: the signed records behind the membership projection.
      // Both signatures are kept because they answer different questions later:
      // the issuer signature is the authority and must stay re-verifiable after
      // any restore, the host activation countersignature only records that this
      // Home acknowledged the credential.
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_home_membership_credential (
          credential_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          issuer_pico_identity_fingerprint_hex TEXT NOT NULL,
          subject_pico_identity_fingerprint_hex TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('home_host', 'home_member')),
          lifecycle_order TEXT NOT NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT NOT NULL,
          membership_json TEXT NOT NULL,
          issuer_identity_key_record_json TEXT NOT NULL,
          issuer_signature_hex TEXT NOT NULL,
          host_activation_signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pico_home_membership_credential_subject
        ON pico_home_membership_credential (home_id, subject_pico_identity_fingerprint_hex);

        CREATE TABLE IF NOT EXISTS pico_home_membership_lifecycle (
          lifecycle_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          credential_id TEXT NOT NULL,
          subject_pico_identity_fingerprint_hex TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'revoked', 'expired', 'evicted', 'transferred_or_reissued')),
          reason_category TEXT NOT NULL,
          changed_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          lifecycle_json TEXT NOT NULL,
          issuer_identity_key_record_json TEXT NOT NULL,
          issuer_signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pico_home_membership_lifecycle_credential
        ON pico_home_membership_lifecycle (credential_id, lifecycle_order);
      `);

      // The projection now has a second source. Rebuilding the table is the only
      // way to widen a CHECK constraint in SQLite; the rows are a projection and
      // are rebuilt from their signed sources on the next reconciliation anyway.
      db.exec(`
        DROP TABLE IF EXISTS pico_home_membership;

        CREATE TABLE pico_home_membership (
          membership_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('home_host', 'home_member')),
          status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'revoked', 'expired', 'evicted', 'transferred_or_reissued')),
          scopes_json TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('founding_record', 'membership_credential')),
          source_ref TEXT NOT NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (home_id, pico_identity_fingerprint_hex, role)
        );

        CREATE INDEX IF NOT EXISTS idx_pico_home_membership_identity
        ON pico_home_membership (pico_identity_fingerprint_hex, status);

        CREATE INDEX IF NOT EXISTS idx_pico_home_membership_home
        ON pico_home_membership (home_id, status);
      `);
    },
  },
  {
    id: '0017_identity_sessions_and_domain_read_grants',
    requiresBackup: false,
    up(db) {
      // ADR 0082: public signed evidence only. Opaque session credentials and
      // private identity/device keys remain memory-only or in Pico Vault.
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_identity_delegation (
          delegation_id TEXT PRIMARY KEY,
          issuer_pico_identity_fingerprint_hex TEXT NOT NULL,
          subject_signing_key_fingerprint_hex TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT NOT NULL,
          delegation_json TEXT NOT NULL,
          issuer_identity_key_record_json TEXT NOT NULL,
          signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pico_identity_delegation_issuer
        ON pico_identity_delegation (issuer_pico_identity_fingerprint_hex, lifecycle_order);

        CREATE TABLE IF NOT EXISTS pico_identity_revocation (
          revocation_id TEXT PRIMARY KEY,
          issuer_pico_identity_fingerprint_hex TEXT NOT NULL,
          subject_kind TEXT NOT NULL CHECK (subject_kind IN ('delegation', 'key')),
          subject_ref TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          revocation_json TEXT NOT NULL,
          issuer_identity_key_record_json TEXT NOT NULL,
          signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pico_identity_revocation_issuer
        ON pico_identity_revocation (issuer_pico_identity_fingerprint_hex, lifecycle_order);

        CREATE TABLE IF NOT EXISTS pico_home_domain_read_grant (
          grant_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          host_signing_key_fingerprint_hex TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          controller_pico_identity_fingerprint_hex TEXT NOT NULL,
          reader_pico_identity_fingerprint_hex TEXT NOT NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          grant_json TEXT NOT NULL,
          issuer_identity_key_record_json TEXT NOT NULL,
          issuer_signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pico_home_domain_read_grant_reader
        ON pico_home_domain_read_grant (
          home_id,
          reader_pico_identity_fingerprint_hex,
          privacy_domain
        );

        CREATE TABLE IF NOT EXISTS pico_home_domain_read_grant_lifecycle (
          lifecycle_id TEXT PRIMARY KEY,
          grant_id TEXT NOT NULL,
          home_id TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          reader_pico_identity_fingerprint_hex TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status = 'revoked'),
          reason_category TEXT NOT NULL,
          changed_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          lifecycle_json TEXT NOT NULL,
          issuer_identity_key_record_json TEXT NOT NULL,
          issuer_signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pico_home_domain_read_grant_lifecycle_grant
        ON pico_home_domain_read_grant_lifecycle (grant_id, lifecycle_order);
      `);
    },
  },
  {
    id: '0018_pico_identity_reader_keys',
    requiresBackup: false,
    up(db) {
      // ADR 0083: this is public reader-key material bound to an already
      // verified identity delegation and the Home membership observed at
      // registration time. Freshness checkpoints are deliberately not stored:
      // only an authenticated registry/sync adapter may assert them.
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_identity_reader_key (
          delegation_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          device_signing_key_fingerprint_hex TEXT NOT NULL,
          device_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          device_key_agreement_key_record_json TEXT NOT NULL,
          registered_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pico_identity_reader_key_identity
        ON pico_identity_reader_key (
          home_id,
          pico_identity_fingerprint_hex,
          device_key_agreement_key_fingerprint_hex
        );
      `);
    },
  },
  {
    id: '0019_pico_share_envelopes',
    requiresBackup: false,
    up(db) {
      // ADR 0084: only controller-signed envelopes cross the durable boundary.
      // The sealed wrap is ciphertext whose digest is signature-bound; raw
      // domain KEKs and unsigned pending issuance state never enter SQLite.
      db.exec(`
        CREATE TABLE IF NOT EXISTS pico_share_envelope (
          issuance_id TEXT PRIMARY KEY,
          grant_id TEXT NOT NULL,
          delegation_id TEXT NOT NULL,
          home_id TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          kek_version INTEGER NOT NULL CHECK (kek_version >= 1),
          host_signing_key_fingerprint_hex TEXT NOT NULL,
          issuer_identity_key_fingerprint_hex TEXT NOT NULL,
          reader_key_fingerprint_hex TEXT NOT NULL,
          wrap_digest_hex TEXT NOT NULL,
          granted_at TEXT NOT NULL,
          envelope_json TEXT NOT NULL,
          sealed_wrap_hex TEXT NOT NULL,
          issuer_identity_key_record_json TEXT NOT NULL,
          issuer_signature_hex TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (grant_id, reader_key_fingerprint_hex, kek_version)
        );

        CREATE INDEX IF NOT EXISTS idx_pico_share_envelope_domain
        ON pico_share_envelope (home_id, privacy_domain, kek_version);
      `);
    },
  },
];

export function runMigrations(db: Database.Database, options: MigrationOptions = {}): MigrationRunResult {
  const startedAt = new Date().toISOString();
  const migrationDefinitions = options.migrationDefinitions ?? migrations;

  ensureMigrationTable(db);

  const appliedMigrationIds = listAppliedMigrationIds(db);
  assertKnownAppliedMigrations(appliedMigrationIds, migrationDefinitions);

  const pendingMigrations = listPendingMigrations(appliedMigrationIds, migrationDefinitions);
  assertBackupContract(pendingMigrations, options);

  const appliedPendingMigrationIds = pendingMigrations.map((migration) => migration.id);

  if (appliedPendingMigrationIds.length > 0) {
    try {
      applyPendingMigrations(db, pendingMigrations, {
        startedAt,
        migrationIds: appliedPendingMigrationIds,
      });
    } catch (error) {
      recordFailedMigrationAudit(db, {
        startedAt,
        finishedAt: new Date().toISOString(),
        migrationIds: appliedPendingMigrationIds,
        errorMessage: toErrorMessage(error),
      });

      throw error;
    }
  }

  return {
    appliedMigrationIds: appliedPendingMigrationIds,
  };
}

export async function runMigrationsWithBackup(db: Database.Database, options: BackupAwareMigrationOptions): Promise<MigrationRunResult> {
  const migrationDefinitions = options.migrationDefinitions ?? migrations;

  ensureMigrationTable(db);

  const appliedMigrationIds = listAppliedMigrationIds(db);
  assertKnownAppliedMigrations(appliedMigrationIds, migrationDefinitions);

  const pendingMigrations = listPendingMigrations(appliedMigrationIds, migrationDefinitions);
  const backupRequired = pendingMigrations.some((migration) => migration.requiresBackup);
  let backup: SqliteBackupResult | undefined;

  if (options.requireBackupBeforeMigration && backupRequired) {
    const backupProvider = options.createBackup ?? createSqliteBackup;
    backup = await backupProvider(options.databasePath, options.backupDirectory);
  }

  const result = runMigrations(db, {
    requireBackupBeforeMigration: options.requireBackupBeforeMigration,
    backupConfirmed: backupRequired ? backup !== undefined : false,
    migrationDefinitions,
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

export function listMigrationAuditRecords(db: Database.Database): MigrationAuditRecord[] {
  if (!tableExists(db, 'schema_migration_audit')) {
    return [];
  }

  return db
    .prepare(`
      SELECT
        id,
        started_at AS startedAt,
        finished_at AS finishedAt,
        status,
        migration_ids_json AS migrationIdsJson,
        ${columnExists(db, 'schema_migration_audit', 'error_message') ? 'error_message' : 'NULL'} AS errorMessage
      FROM schema_migration_audit
      ORDER BY id ASC
    `)
    .all()
    .map((row) => mapMigrationAuditRecord(row as MigrationAuditRow));
}

export function describeMigrationState(db: Database.Database, options: { migrationDefinitions?: readonly MigrationDefinition[] } = {}): MigrationState {
  const migrationDefinitions = options.migrationDefinitions ?? migrations;
  const appliedMigrationIds = tableExists(db, 'schema_migration') ? listAppliedMigrationIds(db) : [];
  const knownMigrationIds = new Set(migrationDefinitions.map((migration) => migration.id));
  const applied = new Set(appliedMigrationIds);
  const pendingMigrations = migrationDefinitions
    .filter((migration) => !applied.has(migration.id))
    .map((migration) => ({
      id: migration.id,
      requiresBackup: migration.requiresBackup,
    }));

  return {
    appliedMigrationIds,
    pendingMigrations,
    unknownMigrationIds: appliedMigrationIds.filter((migrationId) => !knownMigrationIds.has(migrationId)),
    backupRequired: pendingMigrations.some((migration) => migration.requiresBackup),
  };
}

function listAppliedMigrationIds(db: Database.Database): string[] {
  return db
    .prepare('SELECT id FROM schema_migration ORDER BY id ASC')
    .all()
    .map((row) => (row as { id: string }).id);
}

function listPendingMigrations(appliedMigrationIds: string[], migrationDefinitions: readonly MigrationDefinition[]): MigrationDefinition[] {
  const applied = new Set(appliedMigrationIds);

  return migrationDefinitions.filter((migration) => !applied.has(migration.id));
}

function assertKnownAppliedMigrations(appliedMigrationIds: string[], migrationDefinitions: readonly MigrationDefinition[]): void {
  const knownMigrationIds = new Set(migrationDefinitions.map((migration) => migration.id));
  const unknownMigrationIds = appliedMigrationIds.filter((migrationId) => !knownMigrationIds.has(migrationId));

  if (unknownMigrationIds.length > 0) {
    throw new Error(
      `Database contains unsupported migration(s): ${unknownMigrationIds.join(', ')}. Refusing to run with this Pico Core version.`,
    );
  }
}

function applyPendingMigrations(
  db: Database.Database,
  pendingMigrations: readonly MigrationDefinition[],
  auditRecord: { startedAt: string; migrationIds: string[] },
): void {
  const applyMigrationRun = db.transaction(() => {
    for (const migration of pendingMigrations) {
      migration.up(db);
      db
        .prepare('INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
    }

    recordMigrationAudit(db, {
      ...auditRecord,
      finishedAt: new Date().toISOString(),
      status: 'applied',
    });
  });

  applyMigrationRun();
}

function recordMigrationAudit(
  db: Database.Database,
  record: { startedAt: string; finishedAt: string; status: MigrationAuditStatus; migrationIds: string[]; errorMessage?: string },
): void {
  if (!tableExists(db, 'schema_migration_audit')) {
    return;
  }

  if (columnExists(db, 'schema_migration_audit', 'error_message')) {
    db
      .prepare(`
        INSERT INTO schema_migration_audit (
          started_at,
          finished_at,
          status,
          migration_ids_json,
          error_message
        ) VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        record.startedAt,
        record.finishedAt,
        record.status,
        JSON.stringify(record.migrationIds),
        record.errorMessage ?? null,
      );

    return;
  }

  db
    .prepare(`
      INSERT INTO schema_migration_audit (
        started_at,
        finished_at,
        status,
        migration_ids_json
      ) VALUES (?, ?, ?, ?)
    `)
    .run(
      record.startedAt,
      record.finishedAt,
      record.status,
      JSON.stringify(record.migrationIds),
    );
}

function recordFailedMigrationAudit(
  db: Database.Database,
  record: { startedAt: string; finishedAt: string; migrationIds: string[]; errorMessage: string },
): void {
  try {
    recordMigrationAudit(db, {
      ...record,
      status: 'failed',
    });
  } catch {
    // Keep the original migration failure as the caller-visible error.
  }
}

function mapMigrationAuditRecord(row: MigrationAuditRow): MigrationAuditRecord {
  const record: MigrationAuditRecord = {
    id: row.id,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: toMigrationAuditStatus(row.status),
    migrationIds: JSON.parse(row.migrationIdsJson) as string[],
  };

  if (row.errorMessage !== null) {
    record.errorMessage = row.errorMessage;
  }

  return record;
}

function toMigrationAuditStatus(value: string): MigrationAuditStatus {
  return value === 'failed' ? 'failed' : 'applied';
}

function assertBackupContract(pendingMigrations: readonly MigrationDefinition[], options: MigrationOptions): void {
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

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row !== undefined;
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((row) => (row as { name: string }).name === columnName);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

interface MigrationAuditRow {
  id: number;
  startedAt: string;
  finishedAt: string;
  status: string;
  migrationIdsJson: string;
  errorMessage: string | null;
}
