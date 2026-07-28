import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
  type IdentityVerificationSodium,
} from '@pico/identity';
import {
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyKekRotationSignatureInput,
  buildPicoReaderCustodyReaderGrantLifecycleSignatureInput,
  buildPicoReaderCustodyReaderGrantSignatureInput,
  buildPicoReaderCustodySyncEvidenceDigestInput,
  buildPicoReaderCustodySyncManifestSignatureInput,
  buildPicoReaderCustodySyncRecordDigestInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentitySuite,
  picoMemoryContentSuite,
  picoReaderCustodyDomainRecordSchema,
  picoReaderCustodyItemRecordSchema,
  picoReaderCustodyKekRotationRecordSchema,
  picoReaderCustodyReaderGrantLifecycleRecordSchema,
  picoReaderCustodyReaderGrantRecordSchema,
  picoReaderCustodySyncBatchRecordSchema,
  picoReaderCustodySyncPayloadSchema,
  picoReaderCustodyWriterGrantLifecycleRecordSchema,
  picoReaderCustodyWriterGrantRecordSchema,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
  type PicoIdentityReaderKeyFreshnessCheckpoint,
  type PicoReaderCustodyDomainRecord,
  type PicoReaderCustodyItemRecord,
  type PicoReaderCustodyKekRotationRecord,
  type PicoReaderCustodyReaderGrantLifecycleRecord,
  type PicoReaderCustodyReaderGrantRecord,
  type PicoReaderCustodySyncBatchRecord,
  type PicoReaderCustodySyncEvidenceReference,
  type PicoReaderCustodySyncPayload,
  type PicoReaderCustodyWriterGrantLifecycleRecord,
  type PicoReaderCustodyWriterGrantRecord,
  type PicoShareEnvelopeRecord,
} from '@pico/protocol';

export type VersionVector = Record<string, number>;

const MAX_LAMPORT_VALUE = Number.MAX_SAFE_INTEGER;

export class LamportClock {
  private currentValue: number;

  public constructor(initialValue = 0) {
    assertLamportValue(initialValue, 'LamportClock initialValue');

    this.currentValue = initialValue;
  }

  public current(): number {
    return this.currentValue;
  }

  public tick(): number {
    assertCanAdvance(this.currentValue);

    this.currentValue += 1;
    return this.currentValue;
  }

  public receive(remoteValue: number): number {
    assertLamportValue(remoteValue, 'Remote Lamport value');

    const nextValue = Math.max(this.currentValue, remoteValue);
    assertCanAdvance(nextValue);

    this.currentValue = nextValue + 1;
    return this.currentValue;
  }
}

export function mergeVersionVector(local: VersionVector, remote: VersionVector): VersionVector {
  assertVersionVector(local, 'local version vector');
  assertVersionVector(remote, 'remote version vector');

  const merged: VersionVector = { ...local };

  for (const [deviceId, value] of Object.entries(remote)) {
    merged[deviceId] = Math.max(merged[deviceId] ?? 0, value);
  }

  return merged;
}

export function updateVersionVector(vector: VersionVector, deviceId: string, lamport: number): VersionVector {
  assertVersionVector(vector, 'version vector');

  if (!deviceId.trim()) {
    throw new Error('deviceId must not be empty.');
  }

  assertLamportValue(lamport, 'lamport');

  return {
    ...vector,
    [deviceId]: Math.max(vector[deviceId] ?? 0, lamport),
  };
}

// Reader batches encode a bounded 16 MiB sealed payload as lower-case hex in
// the transport JSON wrapper, so the opaque transport ceiling must cover that
// deterministic 2x expansion plus the small record envelope.
export const MAX_PICO_SYNC_OPAQUE_PAYLOAD_BYTES = 33 * 1024 * 1024;
export const MAX_PICO_SYNC_READ_LIMIT = 100;
export const MAX_PICO_READER_CUSTODY_SYNC_MANIFEST_MS =
  24 * 60 * 60 * 1_000;
export const PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX = '00'.repeat(32);

export interface PicoSyncOpaquePublication {
  routeRef: string;
  objectId: string;
  payload: Uint8Array;
  expiresAt: string;
}

export interface PicoSyncOpaqueRecord {
  objectId: string;
  payload: Uint8Array;
  expiresAt: string;
  cursor: string;
}

export interface PicoSyncOpaqueReadResult {
  records: PicoSyncOpaqueRecord[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface PicoSyncOpaqueTransport {
  publish(
    publication: PicoSyncOpaquePublication,
    options: { signal: AbortSignal },
  ): Promise<{ inserted: boolean }>;
  read(
    input: {
      routeRef: string;
      afterCursor?: string;
      limit: number;
      evaluatedAt: string;
    },
    options: { signal: AbortSignal },
  ): Promise<PicoSyncOpaqueReadResult>;
  latest(
    input: { routeRef: string; evaluatedAt: string },
    options: { signal: AbortSignal },
  ): Promise<PicoSyncOpaqueRecord | undefined>;
}

interface StoredOpaqueRecord extends PicoSyncOpaqueRecord {
  sequence: number;
}

/**
 * Reference/test transport. It deliberately understands only opaque mailbox
 * references, object ids, expiry and bytes. A deployment adapter implements
 * the same interface for its medium without gaining Pico authority.
 */
export class InMemoryPicoSyncOpaqueTransport
implements PicoSyncOpaqueTransport {
  readonly #routes = new Map<string, StoredOpaqueRecord[]>();

  public async publish(
    publication: PicoSyncOpaquePublication,
    options: { signal: AbortSignal },
  ): Promise<{ inserted: boolean }> {
    throwIfAborted(options.signal);
    assertOpaquePublication(publication);
    const records = this.#routes.get(publication.routeRef) ?? [];
    const existing = records.find(
      (record) => record.objectId === publication.objectId,
    );
    if (existing !== undefined) {
      if (existing.expiresAt === publication.expiresAt
        && bytesEqual(existing.payload, publication.payload)) {
        return { inserted: false };
      }
      throw new Error('conflicting_sync_object');
    }
    const sequence = (records.at(-1)?.sequence ?? 0) + 1;
    records.push({
      objectId: publication.objectId,
      payload: new Uint8Array(publication.payload),
      expiresAt: publication.expiresAt,
      cursor: formatOpaqueCursor(sequence),
      sequence,
    });
    this.#routes.set(publication.routeRef, records);
    return { inserted: true };
  }

  public async read(
    input: {
      routeRef: string;
      afterCursor?: string;
      limit: number;
      evaluatedAt: string;
    },
    options: { signal: AbortSignal },
  ): Promise<PicoSyncOpaqueReadResult> {
    throwIfAborted(options.signal);
    assertRouteRef(input.routeRef);
    assertCanonicalInstant(input.evaluatedAt);
    if (!Number.isSafeInteger(input.limit)
      || input.limit < 1
      || input.limit > MAX_PICO_SYNC_READ_LIMIT) {
      throw new Error('invalid_sync_read_limit');
    }
    const afterSequence = input.afterCursor === undefined
      ? 0
      : parseOpaqueCursor(input.afterCursor);
    const available = (this.#routes.get(input.routeRef) ?? [])
      .filter((record) =>
        record.sequence > afterSequence
        && input.evaluatedAt < record.expiresAt);
    const page = available.slice(0, input.limit);
    const nextCursor = page.at(-1)?.cursor;
    return {
      records: page.map(cloneOpaqueRecord),
      ...(nextCursor === undefined ? {} : { nextCursor }),
      hasMore: available.length > page.length,
    };
  }

  public async latest(
    input: { routeRef: string; evaluatedAt: string },
    options: { signal: AbortSignal },
  ): Promise<PicoSyncOpaqueRecord | undefined> {
    throwIfAborted(options.signal);
    assertRouteRef(input.routeRef);
    assertCanonicalInstant(input.evaluatedAt);
    const record = [...(this.#routes.get(input.routeRef) ?? [])]
      .reverse()
      .find((candidate) => input.evaluatedAt < candidate.expiresAt);
    return record === undefined ? undefined : cloneOpaqueRecord(record);
  }
}

export interface PicoReaderKeyFreshnessLookupQuery {
  homeId: string;
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
  locallyObservedThroughLifecycleOrder: string;
  evaluatedAt: string;
}

export type PicoReaderKeyFreshnessRouteResolver = (
  query: PicoReaderKeyFreshnessLookupQuery,
) => string | undefined;

export class PicoSyncReaderKeyFreshnessCheckpointPublisher {
  public constructor(private readonly transport: PicoSyncOpaqueTransport) {}

  public publish(
    routeRef: string,
    record: PicoIdentityReaderKeyFreshnessCheckpoint,
    options: { signal: AbortSignal },
  ): Promise<{ inserted: boolean }> {
    if (record.schema !== picoIdentityReaderKeyFreshnessCheckpointSchema) {
      throw new Error('invalid_freshness_checkpoint');
    }
    return this.transport.publish({
      routeRef,
      objectId: record.checkpoint.checkpointId,
      payload: textEncoder.encode(JSON.stringify(record)),
      expiresAt: record.checkpoint.freshUntil,
    }, options);
  }
}

/**
 * Structurally implements Core's checkpoint-source seam without importing
 * Core. The local resolver maps a full internal query to an opaque route; the
 * transport receives only that route and cannot manufacture a usable result
 * because Core still verifies the complete identity-root signature.
 */
export class PicoSyncReaderKeyFreshnessCheckpointSource {
  public constructor(
    private readonly transport: PicoSyncOpaqueTransport,
    private readonly resolveRoute: PicoReaderKeyFreshnessRouteResolver,
    private readonly sourceName = 'pico-sync',
  ) {
    assertAsciiReference(sourceName);
    if (sourceName.length > 121) {
      throw new Error('invalid_sync_source_name');
    }
  }

  public async lookup(
    query: PicoReaderKeyFreshnessLookupQuery,
    options: { signal: AbortSignal },
  ): Promise<
    | {
      status: 'checkpoint';
      sourceRef: string;
      record: PicoIdentityReaderKeyFreshnessCheckpoint;
    }
    | { status: 'unavailable' }
  > {
    const routeRef = this.resolveRoute({ ...query });
    if (routeRef === undefined) {
      return { status: 'unavailable' };
    }
    try {
      assertRouteRef(routeRef);
      const latest = await this.transport.latest({
        routeRef,
        evaluatedAt: query.evaluatedAt,
      }, options);
      if (latest === undefined) {
        return { status: 'unavailable' };
      }
      const parsed = JSON.parse(textDecoder.decode(latest.payload)) as unknown;
      if (!isUnknownRecord(parsed)
        || parsed.schema
          !== picoIdentityReaderKeyFreshnessCheckpointSchema
        || !isUnknownRecord(parsed.checkpoint)
        || parsed.checkpoint.checkpointId !== latest.objectId
        || parsed.checkpoint.freshUntil !== latest.expiresAt) {
        return { status: 'unavailable' };
      }
      return {
        status: 'checkpoint',
        sourceRef: `${this.sourceName}:${routeRef}`,
        record: parsed as unknown as PicoIdentityReaderKeyFreshnessCheckpoint,
      };
    } catch {
      return { status: 'unavailable' };
    }
  }
}

export class PicoReaderCustodySyncBatchPublisher {
  public constructor(private readonly transport: PicoSyncOpaqueTransport) {}

  public publish(
    record: PicoReaderCustodySyncBatchRecord,
    options: { signal: AbortSignal },
  ): Promise<{ inserted: boolean }> {
    if (record.schema !== picoReaderCustodySyncBatchRecordSchema) {
      throw new Error('invalid_reader_sync_batch');
    }
    return this.transport.publish({
      routeRef: record.routeRef,
      objectId: record.syncBatchId,
      payload: textEncoder.encode(JSON.stringify(record)),
      expiresAt: record.expiresAt,
    }, options);
  }
}

export interface PicoReaderCustodySyncBatchPage {
  batches: PicoReaderCustodySyncBatchRecord[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface PicoReaderCustodySyncBatchReader {
  read(
    input: {
      routeRef: string;
      afterCursor?: string;
      limit?: number;
      evaluatedAt: string;
    },
    options: { signal: AbortSignal },
  ): Promise<PicoReaderCustodySyncBatchPage>;
}

export class PicoReaderCustodySyncBatchSource
implements PicoReaderCustodySyncBatchReader {
  public constructor(private readonly transport: PicoSyncOpaqueTransport) {}

  public async read(
    input: {
      routeRef: string;
      afterCursor?: string;
      limit?: number;
      evaluatedAt: string;
    },
    options: { signal: AbortSignal },
  ): Promise<PicoReaderCustodySyncBatchPage> {
    assertRouteRef(input.routeRef);
    assertCanonicalInstant(input.evaluatedAt);
    const limit = input.limit ?? 20;
    assertSyncReadLimit(limit);
    if (input.afterCursor !== undefined) {
      assertTransportCursor(input.afterCursor);
    }
    const page = await this.transport.read({
      routeRef: input.routeRef,
      ...(input.afterCursor === undefined
        ? {}
        : { afterCursor: input.afterCursor }),
      limit,
      evaluatedAt: input.evaluatedAt,
    }, options);
    assertOpaqueSyncReadResult(page, limit, input.afterCursor);

    const batchIds = new Set<string>();
    const batches = page.records.map((record) => {
      const parsed = JSON.parse(textDecoder.decode(record.payload)) as unknown;
      if (!isUnknownRecord(parsed)
        || parsed.schema !== picoReaderCustodySyncBatchRecordSchema
        || parsed.syncBatchId !== record.objectId
        || parsed.expiresAt !== record.expiresAt
        || parsed.routeRef !== input.routeRef
        || batchIds.has(record.objectId)) {
        throw new Error('invalid_reader_sync_batch');
      }
      batchIds.add(record.objectId);
      return parsed as unknown as PicoReaderCustodySyncBatchRecord;
    });
    return {
      batches,
      ...(page.nextCursor === undefined
        ? {}
        : { nextCursor: page.nextCursor }),
      hasMore: page.hasMore,
    };
  }
}

export interface PicoReaderCustodySyncPins {
  routeRef: string;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  ownerIdentityKeyFingerprintHex: string;
  readerGrantId: string;
  readerIdentityKeyFingerprintHex: string;
  readerKeyFingerprintHex: string;
}

export interface PicoReaderCustodySyncFloor {
  routeRef: string;
  syncBatchId: string;
  sequence: number;
  manifestDigestHex: string;
  throughKekVersion: number;
  observedThroughLifecycleOrder: string;
  createdAt: string;
}

export interface PicoReaderCustodySyncProjectionView {
  floor: PicoReaderCustodySyncFloor;
  readerStatus: 'active' | 'revoked';
  readerEnvelopeVersions: number[];
  writerGrantIds: string[];
  itemPackageIds: string[];
}

export type PicoReaderCustodySyncProjectionFailure =
  | 'invalid_payload'
  | 'wrong_scope'
  | 'expired'
  | 'rollback'
  | 'sequence_gap'
  | 'fork';

export type PicoReaderCustodySyncProjectionResult =
  | {
    ok: true;
    inserted: boolean;
    value: PicoReaderCustodySyncProjectionView;
  }
  | { ok: false; reason: PicoReaderCustodySyncProjectionFailure };

export class PicoReaderCustodySyncProjector {
  #floor: PicoReaderCustodySyncFloor | undefined;

  #lastView: PicoReaderCustodySyncProjectionView | undefined;

  public constructor(
    private readonly sodium: IdentityVerificationSodium,
    private readonly pins: PicoReaderCustodySyncPins,
    floor?: PicoReaderCustodySyncFloor,
  ) {
    assertSyncPins(pins);
    if (floor !== undefined) {
      assertSyncFloor(floor);
      if (floor.routeRef !== pins.routeRef) {
        throw new Error('sync_floor_scope_mismatch');
      }
      this.#floor = { ...floor };
    }
  }

  public floor(): PicoReaderCustodySyncFloor | undefined {
    return this.#floor === undefined ? undefined : { ...this.#floor };
  }

  public accept(
    payload: PicoReaderCustodySyncPayload,
    evaluatedAt: string = new Date().toISOString(),
  ): PicoReaderCustodySyncProjectionResult {
    let verified: VerifiedReaderSyncPayload;
    try {
      verified = verifyReaderSyncPayload(
        this.sodium,
        this.pins,
        payload,
        evaluatedAt,
      );
    } catch (error) {
      if (error instanceof ReaderSyncVerificationError) {
        return { ok: false, reason: error.reason };
      }
      return { ok: false, reason: 'invalid_payload' };
    }

    const manifest = payload.manifest;
    const floor = this.#floor;
    if (floor === undefined) {
      if (manifest.sequence !== 1
        || manifest.previousManifestDigestHex
          !== PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX) {
        return { ok: false, reason: 'sequence_gap' };
      }
    } else if (manifest.sequence < floor.sequence) {
      return { ok: false, reason: 'rollback' };
    } else if (manifest.sequence === floor.sequence) {
      if (verified.manifestDigestHex === floor.manifestDigestHex
        && manifest.syncBatchId === floor.syncBatchId
        && manifest.routeRef === floor.routeRef
        && manifest.throughKekVersion === floor.throughKekVersion
        && manifest.observedThroughLifecycleOrder
          === floor.observedThroughLifecycleOrder
        && manifest.createdAt === floor.createdAt) {
        if (this.#lastView === undefined) {
          this.#lastView = projectionView(payload, verified);
        }
        return {
          ok: true,
          inserted: false,
          value: cloneProjectionView(this.#lastView),
        };
      }
      return { ok: false, reason: 'fork' };
    } else if (manifest.sequence !== floor.sequence + 1) {
      return { ok: false, reason: 'sequence_gap' };
    } else if (manifest.previousManifestDigestHex
        !== floor.manifestDigestHex) {
      return { ok: false, reason: 'fork' };
    } else if (manifest.throughKekVersion < floor.throughKekVersion
      || manifest.observedThroughLifecycleOrder
        < floor.observedThroughLifecycleOrder
      || manifest.createdAt < floor.createdAt) {
      return { ok: false, reason: 'rollback' };
    }

    const nextFloor: PicoReaderCustodySyncFloor = {
      routeRef: manifest.routeRef,
      syncBatchId: manifest.syncBatchId,
      sequence: manifest.sequence,
      manifestDigestHex: verified.manifestDigestHex,
      throughKekVersion: manifest.throughKekVersion,
      observedThroughLifecycleOrder:
        manifest.observedThroughLifecycleOrder,
      createdAt: manifest.createdAt,
    };
    this.#floor = nextFloor;
    this.#lastView = projectionView(payload, verified);
    return {
      ok: true,
      inserted: true,
      value: cloneProjectionView(this.#lastView),
    };
  }
}

export const picoReaderCustodySyncClientStateSchema =
  'pico.sync.reader-custody-client-state.v1' as const;
export const MAX_PICO_READER_CUSTODY_SYNC_CLIENT_STATE_BYTES = 64 * 1024;
export const picoReaderCustodySyncPendingRecordSchema =
  'pico.sync.reader-custody-pending.v1' as const;
export const MAX_PICO_READER_CUSTODY_SYNC_SEALED_PAYLOAD_BYTES =
  (16 * 1024 * 1024) + 128;
export const MAX_PICO_READER_CUSTODY_SYNC_PENDING_RECORD_BYTES =
  MAX_PICO_SYNC_OPAQUE_PAYLOAD_BYTES + (64 * 1024);
export const picoReaderCustodySyncProjectionReceiptSchema =
  'pico.sync.reader-custody-projection-receipt.v1' as const;
export const picoReaderCustodySyncProtectedProjectionRecordSchema =
  'pico.sync.reader-custody-protected-projection.v1' as const;
export const picoReaderCustodySyncProtectedProjectionArchiveSchema =
  'pico.sync.reader-custody-protected-projection-archive.v1' as const;
export const MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_RECORDS =
  1_000;
export const MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_ARCHIVE_BYTES =
  256 * 1024 * 1024;

export interface PicoReaderCustodySyncClientState {
  schema: typeof picoReaderCustodySyncClientStateSchema;
  schemaVersion: 1;
  revision: number;
  pins: PicoReaderCustodySyncPins;
  floor: PicoReaderCustodySyncFloor;
  verifiedAt: string;
  transportCursor: string | null;
}

export interface PicoReaderCustodySyncClientStateStore {
  load(): PicoReaderCustodySyncClientState | undefined;
  commit(
    state: PicoReaderCustodySyncClientState,
    expectedRevision: number | undefined,
  ): void;
}

export interface PicoReaderCustodySyncPendingRecord {
  schema: typeof picoReaderCustodySyncPendingRecordSchema;
  schemaVersion: 1;
  pins: PicoReaderCustodySyncPins;
  stagedAt: string;
  baseFloor: PicoReaderCustodySyncFloor | null;
  batchRecord: PicoReaderCustodySyncBatchRecord;
}

export interface PicoReaderCustodySyncPendingStore {
  load(): PicoReaderCustodySyncPendingRecord | undefined;
  stage(
    pending: PicoReaderCustodySyncPendingRecord,
  ): { inserted: boolean };
  acknowledge(
    expected: PicoReaderCustodySyncPendingRecord,
  ): { removed: boolean };
}

export interface PicoReaderCustodySyncProjectionReceipt {
  schema: typeof picoReaderCustodySyncProjectionReceiptSchema;
  routeRef: string;
  syncBatchId: string;
  sequence: number;
  manifestDigestHex: string;
  previousManifestDigestHex: string;
  verifiedAt: string;
}

export interface PicoReaderCustodySyncProtectedProjectionRecord {
  schema: typeof picoReaderCustodySyncProtectedProjectionRecordSchema;
  schemaVersion: 1;
  receipt: PicoReaderCustodySyncProjectionReceipt;
  batchRecord: PicoReaderCustodySyncBatchRecord;
}

export interface PicoReaderCustodySyncProtectedProjectionArchive {
  schema: typeof picoReaderCustodySyncProtectedProjectionArchiveSchema;
  schemaVersion: 1;
  routeRef: string;
  records: PicoReaderCustodySyncProtectedProjectionRecord[];
}

export interface PicoReaderCustodySyncRestoredProjection {
  receipt: PicoReaderCustodySyncProjectionReceipt;
  batchRecord: PicoReaderCustodySyncBatchRecord;
  payload: PicoReaderCustodySyncPayload;
  value: PicoReaderCustodySyncProjectionView;
}

export interface PicoReaderCustodySyncProjectionRestoreSource {
  restore(
    pins: PicoReaderCustodySyncPins,
    state: PicoReaderCustodySyncClientState,
    openPayload: PicoReaderCustodySyncPayloadOpener,
  ): PicoReaderCustodySyncRestoredProjection[];
}

export interface PicoReaderCustodySyncItemDecryptionEvidence {
  receipt: PicoReaderCustodySyncProjectionReceipt;
  domainRecord: PicoReaderCustodyDomainRecord;
  readerGrantRecord: PicoReaderCustodyReaderGrantRecord;
  readerGrantLifecycleRecords:
    PicoReaderCustodyReaderGrantLifecycleRecord[];
  writerGrantRecord: PicoReaderCustodyWriterGrantRecord;
  writerGrantLifecycleRecords:
    PicoReaderCustodyWriterGrantLifecycleRecord[];
  rotationRecords: PicoReaderCustodyKekRotationRecord[];
  itemRecord: PicoReaderCustodyItemRecord;
}

export interface PicoReaderCustodySyncItemDecryptor {
  (evidence: PicoReaderCustodySyncItemDecryptionEvidence): string;
}

export interface PicoReaderCustodySyncItemPlaintextConsumer {
  (plaintext: string): void;
}

export interface PicoReaderCustodySyncProjectionMaterializationStore {
  materialize(
    projection: PicoReaderCustodySyncClientApplySuccess,
  ): {
    inserted: boolean;
    receipt: PicoReaderCustodySyncProjectionReceipt;
  };
}

export class PicoReaderCustodySyncFileStateStore
implements PicoReaderCustodySyncClientStateStore {
  public readonly path: string;

  public constructor(path: string) {
    if (typeof path !== 'string' || path.length < 1) {
      throw new Error('invalid_reader_sync_state_path');
    }
    this.path = resolve(path);
  }

  public load(): PicoReaderCustodySyncClientState | undefined {
    let fileDescriptor: number;
    try {
      fileDescriptor = openSync(
        this.path,
        fsConstants.O_RDONLY | noFollowFlag(),
      );
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        return undefined;
      }
      throw new Error('reader_sync_state_unreadable', { cause: error });
    }

    try {
      assertPrivateReaderSyncStateDirectory(dirname(this.path));
      const stats = fstatSync(fileDescriptor);
      if (!stats.isFile()
        || (stats.mode & 0o777) !== 0o600
        || stats.size < 1
        || stats.size > MAX_PICO_READER_CUSTODY_SYNC_CLIENT_STATE_BYTES) {
        throw new Error('invalid_reader_sync_state_file');
      }
      return parseReaderSyncClientState(
        readFileSync(fileDescriptor, 'utf8'),
      );
    } finally {
      closeSync(fileDescriptor);
    }
  }

  public commit(
    state: PicoReaderCustodySyncClientState,
    expectedRevision: number | undefined,
  ): void {
    const nextState = cloneReaderSyncClientState(state);
    assertReaderSyncClientState(nextState);
    const currentState = this.load();
    assertReaderSyncStateTransition(
      currentState,
      nextState,
      expectedRevision,
    );

    const serialized = `${JSON.stringify(nextState)}\n`;
    if (Buffer.byteLength(serialized, 'utf8')
      > MAX_PICO_READER_CUSTODY_SYNC_CLIENT_STATE_BYTES) {
      throw new Error('reader_sync_state_too_large');
    }

    const parentPath = dirname(this.path);
    mkdirSync(parentPath, { recursive: true, mode: 0o700 });
    assertPrivateReaderSyncStateDirectory(parentPath);

    const temporaryPath =
      `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    let temporaryFileDescriptor: number | undefined;
    try {
      temporaryFileDescriptor = openSync(
        temporaryPath,
        fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | fsConstants.O_WRONLY
          | noFollowFlag(),
        0o600,
      );
      writeFileSync(temporaryFileDescriptor, serialized, {
        encoding: 'utf8',
      });
      fsyncSync(temporaryFileDescriptor);
      closeSync(temporaryFileDescriptor);
      temporaryFileDescriptor = undefined;

      renameSync(temporaryPath, this.path);
      fsyncDirectory(parentPath);
    } catch (error) {
      if (temporaryFileDescriptor !== undefined) {
        closeSync(temporaryFileDescriptor);
      }
      try {
        unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (!isFileSystemError(cleanupError, 'ENOENT')) {
          throw new Error('reader_sync_state_cleanup_failed', {
            cause: cleanupError,
          });
        }
      }
      throw error;
    }
  }
}

export class PicoReaderCustodySyncFilePendingStore
implements PicoReaderCustodySyncPendingStore {
  public readonly path: string;

  public constructor(path: string) {
    if (typeof path !== 'string' || path.length < 1) {
      throw new Error('invalid_reader_sync_pending_path');
    }
    this.path = resolve(path);
  }

  public load(): PicoReaderCustodySyncPendingRecord | undefined {
    let fileDescriptor: number;
    try {
      fileDescriptor = openSync(
        this.path,
        fsConstants.O_RDONLY | noFollowFlag(),
      );
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        return undefined;
      }
      throw new Error('reader_sync_pending_unreadable', { cause: error });
    }

    try {
      assertPrivateReaderSyncStateDirectory(dirname(this.path));
      const stats = fstatSync(fileDescriptor);
      if (!stats.isFile()
        || (stats.mode & 0o777) !== 0o600
        || stats.size < 1
        || stats.size > MAX_PICO_READER_CUSTODY_SYNC_PENDING_RECORD_BYTES) {
        throw new Error('invalid_reader_sync_pending_file');
      }
      return parseReaderSyncPendingRecord(
        readFileSync(fileDescriptor, 'utf8'),
      );
    } finally {
      closeSync(fileDescriptor);
    }
  }

  public stage(
    pending: PicoReaderCustodySyncPendingRecord,
  ): { inserted: boolean } {
    const nextPending = cloneReaderSyncPendingRecord(pending);
    assertReaderSyncPendingRecord(nextPending);
    const currentPending = this.load();
    if (currentPending !== undefined) {
      if (readerSyncPendingRecordsEqual(currentPending, nextPending)) {
        return { inserted: false };
      }
      throw new Error('reader_sync_pending_conflict');
    }

    const serialized = `${JSON.stringify(nextPending)}\n`;
    if (Buffer.byteLength(serialized, 'utf8')
      > MAX_PICO_READER_CUSTODY_SYNC_PENDING_RECORD_BYTES) {
      throw new Error('reader_sync_pending_too_large');
    }

    const parentPath = dirname(this.path);
    mkdirSync(parentPath, { recursive: true, mode: 0o700 });
    assertPrivateReaderSyncStateDirectory(parentPath);

    const temporaryPath =
      `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    let temporaryFileDescriptor: number | undefined;
    try {
      temporaryFileDescriptor = openSync(
        temporaryPath,
        fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | fsConstants.O_WRONLY
          | noFollowFlag(),
        0o600,
      );
      writeFileSync(temporaryFileDescriptor, serialized, {
        encoding: 'utf8',
      });
      fsyncSync(temporaryFileDescriptor);
      closeSync(temporaryFileDescriptor);
      temporaryFileDescriptor = undefined;

      renameSync(temporaryPath, this.path);
      fsyncDirectory(parentPath);
      return { inserted: true };
    } catch (error) {
      if (temporaryFileDescriptor !== undefined) {
        closeSync(temporaryFileDescriptor);
      }
      try {
        unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (!isFileSystemError(cleanupError, 'ENOENT')) {
          throw new Error('reader_sync_pending_cleanup_failed', {
            cause: cleanupError,
          });
        }
      }
      throw error;
    }
  }

  public acknowledge(
    expected: PicoReaderCustodySyncPendingRecord,
  ): { removed: boolean } {
    const expectedPending = cloneReaderSyncPendingRecord(expected);
    assertReaderSyncPendingRecord(expectedPending);
    const currentPending = this.load();
    if (currentPending === undefined) {
      return { removed: false };
    }
    if (!readerSyncPendingRecordsEqual(
      currentPending,
      expectedPending,
    )) {
      throw new Error('reader_sync_pending_ack_mismatch');
    }

    const parentPath = dirname(this.path);
    assertPrivateReaderSyncStateDirectory(parentPath);
    try {
      unlinkSync(this.path);
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        return { removed: false };
      }
      throw error;
    }
    fsyncDirectory(parentPath);
    return { removed: true };
  }
}

export interface PicoReaderCustodySyncProtectedProjectionArchiveOptions {
  maxRecords?: number;
  maxBytes?: number;
}

export class PicoReaderCustodySyncProtectedProjectionFileStore
implements
PicoReaderCustodySyncProjectionMaterializationStore,
PicoReaderCustodySyncProjectionRestoreSource {
  public readonly path: string;

  public readonly routeRef: string;

  public readonly maxRecords: number;

  public readonly maxBytes: number;

  public constructor(
    private readonly sodium: IdentityVerificationSodium,
    path: string,
    routeRef: string,
    options: PicoReaderCustodySyncProtectedProjectionArchiveOptions = {},
  ) {
    if (typeof path !== 'string' || path.length < 1) {
      throw new Error('invalid_reader_sync_projection_archive_path');
    }
    assertRouteRef(routeRef);
    const maxRecords = options.maxRecords
      ?? MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_RECORDS;
    const maxBytes = options.maxBytes
      ?? MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_ARCHIVE_BYTES;
    if (!Number.isSafeInteger(maxRecords)
      || maxRecords < 1
      || maxRecords
        > MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_RECORDS
      || !Number.isSafeInteger(maxBytes)
      || maxBytes < 1
      || maxBytes
        > MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_ARCHIVE_BYTES) {
      throw new Error('invalid_reader_sync_projection_archive_limits');
    }
    this.path = resolve(path);
    this.routeRef = routeRef;
    this.maxRecords = maxRecords;
    this.maxBytes = maxBytes;
  }

  public load():
  PicoReaderCustodySyncProtectedProjectionArchive | undefined {
    let fileDescriptor: number;
    try {
      fileDescriptor = openSync(
        this.path,
        fsConstants.O_RDONLY | noFollowFlag(),
      );
    } catch (error) {
      if (isFileSystemError(error, 'ENOENT')) {
        return undefined;
      }
      throw new Error('reader_sync_projection_archive_unreadable', {
        cause: error,
      });
    }

    try {
      assertPrivateReaderSyncStateDirectory(dirname(this.path));
      const stats = fstatSync(fileDescriptor);
      if (!stats.isFile()
        || (stats.mode & 0o777) !== 0o600
        || stats.size < 1
        || stats.size > this.maxBytes) {
        throw new Error('invalid_reader_sync_projection_archive_file');
      }
      return parseReaderSyncProtectedProjectionArchive(
        this.sodium,
        readFileSync(fileDescriptor, 'utf8'),
        this.routeRef,
        this.maxRecords,
      );
    } finally {
      closeSync(fileDescriptor);
    }
  }

  public materialize(
    projection: PicoReaderCustodySyncClientApplySuccess,
  ): {
    inserted: boolean;
    receipt: PicoReaderCustodySyncProjectionReceipt;
  } {
    const nextRecord =
      protectedProjectionRecordFromApplySuccess(this.sodium, projection);
    if (nextRecord.receipt.routeRef !== this.routeRef) {
      throw new Error('reader_sync_projection_archive_scope_mismatch');
    }
    const currentArchive = this.load();
    const currentHead = currentArchive?.records.at(-1);
    if (currentHead === undefined) {
      if (nextRecord.receipt.sequence !== 1) {
        throw new Error('reader_sync_projection_archive_sequence_gap');
      }
      if (nextRecord.receipt.previousManifestDigestHex
        !== PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX) {
        throw new Error('reader_sync_projection_archive_fork');
      }
    } else if (nextRecord.receipt.sequence
      < currentHead.receipt.sequence) {
      throw new Error(
        'reader_sync_projection_archive_ahead_of_sync_floor',
      );
    } else if (nextRecord.receipt.sequence
      === currentHead.receipt.sequence) {
      if (!protectedProjectionRecordsShareStableIdentity(
        currentHead,
        nextRecord,
      )) {
        throw new Error('reader_sync_projection_archive_fork');
      }
      if (nextRecord.receipt.verifiedAt
        < currentHead.receipt.verifiedAt) {
        throw new Error(
          'reader_sync_projection_archive_verified_at_rollback',
        );
      }
      return {
        inserted: false,
        receipt:
          cloneReaderSyncProjectionReceipt(currentHead.receipt),
      };
    } else {
      if (nextRecord.receipt.sequence
        !== currentHead.receipt.sequence + 1) {
        throw new Error('reader_sync_projection_archive_sequence_gap');
      }
      if (nextRecord.receipt.previousManifestDigestHex
        !== currentHead.receipt.manifestDigestHex) {
        throw new Error('reader_sync_projection_archive_fork');
      }
    }

    const nextArchive: PicoReaderCustodySyncProtectedProjectionArchive = {
      schema: picoReaderCustodySyncProtectedProjectionArchiveSchema,
      schemaVersion: 1,
      routeRef: this.routeRef,
      records: [
        ...(currentArchive?.records ?? []).map(
          cloneReaderSyncProtectedProjectionRecord,
        ),
        nextRecord,
      ],
    };
    if (nextArchive.records.length > this.maxRecords) {
      throw new Error('reader_sync_projection_archive_quota_exceeded');
    }
    const serialized = `${JSON.stringify(nextArchive)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > this.maxBytes) {
      throw new Error('reader_sync_projection_archive_quota_exceeded');
    }

    const parentPath = dirname(this.path);
    mkdirSync(parentPath, { recursive: true, mode: 0o700 });
    assertPrivateReaderSyncStateDirectory(parentPath);
    const temporaryPath =
      `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    let temporaryFileDescriptor: number | undefined;
    try {
      temporaryFileDescriptor = openSync(
        temporaryPath,
        fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | fsConstants.O_WRONLY
          | noFollowFlag(),
        0o600,
      );
      writeFileSync(temporaryFileDescriptor, serialized, {
        encoding: 'utf8',
      });
      fsyncSync(temporaryFileDescriptor);
      closeSync(temporaryFileDescriptor);
      temporaryFileDescriptor = undefined;

      renameSync(temporaryPath, this.path);
      fsyncDirectory(parentPath);
    } catch (error) {
      if (temporaryFileDescriptor !== undefined) {
        closeSync(temporaryFileDescriptor);
      }
      try {
        unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if (!isFileSystemError(cleanupError, 'ENOENT')) {
          throw new Error(
            'reader_sync_projection_archive_cleanup_failed',
            { cause: cleanupError },
          );
        }
      }
      throw error;
    }

    return {
      inserted: true,
      receipt: cloneReaderSyncProjectionReceipt(nextRecord.receipt),
    };
  }

  public restore(
    pins: PicoReaderCustodySyncPins,
    state: PicoReaderCustodySyncClientState,
    openPayload: PicoReaderCustodySyncPayloadOpener,
  ): PicoReaderCustodySyncRestoredProjection[] {
    assertSyncPins(pins);
    assertReaderSyncClientState(state);
    if (!readerSyncPinsEqual(pins, state.pins)
      || pins.routeRef !== this.routeRef) {
      throw new Error('reader_sync_projection_archive_scope_mismatch');
    }
    const archive = this.load();
    if (archive === undefined) {
      throw new Error('reader_sync_projection_archive_missing');
    }

    const projector = new PicoReaderCustodySyncProjector(
      this.sodium,
      pins,
    );
    const restored: PicoReaderCustodySyncRestoredProjection[] = [];
    for (const record of archive.records) {
      const payload = openPayload({
        batchRecord: { ...record.batchRecord },
        evaluatedAt: record.receipt.verifiedAt,
      });
      const projected = projector.accept(
        payload,
        record.receipt.verifiedAt,
      );
      if (!projected.ok
        || !projected.inserted
        || projected.value.floor.routeRef
          !== record.receipt.routeRef
        || projected.value.floor.syncBatchId
          !== record.receipt.syncBatchId
        || projected.value.floor.sequence
          !== record.receipt.sequence
        || projected.value.floor.manifestDigestHex
          !== record.receipt.manifestDigestHex
        || payload.manifest.previousManifestDigestHex
          !== record.receipt.previousManifestDigestHex) {
        throw new Error('invalid_reader_sync_projection_archive');
      }
      restored.push({
        receipt: cloneReaderSyncProjectionReceipt(record.receipt),
        batchRecord: { ...record.batchRecord },
        payload,
        value: cloneProjectionView(projected.value),
      });
    }
    const head = restored.at(-1);
    if (head === undefined
      || !readerSyncFloorsEqual(head.value.floor, state.floor)
      || state.verifiedAt < head.receipt.verifiedAt) {
      throw new Error(
        'reader_sync_projection_archive_state_mismatch',
      );
    }
    return restored;
  }
}

export function createPicoReaderCustodySyncProjectionMaterializationConsumer(
  store: PicoReaderCustodySyncProjectionMaterializationStore,
): PicoReaderCustodySyncProjectionConsumer {
  return (projection, options) => {
    throwIfAborted(options.signal);
    store.materialize(projection);
    throwIfAborted(options.signal);
  };
}

export interface PicoReaderCustodySyncPayloadOpener {
  (input: {
    batchRecord: PicoReaderCustodySyncBatchRecord;
    evaluatedAt: string;
  }): PicoReaderCustodySyncPayload;
}

/**
 * Explicit synchronous Reader plaintext boundary. Restored evidence and
 * plaintext are retained only in this call frame; the caller owns anything it
 * deliberately does inside consumePlaintext.
 */
export class PicoReaderCustodySyncItemAccess {
  readonly #pins: PicoReaderCustodySyncPins;

  #active = false;

  public constructor(
    private readonly restoreSource:
      PicoReaderCustodySyncProjectionRestoreSource,
    pins: PicoReaderCustodySyncPins,
    private readonly stateSource:
      Pick<PicoReaderCustodySyncClientStateStore, 'load'>,
    private readonly openPayload: PicoReaderCustodySyncPayloadOpener,
    private readonly decryptItem: PicoReaderCustodySyncItemDecryptor,
  ) {
    assertSyncPins(pins);
    this.#pins = { ...pins };
  }

  public access(
    packageId: string,
    consumePlaintext: PicoReaderCustodySyncItemPlaintextConsumer,
    options: { signal: AbortSignal },
  ): void {
    try {
      assertAsciiReference(packageId);
    } catch {
      throw new Error('invalid_reader_sync_item_package_id');
    }
    if (typeof consumePlaintext !== 'function') {
      throw new Error('invalid_reader_sync_item_plaintext_consumer');
    }
    throwIfAborted(options.signal);
    if (this.#active) {
      throw new Error('reader_sync_item_access_in_progress');
    }

    this.#active = true;
    let plaintext: string | undefined;
    try {
      const loadedState = this.stateSource.load();
      if (loadedState === undefined) {
        throw new Error('reader_sync_item_access_state_missing');
      }
      assertReaderSyncClientState(loadedState);
      const state = cloneReaderSyncClientState(loadedState);
      if (!readerSyncPinsEqual(state.pins, this.#pins)) {
        throw new Error('reader_sync_item_access_scope_mismatch');
      }

      const restored = this.restoreSource.restore(
        this.#pins,
        state,
        this.openPayload,
      );
      throwIfAborted(options.signal);
      const evidence = selectReaderSyncItemDecryptionEvidence(
        restored,
        this.#pins,
        state,
        packageId,
      );
      assertReaderSyncItemAccessStateUnchanged(
        state,
        this.stateSource.load(),
      );

      plaintext = this.decryptItem(evidence);
      if (typeof plaintext !== 'string') {
        throw new Error('invalid_reader_sync_item_plaintext');
      }
      throwIfAborted(options.signal);
      assertReaderSyncItemAccessStateUnchanged(
        state,
        this.stateSource.load(),
      );

      const consumerResult: unknown = consumePlaintext(plaintext);
      if (isPromiseLike(consumerResult)) {
        throw new Error(
          'reader_sync_item_plaintext_consumer_must_be_synchronous',
        );
      }
      throwIfAborted(options.signal);
    } finally {
      plaintext = undefined;
      this.#active = false;
    }
  }
}

export interface PicoReaderCustodySyncClientApplySuccess {
  ok: true;
  inserted: boolean;
  batchRecord: PicoReaderCustodySyncBatchRecord;
  payload: PicoReaderCustodySyncPayload;
  value: PicoReaderCustodySyncProjectionView;
  state: PicoReaderCustodySyncClientState;
}

export type PicoReaderCustodySyncClientApplyResult =
  | PicoReaderCustodySyncClientApplySuccess
  | { ok: false; reason: PicoReaderCustodySyncProjectionFailure };

export interface PicoReaderCustodySyncRunClient {
  routeRef(): string;
  syncPins(): PicoReaderCustodySyncPins;
  state(): PicoReaderCustodySyncClientState | undefined;
  commitTransportCursor(
    transportCursor: string | null,
  ): PicoReaderCustodySyncClientState;
  apply(input: {
    batchRecord: PicoReaderCustodySyncBatchRecord;
    evaluatedAt?: string;
    transportCursor?: string;
  }): PicoReaderCustodySyncClientApplyResult;
}

export class PicoReaderCustodySyncClient
implements PicoReaderCustodySyncRunClient {
  public constructor(
    private readonly sodium: IdentityVerificationSodium,
    private readonly pins: PicoReaderCustodySyncPins,
    private readonly stateStore: PicoReaderCustodySyncClientStateStore,
    private readonly openPayload: PicoReaderCustodySyncPayloadOpener,
  ) {
    assertSyncPins(pins);
  }

  public routeRef(): string {
    return this.pins.routeRef;
  }

  public syncPins(): PicoReaderCustodySyncPins {
    return { ...this.pins };
  }

  public state(): PicoReaderCustodySyncClientState | undefined {
    const state = this.stateStore.load();
    if (state === undefined) {
      return undefined;
    }
    assertReaderSyncClientState(state);
    if (!readerSyncPinsEqual(state.pins, this.pins)) {
      throw new Error('reader_sync_state_scope_mismatch');
    }
    return cloneReaderSyncClientState(state);
  }

  public commitTransportCursor(
    transportCursor: string | null,
  ): PicoReaderCustodySyncClientState {
    if (transportCursor !== null) {
      assertTransportCursor(transportCursor);
    }
    const currentState = this.state();
    if (currentState === undefined) {
      throw new Error('reader_sync_cursor_without_floor');
    }
    if (currentState.transportCursor === transportCursor) {
      return currentState;
    }

    const nextState: PicoReaderCustodySyncClientState = {
      ...currentState,
      revision: currentState.revision + 1,
      pins: { ...currentState.pins },
      floor: { ...currentState.floor },
      transportCursor,
    };
    this.stateStore.commit(nextState, currentState.revision);
    return cloneReaderSyncClientState(nextState);
  }

  public apply(input: {
    batchRecord: PicoReaderCustodySyncBatchRecord;
    evaluatedAt?: string;
    transportCursor?: string;
  }): PicoReaderCustodySyncClientApplyResult {
    const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
    assertCanonicalInstant(evaluatedAt);
    if (input.transportCursor !== undefined) {
      assertTransportCursor(input.transportCursor);
    }

    const currentState = this.state();

    const payload = this.openPayload({
      batchRecord: input.batchRecord,
      evaluatedAt,
    });
    const projector = new PicoReaderCustodySyncProjector(
      this.sodium,
      this.pins,
      currentState?.floor,
    );
    const projected = projector.accept(payload, evaluatedAt);
    if (!projected.ok) {
      return projected;
    }

    const transportCursor =
      input.transportCursor ?? currentState?.transportCursor ?? null;
    const nextState: PicoReaderCustodySyncClientState = {
      schema: picoReaderCustodySyncClientStateSchema,
      schemaVersion: 1,
      revision: (currentState?.revision ?? 0) + 1,
      pins: { ...this.pins },
      floor: { ...projected.value.floor },
      verifiedAt: evaluatedAt,
      transportCursor,
    };
    if (currentState !== undefined
      && readerSyncFloorsEqual(currentState.floor, nextState.floor)
      && currentState.verifiedAt === nextState.verifiedAt
      && currentState.transportCursor === nextState.transportCursor) {
      return {
        ok: true,
        inserted: false,
        batchRecord: { ...input.batchRecord },
        payload,
        value: cloneProjectionView(projected.value),
        state: cloneReaderSyncClientState(currentState),
      };
    }

    this.stateStore.commit(nextState, currentState?.revision);
    return {
      ok: true,
      inserted: projected.inserted,
      batchRecord: { ...input.batchRecord },
      payload,
      value: cloneProjectionView(projected.value),
      state: cloneReaderSyncClientState(nextState),
    };
  }
}

export const MAX_PICO_READER_CUSTODY_SYNC_RUN_PAGES = 100;
export const MAX_PICO_READER_CUSTODY_SYNC_RUN_BATCHES = 1_000;

export interface PicoReaderCustodySyncProjectionConsumer {
  (
    projection: PicoReaderCustodySyncClientApplySuccess,
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}

export interface PicoReaderCustodySyncRunCounters {
  pagesRead: number;
  batchesRead: number;
  projectionsDelivered: number;
  insertedBatches: number;
  replayedBatches: number;
  obsoleteBatches: number;
}

export type PicoReaderCustodySyncRunResult =
  | {
    ok: true;
    status: 'source_drained' | 'limit_reached';
    startCursor: string | null;
    endCursor: string | null;
    sourceHasMore: boolean;
    counters: PicoReaderCustodySyncRunCounters;
  }
  | {
    ok: false;
    reason: Exclude<PicoReaderCustodySyncProjectionFailure, 'rollback'>;
    failedSyncBatchId: string;
    startCursor: string | null;
    endCursor: string | null;
    sourceHasMore: boolean;
    counters: PicoReaderCustodySyncRunCounters;
  };

export class PicoReaderCustodySyncRunner {
  #running = false;

  public constructor(
    private readonly source: PicoReaderCustodySyncBatchReader,
    private readonly client: PicoReaderCustodySyncRunClient,
    private readonly pendingStore: PicoReaderCustodySyncPendingStore,
    private readonly consumeProjection: PicoReaderCustodySyncProjectionConsumer,
  ) {}

  public async run(
    input: {
      evaluatedAt?: string;
      pageSize?: number;
      maxPages?: number;
      maxBatches?: number;
    },
    options: { signal: AbortSignal },
  ): Promise<PicoReaderCustodySyncRunResult> {
    if (this.#running) {
      throw new Error('reader_sync_run_already_active');
    }

    const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
    assertCanonicalInstant(evaluatedAt);
    const pageSize = input.pageSize ?? 20;
    const maxPages = input.maxPages ?? 10;
    const maxBatches = input.maxBatches ?? 200;
    assertSyncReadLimit(pageSize);
    assertPositiveBoundedInteger(
      maxPages,
      MAX_PICO_READER_CUSTODY_SYNC_RUN_PAGES,
      'invalid_reader_sync_run_page_limit',
    );
    assertPositiveBoundedInteger(
      maxBatches,
      MAX_PICO_READER_CUSTODY_SYNC_RUN_BATCHES,
      'invalid_reader_sync_run_batch_limit',
    );

    this.#running = true;
    try {
      throwIfAborted(options.signal);
      const startCursor =
        this.client.state()?.transportCursor ?? null;
      let endCursor = startCursor;
      const counters: PicoReaderCustodySyncRunCounters = {
        pagesRead: 0,
        batchesRead: 0,
        projectionsDelivered: 0,
        insertedBatches: 0,
        replayedBatches: 0,
        obsoleteBatches: 0,
      };
      let acknowledgedPendingBatch:
        PicoReaderCustodySyncBatchRecord | undefined;

      const resumedPending = this.pendingStore.load();
      if (resumedPending !== undefined) {
        counters.batchesRead += 1;
        const projected = await this.#processPending(
          resumedPending,
          evaluatedAt,
          options,
        );
        if (!projected.ok) {
          if (projected.reason === 'rollback') {
            counters.obsoleteBatches += 1;
            acknowledgedPendingBatch = {
              ...resumedPending.batchRecord,
            };
          } else {
            return {
              ok: false,
              reason: projected.reason,
              failedSyncBatchId:
                resumedPending.batchRecord.syncBatchId,
              startCursor,
              endCursor,
              sourceHasMore: true,
              counters: { ...counters },
            };
          }
        } else {
          acknowledgedPendingBatch = {
            ...resumedPending.batchRecord,
          };
          counters.projectionsDelivered += 1;
          if (projected.inserted) {
            counters.insertedBatches += 1;
          } else {
            counters.replayedBatches += 1;
          }
        }
      }

      while (counters.pagesRead < maxPages
        && counters.batchesRead < maxBatches) {
        throwIfAborted(options.signal);
        const remainingBatches = maxBatches - counters.batchesRead;
        const readLimit = Math.min(pageSize, remainingBatches);
        const page = await this.source.read({
          routeRef: this.client.routeRef(),
          ...(endCursor === null ? {} : { afterCursor: endCursor }),
          limit: readLimit,
          evaluatedAt,
        }, options);
        throwIfAborted(options.signal);
        assertReaderSyncBatchPage(
          page,
          this.client.routeRef(),
          readLimit,
          endCursor,
        );
        counters.pagesRead += 1;

        if (page.batches.length === 0) {
          return {
            ok: true,
            status: 'source_drained',
            startCursor,
            endCursor,
            sourceHasMore: false,
            counters: { ...counters },
          };
        }

        for (const batchRecord of page.batches) {
          throwIfAborted(options.signal);
          counters.batchesRead += 1;
          if (acknowledgedPendingBatch !== undefined
            && readerSyncBatchRecordsEqual(
              acknowledgedPendingBatch,
              batchRecord,
            )) {
            counters.obsoleteBatches += 1;
            acknowledgedPendingBatch = undefined;
            continue;
          }
          const pending: PicoReaderCustodySyncPendingRecord = {
            schema: picoReaderCustodySyncPendingRecordSchema,
            schemaVersion: 1,
            pins: this.client.syncPins(),
            stagedAt: evaluatedAt,
            baseFloor: this.client.state()?.floor ?? null,
            batchRecord,
          };
          this.pendingStore.stage(pending);
          const projected = await this.#processPending(
            pending,
            evaluatedAt,
            options,
          );
          if (!projected.ok) {
            if (projected.reason === 'rollback') {
              counters.obsoleteBatches += 1;
              continue;
            }
            return {
              ok: false,
              reason: projected.reason,
              failedSyncBatchId: batchRecord.syncBatchId,
              startCursor,
              endCursor,
              sourceHasMore: page.hasMore,
              counters: { ...counters },
            };
          }

          counters.projectionsDelivered += 1;
          if (projected.inserted) {
            counters.insertedBatches += 1;
          } else {
            counters.replayedBatches += 1;
          }
        }

        endCursor = this.client.commitTransportCursor(
          page.nextCursor!,
        ).transportCursor;
        if (!page.hasMore) {
          return {
            ok: true,
            status: 'source_drained',
            startCursor,
            endCursor,
            sourceHasMore: false,
            counters: { ...counters },
          };
        }
      }

      return {
        ok: true,
        status: 'limit_reached',
        startCursor,
        endCursor,
        sourceHasMore: true,
        counters: { ...counters },
      };
    } finally {
      this.#running = false;
    }
  }

  async #processPending(
    pending: PicoReaderCustodySyncPendingRecord,
    evaluatedAt: string,
    options: { signal: AbortSignal },
  ): Promise<PicoReaderCustodySyncClientApplyResult> {
    assertReaderSyncPendingRecord(pending);
    if (!readerSyncPinsEqual(pending.pins, this.client.syncPins())) {
      throw new Error('reader_sync_pending_scope_mismatch');
    }
    throwIfAborted(options.signal);

    const currentState = this.client.state();
    const exactDurableReplay = currentState !== undefined
      && pendingMatchesDurableState(pending, currentState);
    if (!exactDurableReplay && evaluatedAt < pending.stagedAt) {
      throw new Error('reader_sync_clock_rollback');
    }
    const projected = this.client.apply({
      batchRecord: pending.batchRecord,
      evaluatedAt: exactDurableReplay
        ? pending.stagedAt
        : evaluatedAt,
    });
    if (!projected.ok) {
      if (projected.reason === 'rollback') {
        this.pendingStore.acknowledge(pending);
      }
      return projected;
    }

    if (exactDurableReplay
      && (projected.inserted
        || currentState === undefined
        || !readerSyncFloorsEqual(
          projected.value.floor,
          currentState.floor,
        ))) {
      throw new Error('reader_sync_pending_floor_mismatch');
    }

    await this.consumeProjection(projected, options);
    throwIfAborted(options.signal);
    this.pendingStore.acknowledge(pending);
    return projected;
  }
}

interface VerifiedReaderSyncPayload {
  manifestDigestHex: string;
  readerStatus: 'active' | 'revoked';
  readerEnvelopeVersions: number[];
}

interface ReaderSyncLifecycleEvidence {
  changedAt: string;
  lifecycleOrder: string;
}

class ReaderSyncVerificationError extends Error {
  public constructor(
    public readonly reason: PicoReaderCustodySyncProjectionFailure,
  ) {
    super(reason);
  }
}

function verifyReaderSyncPayload(
  sodium: IdentityVerificationSodium,
  pins: PicoReaderCustodySyncPins,
  payload: PicoReaderCustodySyncPayload,
  evaluatedAt: string,
): VerifiedReaderSyncPayload {
  try {
    assertCanonicalInstant(evaluatedAt);
    if (!isRuntimeRecord(payload)
      || !hasExactKeys(payload, [
        'schema',
        'manifest',
        'ownerIdentityKeyRecord',
        'ownerSignatureHex',
        'domainRecord',
        'readerGrantRecord',
        'readerGrantLifecycleRecords',
        'writerGrantRecords',
        'writerGrantLifecycleRecords',
        'rotationRecords',
        'itemRecords',
      ])
      || payload.schema !== picoReaderCustodySyncPayloadSchema
      || !isRuntimeRecord(payload.manifest)
      || !isRuntimeRecord(payload.ownerIdentityKeyRecord)
      || !Array.isArray(payload.readerGrantLifecycleRecords)
      || !Array.isArray(payload.writerGrantRecords)
      || !Array.isArray(payload.writerGrantLifecycleRecords)
      || !Array.isArray(payload.rotationRecords)
      || !Array.isArray(payload.itemRecords)
      || payload.readerGrantLifecycleRecords.length
        + payload.writerGrantRecords.length
        + payload.writerGrantLifecycleRecords.length
        + payload.rotationRecords.length
        + payload.itemRecords.length > 9_998) {
      failReaderSync('invalid_payload');
    }
    const manifest = payload.manifest;
    const manifestInput =
      buildPicoReaderCustodySyncManifestSignatureInput(manifest);
    if (manifest.suite !== picoMemoryContentSuite
      || manifest.routeRef !== pins.routeRef
      || manifest.domainAuthorityId !== pins.domainAuthorityId
      || manifest.homeId !== pins.homeId
      || manifest.hostSigningKeyFingerprintHex
        !== pins.hostSigningKeyFingerprintHex
      || manifest.domainId !== pins.domainId
      || manifest.ownerIdentityKeyFingerprintHex
        !== pins.ownerIdentityKeyFingerprintHex
      || manifest.readerGrantId !== pins.readerGrantId
      || manifest.readerKeyFingerprintHex
        !== pins.readerKeyFingerprintHex) {
      failReaderSync('wrong_scope');
    }
    const createdAtMs = Date.parse(manifest.createdAt);
    const expiresAtMs = Date.parse(manifest.expiresAt);
    if (manifest.createdAt > evaluatedAt) {
      failReaderSync('invalid_payload');
    }
    if (evaluatedAt >= manifest.expiresAt) {
      failReaderSync('expired');
    }
    if (expiresAtMs - createdAtMs
      > MAX_PICO_READER_CUSTODY_SYNC_MANIFEST_MS) {
      failReaderSync('invalid_payload');
    }
    if (!verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: payload.ownerIdentityKeyRecord,
      expectedFingerprintHex: pins.ownerIdentityKeyFingerprintHex,
    })
      || payload.ownerIdentityKeyRecord.suite !== picoIdentitySuite
      || payload.ownerIdentityKeyRecord.keyRole !== 'pico_identity'
      || !verifyPicoIdentityDetachedSignature(sodium, {
        publicKeyHex: payload.ownerIdentityKeyRecord.publicKeyHex,
        signatureInput: manifestInput,
        signatureHex: payload.ownerSignatureHex,
      })) {
      failReaderSync('invalid_payload');
    }

    const evidenceRecords = readerSyncEvidenceRecords(payload);
    const references = evidenceRecords.map((record) => ({
      family: record.family,
      recordId: record.recordId,
      recordDigestHex: generichashHex(
        sodium,
        buildPicoReaderCustodySyncRecordDigestInput(record.record),
      ),
    }));
    const evidenceDigestHex = generichashHex(
      sodium,
      buildPicoReaderCustodySyncEvidenceDigestInput(references),
    );
    if (evidenceDigestHex !== manifest.evidenceDigestHex) {
      failReaderSync('invalid_payload');
    }

    verifyReaderSyncDomain(
      sodium,
      pins,
      payload.ownerIdentityKeyRecord,
      payload.domainRecord,
      manifest.createdAt,
    );
    const grant = verifyReaderSyncGrant(
      sodium,
      pins,
      payload,
      evaluatedAt,
    );
    const readerLifecycle = verifyReaderSyncReaderLifecycle(
      sodium,
      payload,
      grant,
      manifest.createdAt,
    );
    const writerGrants = verifyReaderSyncWriters(
      sodium,
      payload,
      manifest,
    );
    const writerLifecycle = verifyReaderSyncWriterLifecycle(
      sodium,
      payload,
      writerGrants,
      manifest.createdAt,
    );
    const lifecycleEntries = [
      ...readerLifecycle.lifecycleById,
      ...writerLifecycle.lifecycleById,
    ] as const;
    const lifecycleById = new Map(lifecycleEntries);
    if (lifecycleById.size !== lifecycleEntries.length) {
      failReaderSync('invalid_payload');
    }
    const rotations = verifyReaderSyncRotations(
      sodium,
      payload,
      grant,
      readerLifecycle.revokedAt,
      lifecycleById,
      manifest.createdAt,
    );
    const readerEnvelopeVersions = new Set<number>(
      grant.envelopes.map((record) => record.envelope.kekVersion),
    );
    for (const rotation of rotations) {
      const envelope = rotation.envelopes.find((record) =>
        record.envelope.grantId === grant.grant.readerGrantId);
      if (envelope !== undefined) {
        readerEnvelopeVersions.add(rotation.rotation.kekVersion);
      }
    }
    if ((rotations.at(-1)?.rotation.kekVersion
        ?? payload.domainRecord.domain.kekVersion)
      !== manifest.throughKekVersion) {
      failReaderSync('invalid_payload');
    }

    verifyReaderSyncItems(
      sodium,
      payload,
      writerGrants,
      writerLifecycle.revokedAtByGrant,
      readerEnvelopeVersions,
      manifest.createdAt,
    );

    const maximumOrder = [
      payload.domainRecord.domain.lifecycleOrder,
      grant.grant.lifecycleOrder,
      ...payload.readerGrantLifecycleRecords
        .map((record) => record.lifecycle.lifecycleOrder),
      ...payload.writerGrantRecords
        .map((record) => record.grant.lifecycleOrder),
      ...payload.writerGrantLifecycleRecords
        .map((record) => record.lifecycle.lifecycleOrder),
      ...rotations.map((record) => record.rotation.lifecycleOrder),
    ].sort().at(-1);
    if (maximumOrder === undefined
      || maximumOrder !== manifest.observedThroughLifecycleOrder) {
      failReaderSync('invalid_payload');
    }

    return {
      manifestDigestHex: generichashHex(sodium, manifestInput),
      readerStatus: readerLifecycle.revokedAt === undefined
        ? 'active'
        : 'revoked',
      readerEnvelopeVersions: [...readerEnvelopeVersions]
        .sort((left, right) => left - right),
    };
  } catch (error) {
    if (error instanceof ReaderSyncVerificationError) {
      throw error;
    }
    failReaderSync('invalid_payload');
  }
}

function verifyReaderSyncDomain(
  sodium: IdentityVerificationSodium,
  pins: PicoReaderCustodySyncPins,
  ownerIdentityKeyRecord:
    PicoReaderCustodySyncPayload['ownerIdentityKeyRecord'],
  record: PicoReaderCustodyDomainRecord,
  throughAt: string,
): void {
  if (!isRuntimeRecord(record)
    || !hasExactKeys(record, [
      'schema',
      'domain',
      'ownerIdentityKeyRecord',
      'ownerReaderKeyRecord',
      'ownerEnvelope',
      'ownerSignatureHex',
      'receivedAt',
    ])
    || record.schema !== picoReaderCustodyDomainRecordSchema
    || !isRuntimeRecord(record.domain)
    || record.domain.suite !== picoMemoryContentSuite
    || record.domain.domainAuthorityId !== pins.domainAuthorityId
    || record.domain.homeId !== pins.homeId
    || record.domain.hostSigningKeyFingerprintHex
      !== pins.hostSigningKeyFingerprintHex
    || record.domain.domainId !== pins.domainId
    || record.domain.ownerIdentityKeyFingerprintHex
      !== pins.ownerIdentityKeyFingerprintHex
    || record.domain.custodyClass !== 'reader_custody'
    || record.domain.authorizedAt > throughAt
    || !sameJson(record.ownerIdentityKeyRecord, ownerIdentityKeyRecord)
    || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: record.ownerReaderKeyRecord,
      expectedFingerprintHex:
        record.domain.ownerReaderKeyFingerprintHex,
    })
    || record.ownerReaderKeyRecord.suite !== picoIdentitySuite
    || record.ownerReaderKeyRecord.keyRole !== 'device_key_agreement'
    || !isCanonicalInstant(record.receivedAt)) {
    failReaderSync('invalid_payload');
  }
  const signatureInput =
    buildPicoReaderCustodyDomainSignatureInput(record.domain);
  if (!verifyPicoIdentityDetachedSignature(sodium, {
    publicKeyHex: ownerIdentityKeyRecord.publicKeyHex,
    signatureInput,
    signatureHex: record.ownerSignatureHex,
  })) {
    failReaderSync('invalid_payload');
  }
  verifyReaderSyncEnvelope(sodium, record.ownerEnvelope, {
    ownerIdentityKeyRecord,
    grantId: record.domain.domainAuthorityId,
    domainId: record.domain.domainId,
    hostSigningKeyFingerprintHex:
      record.domain.hostSigningKeyFingerprintHex,
    ownerIdentityKeyFingerprintHex:
      record.domain.ownerIdentityKeyFingerprintHex,
    readerKeyFingerprintHex:
      record.domain.ownerReaderKeyFingerprintHex,
    kekVersion: record.domain.kekVersion,
    grantedAt: record.domain.authorizedAt,
  });
}

function verifyReaderSyncGrant(
  sodium: IdentityVerificationSodium,
  pins: PicoReaderCustodySyncPins,
  payload: PicoReaderCustodySyncPayload,
  evaluatedAt: string,
): PicoReaderCustodyReaderGrantRecord {
  const record = payload.readerGrantRecord;
  const domain = payload.domainRecord.domain;
  if (!isRuntimeRecord(record)
    || !hasExactKeys(record, [
      'schema',
      'grant',
      'ownerIdentityKeyRecord',
      'readerKeyRecord',
      'envelopes',
      'ownerSignatureHex',
      'receivedAt',
    ])
    || record.schema !== picoReaderCustodyReaderGrantRecordSchema
    || !isRuntimeRecord(record.grant)
    || record.grant.suite !== picoMemoryContentSuite
    || record.grant.readerGrantId !== pins.readerGrantId
    || record.grant.domainAuthorityId !== pins.domainAuthorityId
    || record.grant.homeId !== pins.homeId
    || record.grant.hostSigningKeyFingerprintHex
      !== pins.hostSigningKeyFingerprintHex
    || record.grant.domainId !== pins.domainId
    || record.grant.ownerIdentityKeyFingerprintHex
      !== pins.ownerIdentityKeyFingerprintHex
    || record.grant.readerIdentityKeyFingerprintHex
      !== pins.readerIdentityKeyFingerprintHex
    || record.grant.readerKeyFingerprintHex
      !== pins.readerKeyFingerprintHex
    || !sameJson(
      record.ownerIdentityKeyRecord,
      payload.ownerIdentityKeyRecord,
    )
    || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
      keyRecord: record.readerKeyRecord,
      expectedFingerprintHex: pins.readerKeyFingerprintHex,
    })
    || record.readerKeyRecord.suite !== picoIdentitySuite
    || record.readerKeyRecord.keyRole !== 'device_key_agreement'
    || !Array.isArray(record.envelopes)
    || record.envelopes.length === 0
    || !isCanonicalInstant(record.receivedAt)
    || payload.manifest.createdAt < record.grant.validFrom
    || evaluatedAt >= record.grant.validUntil) {
    failReaderSync('invalid_payload');
  }
  const signatureInput =
    buildPicoReaderCustodyReaderGrantSignatureInput(record.grant);
  if (!verifyPicoIdentityDetachedSignature(sodium, {
    publicKeyHex: payload.ownerIdentityKeyRecord.publicKeyHex,
    signatureInput,
    signatureHex: record.ownerSignatureHex,
  })) {
    failReaderSync('invalid_payload');
  }
  const versions = record.envelopes
    .map((envelope) => envelope.envelope.kekVersion)
    .sort((left, right) => left - right);
  if (versions[0] !== record.grant.firstKekVersion
    || new Set(versions).size !== versions.length
    || versions.some((version, index) =>
      version !== record.grant.firstKekVersion + index)
    || (record.grant.accessMode === 'forward_only'
      && versions.length !== 1)
    || (versions.at(-1) ?? 0) > payload.manifest.throughKekVersion) {
    failReaderSync('invalid_payload');
  }
  for (const envelope of record.envelopes) {
    verifyReaderSyncEnvelope(sodium, envelope, {
      ownerIdentityKeyRecord: payload.ownerIdentityKeyRecord,
      grantId: record.grant.readerGrantId,
      domainId: domain.domainId,
      hostSigningKeyFingerprintHex:
        domain.hostSigningKeyFingerprintHex,
      ownerIdentityKeyFingerprintHex:
        domain.ownerIdentityKeyFingerprintHex,
      readerKeyFingerprintHex: record.grant.readerKeyFingerprintHex,
      kekVersion: envelope.envelope.kekVersion,
      grantedAt: record.grant.validFrom,
    });
  }
  return record;
}

function verifyReaderSyncReaderLifecycle(
  sodium: IdentityVerificationSodium,
  payload: PicoReaderCustodySyncPayload,
  grantRecord: PicoReaderCustodyReaderGrantRecord,
  throughAt: string,
): {
  revokedAt?: string;
  lifecycleById: Map<string, ReaderSyncLifecycleEvidence>;
} {
  const lifecycleIds = new Set<string>();
  const lifecycleById = new Map<string, ReaderSyncLifecycleEvidence>();
  let revokedAt: string | undefined;
  for (const record of payload.readerGrantLifecycleRecords) {
    const lifecycle = record.lifecycle;
    if (!isRuntimeRecord(record)
      || !hasExactKeys(record, [
        'schema',
        'lifecycle',
        'ownerIdentityKeyRecord',
        'ownerSignatureHex',
        'receivedAt',
      ])
      || record.schema
        !== picoReaderCustodyReaderGrantLifecycleRecordSchema
      || !isRuntimeRecord(lifecycle)
      || lifecycleIds.has(lifecycle.lifecycleId)
      || lifecycle.suite !== picoMemoryContentSuite
      || lifecycle.readerGrantId !== grantRecord.grant.readerGrantId
      || lifecycle.domainAuthorityId
        !== payload.domainRecord.domain.domainAuthorityId
      || lifecycle.homeId !== payload.domainRecord.domain.homeId
      || lifecycle.hostSigningKeyFingerprintHex
        !== payload.domainRecord.domain.hostSigningKeyFingerprintHex
      || lifecycle.domainId !== payload.domainRecord.domain.domainId
      || lifecycle.ownerIdentityKeyFingerprintHex
        !== payload.domainRecord.domain.ownerIdentityKeyFingerprintHex
      || lifecycle.readerIdentityKeyFingerprintHex
        !== grantRecord.grant.readerIdentityKeyFingerprintHex
      || lifecycle.readerKeyFingerprintHex
        !== grantRecord.grant.readerKeyFingerprintHex
      || lifecycle.lifecycleOrder <= grantRecord.grant.lifecycleOrder
      || lifecycle.changedAt < grantRecord.grant.validFrom
      || lifecycle.changedAt > throughAt
      || !sameJson(
        record.ownerIdentityKeyRecord,
        payload.ownerIdentityKeyRecord,
      )
      || !isCanonicalInstant(record.receivedAt)) {
      failReaderSync('invalid_payload');
    }
    lifecycleIds.add(lifecycle.lifecycleId);
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: payload.ownerIdentityKeyRecord.publicKeyHex,
      signatureInput:
        buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(
          lifecycle,
        ),
      signatureHex: record.ownerSignatureHex,
    })) {
      failReaderSync('invalid_payload');
    }
    lifecycleById.set(lifecycle.lifecycleId, {
      changedAt: lifecycle.changedAt,
      lifecycleOrder: lifecycle.lifecycleOrder,
    });
    revokedAt = revokedAt === undefined || lifecycle.changedAt < revokedAt
      ? lifecycle.changedAt
      : revokedAt;
  }
  return { revokedAt, lifecycleById };
}

function verifyReaderSyncRotations(
  sodium: IdentityVerificationSodium,
  payload: PicoReaderCustodySyncPayload,
  grantRecord: PicoReaderCustodyReaderGrantRecord,
  revokedAt: string | undefined,
  lifecycleById: ReadonlyMap<string, ReaderSyncLifecycleEvidence>,
  throughAt: string,
): PicoReaderCustodyKekRotationRecord[] {
  const domain = payload.domainRecord.domain;
  const rotations = [...payload.rotationRecords].sort(
    (left, right) =>
      left.rotation.kekVersion - right.rotation.kekVersion,
  );
  const rotationIds = new Set<string>();
  let previousVersion = domain.kekVersion;
  let previousLifecycleOrder = domain.lifecycleOrder;
  let previousRotatedAt = domain.authorizedAt;
  const coveredCauses = new Set<string>();
  for (const record of rotations) {
    const rotation = record.rotation;
    if (!isRuntimeRecord(record)
      || !hasExactKeys(record, [
        'schema',
        'rotation',
        'ownerIdentityKeyRecord',
        'envelopes',
        'ownerSignatureHex',
        'receivedAt',
      ])
      || record.schema !== picoReaderCustodyKekRotationRecordSchema
      || !isRuntimeRecord(rotation)
      || rotationIds.has(rotation.rotationId)
      || rotation.suite !== picoMemoryContentSuite
      || rotation.domainAuthorityId !== domain.domainAuthorityId
      || rotation.homeId !== domain.homeId
      || rotation.hostSigningKeyFingerprintHex
        !== domain.hostSigningKeyFingerprintHex
      || rotation.domainId !== domain.domainId
      || rotation.ownerIdentityKeyFingerprintHex
        !== domain.ownerIdentityKeyFingerprintHex
      || rotation.previousKekVersion !== previousVersion
      || rotation.kekVersion !== previousVersion + 1
      || rotation.lifecycleOrder <= previousLifecycleOrder
      || rotation.rotatedAt < previousRotatedAt
      || rotation.rotatedAt > throughAt
      || rotation.causeLifecycleIds.some((id) =>
        coveredCauses.has(id))
      || !sameJson(
        record.ownerIdentityKeyRecord,
        payload.ownerIdentityKeyRecord,
      )
      || !Array.isArray(record.envelopes)
      || !isCanonicalInstant(record.receivedAt)) {
      failReaderSync('invalid_payload');
    }
    buildPicoReaderCustodyKekRotationSignatureInput(rotation);
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: payload.ownerIdentityKeyRecord.publicKeyHex,
      signatureInput:
        buildPicoReaderCustodyKekRotationSignatureInput(rotation),
      signatureHex: record.ownerSignatureHex,
    })) {
      failReaderSync('invalid_payload');
    }
    rotationIds.add(rotation.rotationId);
    for (const [lifecycleId, evidence] of lifecycleById) {
      if (coveredCauses.has(lifecycleId)) {
        continue;
      }
      if (evidence.lifecycleOrder <= previousLifecycleOrder
        || (evidence.lifecycleOrder < rotation.lifecycleOrder
          && evidence.changedAt > rotation.rotatedAt)) {
        failReaderSync('invalid_payload');
      }
    }
    const actualCauseIds = [...rotation.causeLifecycleIds].sort();
    const requiredCauseIds = [...lifecycleById.entries()]
      .filter(([lifecycleId, evidence]) =>
        !coveredCauses.has(lifecycleId)
        && evidence.lifecycleOrder > previousLifecycleOrder
        && evidence.lifecycleOrder < rotation.lifecycleOrder
        && evidence.changedAt <= rotation.rotatedAt)
      .map(([lifecycleId]) => lifecycleId)
      .sort();
    if (JSON.stringify(actualCauseIds)
      !== JSON.stringify(requiredCauseIds)) {
      failReaderSync('invalid_payload');
    }
    actualCauseIds.forEach((id) => coveredCauses.add(id));

    const expectedGrantIds = [
      rotation.rotationId,
      ...rotation.remainingReaderGrantIds,
    ].sort();
    const actualGrantIds = record.envelopes
      .map((envelope) => envelope.envelope.grantId)
      .sort();
    if (record.envelopes.length !== expectedGrantIds.length
      || new Set(actualGrantIds).size !== actualGrantIds.length
      || JSON.stringify(actualGrantIds)
        !== JSON.stringify(expectedGrantIds)) {
      failReaderSync('invalid_payload');
    }
    for (const envelope of record.envelopes) {
      const isOwner = envelope.envelope.grantId === rotation.rotationId;
      verifyReaderSyncEnvelope(sodium, envelope, {
        ownerIdentityKeyRecord: payload.ownerIdentityKeyRecord,
        grantId: envelope.envelope.grantId,
        domainId: domain.domainId,
        hostSigningKeyFingerprintHex:
          domain.hostSigningKeyFingerprintHex,
        ownerIdentityKeyFingerprintHex:
          domain.ownerIdentityKeyFingerprintHex,
        readerKeyFingerprintHex: isOwner
          ? domain.ownerReaderKeyFingerprintHex
          : envelope.envelope.readerKeyFingerprintHex,
        kekVersion: rotation.kekVersion,
        grantedAt: rotation.rotatedAt,
      });
    }
    const readerWasActive = grantRecord.grant.validFrom <= rotation.rotatedAt
      && grantRecord.grant.validUntil > rotation.rotatedAt
      && (revokedAt === undefined || revokedAt > rotation.rotatedAt);
    const readerNamed = rotation.remainingReaderGrantIds
      .includes(grantRecord.grant.readerGrantId);
    const readerEnvelope = record.envelopes.find((envelope) =>
      envelope.envelope.grantId === grantRecord.grant.readerGrantId);
    if (readerWasActive !== readerNamed
      || readerNamed !== (readerEnvelope !== undefined)) {
      failReaderSync('invalid_payload');
    }
    if (readerEnvelope !== undefined
      && readerEnvelope.envelope.readerKeyFingerprintHex
        !== grantRecord.grant.readerKeyFingerprintHex) {
      failReaderSync('wrong_scope');
    }

    previousVersion = rotation.kekVersion;
    previousLifecycleOrder = rotation.lifecycleOrder;
    previousRotatedAt = rotation.rotatedAt;
  }
  return rotations;
}

function verifyReaderSyncWriters(
  sodium: IdentityVerificationSodium,
  payload: PicoReaderCustodySyncPayload,
  manifest: PicoReaderCustodySyncPayload['manifest'],
): Map<string, PicoReaderCustodyWriterGrantRecord> {
  const domain = payload.domainRecord.domain;
  const grants = new Map<string, PicoReaderCustodyWriterGrantRecord>();
  for (const record of payload.writerGrantRecords) {
    const grant = record.grant;
    if (!isRuntimeRecord(record)
      || !hasExactKeys(record, [
        'schema',
        'grant',
        'ownerIdentityKeyRecord',
        'writerDeviceSigningKeyRecord',
        'ownerSignatureHex',
        'receivedAt',
      ])
      || record.schema !== picoReaderCustodyWriterGrantRecordSchema
      || !isRuntimeRecord(grant)
      || grants.has(grant.writerGrantId)
      || grant.suite !== picoMemoryContentSuite
      || grant.domainAuthorityId !== domain.domainAuthorityId
      || grant.homeId !== domain.homeId
      || grant.hostSigningKeyFingerprintHex
        !== domain.hostSigningKeyFingerprintHex
      || grant.domainId !== domain.domainId
      || grant.kekVersion < domain.kekVersion
      || grant.kekVersion > manifest.throughKekVersion
      || grant.ownerIdentityKeyFingerprintHex
        !== domain.ownerIdentityKeyFingerprintHex
      || !sameJson(
        record.ownerIdentityKeyRecord,
        payload.ownerIdentityKeyRecord,
      )
      || record.writerDeviceSigningKeyRecord.suite !== picoIdentitySuite
      || record.writerDeviceSigningKeyRecord.keyRole !== 'device_signing'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: record.writerDeviceSigningKeyRecord,
        expectedFingerprintHex:
          grant.writerDeviceSigningKeyFingerprintHex,
      })
      || !isCanonicalInstant(record.receivedAt)
      || grant.validFrom > manifest.createdAt) {
      failReaderSync('invalid_payload');
    }
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: payload.ownerIdentityKeyRecord.publicKeyHex,
      signatureInput:
        buildPicoReaderCustodyWriterGrantSignatureInput(grant),
      signatureHex: record.ownerSignatureHex,
    })) {
      failReaderSync('invalid_payload');
    }
    grants.set(grant.writerGrantId, record);
  }
  return grants;
}

function verifyReaderSyncWriterLifecycle(
  sodium: IdentityVerificationSodium,
  payload: PicoReaderCustodySyncPayload,
  grants: ReadonlyMap<string, PicoReaderCustodyWriterGrantRecord>,
  throughAt: string,
): {
  revokedAtByGrant: Map<string, string>;
  lifecycleById: Map<string, ReaderSyncLifecycleEvidence>;
} {
  const revokedAtByGrant = new Map<string, string>();
  const lifecycleById = new Map<string, ReaderSyncLifecycleEvidence>();
  const lifecycleIds = new Set<string>();
  const domain = payload.domainRecord.domain;
  for (const record of payload.writerGrantLifecycleRecords) {
    const lifecycle = record.lifecycle;
    const grantRecord = grants.get(lifecycle.writerGrantId);
    if (!isRuntimeRecord(record)
      || !hasExactKeys(record, [
        'schema',
        'lifecycle',
        'ownerIdentityKeyRecord',
        'ownerSignatureHex',
        'receivedAt',
      ])
      || record.schema
        !== picoReaderCustodyWriterGrantLifecycleRecordSchema
      || !isRuntimeRecord(lifecycle)
      || grantRecord === undefined
      || lifecycleIds.has(lifecycle.lifecycleId)
      || lifecycle.suite !== picoMemoryContentSuite
      || lifecycle.domainAuthorityId !== domain.domainAuthorityId
      || lifecycle.homeId !== domain.homeId
      || lifecycle.hostSigningKeyFingerprintHex
        !== domain.hostSigningKeyFingerprintHex
      || lifecycle.domainId !== domain.domainId
      || lifecycle.ownerIdentityKeyFingerprintHex
        !== domain.ownerIdentityKeyFingerprintHex
      || lifecycle.writerIdentityKeyFingerprintHex
        !== grantRecord.grant.writerIdentityKeyFingerprintHex
      || lifecycle.writerDeviceSigningKeyFingerprintHex
        !== grantRecord.grant.writerDeviceSigningKeyFingerprintHex
      || lifecycle.lifecycleOrder <= grantRecord.grant.lifecycleOrder
      || lifecycle.changedAt < grantRecord.grant.validFrom
      || lifecycle.changedAt > throughAt
      || !sameJson(
        record.ownerIdentityKeyRecord,
        payload.ownerIdentityKeyRecord,
      )
      || !isCanonicalInstant(record.receivedAt)) {
      failReaderSync('invalid_payload');
    }
    lifecycleIds.add(lifecycle.lifecycleId);
    if (!verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: payload.ownerIdentityKeyRecord.publicKeyHex,
      signatureInput:
        buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(
          lifecycle,
        ),
      signatureHex: record.ownerSignatureHex,
    })) {
      failReaderSync('invalid_payload');
    }
    const prior = revokedAtByGrant.get(lifecycle.writerGrantId);
    if (prior === undefined || lifecycle.changedAt < prior) {
      revokedAtByGrant.set(
        lifecycle.writerGrantId,
        lifecycle.changedAt,
      );
    }
    lifecycleById.set(lifecycle.lifecycleId, {
      changedAt: lifecycle.changedAt,
      lifecycleOrder: lifecycle.lifecycleOrder,
    });
  }
  return { revokedAtByGrant, lifecycleById };
}

function verifyReaderSyncItems(
  sodium: IdentityVerificationSodium,
  payload: PicoReaderCustodySyncPayload,
  grants: ReadonlyMap<string, PicoReaderCustodyWriterGrantRecord>,
  revokedAtByGrant: ReadonlyMap<string, string>,
  readerEnvelopeVersions: ReadonlySet<number>,
  throughAt: string,
): void {
  const domain = payload.domainRecord.domain;
  const packageIds = new Set<string>();
  const memoryItemIds = new Set<string>();
  for (const record of payload.itemRecords) {
    const item = record.item;
    const grantRecord = grants.get(item.writerGrantId);
    if (!isRuntimeRecord(record)
      || !hasExactKeys(record, [
        'schema',
        'item',
        'contentCiphertextHex',
        'wrappedDekHex',
        'writerDeviceSigningKeyRecord',
        'writerSignatureHex',
        'receivedAt',
      ])
      || record.schema !== picoReaderCustodyItemRecordSchema
      || !isRuntimeRecord(item)
      || grantRecord === undefined
      || packageIds.has(item.packageId)
      || memoryItemIds.has(item.memoryItemId)
      || item.suite !== picoMemoryContentSuite
      || item.domainAuthorityId !== domain.domainAuthorityId
      || item.homeId !== domain.homeId
      || item.hostSigningKeyFingerprintHex
        !== domain.hostSigningKeyFingerprintHex
      || item.domainId !== domain.domainId
      || item.kekVersion !== grantRecord.grant.kekVersion
      || item.writerIdentityKeyFingerprintHex
        !== grantRecord.grant.writerIdentityKeyFingerprintHex
      || item.writerDeviceSigningKeyFingerprintHex
        !== grantRecord.grant.writerDeviceSigningKeyFingerprintHex
      || item.createdAt < grantRecord.grant.validFrom
      || item.createdAt >= grantRecord.grant.validUntil
      || item.createdAt > throughAt
      || (revokedAtByGrant.get(item.writerGrantId) ?? '9999') <= item.createdAt
      || !readerEnvelopeVersions.has(item.kekVersion)
      || !sameJson(
        record.writerDeviceSigningKeyRecord,
        grantRecord.writerDeviceSigningKeyRecord,
      )
      || !isCanonicalInstant(record.receivedAt)
      || !isCanonicalHex(record.contentCiphertextHex)
      || !isCanonicalHex(record.wrappedDekHex)) {
      failReaderSync('invalid_payload');
    }
    packageIds.add(item.packageId);
    memoryItemIds.add(item.memoryItemId);
    buildPicoReaderCustodyItemSignatureInput(item);
    if (generichashHex(sodium, hexToBytes(record.contentCiphertextHex))
        !== item.contentCiphertextDigestHex
      || generichashHex(sodium, hexToBytes(record.wrappedDekHex))
        !== item.wrappedDekDigestHex
      || !verifyPicoIdentityDetachedSignature(sodium, {
        publicKeyHex:
          record.writerDeviceSigningKeyRecord.publicKeyHex,
        signatureInput: buildPicoReaderCustodyItemSignatureInput(item),
        signatureHex: record.writerSignatureHex,
      })) {
      failReaderSync('invalid_payload');
    }
  }
}

function verifyReaderSyncEnvelope(
  sodium: IdentityVerificationSodium,
  record: PicoShareEnvelopeRecord,
  expected: {
    ownerIdentityKeyRecord:
      PicoReaderCustodySyncPayload['ownerIdentityKeyRecord'];
    grantId: string;
    domainId: string;
    hostSigningKeyFingerprintHex: string;
    ownerIdentityKeyFingerprintHex: string;
    readerKeyFingerprintHex: string;
    kekVersion: number;
    grantedAt: string;
  },
): void {
  const envelope = record.envelope;
  if (!isRuntimeRecord(record)
    || !hasExactKeys(record, [
      'schema',
      'envelope',
      'sealedWrapHex',
      'issuerIdentityKeyRecord',
      'issuerSignatureHex',
      'createdAt',
    ])
    || record.schema !== picoShareEnvelopeRecordSchema
    || !isRuntimeRecord(envelope)
    || envelope.suite !== picoShareSuite
    || envelope.grantId !== expected.grantId
    || envelope.domainId !== expected.domainId
    || envelope.kekVersion !== expected.kekVersion
    || envelope.hostSigningKeyFingerprintHex
      !== expected.hostSigningKeyFingerprintHex
    || envelope.issuerIdentityKeyFingerprintHex
      !== expected.ownerIdentityKeyFingerprintHex
    || envelope.readerKeyFingerprintHex
      !== expected.readerKeyFingerprintHex
    || envelope.grantedAt !== expected.grantedAt
    || !sameJson(
      record.issuerIdentityKeyRecord,
      expected.ownerIdentityKeyRecord,
    )
    || !isCanonicalInstant(record.createdAt)
    || !isCanonicalHex(record.sealedWrapHex)) {
    failReaderSync('invalid_payload');
  }
  buildPicoShareEnvelopeSignatureInput(envelope);
  if (generichashHex(sodium, hexToBytes(record.sealedWrapHex))
      !== envelope.wrapDigestHex
    || !verifyPicoIdentityDetachedSignature(sodium, {
      publicKeyHex: expected.ownerIdentityKeyRecord.publicKeyHex,
      signatureInput: buildPicoShareEnvelopeSignatureInput(envelope),
      signatureHex: record.issuerSignatureHex,
    })) {
    failReaderSync('invalid_payload');
  }
}

interface ReaderSyncEvidenceRecord {
  family: PicoReaderCustodySyncEvidenceReference['family'];
  recordId: string;
  record: unknown;
}

function readerSyncEvidenceRecords(
  payload: PicoReaderCustodySyncPayload,
): ReaderSyncEvidenceRecord[] {
  return [
    {
      family: 'domain',
      recordId: payload.domainRecord.domain.domainAuthorityId,
      record: payload.domainRecord,
    },
    {
      family: 'reader_grant',
      recordId: payload.readerGrantRecord.grant.readerGrantId,
      record: payload.readerGrantRecord,
    },
    ...payload.readerGrantLifecycleRecords.map((record) => ({
      family: 'reader_grant_lifecycle' as const,
      recordId: record.lifecycle.lifecycleId,
      record,
    })),
    ...payload.writerGrantRecords.map((record) => ({
      family: 'writer_grant' as const,
      recordId: record.grant.writerGrantId,
      record,
    })),
    ...payload.writerGrantLifecycleRecords.map((record) => ({
      family: 'writer_grant_lifecycle' as const,
      recordId: record.lifecycle.lifecycleId,
      record,
    })),
    ...payload.rotationRecords.map((record) => ({
      family: 'kek_rotation' as const,
      recordId: record.rotation.rotationId,
      record,
    })),
    ...payload.itemRecords.map((record) => ({
      family: 'item' as const,
      recordId: record.item.packageId,
      record,
    })),
  ];
}

function projectionView(
  payload: PicoReaderCustodySyncPayload,
  verified: VerifiedReaderSyncPayload,
): PicoReaderCustodySyncProjectionView {
  return {
    floor: {
      routeRef: payload.manifest.routeRef,
      syncBatchId: payload.manifest.syncBatchId,
      sequence: payload.manifest.sequence,
      manifestDigestHex: verified.manifestDigestHex,
      throughKekVersion: payload.manifest.throughKekVersion,
      observedThroughLifecycleOrder:
        payload.manifest.observedThroughLifecycleOrder,
      createdAt: payload.manifest.createdAt,
    },
    readerStatus: verified.readerStatus,
    readerEnvelopeVersions: [...verified.readerEnvelopeVersions],
    writerGrantIds: payload.writerGrantRecords
      .map((record) => record.grant.writerGrantId)
      .sort(),
    itemPackageIds: payload.itemRecords
      .map((record) => record.item.packageId)
      .sort(),
  };
}

function cloneProjectionView(
  view: PicoReaderCustodySyncProjectionView,
): PicoReaderCustodySyncProjectionView {
  return {
    floor: { ...view.floor },
    readerStatus: view.readerStatus,
    readerEnvelopeVersions: [...view.readerEnvelopeVersions],
    writerGrantIds: [...view.writerGrantIds],
    itemPackageIds: [...view.itemPackageIds],
  };
}

function assertOpaquePublication(
  publication: PicoSyncOpaquePublication,
): void {
  assertRouteRef(publication.routeRef);
  assertAsciiReference(publication.objectId);
  assertCanonicalInstant(publication.expiresAt);
  if (!(publication.payload instanceof Uint8Array)
    || publication.payload.byteLength < 1
    || publication.payload.byteLength > MAX_PICO_SYNC_OPAQUE_PAYLOAD_BYTES) {
    throw new Error('invalid_sync_payload_size');
  }
}

function assertSyncPins(pins: PicoReaderCustodySyncPins): void {
  assertRouteRef(pins.routeRef);
  assertAsciiReference(pins.domainAuthorityId);
  assertAsciiReference(pins.homeId);
  assertHexFingerprint(pins.hostSigningKeyFingerprintHex);
  assertAsciiReference(pins.domainId);
  assertHexFingerprint(pins.ownerIdentityKeyFingerprintHex);
  assertAsciiReference(pins.readerGrantId);
  assertHexFingerprint(pins.readerIdentityKeyFingerprintHex);
  assertHexFingerprint(pins.readerKeyFingerprintHex);
}

function assertSyncFloor(floor: PicoReaderCustodySyncFloor): void {
  assertRouteRef(floor.routeRef);
  assertAsciiReference(floor.syncBatchId);
  if (!Number.isSafeInteger(floor.sequence) || floor.sequence < 1
    || !Number.isSafeInteger(floor.throughKekVersion)
    || floor.throughKekVersion < 1) {
    throw new Error('invalid_sync_floor');
  }
  assertDigest(floor.manifestDigestHex);
  assertLifecycleOrder(floor.observedThroughLifecycleOrder);
  assertCanonicalInstant(floor.createdAt);
}

function parseReaderSyncClientState(
  serialized: string,
): PicoReaderCustodySyncClientState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error('invalid_reader_sync_state', { cause: error });
  }
  assertReaderSyncClientState(parsed);
  return cloneReaderSyncClientState(parsed);
}

function parseReaderSyncPendingRecord(
  serialized: string,
): PicoReaderCustodySyncPendingRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error('invalid_reader_sync_pending', { cause: error });
  }
  assertReaderSyncPendingRecord(parsed);
  return cloneReaderSyncPendingRecord(parsed);
}

function parseReaderSyncProtectedProjectionArchive(
  sodium: IdentityVerificationSodium,
  serialized: string,
  routeRef: string,
  maxRecords: number,
): PicoReaderCustodySyncProtectedProjectionArchive {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error('invalid_reader_sync_projection_archive', {
      cause: error,
    });
  }
  assertReaderSyncProtectedProjectionArchive(
    sodium,
    parsed,
    routeRef,
    maxRecords,
  );
  return cloneReaderSyncProtectedProjectionArchive(parsed);
}

function assertReaderSyncProtectedProjectionArchive(
  sodium: IdentityVerificationSodium,
  archive: unknown,
  routeRef: string,
  maxRecords: number,
): asserts archive is PicoReaderCustodySyncProtectedProjectionArchive {
  if (!isUnknownRecord(archive)
    || !hasExactKeys(archive, [
      'schema',
      'schemaVersion',
      'routeRef',
      'records',
    ])
    || archive.schema
      !== picoReaderCustodySyncProtectedProjectionArchiveSchema
    || archive.schemaVersion !== 1
    || archive.routeRef !== routeRef
    || !Array.isArray(archive.records)
    || archive.records.length < 1
    || archive.records.length > maxRecords) {
    throw new Error('invalid_reader_sync_projection_archive');
  }

  let previousManifestDigestHex =
    PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX;
  for (const [index, candidate] of archive.records.entries()) {
    assertReaderSyncProtectedProjectionRecord(
      sodium,
      candidate,
      routeRef,
    );
    if (candidate.receipt.sequence !== index + 1
      || candidate.receipt.previousManifestDigestHex
        !== previousManifestDigestHex) {
      throw new Error('invalid_reader_sync_projection_archive');
    }
    previousManifestDigestHex = candidate.receipt.manifestDigestHex;
  }
}

function assertReaderSyncProtectedProjectionRecord(
  sodium: IdentityVerificationSodium,
  record: unknown,
  routeRef: string,
): asserts record is PicoReaderCustodySyncProtectedProjectionRecord {
  if (!isUnknownRecord(record)
    || !hasExactKeys(record, [
      'schema',
      'schemaVersion',
      'receipt',
      'batchRecord',
    ])
    || record.schema
      !== picoReaderCustodySyncProtectedProjectionRecordSchema
    || record.schemaVersion !== 1
    || !isUnknownRecord(record.receipt)
    || !hasExactKeys(record.receipt, [
      'schema',
      'routeRef',
      'syncBatchId',
      'sequence',
      'manifestDigestHex',
      'previousManifestDigestHex',
      'verifiedAt',
    ])
    || record.receipt.schema
      !== picoReaderCustodySyncProjectionReceiptSchema
    || record.receipt.routeRef !== routeRef
    || typeof record.receipt.syncBatchId !== 'string'
    || !Number.isSafeInteger(record.receipt.sequence)
    || (record.receipt.sequence as number) < 1
    || typeof record.receipt.manifestDigestHex !== 'string'
    || typeof record.receipt.previousManifestDigestHex !== 'string'
    || typeof record.receipt.verifiedAt !== 'string'
    || !isUnknownRecord(record.batchRecord)
    || !hasExactKeys(record.batchRecord, [
      'schema',
      'routeRef',
      'syncBatchId',
      'sealedPayloadHex',
      'sealedPayloadDigestHex',
      'expiresAt',
    ])) {
    throw new Error('invalid_reader_sync_projection_archive');
  }
  const receipt = record.receipt as unknown as
    PicoReaderCustodySyncProjectionReceipt;
  const batch = record.batchRecord as unknown as
    PicoReaderCustodySyncBatchRecord;
  assertAsciiReference(receipt.syncBatchId);
  assertDigest(receipt.manifestDigestHex);
  assertDigest(receipt.previousManifestDigestHex);
  assertCanonicalInstant(receipt.verifiedAt);
  assertProtectedProjectionBatchRecord(sodium, batch, routeRef);
  if (batch.syncBatchId !== receipt.syncBatchId
    || receipt.verifiedAt >= batch.expiresAt) {
    throw new Error('invalid_reader_sync_projection_archive');
  }
}

function assertProtectedProjectionBatchRecord(
  sodium: IdentityVerificationSodium,
  batch: PicoReaderCustodySyncBatchRecord,
  routeRef: string,
): void {
  if (batch.schema !== picoReaderCustodySyncBatchRecordSchema
    || batch.routeRef !== routeRef
    || typeof batch.syncBatchId !== 'string'
    || typeof batch.sealedPayloadHex !== 'string'
    || typeof batch.sealedPayloadDigestHex !== 'string'
    || typeof batch.expiresAt !== 'string'
    || !isCanonicalHex(batch.sealedPayloadHex)
    || batch.sealedPayloadHex.length / 2
      > MAX_PICO_READER_CUSTODY_SYNC_SEALED_PAYLOAD_BYTES) {
    throw new Error('invalid_reader_sync_projection_archive');
  }
  assertAsciiReference(batch.syncBatchId);
  assertDigest(batch.sealedPayloadDigestHex);
  assertCanonicalInstant(batch.expiresAt);
  if (generichashHex(sodium, hexToBytes(batch.sealedPayloadHex))
    !== batch.sealedPayloadDigestHex) {
    throw new Error('invalid_reader_sync_projection_archive');
  }
}

function protectedProjectionRecordFromApplySuccess(
  sodium: IdentityVerificationSodium,
  projection: PicoReaderCustodySyncClientApplySuccess,
): PicoReaderCustodySyncProtectedProjectionRecord {
  try {
    if (!isUnknownRecord(projection)
      || !hasExactKeys(projection, [
        'ok',
        'inserted',
        'batchRecord',
        'payload',
        'value',
        'state',
      ])
      || projection.ok !== true
      || typeof projection.inserted !== 'boolean'
      || !isUnknownRecord(projection.payload)
      || projection.payload.schema !== picoReaderCustodySyncPayloadSchema
      || !isUnknownRecord(projection.payload.manifest)
      || !isUnknownRecord(projection.value)
      || !isUnknownRecord(projection.value.floor)) {
      throw new Error('invalid_projection');
    }
    assertReaderSyncClientState(projection.state);
    assertSyncFloor(projection.value.floor);
    const floor = projection.value.floor;
    const manifest = projection.payload.manifest;
    const batch = projection.batchRecord;
    assertProtectedProjectionBatchRecord(
      sodium,
      batch,
      floor.routeRef,
    );
    const manifestDigestHex = generichashHex(
      sodium,
      buildPicoReaderCustodySyncManifestSignatureInput(manifest),
    );
    if (!readerSyncFloorsEqual(projection.state.floor, floor)
      || manifest.routeRef !== floor.routeRef
      || manifest.domainAuthorityId
        !== projection.state.pins.domainAuthorityId
      || manifest.homeId !== projection.state.pins.homeId
      || manifest.hostSigningKeyFingerprintHex
        !== projection.state.pins.hostSigningKeyFingerprintHex
      || manifest.domainId !== projection.state.pins.domainId
      || manifest.ownerIdentityKeyFingerprintHex
        !== projection.state.pins.ownerIdentityKeyFingerprintHex
      || manifest.readerGrantId
        !== projection.state.pins.readerGrantId
      || manifest.readerKeyFingerprintHex
        !== projection.state.pins.readerKeyFingerprintHex
      || manifest.syncBatchId !== floor.syncBatchId
      || manifest.sequence !== floor.sequence
      || manifestDigestHex !== floor.manifestDigestHex
      || manifest.throughKekVersion !== floor.throughKekVersion
      || manifest.observedThroughLifecycleOrder
        !== floor.observedThroughLifecycleOrder
      || manifest.createdAt !== floor.createdAt
      || batch.routeRef !== manifest.routeRef
      || batch.syncBatchId !== manifest.syncBatchId
      || batch.expiresAt !== manifest.expiresAt
      || projection.state.verifiedAt >= batch.expiresAt) {
      throw new Error('invalid_projection');
    }
    return {
      schema: picoReaderCustodySyncProtectedProjectionRecordSchema,
      schemaVersion: 1,
      receipt: {
        schema: picoReaderCustodySyncProjectionReceiptSchema,
        routeRef: floor.routeRef,
        syncBatchId: floor.syncBatchId,
        sequence: floor.sequence,
        manifestDigestHex: floor.manifestDigestHex,
        previousManifestDigestHex:
          manifest.previousManifestDigestHex,
        verifiedAt: projection.state.verifiedAt,
      },
      batchRecord: { ...batch },
    };
  } catch (error) {
    throw new Error('invalid_reader_sync_projection_materialization', {
      cause: error,
    });
  }
}

function assertReaderSyncPendingRecord(
  pending: unknown,
): asserts pending is PicoReaderCustodySyncPendingRecord {
  if (!isUnknownRecord(pending)
    || !hasExactKeys(pending, [
      'schema',
      'schemaVersion',
      'pins',
      'stagedAt',
      'baseFloor',
      'batchRecord',
    ])
    || pending.schema !== picoReaderCustodySyncPendingRecordSchema
    || pending.schemaVersion !== 1
    || typeof pending.stagedAt !== 'string'
    || !isUnknownRecord(pending.pins)
    || !hasExactKeys(pending.pins, [
      'routeRef',
      'domainAuthorityId',
      'homeId',
      'hostSigningKeyFingerprintHex',
      'domainId',
      'ownerIdentityKeyFingerprintHex',
      'readerGrantId',
      'readerIdentityKeyFingerprintHex',
      'readerKeyFingerprintHex',
    ])
    || (pending.baseFloor !== null
      && (!isUnknownRecord(pending.baseFloor)
        || !hasExactKeys(pending.baseFloor, [
          'routeRef',
          'syncBatchId',
          'sequence',
          'manifestDigestHex',
          'throughKekVersion',
          'observedThroughLifecycleOrder',
          'createdAt',
        ])))
    || !isUnknownRecord(pending.batchRecord)
    || !hasExactKeys(pending.batchRecord, [
      'schema',
      'routeRef',
      'syncBatchId',
      'sealedPayloadHex',
      'sealedPayloadDigestHex',
      'expiresAt',
    ])) {
    throw new Error('invalid_reader_sync_pending');
  }

  const pins = pending.pins as unknown as PicoReaderCustodySyncPins;
  const baseFloor = pending.baseFloor as
    PicoReaderCustodySyncFloor | null;
  const batch =
    pending.batchRecord as unknown as PicoReaderCustodySyncBatchRecord;
  assertSyncPins(pins);
  assertCanonicalInstant(pending.stagedAt);
  if (baseFloor !== null) {
    assertSyncFloor(baseFloor);
    if (baseFloor.routeRef !== pins.routeRef) {
      throw new Error('reader_sync_pending_scope_mismatch');
    }
  }
  if (batch.schema !== picoReaderCustodySyncBatchRecordSchema
    || typeof batch.routeRef !== 'string'
    || batch.routeRef !== pins.routeRef
    || typeof batch.syncBatchId !== 'string'
    || typeof batch.sealedPayloadHex !== 'string'
    || typeof batch.sealedPayloadDigestHex !== 'string'
    || typeof batch.expiresAt !== 'string'
    || !isCanonicalHex(batch.sealedPayloadHex)
    || batch.sealedPayloadHex.length / 2
      > MAX_PICO_READER_CUSTODY_SYNC_SEALED_PAYLOAD_BYTES) {
    throw new Error('invalid_reader_sync_pending');
  }
  assertAsciiReference(batch.syncBatchId);
  assertDigest(batch.sealedPayloadDigestHex);
  assertCanonicalInstant(batch.expiresAt);
  if (pending.stagedAt >= batch.expiresAt) {
    throw new Error('reader_sync_pending_expired_at_stage');
  }
}

function assertReaderSyncClientState(
  state: unknown,
): asserts state is PicoReaderCustodySyncClientState {
  if (!isUnknownRecord(state)
    || !hasExactKeys(state, [
      'schema',
      'schemaVersion',
      'revision',
      'pins',
      'floor',
      'verifiedAt',
      'transportCursor',
    ])
    || state.schema !== picoReaderCustodySyncClientStateSchema
    || state.schemaVersion !== 1
    || !Number.isSafeInteger(state.revision)
    || (state.revision as number) < 1
    || !isUnknownRecord(state.pins)
    || !hasExactKeys(state.pins, [
      'routeRef',
      'domainAuthorityId',
      'homeId',
      'hostSigningKeyFingerprintHex',
      'domainId',
      'ownerIdentityKeyFingerprintHex',
      'readerGrantId',
      'readerIdentityKeyFingerprintHex',
      'readerKeyFingerprintHex',
    ])
    || !isUnknownRecord(state.floor)
    || !hasExactKeys(state.floor, [
      'routeRef',
      'syncBatchId',
      'sequence',
      'manifestDigestHex',
      'throughKekVersion',
        'observedThroughLifecycleOrder',
        'createdAt',
      ])
    || typeof state.verifiedAt !== 'string'
    || (state.transportCursor !== null
      && typeof state.transportCursor !== 'string')) {
    throw new Error('invalid_reader_sync_state');
  }

  const pins = state.pins as unknown as PicoReaderCustodySyncPins;
  const floor = state.floor as unknown as PicoReaderCustodySyncFloor;
  assertSyncPins(pins);
  assertSyncFloor(floor);
  assertCanonicalInstant(state.verifiedAt);
  if (floor.routeRef !== pins.routeRef) {
    throw new Error('reader_sync_state_scope_mismatch');
  }
  if (state.verifiedAt < floor.createdAt) {
    throw new Error('invalid_reader_sync_state_verified_at');
  }
  if (typeof state.transportCursor === 'string') {
    assertTransportCursor(state.transportCursor);
  }
}

function assertReaderSyncStateTransition(
  currentState: PicoReaderCustodySyncClientState | undefined,
  nextState: PicoReaderCustodySyncClientState,
  expectedRevision: number | undefined,
): void {
  if (currentState?.revision !== expectedRevision) {
    throw new Error('reader_sync_state_stale_revision');
  }
  if (nextState.revision !== (currentState?.revision ?? 0) + 1) {
    throw new Error('invalid_reader_sync_state_revision');
  }
  if (currentState === undefined) {
    if (nextState.floor.sequence !== 1) {
      throw new Error('invalid_reader_sync_state_initial_floor');
    }
    return;
  }
  if (!readerSyncPinsEqual(currentState.pins, nextState.pins)) {
    throw new Error('reader_sync_state_scope_mismatch');
  }

  const currentFloor = currentState.floor;
  const nextFloor = nextState.floor;
  if (nextState.verifiedAt < currentState.verifiedAt) {
    throw new Error('reader_sync_state_verified_at_rollback');
  }
  if (nextFloor.sequence === currentFloor.sequence) {
    if (!readerSyncFloorsEqual(currentFloor, nextFloor)) {
      throw new Error('reader_sync_state_floor_fork');
    }
    return;
  }
  if (nextFloor.sequence !== currentFloor.sequence + 1) {
    throw new Error('reader_sync_state_floor_not_contiguous');
  }
  if (nextFloor.routeRef !== currentFloor.routeRef
    || nextFloor.throughKekVersion < currentFloor.throughKekVersion
    || nextFloor.observedThroughLifecycleOrder
      < currentFloor.observedThroughLifecycleOrder
    || nextFloor.createdAt < currentFloor.createdAt) {
    throw new Error('reader_sync_state_floor_rollback');
  }
}

function selectReaderSyncItemDecryptionEvidence(
  restored: readonly PicoReaderCustodySyncRestoredProjection[],
  pins: PicoReaderCustodySyncPins,
  state: PicoReaderCustodySyncClientState,
  packageId: string,
): PicoReaderCustodySyncItemDecryptionEvidence {
  const head = restored.at(-1);
  if (head === undefined
    || !readerSyncFloorsEqual(head.value.floor, state.floor)
    || head.receipt.routeRef !== pins.routeRef
    || head.receipt.sequence !== state.floor.sequence
    || head.receipt.syncBatchId !== state.floor.syncBatchId
    || head.receipt.manifestDigestHex
      !== state.floor.manifestDigestHex) {
    throw new Error('reader_sync_item_access_state_mismatch');
  }

  const historicalMatches: PicoReaderCustodyItemRecord[] = [];
  for (const projection of restored) {
    const projectionMatches = projection.payload.itemRecords.filter(
      (record) => record.item.packageId === packageId,
    );
    if (projectionMatches.length > 1) {
      throw new Error('reader_sync_item_evidence_ambiguous');
    }
    historicalMatches.push(...projectionMatches);
  }
  const currentMatches = head.payload.itemRecords.filter(
    (record) => record.item.packageId === packageId,
  );
  if (currentMatches.length === 0) {
    if (historicalMatches.length > 0) {
      throw new Error('reader_sync_item_evidence_stale');
    }
    throw new Error('reader_sync_item_not_found');
  }
  if (currentMatches.length > 1
    || head.value.itemPackageIds.filter(
      (candidate) => candidate === packageId,
    ).length !== 1) {
    throw new Error('reader_sync_item_evidence_ambiguous');
  }

  const itemRecord = currentMatches[0]!;
  if (historicalMatches.some(
    (record) => !sameJson(record, itemRecord),
  )) {
    throw new Error('reader_sync_item_evidence_fork');
  }
  const writerGrantRecords = head.payload.writerGrantRecords.filter(
    (record) =>
      record.grant.writerGrantId === itemRecord.item.writerGrantId,
  );
  if (writerGrantRecords.length !== 1) {
    throw new Error('reader_sync_item_writer_evidence_ambiguous');
  }
  const writerGrantRecord = writerGrantRecords[0]!;
  const domain = head.payload.domainRecord.domain;
  const readerGrant = head.payload.readerGrantRecord.grant;
  const writerGrant = writerGrantRecord.grant;
  const item = itemRecord.item;
  if (domain.domainAuthorityId !== pins.domainAuthorityId
    || domain.homeId !== pins.homeId
    || domain.hostSigningKeyFingerprintHex
      !== pins.hostSigningKeyFingerprintHex
    || domain.domainId !== pins.domainId
    || domain.ownerIdentityKeyFingerprintHex
      !== pins.ownerIdentityKeyFingerprintHex
    || readerGrant.readerGrantId !== pins.readerGrantId
    || readerGrant.readerIdentityKeyFingerprintHex
      !== pins.readerIdentityKeyFingerprintHex
    || readerGrant.readerKeyFingerprintHex
      !== pins.readerKeyFingerprintHex
    || readerGrant.domainAuthorityId !== domain.domainAuthorityId
    || readerGrant.homeId !== domain.homeId
    || readerGrant.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || readerGrant.domainId !== domain.domainId
    || writerGrant.domainAuthorityId !== domain.domainAuthorityId
    || writerGrant.homeId !== domain.homeId
    || writerGrant.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || writerGrant.domainId !== domain.domainId
    || item.domainAuthorityId !== domain.domainAuthorityId
    || item.homeId !== domain.homeId
    || item.hostSigningKeyFingerprintHex
      !== domain.hostSigningKeyFingerprintHex
    || item.domainId !== domain.domainId
    || item.writerGrantId !== writerGrant.writerGrantId
    || item.writerIdentityKeyFingerprintHex
      !== writerGrant.writerIdentityKeyFingerprintHex
    || item.writerDeviceSigningKeyFingerprintHex
      !== writerGrant.writerDeviceSigningKeyFingerprintHex
    || item.kekVersion !== writerGrant.kekVersion
    || !head.value.readerEnvelopeVersions.includes(item.kekVersion)) {
    throw new Error('invalid_reader_sync_item_evidence');
  }

  return {
    receipt: cloneReaderSyncProjectionReceipt(head.receipt),
    domainRecord: structuredClone(head.payload.domainRecord),
    readerGrantRecord:
      structuredClone(head.payload.readerGrantRecord),
    readerGrantLifecycleRecords:
      structuredClone(head.payload.readerGrantLifecycleRecords),
    writerGrantRecord: structuredClone(writerGrantRecord),
    writerGrantLifecycleRecords: structuredClone(
      head.payload.writerGrantLifecycleRecords.filter(
        (record) =>
          record.lifecycle.writerGrantId === writerGrant.writerGrantId,
      ),
    ),
    rotationRecords: structuredClone(head.payload.rotationRecords),
    itemRecord: structuredClone(itemRecord),
  };
}

function assertReaderSyncItemAccessStateUnchanged(
  expected: PicoReaderCustodySyncClientState,
  actual: PicoReaderCustodySyncClientState | undefined,
): void {
  if (actual === undefined) {
    throw new Error('reader_sync_item_access_state_missing');
  }
  assertReaderSyncClientState(actual);
  if (!readerSyncClientStatesEqual(expected, actual)) {
    throw new Error('reader_sync_item_access_state_changed');
  }
}

function readerSyncClientStatesEqual(
  left: PicoReaderCustodySyncClientState,
  right: PicoReaderCustodySyncClientState,
): boolean {
  return left.schema === right.schema
    && left.schemaVersion === right.schemaVersion
    && left.revision === right.revision
    && readerSyncPinsEqual(left.pins, right.pins)
    && readerSyncFloorsEqual(left.floor, right.floor)
    && left.verifiedAt === right.verifiedAt
    && left.transportCursor === right.transportCursor;
}

function cloneReaderSyncClientState(
  state: PicoReaderCustodySyncClientState,
): PicoReaderCustodySyncClientState {
  return {
    schema: picoReaderCustodySyncClientStateSchema,
    schemaVersion: 1,
    revision: state.revision,
    pins: { ...state.pins },
    floor: { ...state.floor },
    verifiedAt: state.verifiedAt,
    transportCursor: state.transportCursor,
  };
}

function cloneReaderSyncPendingRecord(
  pending: PicoReaderCustodySyncPendingRecord,
): PicoReaderCustodySyncPendingRecord {
  return {
    schema: picoReaderCustodySyncPendingRecordSchema,
    schemaVersion: 1,
    pins: { ...pending.pins },
    stagedAt: pending.stagedAt,
    baseFloor:
      pending.baseFloor === null ? null : { ...pending.baseFloor },
    batchRecord: { ...pending.batchRecord },
  };
}

function cloneReaderSyncProjectionReceipt(
  receipt: PicoReaderCustodySyncProjectionReceipt,
): PicoReaderCustodySyncProjectionReceipt {
  return {
    schema: picoReaderCustodySyncProjectionReceiptSchema,
    routeRef: receipt.routeRef,
    syncBatchId: receipt.syncBatchId,
    sequence: receipt.sequence,
    manifestDigestHex: receipt.manifestDigestHex,
    previousManifestDigestHex: receipt.previousManifestDigestHex,
    verifiedAt: receipt.verifiedAt,
  };
}

function cloneReaderSyncProtectedProjectionRecord(
  record: PicoReaderCustodySyncProtectedProjectionRecord,
): PicoReaderCustodySyncProtectedProjectionRecord {
  return {
    schema: picoReaderCustodySyncProtectedProjectionRecordSchema,
    schemaVersion: 1,
    receipt: cloneReaderSyncProjectionReceipt(record.receipt),
    batchRecord: { ...record.batchRecord },
  };
}

function cloneReaderSyncProtectedProjectionArchive(
  archive: PicoReaderCustodySyncProtectedProjectionArchive,
): PicoReaderCustodySyncProtectedProjectionArchive {
  return {
    schema: picoReaderCustodySyncProtectedProjectionArchiveSchema,
    schemaVersion: 1,
    routeRef: archive.routeRef,
    records: archive.records.map(
      cloneReaderSyncProtectedProjectionRecord,
    ),
  };
}

function protectedProjectionRecordsShareStableIdentity(
  left: PicoReaderCustodySyncProtectedProjectionRecord,
  right: PicoReaderCustodySyncProtectedProjectionRecord,
): boolean {
  return left.receipt.routeRef === right.receipt.routeRef
    && left.receipt.syncBatchId === right.receipt.syncBatchId
    && left.receipt.sequence === right.receipt.sequence
    && left.receipt.manifestDigestHex
      === right.receipt.manifestDigestHex
    && left.receipt.previousManifestDigestHex
      === right.receipt.previousManifestDigestHex
    && readerSyncBatchRecordsEqual(
      left.batchRecord,
      right.batchRecord,
    );
}

function readerSyncPendingRecordsEqual(
  left: PicoReaderCustodySyncPendingRecord,
  right: PicoReaderCustodySyncPendingRecord,
): boolean {
  return readerSyncPinsEqual(left.pins, right.pins)
    && left.stagedAt === right.stagedAt
    && ((left.baseFloor === null && right.baseFloor === null)
      || (left.baseFloor !== null
        && right.baseFloor !== null
        && readerSyncFloorsEqual(left.baseFloor, right.baseFloor)))
    && left.batchRecord.schema === right.batchRecord.schema
    && left.batchRecord.routeRef === right.batchRecord.routeRef
    && left.batchRecord.syncBatchId === right.batchRecord.syncBatchId
    && left.batchRecord.sealedPayloadHex
      === right.batchRecord.sealedPayloadHex
    && left.batchRecord.sealedPayloadDigestHex
      === right.batchRecord.sealedPayloadDigestHex
    && left.batchRecord.expiresAt === right.batchRecord.expiresAt;
}

function readerSyncBatchRecordsEqual(
  left: PicoReaderCustodySyncBatchRecord,
  right: PicoReaderCustodySyncBatchRecord,
): boolean {
  return left.schema === right.schema
    && left.routeRef === right.routeRef
    && left.syncBatchId === right.syncBatchId
    && left.sealedPayloadHex === right.sealedPayloadHex
    && left.sealedPayloadDigestHex === right.sealedPayloadDigestHex
    && left.expiresAt === right.expiresAt;
}

function pendingMatchesDurableState(
  pending: PicoReaderCustodySyncPendingRecord,
  state: PicoReaderCustodySyncClientState,
): boolean {
  const floor = state.floor;
  if (pending.batchRecord.routeRef !== floor.routeRef
    || pending.batchRecord.syncBatchId !== floor.syncBatchId
    || pending.stagedAt !== state.verifiedAt) {
    return false;
  }
  if (pending.baseFloor === null) {
    return floor.sequence === 1;
  }
  return readerSyncFloorsEqual(pending.baseFloor, floor)
    || (floor.routeRef === pending.baseFloor.routeRef
      && floor.sequence === pending.baseFloor.sequence + 1);
}

function readerSyncPinsEqual(
  left: PicoReaderCustodySyncPins,
  right: PicoReaderCustodySyncPins,
): boolean {
  return left.routeRef === right.routeRef
    && left.domainAuthorityId === right.domainAuthorityId
    && left.homeId === right.homeId
    && left.hostSigningKeyFingerprintHex
      === right.hostSigningKeyFingerprintHex
    && left.domainId === right.domainId
    && left.ownerIdentityKeyFingerprintHex
      === right.ownerIdentityKeyFingerprintHex
    && left.readerGrantId === right.readerGrantId
    && left.readerIdentityKeyFingerprintHex
      === right.readerIdentityKeyFingerprintHex
    && left.readerKeyFingerprintHex === right.readerKeyFingerprintHex;
}

function readerSyncFloorsEqual(
  left: PicoReaderCustodySyncFloor,
  right: PicoReaderCustodySyncFloor,
): boolean {
  return left.routeRef === right.routeRef
    && left.syncBatchId === right.syncBatchId
    && left.sequence === right.sequence
    && left.manifestDigestHex === right.manifestDigestHex
    && left.throughKekVersion === right.throughKekVersion
    && left.observedThroughLifecycleOrder
      === right.observedThroughLifecycleOrder
    && left.createdAt === right.createdAt;
}

function assertTransportCursor(value: string): void {
  if (!/^[\x21-\x7e]{1,256}$/.test(value)) {
    throw new Error('invalid_reader_sync_transport_cursor');
  }
}

function assertSyncReadLimit(value: number): void {
  assertPositiveBoundedInteger(
    value,
    MAX_PICO_SYNC_READ_LIMIT,
    'invalid_sync_read_limit',
  );
}

function assertPositiveBoundedInteger(
  value: number,
  maximum: number,
  errorCode: string,
): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(errorCode);
  }
}

function assertOpaqueSyncReadResult(
  page: unknown,
  limit: number,
  afterCursor: string | undefined,
): asserts page is PicoSyncOpaqueReadResult {
  if (!isUnknownRecord(page)
    || !hasExactKeys(page, page.nextCursor === undefined
      ? ['records', 'hasMore']
      : ['records', 'nextCursor', 'hasMore'])
    || !Array.isArray(page.records)
    || typeof page.hasMore !== 'boolean'
    || (page.nextCursor !== undefined
      && typeof page.nextCursor !== 'string')
    || page.records.length > limit
    || (page.hasMore && page.records.length === 0)) {
    throw new Error('invalid_sync_read_page');
  }

  const recordIds = new Set<string>();
  const cursors = new Set<string>();
  for (const candidate of page.records) {
    if (!isUnknownRecord(candidate)
      || !hasExactKeys(candidate, [
        'objectId',
        'payload',
        'expiresAt',
        'cursor',
      ])
      || typeof candidate.objectId !== 'string'
      || !(candidate.payload instanceof Uint8Array)
      || typeof candidate.expiresAt !== 'string'
      || typeof candidate.cursor !== 'string'
      || candidate.payload.byteLength < 1
      || candidate.payload.byteLength > MAX_PICO_SYNC_OPAQUE_PAYLOAD_BYTES
      || recordIds.has(candidate.objectId)
      || cursors.has(candidate.cursor)) {
      throw new Error('invalid_sync_read_page');
    }
    assertAsciiReference(candidate.objectId);
    assertCanonicalInstant(candidate.expiresAt);
    assertTransportCursor(candidate.cursor);
    recordIds.add(candidate.objectId);
    cursors.add(candidate.cursor);
  }

  const lastCursor = page.records.at(-1)?.cursor;
  if (page.nextCursor !== lastCursor
    || (page.nextCursor !== undefined
      && page.nextCursor === afterCursor)) {
    throw new Error('invalid_sync_read_page');
  }
}

function assertReaderSyncBatchPage(
  page: unknown,
  routeRef: string,
  limit: number,
  afterCursor: string | null,
): asserts page is PicoReaderCustodySyncBatchPage {
  if (!isUnknownRecord(page)
    || !hasExactKeys(page, page.nextCursor === undefined
      ? ['batches', 'hasMore']
      : ['batches', 'nextCursor', 'hasMore'])
    || !Array.isArray(page.batches)
    || typeof page.hasMore !== 'boolean'
    || (page.nextCursor !== undefined
      && typeof page.nextCursor !== 'string')
    || page.batches.length > limit
    || (page.hasMore && page.batches.length === 0)
    || (page.batches.length === 0) !== (page.nextCursor === undefined)) {
    throw new Error('invalid_reader_sync_page');
  }
  if (page.nextCursor !== undefined) {
    assertTransportCursor(page.nextCursor);
    if (page.nextCursor === afterCursor) {
      throw new Error('invalid_reader_sync_page');
    }
  }

  const batchIds = new Set<string>();
  for (const candidate of page.batches) {
    if (!isUnknownRecord(candidate)
      || candidate.schema !== picoReaderCustodySyncBatchRecordSchema
      || candidate.routeRef !== routeRef
      || typeof candidate.syncBatchId !== 'string'
      || batchIds.has(candidate.syncBatchId)) {
      throw new Error('invalid_reader_sync_page');
    }
    batchIds.add(candidate.syncBatchId);
  }
}

function assertPrivateReaderSyncStateDirectory(path: string): void {
  const stats = lstatSync(path);
  if (!stats.isDirectory()
    || stats.isSymbolicLink()
    || (stats.mode & 0o777) !== 0o700) {
    throw new Error('reader_sync_state_directory_permissions');
  }
}

function fsyncDirectory(path: string): void {
  const fileDescriptor = openSync(
    path,
    fsConstants.O_RDONLY | directoryFlag(),
  );
  try {
    fsyncSync(fileDescriptor);
  } finally {
    closeSync(fileDescriptor);
  }
}

function noFollowFlag(): number {
  return fsConstants.O_NOFOLLOW ?? 0;
}

function directoryFlag(): number {
  return fsConstants.O_DIRECTORY ?? 0;
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === code;
}

function assertRouteRef(value: string): void {
  if (!/^route_[A-Za-z0-9_-]{32,128}$/.test(value)) {
    throw new Error('invalid_sync_route_ref');
  }
}

function assertAsciiReference(value: string): void {
  if (!/^[A-Za-z0-9._:/+-]{1,256}$/.test(value)) {
    throw new Error('invalid_sync_reference');
  }
}

function assertHexFingerprint(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('invalid_sync_fingerprint');
  }
}

function assertDigest(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('invalid_sync_digest');
  }
}

function assertLifecycleOrder(value: string): void {
  if (!/^seq:[0-9]{16}$/.test(value)) {
    throw new Error('invalid_sync_lifecycle_order');
  }
}

function assertCanonicalInstant(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error('invalid_sync_instant');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())
    || parsed.toISOString() !== value) {
    throw new Error('invalid_sync_instant');
  }
}

function formatOpaqueCursor(sequence: number): string {
  return `cursor:${String(sequence).padStart(16, '0')}`;
}

function parseOpaqueCursor(cursor: string): number {
  const match = /^cursor:([0-9]{16})$/.exec(cursor);
  if (match?.[1] === undefined) {
    throw new Error('invalid_sync_cursor');
  }
  const sequence = Number.parseInt(match[1], 10);
  if (!Number.isSafeInteger(sequence)) {
    throw new Error('invalid_sync_cursor');
  }
  return sequence;
}

function cloneOpaqueRecord(
  record: PicoSyncOpaqueRecord,
): PicoSyncOpaqueRecord {
  return {
    objectId: record.objectId,
    payload: new Uint8Array(record.payload),
    expiresAt: record.expiresAt,
    cursor: record.cursor,
  };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('sync_transport_aborted');
  }
}

function generichashHex(
  sodium: IdentityVerificationSodium,
  input: Uint8Array,
): string {
  return Buffer.from(
    sodium.crypto_generichash(32, input, null),
  ).toString('hex');
}

function hexToBytes(value: string): Uint8Array {
  if (!isCanonicalHex(value)) {
    throw new Error('invalid_hex');
  }
  return Buffer.from(value, 'hex');
}

function isCanonicalHex(value: string): boolean {
  return typeof value === 'string'
    && value.length > 0
    && value.length % 2 === 0
    && /^[0-9a-f]+$/.test(value);
}

function hasExactKeys(
  record: object,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(record);
  return keys.length === expectedKeys.length
    && keys.every((key) => expectedKeys.includes(key));
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value);
}

function isRuntimeRecord(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value);
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    assertCanonicalInstant(value);
    return true;
  } catch {
    return false;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isUnknownRecord(value)
    && typeof value.then === 'function';
}

function failReaderSync(
  reason: PicoReaderCustodySyncProjectionFailure,
): never {
  throw new ReaderSyncVerificationError(reason);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function assertVersionVector(vector: VersionVector, label: string): void {
  for (const [deviceId, value] of Object.entries(vector)) {
    if (!deviceId.trim()) {
      throw new Error(`${label} contains an empty deviceId.`);
    }

    assertLamportValue(value, `${label} entry for ${deviceId}`);
  }
}

function assertLamportValue(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function assertCanAdvance(value: number): void {
  if (value >= MAX_LAMPORT_VALUE) {
    throw new Error('LamportClock cannot advance beyond Number.MAX_SAFE_INTEGER.');
  }
}
