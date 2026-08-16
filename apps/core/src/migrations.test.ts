import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  describeMigrationState,
  listAppliedMigrations,
  listMigrationAuditRecords,
  picoDepotAttachmentMigrationId,
  picoDepotFetchOutcomeMigrationId,
  picoLinkMailboxMigrationId,
  picoLinkPushLedgerMigrationId,
  picoDepotAcceptedByMigrationId,
  picoLinkRelayIdentityMigrationId,
  picoModelJobKindMigrationId,
  picoModelJobRecallContextMigrationId,
  picoPresenceRegistryMigrationId,
  picoPresenceSwitchMigrationId,
  picoModelProviderCredentialMigrationId,
  picoMemoryEncryptionDecisionMigrationId,
  picoModelJobProvenanceMigrationId,
  picoModelJobQueueMigrationId,
  picoModelProviderConsentMigrationId,
  picoModelProviderEntryMigrationId,
  picoDepotReachMigrationId,
  picoLibraryDerivationMigrationId,
  picoModuleEffectConsentMigrationId,
  picoRuleDecisionMigrationId,
  picoSchemaBaselineMigrationId,
  picoSupplierAttachmentMigrationId,
  picoSupplierCredentialScopeMigrationId,
  runMigrations,
} from './migrations.js';

const tempDirs: string[] = [];

function createDatabasePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-migration-test-'));
  tempDirs.push(dir);
  return join(dir, 'pico.sqlite');
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('database migrations', () => {
  it('describes pending migrations without creating migration tables', () => {
    const db = new Database(createDatabasePath());

    expect(describeMigrationState(db)).toEqual({
      appliedMigrationIds: [],
      pendingMigrations: [
        {
          id: picoSchemaBaselineMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModuleEffectConsentMigrationId,
          requiresBackup: false,
        },
        {
          id: picoRuleDecisionMigrationId,
          requiresBackup: false,
        },
        {
          id: picoSupplierAttachmentMigrationId,
          requiresBackup: false,
        },
        {
          id: picoSupplierCredentialScopeMigrationId,
          requiresBackup: false,
        },
        {
          id: picoLibraryDerivationMigrationId,
          requiresBackup: false,
        },
        {
          id: picoDepotAttachmentMigrationId,
          requiresBackup: false,
        },
        {
          id: picoDepotReachMigrationId,
          requiresBackup: false,
        },
        {
          id: picoDepotFetchOutcomeMigrationId,
          requiresBackup: false,
        },
        {
          id: picoLinkMailboxMigrationId,
          requiresBackup: false,
        },
        {
          id: picoLinkPushLedgerMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModelProviderEntryMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModelProviderConsentMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModelJobQueueMigrationId,
          requiresBackup: false,
        },
        {
          id: picoDepotAcceptedByMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModelJobProvenanceMigrationId,
          requiresBackup: false,
        },
        {
          id: picoMemoryEncryptionDecisionMigrationId,
          requiresBackup: false,
        },
        {
          id: picoLinkRelayIdentityMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModelProviderCredentialMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModelJobKindMigrationId,
          requiresBackup: false,
        },
        {
          id: picoModelJobRecallContextMigrationId,
          requiresBackup: false,
        },
        {
          id: picoPresenceRegistryMigrationId,
          requiresBackup: false,
        },
        {
          id: picoPresenceSwitchMigrationId,
          requiresBackup: false,
        },
      ],
      unknownMigrationIds: [],
      backupRequired: false,
    });

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all();

    expect(tables).toEqual([]);

    db.close();
  });

  it('applies the consolidated initial schema', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain('schema_migration');
    expect(tables).toContain('schema_migration_audit');
    expect(tables).toContain('pico_event');
    expect(tables).toContain('pico_home_claim_state');
    expect(tables).toContain('pico_home_founding_record');
    expect(tables).toContain('pico_home_membership');
    expect(tables).toContain('memory_domain_custody');
    expect(tables).toContain('pico_share_envelope');
    expect(tables).toContain('pico_reader_custody_domain');
    expect(tables).toContain('pico_reader_custody_writer_grant');
    expect(tables).toContain('pico_reader_custody_writer_grant_lifecycle');
    expect(tables).toContain('pico_reader_custody_item');
    expect(tables).toContain('pico_reader_custody_reader_grant');
    expect(tables).toContain('pico_reader_custody_reader_grant_lifecycle');
    expect(tables).toContain('pico_reader_custody_kek_rotation');
    expect(tables).toContain('pico_home_device_lifecycle_transition');
    expect(tables).toContain('pico_home_device_recovery');
    expect(listAppliedMigrations(db)).toEqual([
      {
        id: picoSchemaBaselineMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModuleEffectConsentMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoRuleDecisionMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoSupplierAttachmentMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoSupplierCredentialScopeMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoLibraryDerivationMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoDepotAttachmentMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoDepotReachMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoDepotFetchOutcomeMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoLinkMailboxMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoLinkPushLedgerMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModelProviderEntryMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModelProviderConsentMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModelJobQueueMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoDepotAcceptedByMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModelJobProvenanceMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoMemoryEncryptionDecisionMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoLinkRelayIdentityMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModelProviderCredentialMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModelJobKindMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoModelJobRecallContextMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoPresenceRegistryMigrationId,
        appliedAt: expect.any(String),
      },
      {
        id: picoPresenceSwitchMigrationId,
        appliedAt: expect.any(String),
      },
    ]);

    db.close();
  });

  it('contains only the final founding and content columns', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);

    const foundingColumns = db
      .prepare('PRAGMA table_info(pico_home_founding_record)')
      .all()
      .map((row) => (row as { name: string }).name);
    const eventColumns = db
      .prepare('PRAGMA table_info(pico_event)')
      .all()
      .map((row) => (row as { name: string }).name);
    const memoryColumns = db
      .prepare('PRAGMA table_info(memory_item)')
      .all()
      .map((row) => (row as { name: string }).name);

    expect(foundingColumns).not.toContain('claimant_claim_signature_hex');
    expect(foundingColumns).toContain('claimant_founding_signature_hex');
    expect(foundingColumns).toContain('first_device_evidence_json');
    expect(eventColumns).toContain('payload_posture');
    expect(memoryColumns).toEqual(expect.arrayContaining(['content_posture', 'key_envelope_ref']));

    db.close();
  });

  it('creates an internal unclaimed Pico Home claim state skeleton', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);

    const rows = db
      .prepare(`
        SELECT
          id,
          state,
          host_admin_pico_id AS hostAdminPicoId,
          home_id AS homeId,
          host_signing_key_fingerprint_hex AS hostSigningKeyFingerprintHex,
          host_key_agreement_key_fingerprint_hex AS hostKeyAgreementKeyFingerprintHex,
          claimed_at AS claimedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pico_home_claim_state
      `)
      .all();

    expect(rows).toEqual([
      {
        id: 1,
        state: 'unclaimed',
        hostAdminPicoId: null,
        homeId: null,
        hostSigningKeyFingerprintHex: null,
        hostKeyAgreementKeyFingerprintHex: null,
        claimedAt: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);

    expect(() => {
      db
        .prepare(`
          UPDATE pico_home_claim_state
          SET state = 'claimed',
              host_admin_pico_id = NULL,
              claimed_at = ?,
              updated_at = ?
          WHERE id = 1
        `)
        .run('2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z');
    }).toThrow();

    expect(() => {
      db
        .prepare(`
          INSERT INTO pico_home_claim_state (
            id,
            state,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?)
        `)
        .run(2, 'unclaimed', '2026-07-05T00:00:00.000Z', '2026-07-05T00:00:00.000Z');
    }).toThrow();

    db.close();
  });

  it('runs idempotently', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    runMigrations(db);

    expect(describeMigrationState(db)).toEqual({
      appliedMigrationIds: [
        picoSchemaBaselineMigrationId,
        picoModuleEffectConsentMigrationId,
        picoRuleDecisionMigrationId,
        picoSupplierAttachmentMigrationId,
        picoSupplierCredentialScopeMigrationId,
        picoLibraryDerivationMigrationId,
        picoDepotAttachmentMigrationId,
        picoDepotReachMigrationId,
        picoDepotFetchOutcomeMigrationId,
        picoLinkMailboxMigrationId,
        picoLinkPushLedgerMigrationId,
        picoModelProviderEntryMigrationId,
        picoModelProviderConsentMigrationId,
        picoModelJobQueueMigrationId,
        picoDepotAcceptedByMigrationId,
        picoModelJobProvenanceMigrationId,
        picoMemoryEncryptionDecisionMigrationId,
        picoLinkRelayIdentityMigrationId,
        picoModelProviderCredentialMigrationId,
        picoModelJobKindMigrationId,
        picoModelJobRecallContextMigrationId,
        picoPresenceRegistryMigrationId,
        picoPresenceSwitchMigrationId,
      ],
      pendingMigrations: [],
      unknownMigrationIds: [],
      backupRequired: false,
    });
    expect(listAppliedMigrations(db)).toHaveLength(23);
    expect(listMigrationAuditRecords(db)).toHaveLength(1);

    db.close();
  });

  // The gate used to be proven through whichever product migration happened to
  // set `requiresBackup`, which made a runner guarantee depend on the schema's
  // history. After the ADR 0134 F3 consolidation no product step requires a
  // backup, so the definition is injected: the runner's promise is now tested
  // as the runner's promise.
  it('requires explicit backup confirmation for a migration that demands one', () => {
    const db = new Database(createDatabasePath());
    const backupDemanding = [
      {
        id: '0001_initial_schema',
        requiresBackup: true,
        up(database: Database.Database) {
          database.exec('CREATE TABLE backup_gated (id TEXT PRIMARY KEY);');
        },
      },
    ];

    expect(() => runMigrations(db, {
      requireBackupBeforeMigration: true,
      migrationDefinitions: backupDemanding,
    })).toThrow('Backup confirmation is required');
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'backup_gated'").get())
      .toBeUndefined();

    expect(() => runMigrations(db, {
      requireBackupBeforeMigration: true,
      backupConfirmed: true,
      migrationDefinitions: backupDemanding,
    })).not.toThrow();
    expect(listAppliedMigrations(db)).toHaveLength(1);

    db.close();
  });

  it('preserves existing event data when rerun', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    db.prepare(`
      INSERT INTO pico_event (
        event_id,
        device_id,
        session_id,
        lamport,
        wall_time,
        type,
        stream,
        payload_json,
        signature,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'event-1',
      'device-1',
      null,
      1,
      '2026-01-01T00:00:00.000Z',
      'message.created',
      'device:device-1',
      '{"role":"user","text":"Hallo"}',
      null,
      '2026-01-01T00:00:00.000Z',
    );

    runMigrations(db);

    const count = db.prepare('SELECT COUNT(*) AS count FROM pico_event').get() as { count: number };
    expect(count.count).toBe(1);
    expect(listAppliedMigrations(db)).toHaveLength(23);

    db.close();
  });

  it('records applied migrations in the schema migration audit log', () => {
    const db = new Database(createDatabasePath());

    const result = runMigrations(db);

    expect(result.appliedMigrationIds).toEqual([
      picoSchemaBaselineMigrationId,
      picoModuleEffectConsentMigrationId,
      picoRuleDecisionMigrationId,
      picoSupplierAttachmentMigrationId,
      picoSupplierCredentialScopeMigrationId,
      picoLibraryDerivationMigrationId,
      picoDepotAttachmentMigrationId,
      picoDepotReachMigrationId,
      picoDepotFetchOutcomeMigrationId,
      picoLinkMailboxMigrationId,
      picoLinkPushLedgerMigrationId,
      picoModelProviderEntryMigrationId,
      picoModelProviderConsentMigrationId,
      picoModelJobQueueMigrationId,
      picoDepotAcceptedByMigrationId,
      picoModelJobProvenanceMigrationId,
      picoMemoryEncryptionDecisionMigrationId,
      picoLinkRelayIdentityMigrationId,
      picoModelProviderCredentialMigrationId,
      picoModelJobKindMigrationId,
      picoModelJobRecallContextMigrationId,
      picoPresenceRegistryMigrationId,
      picoPresenceSwitchMigrationId,
    ]);
    expect(listMigrationAuditRecords(db)).toEqual([
      {
        id: 1,
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
        status: 'applied',
        migrationIds: [
          picoSchemaBaselineMigrationId,
          picoModuleEffectConsentMigrationId,
          picoRuleDecisionMigrationId,
          picoSupplierAttachmentMigrationId,
          picoSupplierCredentialScopeMigrationId,
          picoLibraryDerivationMigrationId,
          picoDepotAttachmentMigrationId,
          picoDepotReachMigrationId,
          picoDepotFetchOutcomeMigrationId,
          picoLinkMailboxMigrationId,
          picoLinkPushLedgerMigrationId,
          picoModelProviderEntryMigrationId,
          picoModelProviderConsentMigrationId,
          picoModelJobQueueMigrationId,
          picoDepotAcceptedByMigrationId,
          picoModelJobProvenanceMigrationId,
          picoMemoryEncryptionDecisionMigrationId,
          picoLinkRelayIdentityMigrationId,
          picoModelProviderCredentialMigrationId,
          picoModelJobKindMigrationId,
          picoModelJobRecallContextMigrationId,
          picoPresenceRegistryMigrationId,
          picoPresenceSwitchMigrationId,
        ],
      },
    ]);

    db.close();
  });

  it('rolls back migration registry changes when audit recording fails', () => {
    const db = new Database(createDatabasePath());

    db.exec(`
      CREATE TABLE schema_migration_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        migration_ids_json TEXT NOT NULL
      );

      CREATE TRIGGER reject_schema_migration_audit_insert
      BEFORE INSERT ON schema_migration_audit
      BEGIN
        SELECT RAISE(ABORT, 'schema migration audit insert blocked');
      END;
    `);

    expect(() => runMigrations(db, {
      migrationDefinitions: [
        {
          id: '0001_test_pending',
          requiresBackup: false,
          up(database) {
            database.exec('CREATE TABLE test_pending (id TEXT PRIMARY KEY);');
          },
        },
      ],
    })).toThrow('schema migration audit insert blocked');
    expect(listAppliedMigrations(db)).toEqual([]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'test_pending'").get()).toBeUndefined();
    expect(listMigrationAuditRecords(db)).toEqual([]);

    db.close();
  });

  it('records failed migration attempts when the audit table supports error messages', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    db.prepare('DELETE FROM schema_migration').run();
    db.prepare('DELETE FROM schema_migration_audit').run();

    expect(() => runMigrations(db)).toThrow(/schema_migration_audit already exists/);
    expect(listAppliedMigrations(db)).toEqual([]);
    expect(listMigrationAuditRecords(db)).toEqual([
      {
        id: 2,
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
        status: 'failed',
        migrationIds: [
          picoSchemaBaselineMigrationId,
          picoModuleEffectConsentMigrationId,
          picoRuleDecisionMigrationId,
          picoSupplierAttachmentMigrationId,
          picoSupplierCredentialScopeMigrationId,
          picoLibraryDerivationMigrationId,
          picoDepotAttachmentMigrationId,
          picoDepotReachMigrationId,
          picoDepotFetchOutcomeMigrationId,
          picoLinkMailboxMigrationId,
          picoLinkPushLedgerMigrationId,
          picoModelProviderEntryMigrationId,
          picoModelProviderConsentMigrationId,
          picoModelJobQueueMigrationId,
          picoDepotAcceptedByMigrationId,
          picoModelJobProvenanceMigrationId,
          picoMemoryEncryptionDecisionMigrationId,
          picoLinkRelayIdentityMigrationId,
          picoModelProviderCredentialMigrationId,
          picoModelJobKindMigrationId,
          picoModelJobRecallContextMigrationId,
          picoPresenceRegistryMigrationId,
          picoPresenceSwitchMigrationId,
        ],
        errorMessage: expect.stringContaining('schema_migration_audit already exists'),
      },
    ]);

    db.close();
  });

  it('refuses to run when the database contains unknown future migrations', () => {
    const db = new Database(createDatabasePath());

    runMigrations(db);
    db
      .prepare('INSERT INTO schema_migration (id, applied_at) VALUES (?, ?)')
      .run('9999_future_schema', '2026-07-04T00:00:00.000Z');

    expect(() => runMigrations(db)).toThrow(
      'Database contains unsupported migration(s): 9999_future_schema. Refusing to run with this Pico Core version.',
    );
    expect(describeMigrationState(db).unknownMigrationIds).toEqual([
      '9999_future_schema',
    ]);

    db.close();
  });
});
