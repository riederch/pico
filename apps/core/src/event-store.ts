import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type {
  PayloadPosture,
  PicoEvent,
  PicoEventAppendResult,
  PicoHomeFoundingRecord,
  PicoHomeMembershipRole,
  PicoHomeMembershipScope,
  PicoHomeMembershipStatus,
  PicoHomeMembershipCredential,
  PicoHomeMembershipLifecycleRecord,
  PicoHomeDomainReadGrantLifecycleRecord,
  PicoHomeDomainReadGrantRecord,
  PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import {
  picoHomeDomainReadGrantLifecycleRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeMembershipCredentialSchema,
  payloadPostures,
  picoHomeClaimResponseRecordSchema,
  picoHomeFoundingRecordSchema,
  picoHomeMembershipRoles,
  picoHomeMembershipScopes,
  picoHomeMembershipStatuses,
} from '@pico/protocol';
import {
  listAppliedMigrations,
  runMigrations,
  runMigrationsWithBackup,
  type AppliedMigration,
  type MigrationDefinition,
} from './migrations.js';
import { MemoryStore } from './memory-store.js';
import { RetentionPolicyStore } from './retention-policy-store.js';
import { OperatorStore, type PasswordHashingSodium } from './operator-store.js';
import {
  verifyPicoHomeMembershipActivation,
  verifyPicoHomeMembershipAuthority,
  verifyPicoHomeMembershipLifecycleRecord,
  type PicoHomeMembershipVerificationFailure,
} from './home-membership.js';
import {
  createVerifiedPicoIdentityLifecycleIndex,
  type IdentityVerificationSodium,
  type PicoIdentitySignedDelegation,
  type PicoIdentitySignedRevocation,
} from '@pico/identity';
import type { MemoryContentCrypto } from './memory-content-crypto.js';
import type { SqliteBackupResult } from './sqlite-backup.js';
import {
  verifyPicoHomeDomainReadGrant,
  verifyPicoHomeDomainReadGrantLifecycle,
  type PicoHomeDomainReadGrantVerificationFailure,
} from './domain-read-grant.js';

export type AppendResult = PicoEventAppendResult;

export interface EventCursor {
  lamport: number;
  wallTime: string;
  eventId: string;
}

export interface EventListPage {
  events: PicoEvent[];
  nextCursor: EventCursor | null;
  hasMore: boolean;
}

export type PicoHomeClaimState =
  | {
    state: 'unclaimed';
    hostAdminPicoId: null;
    homeId: null;
    hostSigningKeyFingerprintHex: null;
    hostKeyAgreementKeyFingerprintHex: null;
    claimedAt: null;
    createdAt: string;
    updatedAt: string;
  }
  | {
    state: 'claimed';
    hostAdminPicoId: string;
    homeId: string | null;
    hostSigningKeyFingerprintHex: string | null;
    hostKeyAgreementKeyFingerprintHex: string | null;
    claimedAt: string;
    createdAt: string;
    updatedAt: string;
  };

export interface PicoHomeClaimInput {
  homeId: string;
  hostAdminPicoId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  foundingRecord?: PicoHomeFoundingRecord;
  claimedAt?: string;
}

export interface PicoHomeFoundingReconciliationResult {
  foundingRecordPresent: boolean;
  restoredClaimState: boolean;
}

export type PicoHomeMembershipSource = 'founding_record' | 'membership_credential';

export interface PicoHomeMembership {
  membershipId: string;
  homeId: string;
  picoIdentityFingerprintHex: string;
  role: PicoHomeMembershipRole;
  status: PicoHomeMembershipStatus;
  scopes: PicoHomeMembershipScope[];
  source: PicoHomeMembershipSource;
  sourceRef: string;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PicoHomeMembershipReconciliationResult {
  foundingRecordPresent: boolean;
  restoredMembership: boolean;
}

export interface PicoHomeMembershipCredentialReconciliationResult {
  verifiedCredentials: number;
  droppedCredentials: number;
  projectedMemberships: number;
}

export type PicoHomeMembershipRecordResult =
  | { ok: true; membership: PicoHomeMembership }
  | { ok: false; reason: PicoHomeMembershipVerificationFailure | 'no_founding_record' | 'conflicting_record' };

export type PicoIdentityLifecycleEvidenceRecordResult =
  | { ok: true }
  | { ok: false; reason: 'conflicting_record' | 'invalid_identity_lifecycle_evidence' };

export interface PicoHomeDomainReadGrantView {
  grantId: string;
  homeId: string;
  privacyDomain: string;
  controllerPicoIdentityFingerprintHex: string;
  readerPicoIdentityFingerprintHex: string;
  status: 'active' | 'not_yet_valid' | 'expired' | 'revoked';
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  createdAt: string;
}

export type PicoHomeDomainReadGrantRecordResult =
  | { ok: true; inserted: boolean; grant: PicoHomeDomainReadGrantView }
  | {
    ok: false;
    reason: PicoHomeDomainReadGrantVerificationFailure
      | 'no_founding_record'
      | 'conflicting_record'
      | 'reader_is_not_active_member'
      | 'domain_is_not_host_custody';
  };

export interface EventStoreOpenOptions {
  backupDirectory?: string;
  requireBackupBeforeMigration?: boolean;
  createBackup?: (databasePath: string, backupDirectory: string) => Promise<SqliteBackupResult>;
  migrationDefinitions?: readonly MigrationDefinition[];
  /** Optional provider that lets {@link EventStore.memory} encrypt/decrypt domain_encrypted items (ADR 0071). */
  memoryCrypto?: MemoryContentCrypto;
}

interface EventStoreConstructorOptions {
  runMigrations?: boolean;
  migrationDefinitions?: readonly MigrationDefinition[];
  memoryCrypto?: MemoryContentCrypto;
}

export class EventStore {
  private readonly db: Database.Database;
  private readonly memoryCrypto?: MemoryContentCrypto;
  private closed = false;

  public static async open(databasePath: string, options: EventStoreOpenOptions = {}): Promise<EventStore> {
    const store = new EventStore(databasePath, {
      runMigrations: false,
      memoryCrypto: options.memoryCrypto,
    });

    try {
      await runMigrationsWithBackup(store.db, {
        databasePath,
        backupDirectory: options.backupDirectory ?? defaultBackupDirectory(databasePath),
        requireBackupBeforeMigration: options.requireBackupBeforeMigration ?? true,
        createBackup: options.createBackup,
        migrationDefinitions: options.migrationDefinitions,
      });
    } catch (error) {
      store.close();
      throw error;
    }

    // Enforce recorded deletions on boot so a restore that resurrected deleted
    // memory items as active is re-tombstoned (ADR 0070 recovery direction).
    store.reconcileMemoryTombstones();
    // Enforce ADR 0080 H8: a restored stale claim-state row must not reopen
    // Setup Mode while a founding record is present.
    store.reconcilePicoHomeFoundingEvidence();
    // Enforce the first ADR 0080 M3 membership projection: the founding record
    // is also the Home Host Pico's active membership root.
    store.reconcilePicoHomeMembershipsFromFoundingEvidence();

    return store;
  }

  public constructor(databasePath: string, options: EventStoreConstructorOptions = {}) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.memoryCrypto = options.memoryCrypto;

    if (options.runMigrations !== false) {
      runMigrations(this.db, {
        migrationDefinitions: options.migrationDefinitions,
      });
    }
  }

  public append(event: PicoEvent): AppendResult {
    this.ensureOpen();
    assertStoredEvent(event);

    const payloadJson = serializePayload(event.payload);
    const existing = this.db
      .prepare('SELECT * FROM pico_event WHERE event_id = ?')
      .get(event.eventId) as EventRow | undefined;

    if (existing) {
      return isSameStoredEvent(existing, event, payloadJson) ? 'duplicate_same_payload' : 'duplicate_conflict';
    }

    const statement = this.db.prepare(`
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
        payload_posture,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    statement.run(
      event.eventId,
      event.deviceId,
      event.sessionId ?? null,
      event.lamport,
      event.wallTime,
      event.type,
      event.stream,
      payloadJson,
      event.signature ?? null,
      event.payloadPosture ?? null,
      new Date().toISOString(),
    );

    return 'inserted';
  }

  public list(limit = 100): PicoEvent[] {
    return this.listPage({ limit }).events;
  }

  public listPage(options: { limit?: number; after?: EventCursor | null } = {}): EventListPage {
    this.ensureOpen();
    const limit = options.limit ?? 100;
    assertListLimit(limit);

    const rows = this.selectPageRows(limit + 1, options.after ?? null);
    const pageRows = rows.slice(0, limit);
    const events = pageRows.map((row) => this.mapRow(row));
    const lastEvent = events.at(-1) ?? null;

    return {
      events,
      nextCursor: lastEvent === null ? null : {
        lamport: lastEvent.lamport,
        wallTime: lastEvent.wallTime,
        eventId: lastEvent.eventId,
      },
      hasMore: rows.length > limit,
    };
  }

  public listTail(limit = 100): EventListPage {
    this.ensureOpen();
    assertListLimit(limit);

    const rows = this.selectTailRows(limit + 1);
    const pageRows = rows.slice(0, limit).reverse();

    return {
      events: pageRows.map((row) => this.mapRow(row)),
      nextCursor: null,
      hasMore: rows.length > limit,
    };
  }

  public maxLamport(): number {
    this.ensureOpen();

    const row = this.db.prepare('SELECT MAX(lamport) AS max_lamport FROM pico_event').get() as { max_lamport: number | null };
    return row.max_lamport ?? 0;
  }

  public appliedMigrations(): AppliedMigration[] {
    this.ensureOpen();

    return listAppliedMigrations(this.db);
  }

  public picoHomeClaimState(): PicoHomeClaimState {
    this.ensureOpen();

    const row = this.db
      .prepare(`
        SELECT
          state,
          host_admin_pico_id AS hostAdminPicoId,
          ${columnExists(this.db, 'pico_home_claim_state', 'home_id') ? 'home_id' : 'NULL'} AS homeId,
          ${columnExists(this.db, 'pico_home_claim_state', 'host_signing_key_fingerprint_hex') ? 'host_signing_key_fingerprint_hex' : 'NULL'} AS hostSigningKeyFingerprintHex,
          ${columnExists(this.db, 'pico_home_claim_state', 'host_key_agreement_key_fingerprint_hex') ? 'host_key_agreement_key_fingerprint_hex' : 'NULL'} AS hostKeyAgreementKeyFingerprintHex,
          claimed_at AS claimedAt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM pico_home_claim_state
        WHERE id = 1
      `)
      .get() as PicoHomeClaimStateRow | undefined;

    if (row === undefined) {
      throw new Error('Pico Home claim state is missing.');
    }

    return mapPicoHomeClaimState(row);
  }

  public picoHomeFoundingRecord(): PicoHomeFoundingRecord | undefined {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_founding_record')) {
      return undefined;
    }

    const row = this.db
      .prepare(`
        SELECT
          schema,
          founding_id AS foundingId,
          home_id AS homeId,
          claim_id AS claimId,
          home_host_pico_identity_fingerprint_hex AS homeHostPicoIdentityFingerprintHex,
          host_signing_key_fingerprint_hex AS hostSigningKeyFingerprintHex,
          host_key_agreement_key_fingerprint_hex AS hostKeyAgreementKeyFingerprintHex,
          founded_at AS foundedAt,
          lifecycle_order AS lifecycleOrder,
          claim_response_json AS claimResponseJson,
          founding_json AS foundingJson,
          claimant_identity_key_record_json AS claimantIdentityKeyRecordJson,
          claimant_founding_signature_hex AS claimantFoundingSignatureHex,
          host_claim_response_signature_hex AS hostClaimResponseSignatureHex,
          host_founding_signature_hex AS hostFoundingSignatureHex,
          created_at AS createdAt
        FROM pico_home_founding_record
        WHERE id = 1
      `)
      .get() as PicoHomeFoundingRecordRow | undefined;

    return row === undefined ? undefined : mapPicoHomeFoundingRecord(row);
  }

  public picoHomeMemberships(): PicoHomeMembership[] {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_membership')) {
      return [];
    }

    return this.db
      .prepare(`
        SELECT ${picoHomeMembershipColumns}
        FROM pico_home_membership
        ORDER BY home_id ASC, role ASC, pico_identity_fingerprint_hex ASC
      `)
      .all()
      .map((row) => mapPicoHomeMembership(row as PicoHomeMembershipRow));
  }

  /**
   * Membership is always scoped to one Home. Without an explicit `homeId` the
   * currently claimed Home is used; an unclaimed Home has no member, so this
   * fails closed rather than accepting a membership row for any other Home.
   */
  public hasActivePicoHomeMembership(
    picoIdentityFingerprintHex: string,
    homeId?: string,
    at: string = new Date().toISOString(),
  ): boolean {
    this.ensureOpen();
    assertFingerprint(picoIdentityFingerprintHex, 'picoIdentityFingerprintHex');
    if (homeId !== undefined) {
      assertAsciiToken(homeId, 'homeId');
    }

    if (!tableExists(this.db, 'pico_home_membership')) {
      return false;
    }

    // An expired credential is not an active membership. The stored status
    // cannot express that on its own - expiry is a function of the clock, not
    // of a statement - so the window is part of the question, not a later sweep.
    const scopedHomeId = homeId ?? this.picoHomeClaimState().homeId ?? undefined;
    if (scopedHomeId === undefined) {
      return false;
    }

    const row = this.db
      .prepare(`
        SELECT 1 AS present
        FROM pico_home_membership
        WHERE home_id = ?
          AND pico_identity_fingerprint_hex = ?
          AND status = 'active'
          AND valid_from <= ?
          AND (valid_until IS NULL OR valid_until > ?)
        LIMIT 1
      `)
      .get(scopedHomeId, picoIdentityFingerprintHex, at, at) as { present: 1 } | undefined;

    return row !== undefined;
  }

  public claimPicoHome(input: PicoHomeClaimInput): PicoHomeClaimState {
    this.ensureOpen();
    assertAsciiToken(input.homeId, 'homeId');
    assertAsciiToken(input.hostAdminPicoId, 'hostAdminPicoId');
    assertFingerprint(input.hostSigningKeyFingerprintHex, 'hostSigningKeyFingerprintHex');
    assertFingerprint(input.hostKeyAgreementKeyFingerprintHex, 'hostKeyAgreementKeyFingerprintHex');
    if (input.foundingRecord !== undefined) {
      assertPicoHomeFoundingRecord(input.foundingRecord, input);
    }
    if (input.claimedAt !== undefined) {
      assertNonEmptyString(input.claimedAt, 'claimedAt');
    }

    const claimedAt = input.claimedAt ?? input.foundingRecord?.founding.foundedAt ?? new Date().toISOString();
    const claim = this.db.transaction(() => {
      const result = this.db
        .prepare(`
          UPDATE pico_home_claim_state
          SET state = ?,
              host_admin_pico_id = ?,
              home_id = ?,
              host_signing_key_fingerprint_hex = ?,
              host_key_agreement_key_fingerprint_hex = ?,
              claimed_at = ?,
              updated_at = ?
          WHERE id = 1 AND state = 'unclaimed'
        `)
        .run(
          'claimed',
          input.hostAdminPicoId,
          input.homeId,
          input.hostSigningKeyFingerprintHex,
          input.hostKeyAgreementKeyFingerprintHex,
          claimedAt,
          claimedAt,
        );

      if (result.changes !== 1) {
        throw new Error('Pico Home is already claimed.');
      }

      if (input.foundingRecord !== undefined) {
        this.insertPicoHomeFoundingRecord(input.foundingRecord);
        this.upsertPicoHomeMembership(picoHomeFoundingMembershipFromRecord(input.foundingRecord));
      }
    });

    claim();
    return this.picoHomeClaimState();
  }

  public resetPicoHome(resetAt: string = new Date().toISOString()): PicoHomeClaimState {
    this.ensureOpen();
    assertNonEmptyString(resetAt, 'resetAt');

    const reset = this.db.transaction(() => {
      this.db
        .prepare(`
          UPDATE pico_home_claim_state
          SET state = ?,
              host_admin_pico_id = NULL,
              home_id = NULL,
              host_signing_key_fingerprint_hex = NULL,
              host_key_agreement_key_fingerprint_hex = NULL,
              claimed_at = NULL,
              updated_at = ?
          WHERE id = 1
        `)
        .run('unclaimed', resetAt);

      if (tableExists(this.db, 'pico_home_founding_record')) {
        this.db.prepare('DELETE FROM pico_home_founding_record WHERE id = 1').run();
      }

      if (tableExists(this.db, 'pico_home_membership')) {
        this.db.prepare('DELETE FROM pico_home_membership').run();
      }

      if (tableExists(this.db, 'pico_identity_revocation')) {
        this.db.prepare('DELETE FROM pico_identity_revocation').run();
      }
      if (tableExists(this.db, 'pico_identity_delegation')) {
        this.db.prepare('DELETE FROM pico_identity_delegation').run();
      }
      if (tableExists(this.db, 'pico_home_domain_read_grant_lifecycle')) {
        this.db.prepare('DELETE FROM pico_home_domain_read_grant_lifecycle').run();
      }
      if (tableExists(this.db, 'pico_home_domain_read_grant')) {
        this.db.prepare('DELETE FROM pico_home_domain_read_grant').run();
      }
    });

    reset();

    return this.picoHomeClaimState();
  }

  /**
   * Reconciles the current Pico Home claim-state projection from the durable
   * founding evidence (ADR 0080 H8). If a stale restore brings back an
   * `unclaimed` or conflicting claim-state row while a founding record is
   * present, the row is projected back to `claimed`. This never mints a new
   * claim or appends audit; it only prevents Setup Mode from reopening as a
   * restore side effect.
   */
  public reconcilePicoHomeFoundingEvidence(reconciledAt: string = new Date().toISOString()): PicoHomeFoundingReconciliationResult {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_claim_state') || !tableExists(this.db, 'pico_home_founding_record')) {
      return { foundingRecordPresent: false, restoredClaimState: false };
    }

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { foundingRecordPresent: false, restoredClaimState: false };
    }

    const expectedClaim = picoHomeClaimInputFromFoundingRecord(foundingRecord);
    assertPicoHomeFoundingRecord(foundingRecord, expectedClaim);
    assertNonEmptyString(reconciledAt, 'reconciledAt');

    const row = this.db
      .prepare(`
        SELECT
          state,
          host_admin_pico_id AS hostAdminPicoId,
          home_id AS homeId,
          host_signing_key_fingerprint_hex AS hostSigningKeyFingerprintHex,
          host_key_agreement_key_fingerprint_hex AS hostKeyAgreementKeyFingerprintHex,
          claimed_at AS claimedAt
        FROM pico_home_claim_state
        WHERE id = 1
      `)
      .get() as Omit<PicoHomeClaimStateRow, 'createdAt' | 'updatedAt'> | undefined;

    const alreadyReconciled = row !== undefined
      && row.state === 'claimed'
      && row.hostAdminPicoId === expectedClaim.hostAdminPicoId
      && row.homeId === expectedClaim.homeId
      && row.hostSigningKeyFingerprintHex === expectedClaim.hostSigningKeyFingerprintHex
      && row.hostKeyAgreementKeyFingerprintHex === expectedClaim.hostKeyAgreementKeyFingerprintHex
      && row.claimedAt === expectedClaim.claimedAt;

    if (alreadyReconciled) {
      return { foundingRecordPresent: true, restoredClaimState: false };
    }

    const result = this.db
      .prepare(`
        UPDATE pico_home_claim_state
        SET state = ?,
            host_admin_pico_id = ?,
            home_id = ?,
            host_signing_key_fingerprint_hex = ?,
            host_key_agreement_key_fingerprint_hex = ?,
            claimed_at = ?,
            updated_at = ?
        WHERE id = 1
      `)
      .run(
        'claimed',
        expectedClaim.hostAdminPicoId,
        expectedClaim.homeId,
        expectedClaim.hostSigningKeyFingerprintHex,
        expectedClaim.hostKeyAgreementKeyFingerprintHex,
        expectedClaim.claimedAt,
        reconciledAt,
      );

    if (result.changes !== 1) {
      throw new Error('Pico Home claim state could not be reconciled from founding evidence.');
    }

    return { foundingRecordPresent: true, restoredClaimState: true };
  }

  /**
   * Reconciles the Home Host Pico's active membership projection from the
   * durable founding evidence (ADR 0080 M3). The founding record doubles as the
   * Home Host Pico's own membership root; a stale restore that drops or damages
   * that projection must not leave the Home without its local membership root.
   *
   * The current founding record is the only truth for founding-sourced rows, so
   * rows carrying a different `source_ref` are dropped first: they belong to a
   * superseded founding and would otherwise both resurrect a stale active
   * membership and collide with the projected row on
   * `UNIQUE (home_id, pico_identity_fingerprint_hex, role)`.
   */
  public reconcilePicoHomeMembershipsFromFoundingEvidence(
    reconciledAt: string = new Date().toISOString(),
  ): PicoHomeMembershipReconciliationResult {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_founding_record') || !tableExists(this.db, 'pico_home_membership')) {
      return { foundingRecordPresent: false, restoredMembership: false };
    }

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { foundingRecordPresent: false, restoredMembership: false };
    }

    const expected = {
      ...picoHomeFoundingMembershipFromRecord(foundingRecord),
      updatedAt: reconciledAt,
    };

    const existing = this.picoHomeMembership(expected.membershipId);
    const projectionMatches = existing !== undefined
      && existing.homeId === expected.homeId
      && existing.picoIdentityFingerprintHex === expected.picoIdentityFingerprintHex
      && existing.role === expected.role
      && existing.status === expected.status
      && sameScopeSet(existing.scopes, expected.scopes)
      && existing.source === expected.source
      && existing.sourceRef === expected.sourceRef
      && existing.validFrom === expected.validFrom
      && existing.validUntil === expected.validUntil;

    const reconcile = this.db.transaction(() => {
      const pruned = this.db
        .prepare(`
          DELETE FROM pico_home_membership
          WHERE source = 'founding_record'
            AND source_ref <> ?
        `)
        .run(expected.sourceRef).changes;

      if (!projectionMatches) {
        this.upsertPicoHomeMembership(expected);
      }

      return pruned > 0 || !projectionMatches;
    });

    return { foundingRecordPresent: true, restoredMembership: reconcile() };
  }

  /**
   * Accepts a signed Home Membership Credential (ADR 0080 H6, Gate M3). The
   * issuer signature is the authority and is checked first; the host activation
   * countersignature is checked only here, at intake, because it is operational
   * acknowledgment rather than authority and must not outrank a later host-key
   * rotation.
   */
  public recordPicoHomeMembershipCredential(params: {
    sodium: IdentityVerificationSodium;
    credential: PicoHomeMembershipCredential;
    hostSigningPublicKeyHex: string;
    recordedAt?: string;
  }): PicoHomeMembershipRecordResult {
    this.ensureOpen();

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const authority = verifyPicoHomeMembershipAuthority(params.sodium, {
      credential: params.credential,
      foundingRecord,
    });
    if (!authority.ok) {
      return { ok: false, reason: authority.reason };
    }

    const activation = verifyPicoHomeMembershipActivation(params.sodium, {
      credential: params.credential,
      hostSigningPublicKeyHex: params.hostSigningPublicKeyHex,
    });
    if (!activation.ok) {
      return { ok: false, reason: activation.reason };
    }

    const membership = params.credential.membership;
    const serialized = serializePayload(membership);
    const existing = this.db
      .prepare('SELECT membership_json FROM pico_home_membership_credential WHERE credential_id = ?')
      .get(membership.credentialId) as { membership_json: string } | undefined;

    // A re-sent identical credential is a replay and is fine; the same id with
    // different content is two different statements claiming one name.
    if (existing !== undefined && existing.membership_json !== serialized) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const recordedAt = params.recordedAt ?? new Date().toISOString();

    const write = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO pico_home_membership_credential (
            credential_id,
            home_id,
            issuer_pico_identity_fingerprint_hex,
            subject_pico_identity_fingerprint_hex,
            role,
            lifecycle_order,
            valid_from,
            valid_until,
            membership_json,
            issuer_identity_key_record_json,
            issuer_signature_hex,
            host_activation_signature_hex,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(credential_id) DO NOTHING
        `)
        .run(
          membership.credentialId,
          membership.homeId,
          membership.issuerPicoIdentityFingerprintHex,
          membership.subjectPicoIdentityFingerprintHex,
          membership.role,
          membership.lifecycleOrder,
          membership.validFrom,
          membership.validUntil,
          serialized,
          serializePayload(params.credential.issuerIdentityKeyRecord),
          params.credential.issuerSignatureHex,
          params.credential.hostActivationSignatureHex,
          params.credential.createdAt,
        );

      return this.projectPicoHomeMemberMembership(
        membership.homeId,
        membership.subjectPicoIdentityFingerprintHex,
        recordedAt,
      );
    });

    const projected = write();
    if (projected === undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }

    return { ok: true, membership: projected };
  }

  /**
   * Accepts a signed membership lifecycle statement. Statements are kept even
   * when they are not the freshest — they are history, and the projection reads
   * the freshest of them (ADR 0079 I9 ordering, ADR 0080 H6).
   */
  public recordPicoHomeMembershipLifecycle(params: {
    sodium: IdentityVerificationSodium;
    record: PicoHomeMembershipLifecycleRecord;
    recordedAt?: string;
  }): PicoHomeMembershipRecordResult {
    this.ensureOpen();

    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const lifecycle = params.record.lifecycle;
    const credential = this.picoHomeMembershipCredential(lifecycle.credentialId);
    if (credential === undefined) {
      return { ok: false, reason: 'unknown_credential' };
    }

    const verification = verifyPicoHomeMembershipLifecycleRecord(params.sodium, {
      record: params.record,
      credential,
      foundingRecord,
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }

    const serialized = serializePayload(lifecycle);
    const existing = this.db
      .prepare('SELECT lifecycle_json FROM pico_home_membership_lifecycle WHERE lifecycle_id = ?')
      .get(lifecycle.lifecycleId) as { lifecycle_json: string } | undefined;

    if (existing !== undefined && existing.lifecycle_json !== serialized) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const recordedAt = params.recordedAt ?? new Date().toISOString();

    const write = this.db.transaction(() => {
      this.db
        .prepare(`
          INSERT INTO pico_home_membership_lifecycle (
            lifecycle_id,
            home_id,
            credential_id,
            subject_pico_identity_fingerprint_hex,
            status,
            reason_category,
            changed_at,
            lifecycle_order,
            lifecycle_json,
            issuer_identity_key_record_json,
            issuer_signature_hex,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(lifecycle_id) DO NOTHING
        `)
        .run(
          lifecycle.lifecycleId,
          lifecycle.homeId,
          lifecycle.credentialId,
          lifecycle.subjectPicoIdentityFingerprintHex,
          lifecycle.status,
          lifecycle.reasonCategory,
          lifecycle.changedAt,
          lifecycle.lifecycleOrder,
          serialized,
          serializePayload(params.record.issuerIdentityKeyRecord),
          params.record.issuerSignatureHex,
          params.record.createdAt,
        );

      return this.projectPicoHomeMemberMembership(
        lifecycle.homeId,
        lifecycle.subjectPicoIdentityFingerprintHex,
        recordedAt,
      );
    });

    const projected = write();
    if (projected === undefined) {
      return { ok: false, reason: 'conflicting_record' };
    }

    return { ok: true, membership: projected };
  }

  /**
   * Re-verifies every stored credential against the current founding record and
   * rebuilds the member rows from it. Only the authority half is re-checked: a
   * host key may legitimately have rotated since intake, and a membership has to
   * survive that. A credential that no longer verifies is dropped rather than
   * left projecting authority nobody can prove.
   */
  public reconcilePicoHomeMembershipsFromCredentials(
    sodium: IdentityVerificationSodium,
    reconciledAt: string = new Date().toISOString(),
  ): PicoHomeMembershipCredentialReconciliationResult {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_membership_credential') || !tableExists(this.db, 'pico_home_membership')) {
      return { verifiedCredentials: 0, droppedCredentials: 0, projectedMemberships: 0 };
    }

    const foundingRecord = this.picoHomeFoundingRecord();
    const credentialIds = this.db
      .prepare('SELECT credential_id FROM pico_home_membership_credential ORDER BY credential_id')
      .all()
      .map((row) => (row as { credential_id: string }).credential_id);

    let verifiedCredentials = 0;
    let droppedCredentials = 0;
    const subjects = new Set<string>();

    const reconcile = this.db.transaction(() => {
      for (const credentialId of credentialIds) {
        const credential = this.picoHomeMembershipCredential(credentialId);
        const verification = credential === undefined || foundingRecord === undefined
          ? { ok: false as const, reason: 'no_founding_record' as const }
          : verifyPicoHomeMembershipAuthority(sodium, { credential, foundingRecord });

        if (!verification.ok) {
          this.dropPicoHomeMembershipCredential(credentialId);
          droppedCredentials += 1;
          continue;
        }

        verifiedCredentials += 1;
        subjects.add(`${credential!.membership.homeId}\u0000${credential!.membership.subjectPicoIdentityFingerprintHex}`);
      }

      // Member rows whose credential is gone must go with it.
      this.db
        .prepare(`
          DELETE FROM pico_home_membership
          WHERE source = 'membership_credential'
            AND source_ref NOT IN (SELECT credential_id FROM pico_home_membership_credential)
        `)
        .run();

      let projectedMemberships = 0;
      for (const key of subjects) {
        const [homeId, subject] = key.split('\u0000');
        if (this.projectPicoHomeMemberMembership(homeId, subject, reconciledAt) !== undefined) {
          projectedMemberships += 1;
        }
      }

      return projectedMemberships;
    });

    // The counters are filled inside the transaction, so it has to run before
    // the result object reads them.
    const projectedMemberships = reconcile();

    return { verifiedCredentials, droppedCredentials, projectedMemberships };
  }

  public picoHomeMembershipCredential(credentialId: string): PicoHomeMembershipCredential | undefined {
    this.ensureOpen();

    if (!tableExists(this.db, 'pico_home_membership_credential')) {
      return undefined;
    }

    const row = this.db
      .prepare(`
        SELECT membership_json, issuer_identity_key_record_json, issuer_signature_hex,
               host_activation_signature_hex, created_at
        FROM pico_home_membership_credential
        WHERE credential_id = ?
      `)
      .get(credentialId) as PicoHomeMembershipCredentialRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      schema: picoHomeMembershipCredentialSchema,
      membership: JSON.parse(row.membership_json) as PicoHomeMembershipCredential['membership'],
      issuerIdentityKeyRecord: JSON.parse(row.issuer_identity_key_record_json) as PicoHomeMembershipCredential['issuerIdentityKeyRecord'],
      issuerSignatureHex: row.issuer_signature_hex,
      hostActivationSignatureHex: row.host_activation_signature_hex,
      createdAt: row.created_at,
    };
  }

  /**
   * Persists only lifecycle statements whose identity signatures verify. A
   * later login may add revocations, but can never remove an already observed
   * one; conflicts on a stable statement id fail closed.
   */
  public recordPicoIdentityLifecycleEvidence(params: {
    identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
    delegation: PicoIdentitySignedDelegation;
    revocations: readonly PicoIdentitySignedRevocation[];
    sodium: IdentityVerificationSodium;
    recordedAt?: string;
  }): PicoIdentityLifecycleEvidenceRecordResult {
    this.ensureOpen();

    try {
      createVerifiedPicoIdentityLifecycleIndex(params.sodium, {
        issuerIdentityKeyRecord: params.identityKeyRecord,
        signedDelegations: [params.delegation],
        signedRevocations: params.revocations,
      });
    } catch {
      return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
    }

    const issuerFingerprint = params.delegation.record.issuerIdentityKeyFingerprintHex;
    if (params.revocations.some((entry) => entry.record.issuerIdentityKeyFingerprintHex !== issuerFingerprint)) {
      return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
    }

    const identityKeyJson = serializePayload(params.identityKeyRecord);
    const delegationJson = serializePayload(params.delegation.record);
    const existingDelegation = this.db
      .prepare(`
        SELECT delegation_json AS recordJson,
               issuer_identity_key_record_json AS keyJson,
               signature_hex AS signatureHex
        FROM pico_identity_delegation
        WHERE delegation_id = ?
      `)
      .get(params.delegation.record.delegationId) as SignedEvidenceRow | undefined;
    if (existingDelegation !== undefined
      && (existingDelegation.recordJson !== delegationJson
        || existingDelegation.keyJson !== identityKeyJson
        || existingDelegation.signatureHex !== params.delegation.signatureHex)) {
      return { ok: false, reason: 'conflicting_record' };
    }

    for (const signed of params.revocations) {
      const existing = this.db
        .prepare(`
          SELECT revocation_json AS recordJson,
                 issuer_identity_key_record_json AS keyJson,
                 signature_hex AS signatureHex
          FROM pico_identity_revocation
          WHERE revocation_id = ?
        `)
        .get(signed.record.revocationId) as SignedEvidenceRow | undefined;
      if (existing !== undefined
        && (existing.recordJson !== serializePayload(signed.record)
          || existing.keyJson !== identityKeyJson
          || existing.signatureHex !== signed.signatureHex)) {
        return { ok: false, reason: 'conflicting_record' };
      }
    }

    const recordedAt = params.recordedAt ?? new Date().toISOString();
    const write = this.db.transaction(() => {
      const delegation = params.delegation.record;
      this.db
        .prepare(`
          INSERT INTO pico_identity_delegation (
            delegation_id,
            issuer_pico_identity_fingerprint_hex,
            subject_signing_key_fingerprint_hex,
            lifecycle_order,
            valid_from,
            valid_until,
            delegation_json,
            issuer_identity_key_record_json,
            signature_hex,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(delegation_id) DO NOTHING
        `)
        .run(
          delegation.delegationId,
          delegation.issuerIdentityKeyFingerprintHex,
          delegation.subjectSigningKeyFingerprintHex,
          delegation.lifecycleOrder,
          delegation.validFrom,
          delegation.validUntil,
          delegationJson,
          identityKeyJson,
          params.delegation.signatureHex,
          recordedAt,
        );

      for (const signed of params.revocations) {
        const revocation = signed.record;
        this.db
          .prepare(`
            INSERT INTO pico_identity_revocation (
              revocation_id,
              issuer_pico_identity_fingerprint_hex,
              subject_kind,
              subject_ref,
              lifecycle_order,
              revocation_json,
              issuer_identity_key_record_json,
              signature_hex,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(revocation_id) DO NOTHING
          `)
          .run(
            revocation.revocationId,
            revocation.issuerIdentityKeyFingerprintHex,
            revocation.subjectKind,
            revocation.subjectRef,
            revocation.lifecycleOrder,
            serializePayload(revocation),
            identityKeyJson,
            signed.signatureHex,
            recordedAt,
          );
      }
    });
    write();

    return { ok: true };
  }

  public hasActivePicoIdentityDelegation(params: {
    picoIdentityFingerprintHex: string;
    deviceSigningKeyFingerprintHex: string;
    delegationId: string;
    sodium: IdentityVerificationSodium;
    at?: string;
  }): boolean {
    this.ensureOpen();

    const row = this.db
      .prepare(`
        SELECT delegation_json AS recordJson,
               issuer_identity_key_record_json AS keyJson,
               signature_hex AS signatureHex
        FROM pico_identity_delegation
        WHERE delegation_id = ?
          AND issuer_pico_identity_fingerprint_hex = ?
          AND subject_signing_key_fingerprint_hex = ?
      `)
      .get(
        params.delegationId,
        params.picoIdentityFingerprintHex,
        params.deviceSigningKeyFingerprintHex,
      ) as SignedEvidenceRow | undefined;
    if (row === undefined) {
      return false;
    }

    try {
      const identityKeyRecord = JSON.parse(row.keyJson) as PicoIdentityKeyRecordSignatureInput;
      const signedDelegation: PicoIdentitySignedDelegation = {
        record: JSON.parse(row.recordJson) as PicoIdentitySignedDelegation['record'],
        signatureHex: row.signatureHex,
      };
      const signedRevocations = this.picoIdentitySignedRevocations(params.picoIdentityFingerprintHex);
      const index = createVerifiedPicoIdentityLifecycleIndex(params.sodium, {
        issuerIdentityKeyRecord: identityKeyRecord,
        signedDelegations: [signedDelegation],
        signedRevocations,
      });

      return index.lookupDelegation(params.delegationId, {
        at: params.at ?? new Date().toISOString(),
        requiredScopes: ['surface_session'],
      }).status === 'active';
    } catch {
      return false;
    }
  }

  public reconcilePicoIdentityLifecycleEvidence(
    sodium: IdentityVerificationSodium,
  ): { droppedDelegations: number; droppedRevocations: number } {
    this.ensureOpen();
    const issuers = this.db
      .prepare(`
        SELECT DISTINCT issuer_pico_identity_fingerprint_hex AS issuer
        FROM pico_identity_delegation
        ORDER BY issuer
      `)
      .all()
      .map((row) => (row as { issuer: string }).issuer);
    let droppedDelegations = 0;
    let droppedRevocations = 0;

    const reconcile = this.db.transaction(() => {
      for (const issuer of issuers) {
        const rows = this.db
          .prepare(`
            SELECT delegation_json AS recordJson,
                   issuer_identity_key_record_json AS keyJson,
                   signature_hex AS signatureHex
            FROM pico_identity_delegation
            WHERE issuer_pico_identity_fingerprint_hex = ?
            ORDER BY lifecycle_order ASC, delegation_id ASC
          `)
          .all(issuer) as SignedEvidenceRow[];
        if (rows.length === 0) {
          continue;
        }

        try {
          const identityKeyRecord = JSON.parse(rows[0]!.keyJson) as PicoIdentityKeyRecordSignatureInput;
          const signedDelegations = rows.map((row) => ({
            record: JSON.parse(row.recordJson) as PicoIdentitySignedDelegation['record'],
            signatureHex: row.signatureHex,
          }));
          createVerifiedPicoIdentityLifecycleIndex(sodium, {
            issuerIdentityKeyRecord: identityKeyRecord,
            signedDelegations,
            signedRevocations: this.picoIdentitySignedRevocations(issuer),
          });
        } catch {
          droppedRevocations += this.db
            .prepare('DELETE FROM pico_identity_revocation WHERE issuer_pico_identity_fingerprint_hex = ?')
            .run(issuer).changes;
          droppedDelegations += this.db
            .prepare('DELETE FROM pico_identity_delegation WHERE issuer_pico_identity_fingerprint_hex = ?')
            .run(issuer).changes;
        }
      }

      // No accepted delegation means no locally anchored identity evidence.
      droppedRevocations += this.db
        .prepare(`
          DELETE FROM pico_identity_revocation
          WHERE issuer_pico_identity_fingerprint_hex NOT IN (
            SELECT DISTINCT issuer_pico_identity_fingerprint_hex
            FROM pico_identity_delegation
          )
        `)
        .run().changes;
    });
    reconcile();

    return { droppedDelegations, droppedRevocations };
  }

  public recordPicoHomeDomainReadGrant(params: {
    sodium: IdentityVerificationSodium;
    record: PicoHomeDomainReadGrantRecord;
  }): PicoHomeDomainReadGrantRecordResult {
    this.ensureOpen();
    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const verification = verifyPicoHomeDomainReadGrant(params.sodium, {
      record: params.record,
      foundingRecord,
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }

    const grant = params.record.grant;
    if (!this.hasActivePicoHomeMembership(
      grant.readerPicoIdentityFingerprintHex,
      grant.homeId,
    )) {
      return { ok: false, reason: 'reader_is_not_active_member' };
    }
    if (!this.isExistingHostCustodyDomain(grant.privacyDomain)) {
      return { ok: false, reason: 'domain_is_not_host_custody' };
    }

    const grantJson = serializePayload(grant);
    const keyJson = serializePayload(params.record.issuerIdentityKeyRecord);
    const existing = this.db
      .prepare(`
        SELECT grant_json AS recordJson,
               issuer_identity_key_record_json AS keyJson,
               issuer_signature_hex AS signatureHex
        FROM pico_home_domain_read_grant
        WHERE grant_id = ?
      `)
      .get(grant.grantId) as SignedEvidenceRow | undefined;
    if (existing !== undefined
      && (existing.recordJson !== grantJson
        || existing.keyJson !== keyJson
        || existing.signatureHex !== params.record.issuerSignatureHex)) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const inserted = this.db
      .prepare(`
        INSERT INTO pico_home_domain_read_grant (
          grant_id,
          home_id,
          host_signing_key_fingerprint_hex,
          privacy_domain,
          controller_pico_identity_fingerprint_hex,
          reader_pico_identity_fingerprint_hex,
          valid_from,
          valid_until,
          lifecycle_order,
          grant_json,
          issuer_identity_key_record_json,
          issuer_signature_hex,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(grant_id) DO NOTHING
      `)
      .run(
        grant.grantId,
        grant.homeId,
        grant.hostSigningKeyFingerprintHex,
        grant.privacyDomain,
        grant.controllerPicoIdentityFingerprintHex,
        grant.readerPicoIdentityFingerprintHex,
        grant.validFrom,
        grant.validUntil,
        grant.lifecycleOrder,
        grantJson,
        keyJson,
        params.record.issuerSignatureHex,
        params.record.createdAt,
      ).changes === 1;

    return { ok: true, inserted, grant: this.picoHomeDomainReadGrantView(grant.grantId) };
  }

  public recordPicoHomeDomainReadGrantLifecycle(params: {
    sodium: IdentityVerificationSodium;
    record: PicoHomeDomainReadGrantLifecycleRecord;
  }): PicoHomeDomainReadGrantRecordResult {
    this.ensureOpen();
    const foundingRecord = this.picoHomeFoundingRecord();
    if (foundingRecord === undefined) {
      return { ok: false, reason: 'no_founding_record' };
    }

    const grantRecord = this.picoHomeDomainReadGrantRecord(params.record.lifecycle.grantId);
    if (grantRecord === undefined) {
      return { ok: false, reason: 'unknown_grant' };
    }

    const verification = verifyPicoHomeDomainReadGrantLifecycle(params.sodium, {
      record: params.record,
      grantRecord,
      foundingRecord,
    });
    if (!verification.ok) {
      return { ok: false, reason: verification.reason };
    }

    const lifecycle = params.record.lifecycle;
    const lifecycleJson = serializePayload(lifecycle);
    const keyJson = serializePayload(params.record.issuerIdentityKeyRecord);
    const existing = this.db
      .prepare(`
        SELECT lifecycle_json AS recordJson,
               issuer_identity_key_record_json AS keyJson,
               issuer_signature_hex AS signatureHex
        FROM pico_home_domain_read_grant_lifecycle
        WHERE lifecycle_id = ?
      `)
      .get(lifecycle.lifecycleId) as SignedEvidenceRow | undefined;
    if (existing !== undefined
      && (existing.recordJson !== lifecycleJson
        || existing.keyJson !== keyJson
        || existing.signatureHex !== params.record.issuerSignatureHex)) {
      return { ok: false, reason: 'conflicting_record' };
    }

    const inserted = this.db
      .prepare(`
        INSERT INTO pico_home_domain_read_grant_lifecycle (
          lifecycle_id,
          grant_id,
          home_id,
          privacy_domain,
          reader_pico_identity_fingerprint_hex,
          status,
          reason_category,
          changed_at,
          lifecycle_order,
          lifecycle_json,
          issuer_identity_key_record_json,
          issuer_signature_hex,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(lifecycle_id) DO NOTHING
      `)
      .run(
        lifecycle.lifecycleId,
        lifecycle.grantId,
        lifecycle.homeId,
        lifecycle.privacyDomain,
        lifecycle.readerPicoIdentityFingerprintHex,
        lifecycle.status,
        lifecycle.reasonCategory,
        lifecycle.changedAt,
        lifecycle.lifecycleOrder,
        lifecycleJson,
        keyJson,
        params.record.issuerSignatureHex,
        params.record.createdAt,
      ).changes === 1;

    return { ok: true, inserted, grant: this.picoHomeDomainReadGrantView(lifecycle.grantId) };
  }

  public picoHomeDomainReadGrants(at: string = new Date().toISOString()): PicoHomeDomainReadGrantView[] {
    this.ensureOpen();
    return this.db
      .prepare('SELECT grant_id AS grantId FROM pico_home_domain_read_grant ORDER BY grant_id')
      .all()
      .map((row) => this.picoHomeDomainReadGrantView((row as { grantId: string }).grantId, at));
  }

  public mayReadDomain(
    picoIdentityFingerprintHex: string,
    privacyDomain: string,
    homeId?: string,
    at: string = new Date().toISOString(),
  ): boolean {
    this.ensureOpen();
    const scopedHomeId = homeId ?? this.picoHomeClaimState().homeId ?? undefined;
    if (scopedHomeId === undefined) {
      return false;
    }

    const grantIds = this.db
      .prepare(`
        SELECT grant_id AS grantId
        FROM pico_home_domain_read_grant
        WHERE home_id = ?
          AND reader_pico_identity_fingerprint_hex = ?
          AND privacy_domain = ?
      `)
      .all(scopedHomeId, picoIdentityFingerprintHex, privacyDomain)
      .map((row) => (row as { grantId: string }).grantId);

    return grantIds.some((grantId) => this.picoHomeDomainReadGrantView(grantId, at).status === 'active');
  }

  public reconcilePicoHomeDomainReadGrants(
    sodium: IdentityVerificationSodium,
  ): { droppedGrants: number; droppedLifecycleRecords: number } {
    this.ensureOpen();
    const foundingRecord = this.picoHomeFoundingRecord();
    let droppedGrants = 0;
    let droppedLifecycleRecords = 0;

    const reconcile = this.db.transaction(() => {
      const grantIds = this.db
        .prepare('SELECT grant_id AS grantId FROM pico_home_domain_read_grant ORDER BY grant_id')
        .all()
        .map((row) => (row as { grantId: string }).grantId);

      for (const grantId of grantIds) {
        let grantRecord: PicoHomeDomainReadGrantRecord | undefined;
        try {
          const candidate = this.picoHomeDomainReadGrantRecord(grantId);
          if (foundingRecord !== undefined
            && candidate !== undefined
            && verifyPicoHomeDomainReadGrant(sodium, {
              record: candidate,
              foundingRecord,
            }).ok) {
            grantRecord = candidate;
          }
        } catch {
          grantRecord = undefined;
        }
        if (foundingRecord === undefined
          || grantRecord === undefined) {
          droppedLifecycleRecords += this.db
            .prepare('DELETE FROM pico_home_domain_read_grant_lifecycle WHERE grant_id = ?')
            .run(grantId).changes;
          droppedGrants += this.db
            .prepare('DELETE FROM pico_home_domain_read_grant WHERE grant_id = ?')
            .run(grantId).changes;
          continue;
        }

        const lifecycleIds = this.db
          .prepare(`
            SELECT lifecycle_id AS lifecycleId
            FROM pico_home_domain_read_grant_lifecycle
            WHERE grant_id = ?
          `)
          .all(grantId)
          .map((row) => (row as { lifecycleId: string }).lifecycleId);
        for (const lifecycleId of lifecycleIds) {
          let lifecycleValid = false;
          try {
            const record = this.picoHomeDomainReadGrantLifecycleRecord(lifecycleId);
            lifecycleValid = record !== undefined
              && verifyPicoHomeDomainReadGrantLifecycle(sodium, {
                record,
                grantRecord,
                foundingRecord,
              }).ok;
          } catch {
            lifecycleValid = false;
          }
          if (!lifecycleValid) {
            droppedLifecycleRecords += this.db
              .prepare('DELETE FROM pico_home_domain_read_grant_lifecycle WHERE lifecycle_id = ?')
              .run(lifecycleId).changes;
          }
        }
      }
    });
    reconcile();

    return { droppedGrants, droppedLifecycleRecords };
  }

  private picoIdentitySignedRevocations(
    issuerPicoIdentityFingerprintHex: string,
  ): PicoIdentitySignedRevocation[] {
    return this.db
      .prepare(`
        SELECT revocation_json AS recordJson, signature_hex AS signatureHex
        FROM pico_identity_revocation
        WHERE issuer_pico_identity_fingerprint_hex = ?
        ORDER BY lifecycle_order ASC, revocation_id ASC
      `)
      .all(issuerPicoIdentityFingerprintHex)
      .map((row) => {
        const signed = row as { recordJson: string; signatureHex: string };
        return {
          record: JSON.parse(signed.recordJson) as PicoIdentitySignedRevocation['record'],
          signatureHex: signed.signatureHex,
        };
      });
  }

  private isExistingHostCustodyDomain(privacyDomain: string): boolean {
    const row = this.db
      .prepare(`
        SELECT custody_class AS custodyClass
        FROM memory_domain_custody
        WHERE privacy_domain = ?
      `)
      .get(privacyDomain) as { custodyClass: string } | undefined;

    return row?.custodyClass === 'host_custody';
  }

  private picoHomeDomainReadGrantRecord(grantId: string): PicoHomeDomainReadGrantRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT grant_json AS grantJson,
               issuer_identity_key_record_json AS issuerIdentityKeyRecordJson,
               issuer_signature_hex AS issuerSignatureHex,
               created_at AS createdAt
        FROM pico_home_domain_read_grant
        WHERE grant_id = ?
      `)
      .get(grantId) as DomainReadGrantRecordRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      schema: picoHomeDomainReadGrantRecordSchema,
      grant: JSON.parse(row.grantJson) as PicoHomeDomainReadGrantRecord['grant'],
      issuerIdentityKeyRecord: JSON.parse(row.issuerIdentityKeyRecordJson) as PicoHomeDomainReadGrantRecord['issuerIdentityKeyRecord'],
      issuerSignatureHex: row.issuerSignatureHex,
      createdAt: row.createdAt,
    };
  }

  private picoHomeDomainReadGrantLifecycleRecord(
    lifecycleId: string,
  ): PicoHomeDomainReadGrantLifecycleRecord | undefined {
    const row = this.db
      .prepare(`
        SELECT lifecycle_json AS lifecycleJson,
               issuer_identity_key_record_json AS issuerIdentityKeyRecordJson,
               issuer_signature_hex AS issuerSignatureHex,
               created_at AS createdAt
        FROM pico_home_domain_read_grant_lifecycle
        WHERE lifecycle_id = ?
      `)
      .get(lifecycleId) as DomainReadGrantLifecycleRecordRow | undefined;

    if (row === undefined) {
      return undefined;
    }

    return {
      schema: picoHomeDomainReadGrantLifecycleRecordSchema,
      lifecycle: JSON.parse(row.lifecycleJson) as PicoHomeDomainReadGrantLifecycleRecord['lifecycle'],
      issuerIdentityKeyRecord: JSON.parse(row.issuerIdentityKeyRecordJson) as PicoHomeDomainReadGrantLifecycleRecord['issuerIdentityKeyRecord'],
      issuerSignatureHex: row.issuerSignatureHex,
      createdAt: row.createdAt,
    };
  }

  private picoHomeDomainReadGrantView(
    grantId: string,
    at: string = new Date().toISOString(),
  ): PicoHomeDomainReadGrantView {
    const row = this.db
      .prepare(`
        SELECT
          grant_id AS grantId,
          home_id AS homeId,
          privacy_domain AS privacyDomain,
          controller_pico_identity_fingerprint_hex AS controllerPicoIdentityFingerprintHex,
          reader_pico_identity_fingerprint_hex AS readerPicoIdentityFingerprintHex,
          valid_from AS validFrom,
          valid_until AS validUntil,
          lifecycle_order AS lifecycleOrder,
          created_at AS createdAt
        FROM pico_home_domain_read_grant
        WHERE grant_id = ?
      `)
      .get(grantId) as DomainReadGrantViewRow | undefined;
    if (row === undefined) {
      throw new Error('Pico Home domain read grant is missing.');
    }

    const lifecycle = this.db
      .prepare(`
        SELECT lifecycle_order AS lifecycleOrder
        FROM pico_home_domain_read_grant_lifecycle
        WHERE grant_id = ?
        ORDER BY lifecycle_order DESC, lifecycle_id DESC
        LIMIT 1
      `)
      .get(grantId) as { lifecycleOrder: string } | undefined;

    let status: PicoHomeDomainReadGrantView['status'];
    if (lifecycle !== undefined && lifecycle.lifecycleOrder > row.lifecycleOrder) {
      status = 'revoked';
    } else if (at < row.validFrom) {
      status = 'not_yet_valid';
    } else if (at >= row.validUntil) {
      status = 'expired';
    } else {
      status = 'active';
    }

    return { ...row, status };
  }

  private dropPicoHomeMembershipCredential(credentialId: string): void {
    this.db.prepare('DELETE FROM pico_home_membership_lifecycle WHERE credential_id = ?').run(credentialId);
    this.db.prepare('DELETE FROM pico_home_membership_credential WHERE credential_id = ?').run(credentialId);
    this.db
      .prepare("DELETE FROM pico_home_membership WHERE source = 'membership_credential' AND source_ref = ?")
      .run(credentialId);
  }

  /**
   * One projection row per person per Home, backed by whichever of their
   * credentials is freshest and carrying the status of that credential's
   * freshest lifecycle statement. Keying on the subject rather than on the
   * credential is what lets a reissue replace a membership instead of colliding
   * with it on the one-row-per-person constraint.
   */
  private projectPicoHomeMemberMembership(
    homeId: string,
    subjectPicoIdentityFingerprintHex: string,
    projectedAt: string,
  ): PicoHomeMembership | undefined {
    const credentialRow = this.db
      .prepare(`
        SELECT credential_id
        FROM pico_home_membership_credential
        WHERE home_id = ? AND subject_pico_identity_fingerprint_hex = ?
        ORDER BY lifecycle_order DESC, credential_id DESC
        LIMIT 1
      `)
      .get(homeId, subjectPicoIdentityFingerprintHex) as { credential_id: string } | undefined;

    if (credentialRow === undefined) {
      return undefined;
    }

    const credential = this.picoHomeMembershipCredential(credentialRow.credential_id);
    if (credential === undefined) {
      return undefined;
    }

    const statusRow = this.db
      .prepare(`
        SELECT status
        FROM pico_home_membership_lifecycle
        WHERE credential_id = ?
        ORDER BY lifecycle_order DESC, lifecycle_id DESC
        LIMIT 1
      `)
      .get(credential.membership.credentialId) as { status: string } | undefined;

    const membership: PicoHomeMembership = {
      membershipId: `member:${homeId}:${subjectPicoIdentityFingerprintHex}`,
      homeId,
      picoIdentityFingerprintHex: subjectPicoIdentityFingerprintHex,
      role: credential.membership.role,
      status: statusRow === undefined ? 'active' : toPicoHomeMembershipStatus(statusRow.status),
      scopes: [...credential.membership.scopes],
      source: 'membership_credential',
      sourceRef: credential.membership.credentialId,
      validFrom: credential.membership.validFrom,
      validUntil: credential.membership.validUntil,
      createdAt: credential.createdAt,
      updatedAt: projectedAt,
    };

    this.upsertPicoHomeMembership(membership);

    return membership;
  }

  // Deleteable memory store (ADR 0068), sharing this store's database
  // connection. When a crypto provider is attached (ADR 0071), it can store and
  // read domain_encrypted items.
  public memory(): MemoryStore {
    this.ensureOpen();
    return new MemoryStore(this.db, this.memoryCrypto);
  }

  // Named retention policies (ADR 0074), sharing this store's connection.
  public retentionPolicies(): RetentionPolicyStore {
    this.ensureOpen();
    return new RetentionPolicyStore(this.db);
  }

  // The Foundation Operator credential (ADR 0075/0076), sharing this store's
  // connection. Only the Argon2id verifier is persisted; sessions are never
  // stored here.
  public operators(sodium: PasswordHashingSodium): OperatorStore {
    this.ensureOpen();
    return new OperatorStore(this.db, sodium);
  }

  /**
   * Re-applies append-only memory.tombstone events onto the memory store
   * (ADR 0070 recovery direction). This enforces recorded deletions after a
   * restore that resurrected deleted items as active. Idempotent; returns the
   * number of items that were newly enforced to the tombstoned state.
   */
  public reconcileMemoryTombstones(): { enforced: number } {
    this.ensureOpen();

    // Resilient to non-standard migration sets: without both tables there is
    // nothing to reconcile.
    const tables = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('pico_event', 'memory_item')")
      .all() as { name: string }[];
    if (tables.length < 2) {
      return { enforced: 0 };
    }

    const rows = this.db
      .prepare("SELECT payload_json FROM pico_event WHERE type = 'memory.tombstone'")
      .all() as { payload_json: string }[];

    const memory = new MemoryStore(this.db);
    let enforced = 0;

    for (const row of rows) {
      let payload: unknown;
      try {
        payload = JSON.parse(row.payload_json);
      } catch {
        continue;
      }

      if (payload === null || typeof payload !== 'object') {
        continue;
      }

      const { memoryItemId, privacyDomain } = payload as { memoryItemId?: unknown; privacyDomain?: unknown };
      if (typeof memoryItemId !== 'string' || typeof privacyDomain !== 'string') {
        continue;
      }

      if (memory.enforceTombstone(memoryItemId, privacyDomain) === 'tombstoned') {
        enforced += 1;
      }
    }

    return { enforced };
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.db.close();
    this.closed = true;
  }

  private selectPageRows(limit: number, after: EventCursor | null): EventRow[] {
    if (after === null) {
      return this.db.prepare(`
        SELECT *
        FROM pico_event
        ORDER BY lamport ASC, wall_time ASC, event_id ASC
        LIMIT ?
      `).all(limit) as EventRow[];
    }

    return this.db.prepare(`
      SELECT *
      FROM pico_event
      WHERE
        lamport > ?
        OR (lamport = ? AND wall_time > ?)
        OR (lamport = ? AND wall_time = ? AND event_id > ?)
      ORDER BY lamport ASC, wall_time ASC, event_id ASC
      LIMIT ?
    `).all(after.lamport, after.lamport, after.wallTime, after.lamport, after.wallTime, after.eventId, limit) as EventRow[];
  }

  private selectTailRows(limit: number): EventRow[] {
    return this.db.prepare(`
      SELECT *
      FROM pico_event
      ORDER BY lamport DESC, wall_time DESC, event_id DESC
      LIMIT ?
    `).all(limit) as EventRow[];
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('EventStore is closed.');
    }
  }

  private insertPicoHomeFoundingRecord(record: PicoHomeFoundingRecord): void {
    this.db
      .prepare(`
        INSERT INTO pico_home_founding_record (
          id,
          schema,
          founding_id,
          home_id,
          claim_id,
          home_host_pico_identity_fingerprint_hex,
          host_signing_key_fingerprint_hex,
          host_key_agreement_key_fingerprint_hex,
          founded_at,
          lifecycle_order,
          claim_response_json,
          founding_json,
          claimant_identity_key_record_json,
          claimant_founding_signature_hex,
          host_claim_response_signature_hex,
          host_founding_signature_hex,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        1,
        record.schema,
        record.founding.foundingId,
        record.founding.homeId,
        record.hostClaimResponse.claimResponse.claimId,
        record.founding.homeHostPicoIdentityFingerprintHex,
        record.founding.hostSigningKeyFingerprintHex,
        record.founding.hostKeyAgreementKeyFingerprintHex,
        record.founding.foundedAt,
        record.founding.lifecycleOrder,
        serializePayload(record.hostClaimResponse.claimResponse),
        serializePayload(record.founding),
        serializePayload(record.claimantIdentityKeyRecord),
        record.claimantFoundingSignatureHex,
        record.hostClaimResponse.hostSignatureHex,
        record.hostFoundingSignatureHex,
        record.createdAt,
      );
  }

  private picoHomeMembership(membershipId: string): PicoHomeMembership | undefined {
    const row = this.db
      .prepare(`
        SELECT ${picoHomeMembershipColumns}
        FROM pico_home_membership
        WHERE membership_id = ?
      `)
      .get(membershipId) as PicoHomeMembershipRow | undefined;

    return row === undefined ? undefined : mapPicoHomeMembership(row);
  }

  private upsertPicoHomeMembership(membership: PicoHomeMembership): void {
    assertPicoHomeMembership(membership);

    this.db
      .prepare(`
        INSERT INTO pico_home_membership (
          membership_id,
          home_id,
          pico_identity_fingerprint_hex,
          role,
          status,
          scopes_json,
          source,
          source_ref,
          valid_from,
          valid_until,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(membership_id) DO UPDATE SET
          home_id = excluded.home_id,
          pico_identity_fingerprint_hex = excluded.pico_identity_fingerprint_hex,
          role = excluded.role,
          status = excluded.status,
          scopes_json = excluded.scopes_json,
          source = excluded.source,
          source_ref = excluded.source_ref,
          valid_from = excluded.valid_from,
          valid_until = excluded.valid_until,
          updated_at = excluded.updated_at
      `)
      .run(
        membership.membershipId,
        membership.homeId,
        membership.picoIdentityFingerprintHex,
        membership.role,
        membership.status,
        serializePayload(membership.scopes),
        membership.source,
        membership.sourceRef,
        membership.validFrom,
        membership.validUntil,
        membership.createdAt,
        membership.updatedAt,
      );
  }

  private mapRow(row: EventRow): PicoEvent {
    return {
      eventId: row.event_id,
      deviceId: row.device_id,
      sessionId: row.session_id ?? undefined,
      lamport: row.lamport,
      wallTime: row.wall_time,
      type: row.type as PicoEvent['type'],
      stream: row.stream,
      payload: JSON.parse(row.payload_json) as unknown,
      signature: row.signature ?? undefined,
      ...(row.payload_posture ? { payloadPosture: row.payload_posture as PayloadPosture } : {}),
    };
  }
}

function defaultBackupDirectory(databasePath: string): string {
  return join(dirname(databasePath), 'backups');
}

interface EventRow {
  event_id: string;
  device_id: string;
  session_id: string | null;
  lamport: number;
  wall_time: string;
  type: string;
  stream: string;
  payload_json: string;
  signature: string | null;
  payload_posture: string | null;
}

interface PicoHomeClaimStateRow {
  state: string;
  hostAdminPicoId: string | null;
  homeId: string | null;
  hostSigningKeyFingerprintHex: string | null;
  hostKeyAgreementKeyFingerprintHex: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PicoHomeFoundingRecordRow {
  schema: string;
  foundingId: string;
  homeId: string;
  claimId: string;
  homeHostPicoIdentityFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  foundedAt: string;
  lifecycleOrder: string;
  claimResponseJson: string;
  foundingJson: string;
  claimantIdentityKeyRecordJson: string;
  claimantFoundingSignatureHex: string;
  hostClaimResponseSignatureHex: string;
  hostFoundingSignatureHex: string;
  createdAt: string;
}

interface PicoHomeMembershipCredentialRow {
  membership_json: string;
  issuer_identity_key_record_json: string;
  issuer_signature_hex: string;
  host_activation_signature_hex: string;
  created_at: string;
}

interface SignedEvidenceRow {
  recordJson: string;
  keyJson: string;
  signatureHex: string;
}

interface DomainReadGrantRecordRow {
  grantJson: string;
  issuerIdentityKeyRecordJson: string;
  issuerSignatureHex: string;
  createdAt: string;
}

interface DomainReadGrantLifecycleRecordRow {
  lifecycleJson: string;
  issuerIdentityKeyRecordJson: string;
  issuerSignatureHex: string;
  createdAt: string;
}

interface DomainReadGrantViewRow {
  grantId: string;
  homeId: string;
  privacyDomain: string;
  controllerPicoIdentityFingerprintHex: string;
  readerPicoIdentityFingerprintHex: string;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  createdAt: string;
}

interface PicoHomeMembershipRow {
  membershipId: string;
  homeId: string;
  picoIdentityFingerprintHex: string;
  role: string;
  status: string;
  scopesJson: string;
  source: string;
  sourceRef: string;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

const picoHomeMembershipColumns = `
          membership_id AS membershipId,
          home_id AS homeId,
          pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
          role,
          status,
          scopes_json AS scopesJson,
          source,
          source_ref AS sourceRef,
          valid_from AS validFrom,
          valid_until AS validUntil,
          created_at AS createdAt,
          updated_at AS updatedAt
`;

function mapPicoHomeClaimState(row: PicoHomeClaimStateRow): PicoHomeClaimState {
  if (
    row.state === 'unclaimed'
    && row.hostAdminPicoId === null
    && row.homeId === null
    && row.hostSigningKeyFingerprintHex === null
    && row.hostKeyAgreementKeyFingerprintHex === null
    && row.claimedAt === null
  ) {
    return {
      state: 'unclaimed',
      hostAdminPicoId: null,
      homeId: null,
      hostSigningKeyFingerprintHex: null,
      hostKeyAgreementKeyFingerprintHex: null,
      claimedAt: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  if (row.state === 'claimed' && row.hostAdminPicoId !== null && row.hostAdminPicoId.trim() !== '' && row.claimedAt !== null) {
    return {
      state: 'claimed',
      hostAdminPicoId: row.hostAdminPicoId,
      homeId: row.homeId,
      hostSigningKeyFingerprintHex: row.hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: row.hostKeyAgreementKeyFingerprintHex,
      claimedAt: row.claimedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  throw new Error('Pico Home claim state is invalid.');
}

function mapPicoHomeFoundingRecord(row: PicoHomeFoundingRecordRow): PicoHomeFoundingRecord {
  if (row.schema !== picoHomeFoundingRecordSchema) {
    throw new Error('Pico Home founding record is invalid.');
  }

  return {
    schema: picoHomeFoundingRecordSchema,
    founding: JSON.parse(row.foundingJson) as PicoHomeFoundingRecord['founding'],
    claimantIdentityKeyRecord: JSON.parse(row.claimantIdentityKeyRecordJson) as PicoHomeFoundingRecord['claimantIdentityKeyRecord'],
    claimantFoundingSignatureHex: row.claimantFoundingSignatureHex,
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: JSON.parse(row.claimResponseJson) as PicoHomeFoundingRecord['hostClaimResponse']['claimResponse'],
      hostSignatureHex: row.hostClaimResponseSignatureHex,
    },
    hostFoundingSignatureHex: row.hostFoundingSignatureHex,
    createdAt: row.createdAt,
  };
}

function mapPicoHomeMembership(row: PicoHomeMembershipRow): PicoHomeMembership {
  const membership: PicoHomeMembership = {
    membershipId: row.membershipId,
    homeId: row.homeId,
    picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
    role: toPicoHomeMembershipRole(row.role),
    status: toPicoHomeMembershipStatus(row.status),
    scopes: parsePicoHomeMembershipScopes(row.scopesJson),
    source: toPicoHomeMembershipSource(row.source),
    sourceRef: row.sourceRef,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  assertPicoHomeMembership(membership);
  return membership;
}

function isSameStoredEvent(row: EventRow, event: PicoEvent, payloadJson: string): boolean {
  return row.event_id === event.eventId
    && row.device_id === event.deviceId
    && row.session_id === (event.sessionId ?? null)
    && row.lamport === event.lamport
    && row.wall_time === event.wallTime
    && row.type === event.type
    && row.stream === event.stream
    && serializeStoredPayload(row.payload_json) === payloadJson
    && row.signature === (event.signature ?? null)
    && row.payload_posture === (event.payloadPosture ?? null);
}

function assertStoredEvent(event: PicoEvent): void {
  assertNonEmptyString(event.eventId, 'eventId');
  assertNonEmptyString(event.deviceId, 'deviceId');

  if (event.sessionId !== undefined) {
    assertNonEmptyString(event.sessionId, 'sessionId');
  }

  assertLamportValue(event.lamport);
  assertNonEmptyString(event.wallTime, 'wallTime');
  assertNonEmptyString(event.type, 'type');
  assertNonEmptyString(event.stream, 'stream');

  if (event.signature !== undefined) {
    assertNonEmptyString(event.signature, 'signature');
  }

  if (event.payloadPosture !== undefined && !payloadPostures.includes(event.payloadPosture)) {
    throw new Error('Event payloadPosture must be a known posture.');
  }
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Event ${label} must be a non-empty string.`);
  }
}

function assertAsciiToken(value: string, label: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:/+-]{1,256}$/.test(value)) {
    throw new Error(`Pico Home ${label} must be a non-empty ASCII token.`);
  }
}

function assertFingerprint(value: string, label: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Pico Home ${label} must be a lowercase BLAKE2b-256 hex fingerprint.`);
  }
}

function assertDetachedSignature(value: string, label: string): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{128}$/.test(value)) {
    throw new Error(`Pico Home ${label} must be a lowercase Ed25519 signature hex value.`);
  }
}

function assertLifecycleOrder(value: string, label: string): void {
  if (typeof value !== 'string' || !/^seq:[0-9]{16}$/.test(value)) {
    throw new Error(`Pico Home ${label} must be a fixed-width lifecycle order.`);
  }
}

function assertPicoHomeMembership(membership: PicoHomeMembership): void {
  assertAsciiToken(membership.membershipId, 'membershipId');
  assertAsciiToken(membership.homeId, 'membership.homeId');
  assertFingerprint(membership.picoIdentityFingerprintHex, 'membership.picoIdentityFingerprintHex');
  assertPicoHomeMembershipRole(membership.role);
  assertPicoHomeMembershipStatus(membership.status);
  assertPicoHomeMembershipScopes(membership.scopes);
  if (membership.source !== 'founding_record' && membership.source !== 'membership_credential') {
    throw new Error('Pico Home membership source is invalid.');
  }
  assertAsciiToken(membership.sourceRef, 'membership.sourceRef');
  assertNonEmptyString(membership.validFrom, 'membership.validFrom');
  if (membership.validUntil !== null) {
    assertNonEmptyString(membership.validUntil, 'membership.validUntil');
  }
  assertNonEmptyString(membership.createdAt, 'membership.createdAt');
  assertNonEmptyString(membership.updatedAt, 'membership.updatedAt');
}

function assertPicoHomeMembershipRole(role: PicoHomeMembershipRole): void {
  if (!picoHomeMembershipRoles.includes(role)) {
    throw new Error('Pico Home membership role is invalid.');
  }
}

function assertPicoHomeMembershipStatus(status: PicoHomeMembershipStatus): void {
  if (!picoHomeMembershipStatuses.includes(status)) {
    throw new Error('Pico Home membership status is invalid.');
  }
}

function assertPicoHomeMembershipScopes(scopes: readonly PicoHomeMembershipScope[]): void {
  if (scopes.length === 0) {
    throw new Error('Pico Home membership scopes must not be empty.');
  }

  const seen = new Set<PicoHomeMembershipScope>();
  for (const scope of scopes) {
    if (!picoHomeMembershipScopes.includes(scope)) {
      throw new Error('Pico Home membership scope is invalid.');
    }
    if (seen.has(scope)) {
      throw new Error('Pico Home membership scopes must be unique.');
    }
    seen.add(scope);
  }
}

function assertPicoHomeFoundingRecord(record: PicoHomeFoundingRecord, claim: PicoHomeClaimInput): void {
  if (record.schema !== picoHomeFoundingRecordSchema) {
    throw new Error('Pico Home founding record schema is invalid.');
  }

  if (record.hostClaimResponse.schema !== picoHomeClaimResponseRecordSchema) {
    throw new Error('Pico Home claim response record schema is invalid.');
  }

  const founding = record.founding;
  const claimResponse = record.hostClaimResponse.claimResponse;
  assertAsciiToken(founding.foundingId, 'foundingId');
  assertAsciiToken(founding.homeId, 'homeId');
  assertFingerprint(founding.hostSigningKeyFingerprintHex, 'founding.hostSigningKeyFingerprintHex');
  assertFingerprint(founding.hostKeyAgreementKeyFingerprintHex, 'founding.hostKeyAgreementKeyFingerprintHex');
  assertFingerprint(founding.homeHostPicoIdentityFingerprintHex, 'founding.homeHostPicoIdentityFingerprintHex');
  assertNonEmptyString(founding.foundedAt, 'foundedAt');
  assertLifecycleOrder(founding.lifecycleOrder, 'founding.lifecycleOrder');
  assertAsciiToken(claimResponse.claimId, 'claimId');
  assertAsciiToken(claimResponse.homeId, 'claimResponse.homeId');
  assertAsciiToken(claimResponse.foundingRecordId, 'claimResponse.foundingRecordId');
  assertFingerprint(claimResponse.hostSigningKeyFingerprintHex, 'claimResponse.hostSigningKeyFingerprintHex');
  assertFingerprint(claimResponse.hostKeyAgreementKeyFingerprintHex, 'claimResponse.hostKeyAgreementKeyFingerprintHex');
  assertFingerprint(claimResponse.claimantIdentityKeyFingerprintHex, 'claimResponse.claimantIdentityKeyFingerprintHex');
  assertFingerprint(claimResponse.claimantNonceHex, 'claimResponse.claimantNonceHex');
  assertFingerprint(claimResponse.hostNonceHex, 'claimResponse.hostNonceHex');
  assertDetachedSignature(record.claimantFoundingSignatureHex, 'claimantFoundingSignatureHex');
  assertDetachedSignature(record.hostClaimResponse.hostSignatureHex, 'hostClaimResponseSignatureHex');
  assertDetachedSignature(record.hostFoundingSignatureHex, 'hostFoundingSignatureHex');
  assertNonEmptyString(record.createdAt, 'createdAt');

  if (
    founding.homeId !== claim.homeId
    || claimResponse.homeId !== claim.homeId
    || founding.hostSigningKeyFingerprintHex !== claim.hostSigningKeyFingerprintHex
    || claimResponse.hostSigningKeyFingerprintHex !== claim.hostSigningKeyFingerprintHex
    || founding.hostKeyAgreementKeyFingerprintHex !== claim.hostKeyAgreementKeyFingerprintHex
    || claimResponse.hostKeyAgreementKeyFingerprintHex !== claim.hostKeyAgreementKeyFingerprintHex
    || claimResponse.foundingRecordId !== founding.foundingId
    || claimResponse.claimantIdentityKeyFingerprintHex !== founding.homeHostPicoIdentityFingerprintHex
    || claimResponse.claimantNonceHex !== founding.claimantNonceHex
    || claimResponse.hostNonceHex !== founding.hostNonceHex
    || claim.hostAdminPicoId !== `pico:identity:${founding.homeHostPicoIdentityFingerprintHex}`
  ) {
    throw new Error('Pico Home founding record is not bound to the claim state.');
  }
}

function picoHomeClaimInputFromFoundingRecord(record: PicoHomeFoundingRecord): PicoHomeClaimInput {
  return {
    homeId: record.founding.homeId,
    hostAdminPicoId: `pico:identity:${record.founding.homeHostPicoIdentityFingerprintHex}`,
    hostSigningKeyFingerprintHex: record.founding.hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: record.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: record,
    claimedAt: record.founding.foundedAt,
  };
}

function picoHomeFoundingMembershipFromRecord(record: PicoHomeFoundingRecord): PicoHomeMembership {
  return {
    membershipId: `founding:${record.founding.foundingId}:home_host`,
    homeId: record.founding.homeId,
    picoIdentityFingerprintHex: record.founding.homeHostPicoIdentityFingerprintHex,
    role: 'home_host',
    status: 'active',
    scopes: [...picoHomeMembershipScopes],
    source: 'founding_record',
    sourceRef: record.founding.foundingId,
    validFrom: record.founding.foundedAt,
    validUntil: null,
    createdAt: record.createdAt,
    updatedAt: record.createdAt,
  };
}

function toPicoHomeMembershipRole(value: string): PicoHomeMembershipRole {
  if (!picoHomeMembershipRoles.includes(value as PicoHomeMembershipRole)) {
    throw new Error('Pico Home membership role is invalid.');
  }

  return value as PicoHomeMembershipRole;
}

function toPicoHomeMembershipStatus(value: string): PicoHomeMembershipStatus {
  if (!picoHomeMembershipStatuses.includes(value as PicoHomeMembershipStatus)) {
    throw new Error('Pico Home membership status is invalid.');
  }

  return value as PicoHomeMembershipStatus;
}

function toPicoHomeMembershipSource(value: string): PicoHomeMembershipSource {
  if (value !== 'founding_record' && value !== 'membership_credential') {
    throw new Error('Pico Home membership source is invalid.');
  }

  return value;
}

function parsePicoHomeMembershipScopes(scopesJson: string): PicoHomeMembershipScope[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(scopesJson) as unknown;
  } catch {
    throw new Error('Pico Home membership scopes are invalid.');
  }

  if (!Array.isArray(parsed) || !parsed.every((scope) => typeof scope === 'string')) {
    throw new Error('Pico Home membership scopes are invalid.');
  }

  const scopes = parsed as PicoHomeMembershipScope[];
  assertPicoHomeMembershipScopes(scopes);
  return scopes;
}

/** Scope sets carry no order, so compare them as sets and not as sequences. */
function sameScopeSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const known = new Set(left);
  return right.every((value) => known.has(value));
}

function assertLamportValue(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Event lamport must be a non-negative safe integer.');
  }
}

function assertListLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error('EventStore list limit must be a positive safe integer.');
  }
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  return db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .some((row) => (row as { name: string }).name === columnName);
}

function tableExists(db: Database.Database, tableName: string): boolean {
  return db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) !== undefined;
}

// Storage comparison helper only. This is not Pico protocol canonicalization
// and must not be used as a cryptographic signature or hash input. Future
// security-relevant canonicalization is governed by ADR 0034 and must define
// explicit test vectors.
function serializePayload(payload: unknown): string {
  const serialized = JSON.stringify(payload);

  if (serialized === undefined) {
    throw new Error('Event payload must be JSON serializable.');
  }

  return stringifyStableJson(JSON.parse(serialized) as JsonValue);
}

function serializeStoredPayload(payloadJson: string): string {
  return stringifyStableJson(JSON.parse(payloadJson) as JsonValue);
}

function stringifyStableJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStableJson(item)).join(',')}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stringifyStableJson(value[key])}`)
    .join(',')}}`;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
