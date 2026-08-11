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
