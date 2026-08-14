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

export const picoSchemaBaselineMigrationId = '0001_initial_schema' as const;

/** ADR 0139 AC4. The consent record beside the activation decision. */
export const picoModuleEffectConsentMigrationId = '0002_pico_module_effect_consent' as const;

/** ADR 0140 RL4. What a person decided a requested effect is answered with. */
export const picoRuleDecisionMigrationId = '0003_pico_rule_decision' as const;

/** ADR 0137 IN5 / ADR 0138 CO3-CO4. Which suppliers are attached, and to what. */
export const picoSupplierAttachmentMigrationId = '0004_pico_supplier_attachment' as const;

/** ADR 0138 CO1. What a supplier's credential is allowed to do. */
export const picoSupplierCredentialScopeMigrationId = '0005_pico_supplier_credential_scope' as const;

/** ADR 0136 BR6. The revision a derived item was read at, on the item itself. */
export const picoLibraryDerivationMigrationId = '0006_pico_library_derivation' as const;

/** ADR 0143 DP1. Which depots are attached, and at which commit each runs. */
export const picoDepotAttachmentMigrationId = '0007_pico_depot_attachment' as const;

/** ADR 0138 CO3/CO4. Whether Pico may fetch a depot, and whether unasked. */
export const picoDepotReachMigrationId = '0008_pico_depot_reach' as const;

export const picoDepotFetchOutcomeMigrationId = '0009_pico_depot_fetch_outcome' as const;

export const picoLinkMailboxMigrationId = '0010_pico_link_mailbox' as const;

export const picoLinkPushLedgerMigrationId = '0011_pico_link_push_ledger' as const;

/**
 * ADR 0152 SE6 and ADR 0142 PE1. Where a measured deployment is kept.
 *
 * One row per entry, and the row holds a **measurement** beside an optional
 * **narrowing**. Keeping them in separate columns is SE4 said in schema: a
 * person's preference cannot overwrite an observation, because there is
 * nowhere for it to be written.
 */
export const picoModelProviderEntryMigrationId = '0012_pico_model_provider_entry' as const;

/**
 * ADR 0152, second open question, decided by the user on 2026-08-13: **a
 * shared finding with per-person decisions attached.**
 *
 * The measurement is one row because a deployment is one deployment. What can
 * differ between two residents hangs off it: whether this machine is *theirs*
 * (ADR 0048's declaration, a judgement about premises nobody can measure),
 * their standing consent (ADR 0048, 2026-08-04), and what they let it carry.
 *
 * **No row here means no provider for that person.** ADR 0138's title says it:
 * reaching outside is off until somebody says so. An absent decision is not a
 * default to the Home's - it is the absence of a decision.
 */
export const picoModelProviderConsentMigrationId = '0013_pico_model_provider_consent' as const;

/**
 * ADR 0049's job queue, which that ADR named and nothing built.
 *
 * **The queue is the seam, and it is deliberately dumb.** What Pico wants read
 * is a product decision nobody has taken; that a queued job should eventually
 * run is not. So this holds jobs and their outcomes and knows nothing about
 * why any of them exist - whatever decides that later writes rows here and
 * changes nothing else.
 */
export const picoModelJobQueueMigrationId = '0014_pico_model_job_queue' as const;

/**
 * ADR 0143 DP1. Who accepted this attachment.
 *
 * **Nothing recorded it, and that only became visible when something needed
 * it.** A depot is attached by a person - DP1 makes a new commit a new
 * decision, and a decision belongs to somebody - but the row held a pin, a
 * reach switch and a date, and no name. So when a fetch wanted to queue reads
 * of that material, there was nobody to queue them for.
 *
 * Nullable, and deliberately: attachments that already exist were accepted by
 * somebody this schema never asked about, and inventing an answer would be
 * worse than reads that stay unqueued until a person attaches again.
 */
export const picoDepotAcceptedByMigrationId = '0015_pico_depot_accepted_by' as const;

/**
 * ADR 0136 BR6. What a queued read was taken from, kept with the row.
 *
 * A derivation names a supplier, a pin and whether that pin covers the
 * content, and ADR 0136 BR6 refuses a partial one - `pinCoversContent` is
 * "not a field with a default: an unasked question and a negative answer are
 * different facts". None of it is recoverable from the job, and reconstructing
 * it at the moment somebody keeps the answer would be reconstructing it from
 * a working copy that has moved on.
 */
export const picoModelJobProvenanceMigrationId = '0016_pico_model_job_provenance' as const;

/**
 * ADR 0104 S3. The memory-encryption decision, in Pico.
 *
 * **This is the older of the two violations ADR 0104 named**, and it has been
 * a Home Assistant add-on option since before that ADR existed: a person's
 * privacy decision living where whoever administers the host can see and set
 * it, invisible from any other surface, and lost when the Home moves.
 *
 * The row records the decision and where it came from. `inheritedFromHost`
 * matters because the two are different facts: a person who chose this and an
 * instance that was booted with an environment variable are not the same
 * thing, and a surface that showed them alike would be inventing consent.
 */
export const picoMemoryEncryptionDecisionMigrationId =
  '0017_pico_memory_encryption_decision' as const;

/**
 * ADR 0104 S5 with ADR 0031. Which relay account this Home holds, in Pico.
 *
 * **Identity, not reachability.** ADR 0031 keeps a relay account separate from
 * a Pico identity, and the entry that names it survives moving the Home to
 * another host - which is this ADR's own mark of a setting. The base URL
 * stays in the environment, because where an operator answers can change
 * without anybody deciding anything.
 *
 * The same inheritance shape as 0017, for the same reason: an instance with no
 * decision reads what it was booted with and records that it inherited.
 */
export const picoLinkRelayIdentityMigrationId = '0018_pico_link_relay_identity' as const;

/**
 * ADR 0151 PV1 with ADR 0138 CO1. Where a provider credential's seal lives.
 *
 * One per person per entry, because that is what the credential is: ADR 0152
 * puts the reference on a person's decision, and two residents may hold two
 * credentials at one provider. The secret is not here - only the seal, whose
 * key lives in the key store and therefore never travels with a backup.
 */
export const picoModelProviderCredentialMigrationId =
  '0019_pico_model_provider_credential' as const;

// Pico has no deployed database yet, so the development chain is folded into
// one final-schema baseline rather than carried as steps out of states nothing
// is in. This is the second such fold: the first collapsed 0001-0020, and this
// one collapses the 0002-0017 that accumulated after it (ADR 0134 F3).
//
// The baseline is *derived*, not transcribed. It is the schema a database
// carries after running those seventeen, read back from `sqlite_master`, so
// columns that arrived by `ALTER TABLE` appear here in their final position
// and no statement was retyped by hand. Equivalence is proven the same way it
// was produced: apply this baseline to an empty database and compare
// `sqlite_master` against the seventeen-step result.
//
// Future schema changes are appended as new migrations. The runner's backup,
// audit and unknown-version protections are unchanged, and an existing
// development database - which now reports sixteen unknown migrations and
// refuses to open - is recreated rather than migrated.
const migrations: readonly MigrationDefinition[] = [
  {
    id: picoSchemaBaselineMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE schema_migration_audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          finished_at TEXT NOT NULL,
          status TEXT NOT NULL,
          migration_ids_json TEXT NOT NULL,
          error_message TEXT NULL
        );

        CREATE INDEX idx_schema_migration_audit_finished_at
        ON schema_migration_audit (finished_at);

        CREATE TABLE pico_event (
          event_id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          session_id TEXT NULL,
          lamport INTEGER NOT NULL,
          wall_time TEXT NOT NULL,
          type TEXT NOT NULL,
          stream TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          signature TEXT NULL,
          created_at TEXT NOT NULL,
          payload_posture TEXT NULL
        , origin TEXT NULL
          CHECK (origin IS NULL OR origin IN (
            'person_present', 'own_pico', 'home_member',
            'remote_pico', 'external_content', 'unattributed'
          )));

        CREATE INDEX idx_pico_event_lamport
        ON pico_event (lamport, wall_time, event_id);

        CREATE INDEX idx_pico_event_stream
        ON pico_event (stream, lamport);

        CREATE INDEX idx_pico_event_type
        ON pico_event (type, lamport);

        CREATE INDEX idx_pico_event_device
        ON pico_event (device_id, lamport);

        CREATE TABLE pico_home_claim_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          state TEXT NOT NULL CHECK (state IN ('unclaimed', 'claimed')),
          host_admin_pico_id TEXT NULL,
          claimed_at TEXT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          home_id TEXT NULL,
          host_signing_key_fingerprint_hex TEXT NULL,
          host_key_agreement_key_fingerprint_hex TEXT NULL,
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

        CREATE TABLE memory_item (
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
          updated_at TEXT NOT NULL,
          content_posture TEXT NOT NULL DEFAULT 'plaintext_foundation'
            CHECK (content_posture IN ('plaintext_foundation', 'domain_encrypted')),
          key_envelope_ref TEXT NULL
        , origin TEXT NULL
          CHECK (origin IS NULL OR origin IN (
            'person_present', 'own_pico', 'home_member',
            'remote_pico', 'external_content', 'unattributed'
          )), due_at TEXT NULL, raised_at TEXT NULL, announced_at TEXT NULL, latitude_deg REAL NULL, longitude_deg REAL NULL, accuracy_m REAL NULL);

        CREATE INDEX idx_memory_item_domain
        ON memory_item (privacy_domain, deletion_state);

        CREATE TABLE memory_key_envelope (
          key_envelope_id TEXT PRIMARY KEY,
          memory_item_id TEXT NOT NULL,
          domain_id TEXT NOT NULL,
          suite TEXT NOT NULL,
          kek_version INTEGER NOT NULL,
          wrap_nonce TEXT NOT NULL,
          wrapped_dek TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX idx_memory_key_envelope_domain
        ON memory_key_envelope (domain_id);

        CREATE TABLE memory_retention_policy (
          retention_policy_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          mode TEXT NOT NULL CHECK (mode IN ('keep_until_deleted', 'delete_after_max_age')),
          max_age_days INTEGER NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE foundation_operator (
          operator_id TEXT PRIMARY KEY CHECK (operator_id = 'operator'),
          credential_verifier TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        , home_binding_json TEXT NULL);

        CREATE TABLE memory_domain_custody (
          privacy_domain TEXT PRIMARY KEY,
          custody_class TEXT NOT NULL DEFAULT 'host_custody'
            CHECK (custody_class IN ('host_custody', 'reader_custody')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

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

        CREATE INDEX idx_pico_home_membership_identity
        ON pico_home_membership (pico_identity_fingerprint_hex, status);

        CREATE INDEX idx_pico_home_membership_home
        ON pico_home_membership (home_id, status);

        CREATE TABLE pico_home_membership_credential (
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

        CREATE INDEX idx_pico_home_membership_credential_subject
        ON pico_home_membership_credential (home_id, subject_pico_identity_fingerprint_hex);

        CREATE TABLE pico_home_membership_lifecycle (
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

        CREATE INDEX idx_pico_home_membership_lifecycle_credential
        ON pico_home_membership_lifecycle (credential_id, lifecycle_order);

        CREATE TABLE pico_identity_delegation (
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

        CREATE INDEX idx_pico_identity_delegation_issuer
        ON pico_identity_delegation (issuer_pico_identity_fingerprint_hex, lifecycle_order);

        CREATE TABLE pico_identity_revocation (
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

        CREATE INDEX idx_pico_identity_revocation_issuer
        ON pico_identity_revocation (issuer_pico_identity_fingerprint_hex, lifecycle_order);

        CREATE TABLE pico_home_domain_read_grant (
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

        CREATE INDEX idx_pico_home_domain_read_grant_reader
        ON pico_home_domain_read_grant (
          home_id,
          reader_pico_identity_fingerprint_hex,
          privacy_domain
        );

        CREATE TABLE pico_home_domain_read_grant_lifecycle (
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

        CREATE INDEX idx_pico_home_domain_read_grant_lifecycle_grant
        ON pico_home_domain_read_grant_lifecycle (grant_id, lifecycle_order);

        CREATE TABLE pico_identity_reader_key (
          delegation_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          device_signing_key_fingerprint_hex TEXT NOT NULL,
          device_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          device_key_agreement_key_record_json TEXT NOT NULL,
          registered_at TEXT NOT NULL
        );

        CREATE INDEX idx_pico_identity_reader_key_identity
        ON pico_identity_reader_key (
          home_id,
          pico_identity_fingerprint_hex,
          device_key_agreement_key_fingerprint_hex
        );

        CREATE TABLE pico_share_envelope (
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

        CREATE INDEX idx_pico_share_envelope_domain
        ON pico_share_envelope (home_id, privacy_domain, kek_version);

        CREATE TABLE pico_reader_custody_domain (
          domain_authority_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          host_signing_key_fingerprint_hex TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          owner_identity_key_fingerprint_hex TEXT NOT NULL,
          owner_reader_key_fingerprint_hex TEXT NOT NULL,
          kek_version INTEGER NOT NULL CHECK (kek_version >= 1),
          authorized_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          domain_record_json TEXT NOT NULL,
          received_at TEXT NOT NULL,
          UNIQUE (home_id, privacy_domain)
        );

        CREATE TABLE pico_reader_custody_writer_grant (
          writer_grant_id TEXT PRIMARY KEY,
          domain_authority_id TEXT NOT NULL,
          home_id TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          kek_version INTEGER NOT NULL CHECK (kek_version >= 1),
          owner_identity_key_fingerprint_hex TEXT NOT NULL,
          writer_identity_key_fingerprint_hex TEXT NOT NULL,
          writer_device_signing_key_fingerprint_hex TEXT NOT NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          writer_grant_record_json TEXT NOT NULL,
          received_at TEXT NOT NULL
        );

        CREATE INDEX idx_reader_custody_writer_domain
        ON pico_reader_custody_writer_grant (
          domain_authority_id,
          writer_identity_key_fingerprint_hex
        );

        CREATE TABLE pico_reader_custody_writer_grant_lifecycle (
          lifecycle_id TEXT PRIMARY KEY,
          writer_grant_id TEXT NOT NULL,
          domain_authority_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status = 'revoked'),
          reason_category TEXT NOT NULL,
          changed_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          lifecycle_record_json TEXT NOT NULL,
          received_at TEXT NOT NULL
        );

        CREATE INDEX idx_reader_custody_writer_lifecycle
        ON pico_reader_custody_writer_grant_lifecycle (
          writer_grant_id,
          lifecycle_order
        );

        CREATE TABLE pico_reader_custody_item (
          package_id TEXT PRIMARY KEY,
          domain_authority_id TEXT NOT NULL,
          writer_grant_id TEXT NOT NULL,
          home_id TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          memory_item_id TEXT NOT NULL,
          content_type TEXT NOT NULL,
          kek_version INTEGER NOT NULL CHECK (kek_version >= 1),
          writer_identity_key_fingerprint_hex TEXT NOT NULL,
          writer_device_signing_key_fingerprint_hex TEXT NOT NULL,
          content_ciphertext_hex TEXT NOT NULL,
          wrapped_dek_hex TEXT NOT NULL,
          created_at TEXT NOT NULL,
          item_record_json TEXT NOT NULL,
          received_at TEXT NOT NULL,
          UNIQUE (domain_authority_id, memory_item_id)
        );

        CREATE INDEX idx_reader_custody_item_domain
        ON pico_reader_custody_item (
          domain_authority_id,
          created_at,
          package_id
        );

        CREATE TABLE pico_reader_custody_reader_grant (
          reader_grant_id TEXT PRIMARY KEY,
          domain_authority_id TEXT NOT NULL,
          home_id TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          owner_identity_key_fingerprint_hex TEXT NOT NULL,
          reader_identity_key_fingerprint_hex TEXT NOT NULL,
          reader_device_signing_key_fingerprint_hex TEXT NOT NULL,
          reader_key_fingerprint_hex TEXT NOT NULL,
          reader_delegation_id TEXT NOT NULL,
          access_mode TEXT NOT NULL
            CHECK (access_mode IN ('from_version', 'forward_only')),
          first_kek_version INTEGER NOT NULL CHECK (first_kek_version >= 1),
          valid_from TEXT NOT NULL,
          valid_until TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          reader_grant_record_json TEXT NOT NULL,
          received_at TEXT NOT NULL
        );

        CREATE INDEX idx_reader_custody_reader_domain
        ON pico_reader_custody_reader_grant (
          domain_authority_id,
          reader_identity_key_fingerprint_hex,
          reader_key_fingerprint_hex
        );

        CREATE TABLE pico_reader_custody_reader_grant_lifecycle (
          lifecycle_id TEXT PRIMARY KEY,
          reader_grant_id TEXT NOT NULL,
          domain_authority_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status = 'revoked'),
          reason_category TEXT NOT NULL,
          changed_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          lifecycle_record_json TEXT NOT NULL,
          received_at TEXT NOT NULL
        );

        CREATE INDEX idx_reader_custody_reader_lifecycle
        ON pico_reader_custody_reader_grant_lifecycle (
          reader_grant_id,
          lifecycle_order
        );

        CREATE TABLE pico_reader_custody_kek_rotation (
          rotation_id TEXT PRIMARY KEY,
          domain_authority_id TEXT NOT NULL,
          previous_kek_version INTEGER NOT NULL
            CHECK (previous_kek_version >= 1),
          kek_version INTEGER NOT NULL CHECK (kek_version >= 2),
          rotated_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          rotation_record_json TEXT NOT NULL,
          received_at TEXT NOT NULL,
          UNIQUE (domain_authority_id, kek_version)
        );

        CREATE INDEX idx_reader_custody_rotation_domain
        ON pico_reader_custody_kek_rotation (
          domain_authority_id,
          kek_version
        );

        CREATE TABLE pico_home_founding_record (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          schema TEXT NOT NULL CHECK (
            schema IN (
              'pico.home.founding-record.v1',
              'pico.home.founding-record.v2'
            )
          ),
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
          claimant_founding_signature_hex TEXT NOT NULL,
          host_claim_response_signature_hex TEXT NOT NULL,
          host_founding_signature_hex TEXT NOT NULL,
          first_device_evidence_json TEXT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE pico_home_device_lifecycle_transition (
          transition_id TEXT PRIMARY KEY,
          action TEXT NOT NULL CHECK (action IN ('enroll', 'renew', 'revoke')),
          home_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          sponsor_delegation_id TEXT NOT NULL,
          target_delegation_id TEXT NOT NULL,
          submission_digest_hex TEXT NOT NULL,
          lifecycle_record_json TEXT NOT NULL,
          accepted_at TEXT NOT NULL
        );

        CREATE INDEX idx_pico_home_device_lifecycle_identity
        ON pico_home_device_lifecycle_transition (
          pico_identity_fingerprint_hex,
          accepted_at,
          transition_id
        );

        CREATE TABLE pico_home_device_recovery (
          recovery_id TEXT PRIMARY KEY,
          home_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('pending', 'superseded', 'vetoed', 'lapsed', 'consumed')),
          target_delegation_id TEXT NOT NULL,
          target_device_signing_key_fingerprint_hex TEXT NOT NULL,
          target_device_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          observed_lifecycle_order TEXT NOT NULL,
          evidence_digest_hex TEXT NOT NULL,
          claim_digest_hex TEXT NOT NULL UNIQUE,
          submission_json TEXT NOT NULL,
          accepted_at TEXT NOT NULL,
          effective_at TEXT NOT NULL,
          completion_expires_at TEXT NOT NULL,
          resolved_at TEXT NULL,
          superseded_by_recovery_id TEXT NULL,
          recovery_record_json TEXT NULL
        );

        CREATE INDEX idx_pico_home_device_recovery_identity
        ON pico_home_device_recovery (
          pico_identity_fingerprint_hex,
          status,
          accepted_at,
          recovery_id
        );

        CREATE UNIQUE INDEX idx_pico_home_device_recovery_one_pending
        ON pico_home_device_recovery (pico_identity_fingerprint_hex)
        WHERE status = 'pending';

        CREATE TABLE pico_identity_root_rotation (
          rotation_id TEXT NOT NULL,
          home_id TEXT NOT NULL,
          predecessor_identity_fingerprint_hex TEXT NOT NULL,
          successor_identity_fingerprint_hex TEXT NOT NULL,
          status TEXT NOT NULL
            CHECK (status IN ('pending', 'vetoed', 'effective')),
          reason_category TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          rotated_at TEXT NOT NULL,
          accepted_at TEXT NOT NULL,
          effective_at TEXT NOT NULL,
          resolved_at TEXT NULL,
          co_signing_delegation_id TEXT NOT NULL,
          -- ADR 0114 T3. A rotation revokes every device the old root
          -- delegated, so it must name the successor's first device or it
          -- strands the person it was meant to protect. Not nullable for
          -- exactly that reason.
          successor_first_device_delegation_id TEXT NOT NULL,
          successor_first_device_signing_key_fingerprint_hex TEXT NOT NULL,
          successor_first_device_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          successor_first_device_projected_at TEXT NULL,
          record_json TEXT NOT NULL,
          -- ADR 0114 T5. A rotation record names no Home; deciding it is a
          -- local act. The row identity is therefore the pair, so a record
          -- carried in from another Home cannot occupy the name a local
          -- ceremony needs.
          PRIMARY KEY (home_id, rotation_id)
        );

        CREATE INDEX idx_pico_identity_root_rotation_predecessor
        ON pico_identity_root_rotation (
          home_id,
          predecessor_identity_fingerprint_hex,
          status,
          effective_at
        );

        CREATE UNIQUE INDEX idx_pico_identity_root_rotation_one_pending
        ON pico_identity_root_rotation (
          home_id,
          predecessor_identity_fingerprint_hex
        )
        WHERE status = 'pending';

        CREATE TABLE pico_home_host_continuity (
          continuity_id TEXT NOT NULL,
          home_id TEXT NOT NULL,
          chain_position INTEGER NOT NULL,
          outgoing_host_signing_key_fingerprint_hex TEXT NOT NULL,
          outgoing_host_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          incoming_host_signing_key_fingerprint_hex TEXT NOT NULL,
          incoming_host_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          reason_category TEXT NOT NULL
            CHECK (reason_category IN ('host_key_rotated', 'host_migrated', 'host_restored')),
          changed_at TEXT NOT NULL,
          lifecycle_order TEXT NOT NULL,
          accepted_at TEXT NOT NULL,
          record_json TEXT NOT NULL,
          PRIMARY KEY (home_id, continuity_id)
        );

        CREATE UNIQUE INDEX idx_pico_home_host_continuity_position
        ON pico_home_host_continuity (home_id, chain_position);

        CREATE TABLE pico_audit_record (
          event_id TEXT PRIMARY KEY REFERENCES pico_event (event_id),
          writer_id TEXT NOT NULL,
          chain_position INTEGER NOT NULL CHECK (chain_position >= 1),
          previous_digest_hex TEXT NULL,
          digest_hex TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          -- Per writer, because ADR 0014's log is designed to become
          -- replicated and a global chain would assert the single writer the
          -- architecture never promised.
          UNIQUE (writer_id, chain_position),
          -- A digest may appear once as a link, so no writer can fork its own
          -- sequence and keep both branches.
          UNIQUE (writer_id, digest_hex),
          CHECK (
            (chain_position = 1 AND previous_digest_hex IS NULL)
            OR (chain_position > 1 AND previous_digest_hex IS NOT NULL)
          )
        );

        CREATE INDEX idx_pico_audit_record_writer
        ON pico_audit_record (writer_id, chain_position);

        CREATE TABLE pico_module_activation (
          identifier TEXT PRIMARY KEY,
          active INTEGER NOT NULL CHECK (active IN (0, 1)),
          decided_at TEXT NOT NULL
        , capture_consented INTEGER NULL
          CHECK (capture_consented IS NULL OR capture_consented IN (0, 1)));

        CREATE INDEX idx_memory_item_due
        ON memory_item (due_at)
        WHERE due_at IS NOT NULL AND raised_at IS NULL AND deletion_state = 'active';

        CREATE INDEX idx_memory_item_unannounced
        ON memory_item (due_at)
        WHERE due_at IS NOT NULL AND announced_at IS NULL AND deletion_state = 'active';

        CREATE TABLE pico_observation (
          observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
          privacy_domain TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('location_fix', 'mobility_sample')),
          observed_at TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX idx_pico_observation_observed
        ON pico_observation (observed_at);

        CREATE INDEX idx_pico_observation_domain
        ON pico_observation (privacy_domain);

        CREATE INDEX idx_memory_item_place
        ON memory_item (latitude_deg, longitude_deg)
        WHERE latitude_deg IS NOT NULL AND deletion_state = 'active';
      `);

      // The claim-state singleton is seeded, not merely declared: a Home with
      // no row is indistinguishable from one whose row was lost, and Setup
      // Mode reads this to decide whether it may mint a Move-In Code.
      const now = new Date().toISOString();
      db
        .prepare(`
          INSERT INTO pico_home_claim_state (
            id,
            state,
            host_admin_pico_id,
            claimed_at,
            created_at,
            updated_at,
            home_id,
            host_signing_key_fingerprint_hex,
            host_key_agreement_key_fingerprint_hex
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(1, 'unclaimed', null, null, now, now, null, null, null);
    },
  },
  {
    /**
     * ADR 0139 AC4. What a person consented to, kept beside what a module now
     * declares so the two can disagree out loud.
     *
     * A module declares its own risk class because only it knows what its
     * effects do, and that would hand every module a privilege escalation -
     * declare `local_write` today, ship `destructive` in an update, inherit
     * the answer a person already gave. Recording name, description and risk
     * at the moment of consent turns that silent change into a question.
     *
     * The description is stored with the rest because it is the sentence a
     * person read when they agreed. Changing it changes what was agreed to,
     * and ADR 0141 RN3 renders the *consented* description in an approval
     * statement for the same reason.
     *
     * **ADR 0127's five admission questions, answered rather than skipped.**
     * This is not a memory item and holds no person content, so the crypto
     * shred does not reach it and must not: consent is a decision about a
     * module, not data about a life, and a domain shred that erased it would
     * silently re-grant what nobody re-granted. It rides ordinary backup and
     * restore with the rest of the schema. Boot reconciliation is the drift
     * comparison itself. It needs no ADR 0119 Q5 ceiling for the reason
     * `pico_module_activation` needs none - it is bounded by the closed module
     * list times the effects those shipped modules declare, neither of which a
     * writer can grow at runtime. And the ADR 0119 Q3 byte digest covers it
     * already, because that digest hashes the file.
     */
    id: picoModuleEffectConsentMigrationId,
    // Additive: a new table cannot lose a row that already exists.
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_module_effect_consent (
          identifier TEXT NOT NULL,
          effect_name TEXT NOT NULL,
          description TEXT NOT NULL,
          risk TEXT NOT NULL,
          consented_at TEXT NOT NULL,
          PRIMARY KEY (identifier, effect_name)
        );
      `);
    },
  },
{
    /**
     * ADR 0140 RL4, the durable half. A rule is a person's decision about what
     * a requested effect is answered with, and it is recorded the way this
     * codebase records durable decisions - the same shape as ADR 0127
     * activation and ADR 0129 SR6 capture, which are the two decisions this
     * one decides *about*.
     *
     * **Not an action, and that is the point.** No effect may change a rule;
     * if one could, the most valuable request in the system would be the one
     * that removes the governor. `module:check` refuses a module that even
     * links against the decision contract, and this table has no write path
     * that an effect can reach.
     *
     * **Not host configuration** (ADR 0104). A rule set a container rebuild
     * could replace is not a rule set.
     *
     * Scoped by domain because ADR 0140 RL6 says no decision is domain-blind.
     * What this is *not* is a rule language: whether rules nest, inherit or
     * compose is product work, and this is the base case those would be built
     * on - one recorded outcome per effect and domain.
     *
     * ADR 0127's five questions, answered: the crypto shred does not reach it,
     * for the reason consent is not reachable either - a decision about what
     * Pico may do is not data about a life, and a domain shred that erased it
     * would silently re-grant what nobody re-granted. It rides ordinary backup
     * and restore, boot reconciliation is the read itself, it needs no
     * ADR 0119 Q5 ceiling because it is bounded by declared effects times
     * domains rather than by anything a writer can grow, and the Q3 byte
     * digest covers it because that digest hashes the file.
     */
    id: picoRuleDecisionMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_rule_decision (
          effect_name TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          decision TEXT NOT NULL CHECK (decision IN ('allow', 'require_approval', 'deny')),
          decided_at TEXT NOT NULL,
          PRIMARY KEY (effect_name, privacy_domain)
        );
      `);
    },
  },
{
    /**
     * ADR 0137 IN5, ADR 0136 BR7 and ADR 0138 CO3/CO4 in one row, because they
     * are one record: an attachment names a supplier, says where it lands, and
     * says what it may do.
     *
     * **One domain per attachment (IN5).** `rchkb` holds `Finanz`, `Privat`
     * and `Feuerwehr` in one working copy, and an attachment bound to a Pico
     * rather than a domain would cross every ADR 0075 boundary in a single
     * silent act. A corpus spanning several is attached several times.
     *
     * **Both reaching flags default to off (CO3/CO4)**, and they are two
     * columns rather than one because they answer different questions. Whether
     * Pico may contact a system at all is where money and disclosure enter;
     * whether it may do so unprompted is a further question, and an
     * implementation that folded them would grant the second with the first.
     * They fail differently too: an answered question that cost money is
     * visible to the person who asked, a background sweep is visible to
     * nobody.
     *
     * The identifier is the person's token (IN1) and never a path or an
     * address, which the ADR 0136 parser enforces before anything reaches
     * here.
     *
     * ADR 0127's five questions: the crypto shred does not reach this, for the
     * reason it does not reach consent or rules - detaching is not forgetting
     * (ADR 0129 SR6), and a domain shred that removed the attachment would
     * silently stop something nobody stopped. Ordinary backup and restore.
     * Boot reconciliation is the read. A ceiling in the ADR 0119 Q5 idiom is
     * owed here and *is* the open part of IN1, because this is the tree's
     * first deliberately open identifier list. The Q3 byte digest covers it.
     */
    id: picoSupplierAttachmentMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_supplier_attachment (
          identifier TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('bridge', 'library')),
          slots_json TEXT NOT NULL,
          coverage_json TEXT NOT NULL,
          privacy_domain TEXT NOT NULL,
          may_reach_outside INTEGER NOT NULL DEFAULT 0
            CHECK (may_reach_outside IN (0, 1)),
          may_reach_unasked INTEGER NOT NULL DEFAULT 0
            CHECK (may_reach_unasked IN (0, 1)),
          attached_at TEXT NOT NULL,
          -- CO4 is a further decision, never implied by CO3. The database says
          -- so rather than trusting every future writer to remember.
          CHECK (may_reach_unasked = 0 OR may_reach_outside = 1)
        );
      `);
    },
  },
{
    /**
     * ADR 0138 CO1, the part that is a decision rather than a cipher.
     *
     * **Scope, because a credential that only needs to read is issued as one.**
     * A supplier that could write to its source could edit the material it is
     * quoting, which is a quieter failure than losing the credential: the
     * quotes would still be accurate about a source that had been changed to
     * agree with them. A library therefore takes `read` and nothing else, and
     * the CHECK below says so rather than leaving it to whoever attaches next.
     *
     * **Presence, not the secret.** This column records that a credential
     * exists, so a surface can say `not configured` (ADR 0138 CO2) without
     * anything holding the secret to check. Where the secret itself lives is
     * deliberately still open - see the ADR - and putting a flag here does not
     * pre-empt it.
     */
    id: picoSupplierCredentialScopeMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE pico_supplier_attachment
        ADD COLUMN credential_scope TEXT NULL
          CHECK (credential_scope IS NULL OR credential_scope IN ('read', 'read_write'));
      `);
      db.exec(`
        ALTER TABLE pico_supplier_attachment
        ADD COLUMN credential_present INTEGER NOT NULL DEFAULT 0
          CHECK (credential_present IN (0, 1));
      `);
    },
  },
  {
    /**
     * ADR 0136 BR6. What a derived item was read from, and at what revision.
     *
     * **Columns rather than a table, and that is the decision.** ADR 0127 asks
     * five questions of a new store kind - shred cascade, backup exclusions,
     * boot reconciliation, ADR 0119 Q5 ceilings, the Q3 byte-identity proof -
     * and a derivation would have had to answer all five for a fact that has no
     * life apart from the item it is a fact about. On the item, it inherits
     * every one of them for free: a domain shred reaches it because the item is
     * shredded, the retention sweep reaches it for the same reason, and the
     * memory ceiling counts it exactly once.
     *
     * That inheritance is also what makes ADR 0136's two halves true rather
     * than promised. **Detaching deletes nothing** - `detachPicoSupplier`
     * touches `pico_supplier_attachment` and nothing here, so what Pico
     * concluded outlives the attachment it concluded it from. **A domain shred
     * reaches every derived item** - because there is no second place holding
     * a copy of what was derived.
     *
     * `derived_pin_covers_content` is a third state as well as a boolean: NULL
     * means this item is not a derivation at all.
     *
     * The four columns have to arrive together - a pin without a supplier, or a
     * supplier without a pin, is a quotation without a source - and that is
     * held at the single insert site rather than by a CHECK, because SQLite's
     * `ALTER TABLE ADD COLUMN` cannot add a table-level constraint. The
     * protocol's `buildPicoLibraryDerivation` is what the write path takes, so
     * a partial derivation cannot be constructed to be written in the first
     * place; the column-level CHECKs above still hold the vocabulary.
     */
    id: picoLibraryDerivationMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE memory_item
        ADD COLUMN derived_from_supplier TEXT NULL;
      `);
      db.exec(`
        ALTER TABLE memory_item
        ADD COLUMN derived_pin_kind TEXT NULL
          CHECK (derived_pin_kind IS NULL OR derived_pin_kind IN ('content_hash', 'commit'));
      `);
      db.exec(`
        ALTER TABLE memory_item
        ADD COLUMN derived_pin_value TEXT NULL;
      `);
      db.exec(`
        ALTER TABLE memory_item
        ADD COLUMN derived_pin_covers_content INTEGER NULL
          CHECK (derived_pin_covers_content IS NULL OR derived_pin_covers_content IN (0, 1));
      `);
    },
  },
  {
    /**
     * ADR 0143 DP1. What a depot is and what it runs.
     *
     * **Three columns, and the absent fourth is the gate.** There is no
     * `branch`, no `ref` and no `channel`, so "follow main" is not a thing this
     * schema can hold - which is stronger than a rule against auto-updating,
     * because a rule needs something to keep obeying it. ADR 0122 refuses a
     * build that reads anything mutable; a depot following a branch would be
     * the same exposure through a door that ADR has no sentence about.
     *
     * **No privacy domain, and that is ADR 0143 DP6 rather than an
     * omission.** A depot produces nothing, so it has nothing to place. Its
     * suppliers each land in exactly one Private Space under ADR 0137 IN5, and
     * two instances from one depot may sit in two different spaces - a column
     * here would have made that impossible to express and would have put a
     * delivery vehicle inside a person's privacy boundary.
     *
     * The remote is the primary key because a depot **is** its address
     * (ADR 0143 DP1). That is deliberately the opposite of ADR 0137 IN1, where
     * an instance identifier is a person-chosen token precisely so it survives
     * a move: a supplier instance is a thing in a person's life, a depot is the
     * place code comes from, and if the place changes it is a different place.
     */
    id: picoDepotAttachmentMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_depot_attachment (
          remote TEXT PRIMARY KEY,
          running_commit TEXT NOT NULL,
          accepted_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    /**
     * ADR 0138 CO3/CO4 for depots - a gap the depot table left open.
     *
     * `pico_supplier_attachment` has carried these two decisions since
     * 2026-08-11, and the depot table did not. That looked defensible while a
     * depot was modelled as a delivery vehicle with no domain (ADR 0143 DP6),
     * and it was wrong for a reason ADR 0138 CO1 states in so many words about
     * the neighbouring case: **"A git fetch reaches outside, discloses that
     * this Pico is pulling, and may need a credential. Fetching is therefore a
     * bridge-shaped decision under this ADR even though reading is not."**
     *
     * Without these columns, attaching a depot implied permission to fetch it,
     * and there was no separate decision for fetching it *unasked* - exactly
     * the merge CO3 and CO4 exist to prevent, and for the reason they give: an
     * answered question is visible to the person who asked it, and a
     * background sweep is visible to nobody.
     *
     * Both default to off. CO4's dependence on CO3 is held at the single
     * write site rather than by a table CHECK, because SQLite's
     * `ALTER TABLE ADD COLUMN` cannot add one - the supplier table got its
     * CHECK by being created with it. The column-level CHECKs above still
     * hold the vocabulary, and `setPicoDepotReach` refuses the forbidden
     * combination under its own error, which is the same guarantee reached
     * through the only door this schema change leaves open.
     */
    id: picoDepotReachMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE pico_depot_attachment
        ADD COLUMN may_fetch INTEGER NOT NULL DEFAULT 0
          CHECK (may_fetch IN (0, 1));
      `);
      db.exec(`
        ALTER TABLE pico_depot_attachment
        ADD COLUMN may_fetch_unasked INTEGER NOT NULL DEFAULT 0
          CHECK (may_fetch_unasked IN (0, 1));
      `);
    },
  },
  {
    /**
     * ADR 0143 DP1/DP8 - the half of a depot row that says what a *fetch*
     * learned, next to the half that says what a *person* decided.
     *
     * Until now the row carried only the decision: the pin, when it was
     * accepted, and the two ADR 0138 CO3/CO4 switches. That left two states
     * with nowhere to come from. `offered` was declared, read by
     * `picoDepotState` and **unreachable in the running product** - a fetch
     * that saw a newer commit had no place to put it, so the observation was
     * gone before anyone looked, and DP1's promise that a newer commit waits
     * for a person was true of a type and not of a Pico. The other was the ADR
     * 0138 CO2 condition: a fetch that could not reach its remote had nowhere
     * to be the state CO2 says it is.
     *
     * Three columns rather than two, because when the last attempt failed is
     * part of what a person is deciding about - "could not reach it" reads
     * differently at four minutes and at four weeks.
     *
     * **This is a projection, not a second record.** The ADR 0121 chain keeps
     * the immutable history of every attempt; these hold only what is
     * currently true, the way `running_commit` already holds what acceptance
     * events decided. One write site keeps them honest: a fetch outcome, which
     * sets them on failure and clears them on success. A `NULL` condition
     * means the last attempt did not fail, which is why success must clear it
     * rather than only failure setting it.
     */
    id: picoDepotFetchOutcomeMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE pico_depot_attachment
        ADD COLUMN offered_commit TEXT;
      `);
      db.exec(`
        ALTER TABLE pico_depot_attachment
        ADD COLUMN last_fetch_condition TEXT;
      `);
      db.exec(`
        ALTER TABLE pico_depot_attachment
        ADD COLUMN last_fetch_at TEXT;
      `);
    },
  },
  {
    /**
     * ADR 0148 EX5 - where a Home keeps the mailbox addresses it exchanged.
     *
     * Keyed by the **device** signing key, not by the person's identity (ADR
     * 0148 EX2). A Home holds several of one person's devices, and keying by
     * identity would put them behind one mailbox - which ADR 0147 RY2 refuses,
     * because a shared mailbox stops identifying the sender and the envelope's
     * absent sender field would turn from a removed fact into an unknown one.
     *
     * **The two RY2 invariants are table constraints here rather than code.**
     * `home_inbound` is unique because two devices behind one of our mailboxes
     * is that same loss of identification; `device_inbound` is unique because
     * two devices behind one of *theirs* is a redirection - a device handing us
     * the address another device gave us would silently send what we write to
     * the first into the second's mailbox. A guard that lives in the schema
     * cannot be skipped by a second write path.
     *
     * The delegation triple travels with the row because ADR 0148 EX3 derives
     * a mailbox's life from `hasActivePicoIdentityDelegation`, and that check
     * runs where no request principal exists - at collection. Storing it is not
     * a second copy of authority: the delegation record still decides, and
     * these are the arguments needed to ask it.
     *
     * No status column and no expiry, deliberately (ADR 0148 EX3, ADR 0147
     * RY4). A row whose delegation went inactive is simply not honoured, so
     * there is no second state to keep in step and no revocation event to miss.
     */
    id: picoLinkMailboxMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_link_mailbox (
          device_signing_key_fingerprint_hex TEXT PRIMARY KEY,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          device_key_agreement_key_fingerprint_hex TEXT NOT NULL,
          delegation_id TEXT NOT NULL,
          home_inbound TEXT NOT NULL UNIQUE,
          device_inbound TEXT NOT NULL UNIQUE,
          exchanged_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    /**
     * ADR 0150 PU5 - what this Home has already pushed about.
     *
     * **Durable because the rule it serves is.** "One push per event" holds
     * however long ago the first was, and a ledger that lived in memory would
     * hold it only as long as the process: a Home restarting - or crash-looping
     * - would push again for the same recovery, which is exactly the battery
     * attack PU5 exists to prevent, performed by the Home on its own person.
     *
     * The primary key is the two things that make a push the same push: which
     * device it went to, and which event it was about. A second row for the
     * same pair is the retry that must not happen, so the schema refuses it
     * rather than a comparison somewhere doing so.
     *
     * `event_id` is a recovery id or a window id - the Home's own name for
     * something, never content. It does not leave this table.
     */
    id: picoLinkPushLedgerMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_link_push_ledger (
          device_signing_key_fingerprint_hex TEXT NOT NULL,
          occasion TEXT NOT NULL,
          event_id TEXT NOT NULL,
          pushed_at TEXT NOT NULL,
          PRIMARY KEY (device_signing_key_fingerprint_hex, occasion, event_id)
        );
      `);
    },
  },
  {
    id: picoModelProviderEntryMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_model_provider_entry (
          entry_id TEXT PRIMARY KEY,
          entry_json TEXT NOT NULL,
          -- ADR 0152 SE4. A narrowing lives beside the measurement and never
          -- inside it. Widening has nowhere to be written, so an entry that
          -- was measured at one width cannot be edited into claiming another.
          narrowed_context_tokens INTEGER NULL,
          narrowed_concurrent_jobs INTEGER NULL,
          added_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },  {
    id: picoModelProviderConsentMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_model_provider_consent (
          entry_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          -- ADR 0048. The declaration is a person's judgement about their own
          -- premises, so it hangs here rather than on the finding: two
          -- residents can disagree about whose hardware the box in the hall is.
          provider_class TEXT NOT NULL,
          carries TEXT NOT NULL,
          credential_ref TEXT NULL,
          decided_at TEXT NOT NULL,
          revoked_at TEXT NULL,
          PRIMARY KEY (entry_id, pico_identity_fingerprint_hex)
        );
      `);
    },
  },
  {
    id: picoModelJobQueueMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_model_job_queue (
          job_id TEXT PRIMARY KEY,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          entry_id TEXT NOT NULL,
          job_json TEXT NOT NULL,
          enqueued_at TEXT NOT NULL,
          -- Set when the job stopped being pending, whichever way it went. A
          -- refusal that cannot change is as final as an answer, and the
          -- column that says so is the same one.
          settled_at TEXT NULL,
          outcome TEXT NULL,
          result_json TEXT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_attempt_at TEXT NULL
        );

        CREATE INDEX idx_pico_model_job_queue_pending
        ON pico_model_job_queue (settled_at, enqueued_at);
      `);
    },
  },
  {
    id: picoDepotAcceptedByMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE pico_depot_attachment
        ADD COLUMN accepted_by_pico_identity_fingerprint_hex TEXT NULL;
      `);
    },
  },
  {
    id: picoModelJobProvenanceMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        ALTER TABLE pico_model_job_queue ADD COLUMN derived_from_supplier TEXT NULL;
      `);
      db.exec(`
        ALTER TABLE pico_model_job_queue ADD COLUMN derived_pin_value TEXT NULL;
      `);
      db.exec(`
        ALTER TABLE pico_model_job_queue ADD COLUMN derived_pin_covers_content INTEGER NULL;
      `);
    },
  },
  {
    id: picoMemoryEncryptionDecisionMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_memory_encryption_decision (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          enabled INTEGER NOT NULL,
          decided_at TEXT NOT NULL,
          -- ADR 0104. True when nobody decided and Pico read the host option
          -- it is trying to stop depending on.
          inherited_from_host INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: picoLinkRelayIdentityMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_link_relay_identity (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          operator TEXT NOT NULL,
          account_id TEXT NOT NULL,
          decided_at TEXT NOT NULL,
          inherited_from_host INTEGER NOT NULL
        );
      `);
    },
  },
  {
    id: picoModelProviderCredentialMigrationId,
    requiresBackup: false,
    up(db) {
      db.exec(`
        CREATE TABLE pico_model_provider_credential (
          entry_id TEXT NOT NULL,
          pico_identity_fingerprint_hex TEXT NOT NULL,
          -- The name the decision points at. Part of the sealed associated
          -- data, so a row edited to point elsewhere fails to open rather than
          -- opening something else.
          credential_ref TEXT NOT NULL,
          seal_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (entry_id, pico_identity_fingerprint_hex)
        );
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
