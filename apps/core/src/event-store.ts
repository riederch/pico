import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type { PayloadPosture, PicoEvent, PicoEventAppendResult, PicoHomeFoundingRecord } from '@pico/protocol';
import { payloadPostures, picoHomeClaimResponseRecordSchema, picoHomeFoundingRecordSchema } from '@pico/protocol';
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
import type { MemoryContentCrypto } from './memory-content-crypto.js';
import type { SqliteBackupResult } from './sqlite-backup.js';

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
          claimant_claim_signature_hex AS claimantClaimSignatureHex,
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
          claimant_claim_signature_hex,
          claimant_founding_signature_hex,
          host_claim_response_signature_hex,
          host_founding_signature_hex,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        record.claimantClaimSignatureHex,
        record.claimantFoundingSignatureHex,
        record.hostClaimResponse.hostSignatureHex,
        record.hostFoundingSignatureHex,
        record.createdAt,
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
  claimantClaimSignatureHex: string;
  claimantFoundingSignatureHex: string;
  hostClaimResponseSignatureHex: string;
  hostFoundingSignatureHex: string;
  createdAt: string;
}

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
    claimantClaimSignatureHex: row.claimantClaimSignatureHex,
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
  assertDetachedSignature(record.claimantClaimSignatureHex, 'claimantClaimSignatureHex');
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
