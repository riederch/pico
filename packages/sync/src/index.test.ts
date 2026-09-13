import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoReaderCustodySyncManifestSignatureInput,
  picoIdentitySuite,
  picoMemoryContentSuite,
  picoReaderCustodySyncBatchRecordSchema,
  picoReaderCustodySyncPayloadSchema,
  type PicoReaderCustodySyncBatchRecord,
  type PicoReaderCustodySyncPayload,
} from '@pico/protocol';
import {
  createPicoReaderCustodyDomain,
  createPicoReaderCustodyReaderGrant,
  createPicoReaderCustodySyncBatch,
  createPicoReaderCustodyWriterGrant,
  createPicoVaultReaderCustodySyncAccessSession,
  createPicoVaultKeyfile,
  decryptPicoReaderCustodyItem,
  encryptPicoReaderCustodyItem,
  openPicoReaderCustodySyncBatch,
  openPicoVaultKeyfile,
  revokePicoReaderCustodyReaderGrant,
  revokePicoReaderCustodyWriterGrant,
  rotatePicoReaderCustodyDomain,
} from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import {
  InMemoryPicoSyncOpaqueTransport,
  LamportClock,
  MAX_PICO_READER_CUSTODY_SYNC_ACCESS_SESSION_MS,
  MAX_PICO_READER_CUSTODY_SYNC_ITEM_CATALOG_ENTRIES,
  MAX_PICO_READER_CUSTODY_SYNC_PENDING_RECORD_BYTES,
  MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_ARCHIVE_BYTES,
  PicoReaderCustodySyncBatchPublisher,
  PicoReaderCustodySyncBatchSource,
  PicoReaderCustodySyncAccessSession,
  PicoReaderCustodySyncClient,
  PicoReaderCustodySyncFilePendingStore,
  PicoReaderCustodySyncFileStateStore,
  PicoReaderCustodySyncItemAccess,
  PicoReaderCustodySyncItemCatalog,
  PicoReaderCustodySyncItemSelection,
  PicoReaderCustodySyncProjector,
  PicoReaderCustodySyncProtectedProjectionFileStore,
  PicoReaderCustodySyncRunner,
  createPicoReaderCustodySyncProjectionMaterializationConsumer,
  mergeVersionVector,
  picoReaderCustodySyncClientStateSchema,
  picoReaderCustodySyncPendingRecordSchema,
  picoReaderCustodySyncProjectionReceiptSchema,
  picoReaderCustodySyncProtectedProjectionArchiveSchema,
  picoReaderCustodySyncProtectedProjectionRecordSchema,
  updateVersionVector,
  type PicoReaderCustodySyncBatchReader,
  type PicoReaderCustodySyncAccessSessionUnlockPort,
  type PicoReaderCustodySyncClientApplySuccess,
  type PicoReaderCustodySyncClientApplyResult,
  type PicoReaderCustodySyncClientState,
  type PicoReaderCustodySyncClientStateStore,
  type PicoReaderCustodySyncItemDecryptionEvidence,
  type PicoReaderCustodySyncItemDescriptor,
  type PicoReaderCustodySyncPresentedItem,
  type PicoReaderCustodySyncPins,
  type PicoReaderCustodySyncPendingRecord,
  type PicoReaderCustodySyncPendingStore,
  type PicoReaderCustodySyncProjectionMaterializationStore,
  type PicoReaderCustodySyncRunClient,
  type PicoSyncOpaqueTransport,
} from './index.js';

const temporaryDirectories: string[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('LamportClock', () => {
  it('starts at zero by default', () => {
    const clock = new LamportClock();
    expect(clock.current()).toBe(0);
  });

  it('increments on local tick', () => {
    const clock = new LamportClock();
    expect(clock.tick()).toBe(1);
    expect(clock.tick()).toBe(2);
  });

  it('moves beyond received remote values', () => {
    const clock = new LamportClock(3);
    expect(clock.receive(10)).toBe(11);
    expect(clock.current()).toBe(11);
  });

  it('keeps monotonic order when receiving smaller values', () => {
    const clock = new LamportClock(10);
    expect(clock.receive(4)).toBe(11);
  });

  it('rejects invalid initial values', () => {
    expect(() => new LamportClock(-1)).toThrow();
    expect(() => new LamportClock(1.5)).toThrow();
    expect(() => new LamportClock(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('rejects invalid remote values', () => {
    const clock = new LamportClock();
    expect(() => clock.receive(-1)).toThrow();
    expect(() => clock.receive(1.5)).toThrow();
    expect(() => clock.receive(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('rejects advancing beyond safe integer range', () => {
    expect(() => new LamportClock(Number.MAX_SAFE_INTEGER).tick()).toThrow(
      'LamportClock cannot advance beyond Number.MAX_SAFE_INTEGER.',
    );

    const clock = new LamportClock(Number.MAX_SAFE_INTEGER - 1);
    expect(() => clock.receive(Number.MAX_SAFE_INTEGER)).toThrow(
      'LamportClock cannot advance beyond Number.MAX_SAFE_INTEGER.',
    );
  });
});

describe('VersionVector helpers', () => {
  it('merges vectors by taking the highest value per device', () => {
    expect(mergeVersionVector({ phone: 2, desktop: 5 }, { phone: 4, tablet: 1 })).toEqual({
      phone: 4,
      desktop: 5,
      tablet: 1,
    });
  });

  it('updates a device entry without decreasing it', () => {
    expect(updateVersionVector({ phone: 8 }, 'phone', 3)).toEqual({ phone: 8 });
    expect(updateVersionVector({ phone: 8 }, 'phone', 9)).toEqual({ phone: 9 });
  });

  it('rejects invalid device or lamport input', () => {
    expect(() => updateVersionVector({}, '', 1)).toThrow();
    expect(() => updateVersionVector({}, '   ', 1)).toThrow();
    expect(() => updateVersionVector({}, 'phone', -1)).toThrow();
    expect(() => updateVersionVector({}, 'phone', Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('rejects invalid existing vector entries', () => {
    expect(() => mergeVersionVector({ '': 1 }, {})).toThrow();
    expect(() => mergeVersionVector({}, { phone: -1 })).toThrow();
    expect(() => mergeVersionVector({}, { phone: 1.5 })).toThrow();
    expect(() => updateVersionVector({ phone: Number.MAX_SAFE_INTEGER + 1 }, 'phone', 1)).toThrow();
  });
});

describe('reader-custody sync client state (ADR 0090)', () => {
  it('persists a private bounded state with atomic revision checks', () => {
    const statePath = createReaderSyncStatePath();
    const store = new PicoReaderCustodySyncFileStateStore(statePath);
    const state1 = readerSyncClientState(1, 1);

    store.commit(state1, undefined);

    expect(store.load()).toEqual(state1);
    expect(statSync(statePath).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(statePath, '..'))).toEqual(['state.json']);
    expect(readFileSync(statePath, 'utf8')).not.toContain('plaintext');
    expect(() => store.commit({
      ...state1,
      revision: 2,
      transportCursor: 'cursor:0000000000000002',
    }, undefined)).toThrow('reader_sync_state_stale_revision');

    const state2 = readerSyncClientState(2, 2);
    store.commit(state2, 1);
    expect(store.load()).toEqual(state2);
  });

  it('rejects malformed, oversized, permissive and symlink state files', () => {
    const statePath = createReaderSyncStatePath();
    const store = new PicoReaderCustodySyncFileStateStore(statePath);

    writeFileSync(statePath, '{"schema":', { mode: 0o600 });
    expect(() => store.load()).toThrow('invalid_reader_sync_state');

    writeFileSync(statePath, 'x'.repeat((64 * 1024) + 1));
    expect(() => store.load()).toThrow('invalid_reader_sync_state_file');

    writeFileSync(statePath, JSON.stringify(readerSyncClientState(1, 1)));
    chmodSync(statePath, 0o644);
    expect(() => store.load()).toThrow('invalid_reader_sync_state_file');

    rmSync(statePath);
    const targetPath = join(statePath, '..', 'target.json');
    writeFileSync(
      targetPath,
      JSON.stringify(readerSyncClientState(1, 1)),
      { mode: 0o600 },
    );
    symlinkSync(targetPath, statePath);
    expect(() => store.load()).toThrow('reader_sync_state_unreadable');

    rmSync(statePath);
    writeFileSync(
      statePath,
      JSON.stringify(readerSyncClientState(1, 1)),
      { mode: 0o600 },
    );
    chmodSync(join(statePath, '..'), 0o755);
    expect(() => store.load()).toThrow(
      'reader_sync_state_directory_permissions',
    );
  });

  it('allows cursor movement but rejects floor rollback, gaps, forks and scope swaps', () => {
    const statePath = createReaderSyncStatePath();
    const store = new PicoReaderCustodySyncFileStateStore(statePath);
    const state1 = readerSyncClientState(1, 1);
    const state2 = readerSyncClientState(2, 2);
    store.commit(state1, undefined);
    store.commit(state2, 1);

    expect(() => store.commit({
      ...state2,
      revision: 3,
      floor: { ...state2.floor, sequence: 1 },
    }, 2)).toThrow('reader_sync_state_floor_not_contiguous');
    expect(() => store.commit({
      ...state2,
      revision: 3,
      floor: { ...state2.floor, sequence: 4 },
    }, 2)).toThrow('reader_sync_state_floor_not_contiguous');
    expect(() => store.commit({
      ...state2,
      revision: 3,
      floor: {
        ...state2.floor,
        manifestDigestHex: 'ef'.repeat(32),
      },
    }, 2)).toThrow('reader_sync_state_floor_fork');
    expect(() => store.commit({
      ...state2,
      revision: 3,
      verifiedAt: state1.verifiedAt,
    }, 2)).toThrow('reader_sync_state_verified_at_rollback');
    expect(() => store.commit({
      ...state2,
      revision: 3,
      pins: {
        ...state2.pins,
        homeId: 'home_reader_sync_swapped',
      },
      floor: {
        ...state2.floor,
        routeRef: `route_${'B'.repeat(48)}`,
      },
    }, 2)).toThrow('reader_sync_state_scope_mismatch');

    const cursorOnly = {
      ...state2,
      revision: 3,
      transportCursor: 'cursor:0000000000000001',
    };
    store.commit(cursorOnly, 2);
    expect(store.load()).toEqual(cursorOnly);
  });
});

describe('durable reader-custody pending inbox (ADR 0092)', () => {
  it('stages exactly one private sealed batch and acknowledges it durably', () => {
    const pendingPath = createReaderSyncPendingPath();
    const store = new PicoReaderCustodySyncFilePendingStore(pendingPath);
    const pending = readerSyncPendingRecord(1);

    expect(store.stage(pending)).toEqual({ inserted: true });
    expect(store.stage(pending)).toEqual({ inserted: false });
    expect(store.load()).toEqual(pending);
    expect(statSync(pendingPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(pendingPath, 'utf8')).not.toContain('plaintext');
    expect(() => store.stage({
      ...pending,
      batchRecord: runnerBatchRecord(2),
    })).toThrow('reader_sync_pending_conflict');
    expect(() => store.acknowledge({
      ...pending,
      stagedAt: '2026-07-27T10:31:00.000Z',
    })).toThrow('reader_sync_pending_ack_mismatch');

    expect(store.acknowledge(pending)).toEqual({ removed: true });
    expect(store.load()).toBeUndefined();
    expect(store.acknowledge(pending)).toEqual({ removed: false });
  });

  it('rejects truncated, oversized, permissive, symlink and expired pending state', () => {
    const pendingPath = createReaderSyncPendingPath();
    const store = new PicoReaderCustodySyncFilePendingStore(pendingPath);

    writeFileSync(pendingPath, '{"schema":', { mode: 0o600 });
    expect(() => store.load()).toThrow('invalid_reader_sync_pending');

    truncateSync(
      pendingPath,
      MAX_PICO_READER_CUSTODY_SYNC_PENDING_RECORD_BYTES + 1,
    );
    expect(() => store.load()).toThrow(
      'invalid_reader_sync_pending_file',
    );

    writeFileSync(
      pendingPath,
      JSON.stringify(readerSyncPendingRecord(1)),
    );
    chmodSync(pendingPath, 0o644);
    expect(() => store.load()).toThrow(
      'invalid_reader_sync_pending_file',
    );

    rmSync(pendingPath);
    const targetPath = join(pendingPath, '..', 'pending-target.json');
    writeFileSync(
      targetPath,
      JSON.stringify(readerSyncPendingRecord(1)),
      { mode: 0o600 },
    );
    symlinkSync(targetPath, pendingPath);
    expect(() => store.load()).toThrow(
      'reader_sync_pending_unreadable',
    );

    rmSync(pendingPath);
    writeFileSync(
      pendingPath,
      JSON.stringify(readerSyncPendingRecord(1)),
      { mode: 0o600 },
    );
    chmodSync(join(pendingPath, '..'), 0o755);
    expect(() => store.load()).toThrow(
      'reader_sync_state_directory_permissions',
    );

    chmodSync(join(pendingPath, '..'), 0o700);
    rmSync(pendingPath);
    expect(() => store.stage({
      ...readerSyncPendingRecord(1),
      stagedAt: '2026-07-27T11:00:00.000Z',
    })).toThrow('reader_sync_pending_expired_at_stage');
  });

  it('keeps pending and floor recoverable across stage, consumer and ack failures', async () => {
    const batch = runnerBatchRecord(1);
    const source: PicoReaderCustodySyncBatchReader = {
      read: async () => ({
        batches: [batch],
        nextCursor: 'cursor:0000000000000001',
        hasMore: false,
      }),
    };

    const diskFull = createFakeRunnerClient();
    const diskFullPending: PicoReaderCustodySyncPendingStore = {
      load: () => undefined,
      stage: () => {
        throw new Error('simulated_pending_disk_full');
      },
      acknowledge: () => ({ removed: false }),
    };
    await expect(new PicoReaderCustodySyncRunner(
      source,
      diskFull.client,
      diskFullPending,
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('simulated_pending_disk_full');
    expect(diskFull.getState()).toBeUndefined();

    const beforeFloorPending = createMemoryPendingStore();
    const beforeFloor = createFakeRunnerClient({ throwSequence: 1 });
    await expect(new PicoReaderCustodySyncRunner(
      source,
      beforeFloor.client,
      beforeFloorPending,
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('simulated_vault_open_failure');
    expect(beforeFloor.getState()).toBeUndefined();
    expect(beforeFloorPending.load()?.batchRecord.syncBatchId)
      .toBe(batch.syncBatchId);

    const recovered = createFakeRunnerClient();
    await expect(new PicoReaderCustodySyncRunner(
      source,
      recovered.client,
      beforeFloorPending,
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      maxBatches: 2,
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      counters: {
        insertedBatches: 1,
        obsoleteBatches: 1,
      },
    });
    expect(beforeFloorPending.load()).toBeUndefined();

    const ackBase = createMemoryPendingStore();
    const ackFailure: PicoReaderCustodySyncPendingStore = {
      load: () => ackBase.load(),
      stage: (pending) => ackBase.stage(pending),
      acknowledge: () => {
        throw new Error('simulated_pending_ack_failure');
      },
    };
    const afterConsumer = createFakeRunnerClient();
    let deliveries = 0;
    await expect(new PicoReaderCustodySyncRunner(
      source,
      afterConsumer.client,
      ackFailure,
      () => {
        deliveries += 1;
      },
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('simulated_pending_ack_failure');
    expect(deliveries).toBe(1);
    expect(afterConsumer.getState()?.floor.sequence).toBe(1);
    expect(ackBase.load()?.batchRecord.syncBatchId)
      .toBe(batch.syncBatchId);

    await expect(new PicoReaderCustodySyncRunner(
      source,
      afterConsumer.client,
      ackBase,
      () => {
        deliveries += 1;
      },
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      maxBatches: 2,
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      counters: {
        replayedBatches: 1,
        obsoleteBatches: 1,
      },
    });
    expect(deliveries).toBe(2);
    expect(ackBase.load()).toBeUndefined();
  });
});

describe('protected reader-custody projection archive (ADR 0093)', () => {
  it('materializes sealed batches and stable receipts privately and idempotently', () => {
    const archivePath = createReaderSyncProjectionArchivePath();
    const routeRef = readerSyncClientPins().routeRef;
    const store =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        archivePath,
        routeRef,
      );
    const projection1 = protectedProjection(1);
    const projection2 = protectedProjection(
      2,
      projection1.value.floor.manifestDigestHex,
    );

    expect(store.materialize(projection1)).toEqual({
      inserted: true,
      receipt: {
        schema: picoReaderCustodySyncProjectionReceiptSchema,
        routeRef,
        syncBatchId: 'reader_sync_batch_0001',
        sequence: 1,
        manifestDigestHex:
          projection1.value.floor.manifestDigestHex,
        previousManifestDigestHex: '00'.repeat(32),
        verifiedAt: '2026-07-27T10:30:00.000Z',
      },
    });
    expect(store.materialize(projection1))
      .toMatchObject({ inserted: false });
    expect(store.materialize(projection2))
      .toMatchObject({ inserted: true });
    const reverifiedProjection2 = structuredClone(projection2);
    reverifiedProjection2.state.verifiedAt =
      '2026-07-27T10:31:00.000Z';
    expect(store.materialize(reverifiedProjection2)).toMatchObject({
      inserted: false,
      receipt: {
        verifiedAt: '2026-07-27T10:30:00.000Z',
      },
    });

    expect(store.load()).toMatchObject({
      schema: picoReaderCustodySyncProtectedProjectionArchiveSchema,
      schemaVersion: 1,
      routeRef,
      records: [
        {
          schema: picoReaderCustodySyncProtectedProjectionRecordSchema,
          schemaVersion: 1,
          receipt: { sequence: 1 },
        },
        {
          schema: picoReaderCustodySyncProtectedProjectionRecordSchema,
          schemaVersion: 1,
          receipt: { sequence: 2 },
        },
      ],
    });
    expect(statSync(archivePath).mode & 0o777).toBe(0o600);
    const serialized = readFileSync(archivePath, 'utf8');
    expect(serialized).not.toContain(
      readerSyncClientPins().homeId,
    );
    expect(serialized).not.toContain(
      readerSyncClientPins().domainId,
    );
    expect(serialized).not.toContain('plaintext');
    expect(readdirSync(join(archivePath, '..')))
      .toEqual(['projections.json']);
  });

  it('rejects gaps, forks, stale archive heads, quota and filesystem tampering', () => {
    const routeRef = readerSyncClientPins().routeRef;
    const projection1 = protectedProjection(1);
    const projection1Fork = protectedProjection(
      1,
      '00'.repeat(32),
      '-fork',
    );
    const projection2 = protectedProjection(
      2,
      projection1.value.floor.manifestDigestHex,
    );

    const gapStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        createReaderSyncProjectionArchivePath(),
        routeRef,
      );
    expect(() => gapStore.materialize(projection2)).toThrow(
      'reader_sync_projection_archive_sequence_gap',
    );
    const wrongScopeProjection = structuredClone(projection1);
    wrongScopeProjection.state.pins.homeId =
      'home_reader_sync_cross_scope';
    expect(() => gapStore.materialize(wrongScopeProjection)).toThrow(
      'invalid_reader_sync_projection_materialization',
    );

    const orderedStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        createReaderSyncProjectionArchivePath(),
        routeRef,
      );
    orderedStore.materialize(projection1);
    expect(() => orderedStore.materialize(projection1Fork)).toThrow(
      'reader_sync_projection_archive_fork',
    );
    orderedStore.materialize(projection2);
    expect(() => orderedStore.materialize(projection1)).toThrow(
      'reader_sync_projection_archive_ahead_of_sync_floor',
    );

    const quotaStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        createReaderSyncProjectionArchivePath(),
        routeRef,
        { maxRecords: 1 },
      );
    quotaStore.materialize(projection1);
    expect(() => quotaStore.materialize(projection2)).toThrow(
      'reader_sync_projection_archive_quota_exceeded',
    );
    expect(quotaStore.load()?.records).toHaveLength(1);
    expect(() =>
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        createReaderSyncProjectionArchivePath(),
        routeRef,
        {
          maxBytes:
            MAX_PICO_READER_CUSTODY_SYNC_PROTECTED_PROJECTION_ARCHIVE_BYTES
            + 1,
        },
      )).toThrow('invalid_reader_sync_projection_archive_limits');

    const receiptTamperPath =
      createReaderSyncProjectionArchivePath();
    const receiptTamperStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        receiptTamperPath,
        routeRef,
      );
    receiptTamperStore.materialize(projection1);
    const receiptTamper = JSON.parse(
      readFileSync(receiptTamperPath, 'utf8'),
    ) as {
      records: Array<{
        receipt: { verifiedAt: string };
      }>;
    };
    receiptTamper.records[0]!.receipt.verifiedAt =
      '2026-07-27T10:31:00.000Z';
    writeFileSync(
      receiptTamperPath,
      `${JSON.stringify(receiptTamper)}\n`,
    );
    expect(() => receiptTamperStore.materialize(projection1))
      .toThrow(
        'reader_sync_projection_archive_verified_at_rollback',
      );

    const ciphertextTamperPath =
      createReaderSyncProjectionArchivePath();
    const ciphertextTamperStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        ciphertextTamperPath,
        routeRef,
      );
    ciphertextTamperStore.materialize(projection1);
    const ciphertextTamper = JSON.parse(
      readFileSync(ciphertextTamperPath, 'utf8'),
    ) as {
      records: Array<{
        batchRecord: { sealedPayloadHex: string };
      }>;
    };
    const sealedPayloadHex =
      ciphertextTamper.records[0]!.batchRecord.sealedPayloadHex;
    ciphertextTamper.records[0]!.batchRecord.sealedPayloadHex =
      `${sealedPayloadHex.startsWith('00') ? '01' : '00'}`
      + sealedPayloadHex.slice(2);
    writeFileSync(
      ciphertextTamperPath,
      `${JSON.stringify(ciphertextTamper)}\n`,
    );
    expect(() => ciphertextTamperStore.load()).toThrow(
      'invalid_reader_sync_projection_archive',
    );

    const boundedPath = createReaderSyncProjectionArchivePath();
    const boundedStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        boundedPath,
        routeRef,
        { maxBytes: 4_096 },
      );
    boundedStore.materialize(projection1);
    truncateSync(boundedPath, 4_097);
    expect(() => boundedStore.load()).toThrow(
      'invalid_reader_sync_projection_archive_file',
    );

    const truncatedPath =
      createReaderSyncProjectionArchivePath();
    const truncatedStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        truncatedPath,
        routeRef,
      );
    truncatedStore.materialize(projection1);
    truncateSync(truncatedPath, 16);
    expect(() => truncatedStore.load()).toThrow(
      'invalid_reader_sync_projection_archive',
    );

    const permissionsPath =
      createReaderSyncProjectionArchivePath();
    const permissionsStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        permissionsPath,
        routeRef,
      );
    permissionsStore.materialize(projection1);
    chmodSync(permissionsPath, 0o644);
    expect(() => permissionsStore.load()).toThrow(
      'invalid_reader_sync_projection_archive_file',
    );
    chmodSync(permissionsPath, 0o600);
    chmodSync(join(permissionsPath, '..'), 0o755);
    expect(() => permissionsStore.load()).toThrow(
      'reader_sync_state_directory_permissions',
    );

    const symlinkPath = createReaderSyncProjectionArchivePath();
    const symlinkTarget = join(symlinkPath, '..', 'target.json');
    const targetStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        symlinkTarget,
        routeRef,
      );
    targetStore.materialize(projection1);
    symlinkSync(symlinkTarget, symlinkPath);
    expect(() =>
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        symlinkPath,
        routeRef,
      ).load()).toThrow(
      'reader_sync_projection_archive_unreadable',
    );
  });

  it('keeps pending until materialization is durable and recovers uncertain commits', async () => {
    const routeRef = readerSyncClientPins().routeRef;
    const projection = protectedProjection(1);
    const source: PicoReaderCustodySyncBatchReader = {
      read: async () => ({
        batches: [{ ...projection.batchRecord }],
        nextCursor: 'cursor:0000000000000001',
        hasMore: false,
      }),
    };
    const client = createProjectionRunnerClient(projection);
    const pendingStore = createMemoryPendingStore();
    const archiveStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        createReaderSyncProjectionArchivePath(),
        routeRef,
      );
    const uncertainStore:
    PicoReaderCustodySyncProjectionMaterializationStore = {
      materialize: (nextProjection) => {
        archiveStore.materialize(nextProjection);
        throw new Error('simulated_crash_after_materialization_commit');
      },
    };

    await expect(new PicoReaderCustodySyncRunner(
      source,
      client.client,
      pendingStore,
      createPicoReaderCustodySyncProjectionMaterializationConsumer(
        uncertainStore,
      ),
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      maxBatches: 1,
    }, { signal: new AbortController().signal })).rejects.toThrow(
      'simulated_crash_after_materialization_commit',
    );
    expect(client.getState()?.floor.sequence).toBe(1);
    expect(pendingStore.load()?.batchRecord.syncBatchId)
      .toBe(projection.batchRecord.syncBatchId);
    expect(archiveStore.load()?.records).toHaveLength(1);

    await expect(new PicoReaderCustodySyncRunner(
      source,
      client.client,
      pendingStore,
      createPicoReaderCustodySyncProjectionMaterializationConsumer(
        archiveStore,
      ),
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      maxBatches: 2,
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      counters: {
        replayedBatches: 1,
        obsoleteBatches: 1,
      },
    });
    expect(pendingStore.load()).toBeUndefined();
    expect(archiveStore.load()?.records).toHaveLength(1);

    const quotaClient = createProjectionRunnerClient(projection);
    const quotaPendingStore = createMemoryPendingStore();
    const quotaPath = createReaderSyncProjectionArchivePath();
    const undersizedStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        quotaPath,
        routeRef,
        { maxBytes: 1 },
      );
    await expect(new PicoReaderCustodySyncRunner(
      source,
      quotaClient.client,
      quotaPendingStore,
      createPicoReaderCustodySyncProjectionMaterializationConsumer(
        undersizedStore,
      ),
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      maxBatches: 1,
    }, { signal: new AbortController().signal })).rejects.toThrow(
      'reader_sync_projection_archive_quota_exceeded',
    );
    expect(quotaClient.getState()?.floor.sequence).toBe(1);
    expect(quotaPendingStore.load()).toBeDefined();
    expect(undersizedStore.load()).toBeUndefined();

    const recoveredStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        quotaPath,
        routeRef,
      );
    await expect(new PicoReaderCustodySyncRunner(
      source,
      quotaClient.client,
      quotaPendingStore,
      createPicoReaderCustodySyncProjectionMaterializationConsumer(
        recoveredStore,
      ),
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      maxBatches: 2,
    }, { signal: new AbortController().signal }))
      .resolves.toMatchObject({ ok: true, status: 'source_drained' });
    expect(quotaPendingStore.load()).toBeUndefined();
    expect(recoveredStore.load()?.records).toHaveLength(1);
  });
});

describe('bounded reader-custody sync runs (ADR 0091)', () => {
  it('applies complete pages, commits their cursor and stops at explicit limits', async () => {
    const batch1 = runnerBatchRecord(1);
    const batch2 = runnerBatchRecord(2);
    const batch3 = runnerBatchRecord(3);
    const { client } = createFakeRunnerClient();
    const delivered: number[] = [];
    const source: PicoReaderCustodySyncBatchReader = {
      read: async (input) => input.afterCursor === undefined
        ? {
          batches: [batch1, batch2],
          nextCursor: 'cursor:0000000000000002',
          hasMore: true,
        }
        : {
          batches: [batch3],
          nextCursor: 'cursor:0000000000000003',
          hasMore: false,
        },
    };
    const runner = new PicoReaderCustodySyncRunner(
      source,
      client,
      createMemoryPendingStore(),
      (projection) => {
        delivered.push(projection.value.floor.sequence);
      },
    );

    await expect(runner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      pageSize: 2,
      maxPages: 1,
      maxBatches: 3,
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: true,
      status: 'limit_reached',
      startCursor: null,
      endCursor: 'cursor:0000000000000002',
      sourceHasMore: true,
      counters: {
        pagesRead: 1,
        batchesRead: 2,
        projectionsDelivered: 2,
        insertedBatches: 2,
      },
    });
    await expect(runner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      pageSize: 2,
      maxPages: 2,
      maxBatches: 3,
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      startCursor: 'cursor:0000000000000002',
      endCursor: 'cursor:0000000000000003',
      sourceHasMore: false,
      counters: {
        pagesRead: 1,
        batchesRead: 1,
        projectionsDelivered: 1,
        insertedBatches: 1,
      },
    });
    expect(delivered).toEqual([1, 2, 3]);
  });

  it('recovers a mid-page consumer crash through obsolete skips and exact replay', async () => {
    const batches = [
      runnerBatchRecord(1),
      runnerBatchRecord(2),
      runnerBatchRecord(3),
    ];
    const { client, getState } = createFakeRunnerClient();
    const source: PicoReaderCustodySyncBatchReader = {
      read: async () => ({
        batches,
        nextCursor: 'cursor:0000000000000003',
        hasMore: false,
      }),
    };
    let crashOnce = true;
    const pendingStore = createMemoryPendingStore();
    const firstRunner = new PicoReaderCustodySyncRunner(
      source,
      client,
      pendingStore,
      (projection) => {
        if (projection.value.floor.sequence === 2 && crashOnce) {
          crashOnce = false;
          throw new Error('simulated_projection_consumer_crash');
        }
      },
    );

    await expect(firstRunner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      pageSize: 3,
      maxPages: 1,
      maxBatches: 3,
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('simulated_projection_consumer_crash');
    expect(getState()).toMatchObject({
      floor: { sequence: 2 },
      transportCursor: null,
    });

    const delivered: number[] = [];
    const restartedRunner = new PicoReaderCustodySyncRunner(
      source,
      client,
      pendingStore,
      (projection) => {
        delivered.push(projection.value.floor.sequence);
      },
    );
    await expect(restartedRunner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      pageSize: 3,
      maxPages: 1,
      maxBatches: 4,
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      endCursor: 'cursor:0000000000000003',
      counters: {
        batchesRead: 4,
        projectionsDelivered: 2,
        insertedBatches: 1,
        replayedBatches: 1,
        obsoleteBatches: 2,
      },
    });
    expect(delivered).toEqual([2, 3]);
  });

  it('does not advance the page cursor on projection errors, consumer errors or abort', async () => {
    const batch1 = runnerBatchRecord(1);
    const batch2 = runnerBatchRecord(2);
    const source: PicoReaderCustodySyncBatchReader = {
      read: async () => ({
        batches: [batch1, batch2],
        nextCursor: 'cursor:0000000000000002',
        hasMore: false,
      }),
    };
    const projectionFailure = createFakeRunnerClient({
      rejectSequence: 2,
      rejection: { ok: false, reason: 'sequence_gap' },
    });
    const failedRunner = new PicoReaderCustodySyncRunner(
      source,
      projectionFailure.client,
      createMemoryPendingStore(),
      () => undefined,
    );
    await expect(failedRunner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: false,
      reason: 'sequence_gap',
      failedSyncBatchId: batch2.syncBatchId,
      endCursor: null,
      counters: {
        batchesRead: 2,
        projectionsDelivered: 1,
      },
    });
    expect(projectionFailure.getState()?.transportCursor).toBeNull();

    const openFailure = createFakeRunnerClient({
      throwSequence: 2,
    });
    await expect(new PicoReaderCustodySyncRunner(
      source,
      openFailure.client,
      createMemoryPendingStore(),
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('simulated_vault_open_failure');
    expect(openFailure.getState()).toMatchObject({
      floor: { sequence: 1 },
      transportCursor: null,
    });

    const abortController = new AbortController();
    const aborted = createFakeRunnerClient();
    await expect(new PicoReaderCustodySyncRunner(
      source,
      aborted.client,
      createMemoryPendingStore(),
      () => {
        abortController.abort();
      },
    ).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: abortController.signal }))
      .rejects.toThrow('sync_transport_aborted');
    expect(aborted.getState()).toMatchObject({
      floor: { sequence: 1 },
      transportCursor: null,
    });

    const forkState = readerSyncClientState(1, 1);
    forkState.transportCursor = null;
    const forked = createFakeRunnerClient({ initialState: forkState });
    await expect(new PicoReaderCustodySyncRunner({
      read: async () => ({
        batches: [runnerBatchRecord(1, '_fork')],
        nextCursor: 'cursor:0000000000000001-fork',
        hasMore: false,
      }),
    }, forked.client, createMemoryPendingStore(), () => undefined).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal })).resolves.toMatchObject({
      ok: false,
      reason: 'fork',
      endCursor: null,
    });

    const expired = createFakeRunnerClient();
    await expect(new PicoReaderCustodySyncRunner({
      read: async () => ({
        batches: [batch1],
        nextCursor: 'cursor:0000000000000001-expired',
        hasMore: false,
      }),
    }, expired.client, createMemoryPendingStore(), () => undefined).run({
      evaluatedAt: batch1.expiresAt,
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('reader_sync_pending_expired_at_stage');
  });

  it('rejects stalled pages, overlapping runs and invalid work bounds', async () => {
    let releaseRead: (() => void) | undefined;
    const pendingRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const source: PicoReaderCustodySyncBatchReader = {
      read: async () => {
        await pendingRead;
        return { batches: [], hasMore: false };
      },
    };
    const { client } = createFakeRunnerClient();
    const runner = new PicoReaderCustodySyncRunner(
      source,
      client,
      createMemoryPendingStore(),
      () => undefined,
    );
    const activeRun = runner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal });
    await expect(runner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('reader_sync_run_already_active');
    releaseRead!();
    await expect(activeRun).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
    });

    await expect(runner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
      maxPages: 0,
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('invalid_reader_sync_run_page_limit');

    const stalledRunner = new PicoReaderCustodySyncRunner({
      read: async () => ({
        batches: [],
        nextCursor: 'cursor:0000000000000001',
        hasMore: true,
      }),
    }, client, createMemoryPendingStore(), () => undefined);
    await expect(stalledRunner.run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('invalid_reader_sync_page');

    const duplicate = runnerBatchRecord(1);
    await expect(new PicoReaderCustodySyncRunner({
      read: async () => ({
        batches: [duplicate, duplicate],
        nextCursor: 'cursor:0000000000000002',
        hasMore: false,
      }),
    }, client, createMemoryPendingStore(), () => undefined).run({
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('invalid_reader_sync_page');
  });

  it('rejects inconsistent opaque transport cursors before parsing a batch', async () => {
    const batch = runnerBatchRecord(1);
    const serialized = new TextEncoder().encode(JSON.stringify(batch));
    const routeRef = batch.routeRef;
    const transport: PicoSyncOpaqueTransport = {
      publish: async () => ({ inserted: false }),
      latest: async () => undefined,
      read: async () => ({
        records: [{
          objectId: batch.syncBatchId,
          payload: serialized,
          expiresAt: batch.expiresAt,
          cursor: 'cursor:0000000000000001',
        }],
        nextCursor: 'cursor:0000000000000002',
        hasMore: false,
      }),
    };

    await expect(new PicoReaderCustodySyncBatchSource(transport).read({
      routeRef,
      evaluatedAt: '2026-07-27T10:30:00.000Z',
    }, { signal: new AbortController().signal }))
      .rejects.toThrow('invalid_sync_read_page');
  });
});

describe('authenticated reader sync and local presentation (ADRs 0089/0094/0095/0096)', () => {
  it('keeps transport sealed and presents one current item through the synchronous Vault boundary', async () => {
    const ownerIdentity = createPicoVaultKeyfile(sodium, {
      keyRole: 'pico_identity',
      passphrase: 'owner identity passphrase',
    });
    const ownerAgreement = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_key_agreement',
      passphrase: 'owner agreement passphrase',
    });
    const readerAgreement = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_key_agreement',
      passphrase: 'reader agreement passphrase',
    });
    const wrongAgreement = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_key_agreement',
      passphrase: 'wrong agreement passphrase',
    });
    const writerSigning = createPicoVaultKeyfile(sodium, {
      keyRole: 'device_signing',
      passphrase: 'writer signing passphrase',
    });
    const ownerIdentitySession = openPicoVaultKeyfile(sodium, {
      keyfile: ownerIdentity.keyfile,
      passphrase: 'owner identity passphrase',
    });
    const ownerAgreementSession = openPicoVaultKeyfile(sodium, {
      keyfile: ownerAgreement.keyfile,
      passphrase: 'owner agreement passphrase',
    });
    const readerAgreementSession = openPicoVaultKeyfile(sodium, {
      keyfile: readerAgreement.keyfile,
      passphrase: 'reader agreement passphrase',
    });
    const wrongAgreementSession = openPicoVaultKeyfile(sodium, {
      keyfile: wrongAgreement.keyfile,
      passphrase: 'wrong agreement passphrase',
    });
    const writerSigningSession = openPicoVaultKeyfile(sodium, {
      keyfile: writerSigning.keyfile,
      passphrase: 'writer signing passphrase',
    });
    const ownerReaderKeyRecord = {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement' as const,
      publicKeyHex: ownerAgreement.publicKeyHex,
    };
    const readerKeyRecord = {
      suite: picoIdentitySuite,
      keyRole: 'device_key_agreement' as const,
      publicKeyHex: readerAgreement.publicKeyHex,
    };
    const writerSigningKeyRecord = {
      suite: picoIdentitySuite,
      keyRole: 'device_signing' as const,
      publicKeyHex: writerSigning.publicKeyHex,
    };
    const domainRecord = createPicoReaderCustodyDomain(sodium, {
      ownerIdentitySession,
      ownerReaderKeyRecord,
      domainAuthorityId: 'reader_sync_domain_authority_0001',
      homeId: 'home_reader_sync_0001',
      hostSigningKeyFingerprintHex: '11'.repeat(32),
      domainId: 'reader_sync_domain_0001',
      authorizedAt: '2026-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
    });
    const writerGrantRecord = createPicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession,
      domainRecord,
      writerDeviceSigningKeyRecord: writerSigningKeyRecord,
      writerGrantId: 'reader_sync_writer_grant_0001',
      writerIdentityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    });
    const readerGrantRecord = createPicoReaderCustodyReaderGrant(sodium, {
      ownerIdentitySession,
      ownerReaderKeyAgreementSession: ownerAgreementSession,
      domainRecord,
      readerKeyRecord,
      readerGrantId: 'reader_sync_reader_grant_0001',
      readerIdentityKeyFingerprintHex: '44'.repeat(32),
      readerDeviceSigningKeyFingerprintHex: '55'.repeat(32),
      readerDelegationId: 'reader_sync_delegation_0001',
      accessMode: 'from_version',
      firstKekVersion: 1,
      validFrom: '2026-07-27T10:00:00.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000003',
    });
    const forwardReaderGrantRecord =
      createPicoReaderCustodyReaderGrant(sodium, {
        ownerIdentitySession,
        ownerReaderKeyAgreementSession: ownerAgreementSession,
        domainRecord,
        readerKeyRecord: {
          suite: picoIdentitySuite,
          keyRole: 'device_key_agreement',
          publicKeyHex: wrongAgreement.publicKeyHex,
        },
        readerGrantId: 'reader_sync_reader_grant_forward_0001',
        readerIdentityKeyFingerprintHex: '77'.repeat(32),
        readerDeviceSigningKeyFingerprintHex: '88'.repeat(32),
        readerDelegationId: 'reader_sync_delegation_forward_0001',
        accessMode: 'forward_only',
        firstKekVersion: 1,
        validFrom: '2026-07-27T10:00:00.000Z',
        validUntil: '2027-07-27T10:00:00.000Z',
        lifecycleOrder: 'seq:0000000000000004',
      });
    const itemRecord = encryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: ownerAgreementSession,
      writerSigningSession,
      domainRecord,
      writerGrantRecord,
      packageId: 'reader_sync_package_0001',
      memoryItemId: 'reader_sync_memory_0001',
      contentType: 'text/plain',
      plaintext: 'transport must never receive this plaintext',
      createdAt: '2026-07-27T10:03:00.000Z',
    });
    const routeRef = `route_${'A'.repeat(48)}`;
    const forwardRouteRef = `route_${'F'.repeat(48)}`;
    const forwardBatch = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord: forwardReaderGrantRecord,
      writerGrantRecords: [writerGrantRecord],
      itemRecords: [itemRecord],
      syncBatchId: 'reader_sync_forward_batch_0001',
      routeRef: forwardRouteRef,
      sequence: 1,
      previousManifestDigestHex: '00'.repeat(32),
      createdAt: '2026-07-27T10:09:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });
    const batch1 = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      writerGrantRecords: [writerGrantRecord],
      itemRecords: [itemRecord],
      syncBatchId: 'reader_sync_batch_0001',
      routeRef,
      sequence: 1,
      previousManifestDigestHex: '00'.repeat(32),
      createdAt: '2026-07-27T10:10:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });

    expect(Object.keys(batch1.batchRecord).sort()).toEqual([
      'expiresAt',
      'routeRef',
      'schema',
      'sealedPayloadDigestHex',
      'sealedPayloadHex',
      'syncBatchId',
    ]);
    expect(JSON.stringify(batch1.batchRecord))
      .not.toContain('transport must never receive this plaintext');
    expect(JSON.stringify(batch1.batchRecord))
      .not.toContain(domainRecord.domain.homeId);

    const transport = new InMemoryPicoSyncOpaqueTransport();
    const publisher = new PicoReaderCustodySyncBatchPublisher(transport);
    const source = new PicoReaderCustodySyncBatchSource(transport);
    const signal = new AbortController().signal;
    await expect(publisher.publish(batch1.batchRecord, { signal }))
      .resolves.toEqual({ inserted: true });
    await expect(publisher.publish(batch1.batchRecord, { signal }))
      .resolves.toEqual({ inserted: false });
    const page = await source.read({
      routeRef,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
    }, { signal });
    expect(page.batches).toEqual([batch1.batchRecord]);

    expect(() => openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: wrongAgreementSession,
      batchRecord: page.batches[0]!,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
    })).toThrow();
    expect(() => openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: page.batches[0]!,
      evaluatedAt: batch1.batchRecord.expiresAt,
    })).toThrow('invalid_reader_sync_batch');

    /**
     * The same expired batch, evaluated at the farthest instant a `Date` can
     * hold - and it must still refuse.
     *
     * Expiry here is a *string* comparison, which the protocol pins to one
     * fixed-width form for exactly this reason. `@pico/vault` carried a second
     * spelling of "is this a canonical instant" until 2026-08-20 that checked
     * only whether the value round-tripped through `toISOString`, and the
     * extended-year form does: `+275760-09-13T00:00:00.000Z` is a real Date
     * and re-serializes to itself. But `+` is 0x2B, below every digit, so as a
     * string it sorts *before* every ordinary year - the farthest future
     * reading as earlier than any deadline, and an expired batch opening. The
     * rule is the protocol's now, asked rather than restated.
     */
    expect(() => openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: page.batches[0]!,
      evaluatedAt: '+275760-09-13T00:00:00.000Z',
    })).toThrow('invalid_reader_sync_batch');
    expect('+275760-09-13T00:00:00.000Z' < batch1.batchRecord.expiresAt).toBe(true);

    const payload1 = openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: page.batches[0]!,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
    });
    const pins = {
      routeRef,
      domainAuthorityId: domainRecord.domain.domainAuthorityId,
      homeId: domainRecord.domain.homeId,
      hostSigningKeyFingerprintHex:
        domainRecord.domain.hostSigningKeyFingerprintHex,
      domainId: domainRecord.domain.domainId,
      ownerIdentityKeyFingerprintHex:
        domainRecord.domain.ownerIdentityKeyFingerprintHex,
      readerGrantId: readerGrantRecord.grant.readerGrantId,
      readerIdentityKeyFingerprintHex:
        readerGrantRecord.grant.readerIdentityKeyFingerprintHex,
      readerKeyFingerprintHex:
        readerGrantRecord.grant.readerKeyFingerprintHex,
    };
    const durableStatePath = createReaderSyncStatePath();
    const durableStateStore =
      new PicoReaderCustodySyncFileStateStore(durableStatePath);
    const createDurableClient = (
      stateStore: PicoReaderCustodySyncClientStateStore,
    ) => new PicoReaderCustodySyncClient(
      sodium,
      pins,
      stateStore,
      ({ batchRecord, evaluatedAt }) =>
        openPicoReaderCustodySyncBatch(sodium, {
          readerKeyAgreementSession: readerAgreementSession,
          batchRecord,
          evaluatedAt,
        }),
    );
    const durableClient = createDurableClient(durableStateStore);
    expect(durableClient.apply({
      batchRecord: batch1.batchRecord,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
      transportCursor: 'cursor:0000000000000001',
    })).toMatchObject({
      ok: true,
      inserted: true,
      state: {
        revision: 1,
        floor: { sequence: 1 },
        transportCursor: 'cursor:0000000000000001',
      },
      value: {
        readerEnvelopeVersions: [1],
        itemPackageIds: ['reader_sync_package_0001'],
      },
    });
    expect(statSync(durableStatePath).mode & 0o777).toBe(0o600);
    expect(readFileSync(durableStatePath, 'utf8'))
      .not.toContain('transport must never receive this plaintext');
    expect(createDurableClient(durableStateStore).apply({
      batchRecord: batch1.batchRecord,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
      transportCursor: 'cursor:0000000000000001',
    })).toMatchObject({
      ok: true,
      inserted: false,
      state: { revision: 1, floor: { sequence: 1 } },
    });
    expect(createDurableClient(durableStateStore).apply({
      batchRecord: batch1.batchRecord,
      evaluatedAt: '2026-07-27T10:12:00.000Z',
      transportCursor: 'cursor:0000000000000001',
    })).toMatchObject({
      ok: true,
      inserted: false,
      state: {
        revision: 2,
        floor: { sequence: 1 },
        verifiedAt: '2026-07-27T10:12:00.000Z',
      },
    });

    const projector = new PicoReaderCustodySyncProjector(sodium, pins);
    expect(projector.accept(
      payload1,
      '2026-07-27T10:11:00.000Z',
    )).toMatchObject({
      ok: true,
      inserted: true,
      value: {
        readerStatus: 'active',
        readerEnvelopeVersions: [1],
        writerGrantIds: ['reader_sync_writer_grant_0001'],
        itemPackageIds: ['reader_sync_package_0001'],
      },
    });
    expect(projector.accept(
      payload1,
      '2026-07-27T10:11:00.000Z',
    )).toMatchObject({ ok: true, inserted: false });

    const batch2 = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      writerGrantRecords: [writerGrantRecord],
      itemRecords: [itemRecord],
      syncBatchId: 'reader_sync_batch_0002',
      routeRef,
      sequence: 2,
      previousManifestDigestHex: batch1.manifestDigestHex,
      createdAt: '2026-07-27T10:20:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });
    const payload2 = openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: batch2.batchRecord,
      evaluatedAt: '2026-07-27T10:21:00.000Z',
    });
    expect(projector.accept(
      payload2,
      '2026-07-27T10:21:00.000Z',
    )).toMatchObject({ ok: true, inserted: true });

    const crashBeforeCommitStore: PicoReaderCustodySyncClientStateStore = {
      load: () => durableStateStore.load(),
      commit: () => {
        throw new Error('simulated_crash_before_commit');
      },
    };
    expect(() => createDurableClient(crashBeforeCommitStore).apply({
      batchRecord: batch2.batchRecord,
      evaluatedAt: '2026-07-27T10:21:00.000Z',
      transportCursor: 'cursor:0000000000000002',
    })).toThrow('simulated_crash_before_commit');
    expect(durableStateStore.load()?.floor.sequence).toBe(1);
    expect(createDurableClient(durableStateStore).apply({
      batchRecord: batch2.batchRecord,
      evaluatedAt: '2026-07-27T10:21:00.000Z',
      transportCursor: 'cursor:0000000000000002',
    })).toMatchObject({
      ok: true,
      inserted: true,
      state: { floor: { sequence: 2 } },
    });

    const stateBeforeCursorSwap = durableStateStore.load()!;
    durableStateStore.commit({
      ...stateBeforeCursorSwap,
      revision: stateBeforeCursorSwap.revision + 1,
      transportCursor: 'cursor:0000000000000001',
    }, stateBeforeCursorSwap.revision);
    expect(createDurableClient(durableStateStore).apply({
      batchRecord: batch1.batchRecord,
      evaluatedAt: '2026-07-27T10:21:00.000Z',
      transportCursor: 'cursor:0000000000000002',
    })).toEqual({ ok: false, reason: 'rollback' });

    expect(projector.accept(
      payload1,
      '2026-07-27T10:21:00.000Z',
    )).toEqual({ ok: false, reason: 'rollback' });

    const gapBatch = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      writerGrantRecords: [writerGrantRecord],
      itemRecords: [itemRecord],
      syncBatchId: 'reader_sync_batch_0004',
      routeRef,
      sequence: 4,
      previousManifestDigestHex: batch2.manifestDigestHex,
      createdAt: '2026-07-27T10:30:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });
    const gapPayload = openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: gapBatch.batchRecord,
      evaluatedAt: '2026-07-27T10:31:00.000Z',
    });
    expect(projector.accept(
      gapPayload,
      '2026-07-27T10:31:00.000Z',
    )).toEqual({ ok: false, reason: 'sequence_gap' });

    const readerRevoked = revokePicoReaderCustodyReaderGrant(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      lifecycleId: 'reader_sync_reader_lifecycle_0001',
      reasonCategory: 'reader_removed',
      changedAt: '2026-07-27T10:40:00.000Z',
      lifecycleOrder: 'seq:0000000000000005',
    });
    const rotation2 = rotatePicoReaderCustodyDomain(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantLifecycleRecords: [readerRevoked],
      remainingReaderGrantRecords: [forwardReaderGrantRecord],
      rotationId: 'reader_sync_rotation_0002',
      rotatedAt: '2026-07-27T10:41:00.000Z',
      lifecycleOrder: 'seq:0000000000000006',
    });
    const writerGrantV2 = createPicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession,
      domainRecord,
      rotationRecords: [rotation2],
      writerDeviceSigningKeyRecord: writerSigningKeyRecord,
      writerGrantId: 'reader_sync_writer_grant_0002',
      writerIdentityKeyFingerprintHex: ownerIdentity.keyFingerprintHex,
      validFrom: '2026-07-27T10:41:30.000Z',
      validUntil: '2027-07-27T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000007',
    });
    const itemV2WithoutReaderEnvelope =
      encryptPicoReaderCustodyItem(sodium, {
        readerKeyAgreementSession: ownerAgreementSession,
        writerSigningSession,
        domainRecord,
        rotationRecords: [rotation2],
        writerGrantRecord: writerGrantV2,
        packageId: 'reader_sync_package_0002',
        memoryItemId: 'reader_sync_memory_0002',
        contentType: 'text/plain',
        plaintext: 'revoked reader must not receive version two',
        createdAt: '2026-07-27T10:42:00.000Z',
      });
    const missingVersionBatch = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      readerGrantLifecycleRecords: [readerRevoked],
      writerGrantRecords: [writerGrantV2],
      rotationRecords: [rotation2],
      itemRecords: [itemV2WithoutReaderEnvelope],
      syncBatchId: 'reader_sync_batch_missing_version',
      routeRef,
      sequence: 3,
      previousManifestDigestHex: batch2.manifestDigestHex,
      createdAt: '2026-07-27T10:42:15.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });
    const missingVersionPayload = openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: missingVersionBatch.batchRecord,
      evaluatedAt: '2026-07-27T10:42:20.000Z',
    });
    expect(projector.accept(
      missingVersionPayload,
      '2026-07-27T10:42:20.000Z',
    )).toEqual({ ok: false, reason: 'invalid_payload' });

    const writerRevoked = revokePicoReaderCustodyWriterGrant(sodium, {
      ownerIdentitySession,
      domainRecord,
      rotationRecords: [rotation2],
      writerGrantRecord,
      lifecycleId: 'reader_sync_writer_lifecycle_0001',
      reasonCategory: 'writer_removed',
      changedAt: '2026-07-27T10:42:30.000Z',
      lifecycleOrder: 'seq:0000000000000008',
    });
    const rotation3 = rotatePicoReaderCustodyDomain(sodium, {
      ownerIdentitySession,
      domainRecord,
      rotationRecords: [rotation2],
      writerGrantLifecycleRecords: [writerRevoked],
      remainingReaderGrantRecords: [forwardReaderGrantRecord],
      rotationId: 'reader_sync_rotation_0003',
      rotatedAt: '2026-07-27T10:43:00.000Z',
      lifecycleOrder: 'seq:0000000000000009',
    });
    const batch3 = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      readerGrantLifecycleRecords: [readerRevoked],
      writerGrantRecords: [writerGrantRecord],
      writerGrantLifecycleRecords: [writerRevoked],
      rotationRecords: [rotation2, rotation3],
      itemRecords: [itemRecord],
      syncBatchId: 'reader_sync_batch_0003',
      routeRef,
      sequence: 3,
      previousManifestDigestHex: batch2.manifestDigestHex,
      createdAt: '2026-07-27T10:45:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });
    const payload3 = openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: batch3.batchRecord,
      evaluatedAt: '2026-07-27T10:46:00.000Z',
    });
    expect(projector.accept(
      payload3,
      '2026-07-27T10:46:00.000Z',
    )).toMatchObject({
      ok: true,
      inserted: true,
      value: {
        readerStatus: 'revoked',
        readerEnvelopeVersions: [1],
      },
    });

    await expect(publisher.publish(batch2.batchRecord, { signal }))
      .resolves.toEqual({ inserted: true });
    await expect(publisher.publish(batch3.batchRecord, { signal }))
      .resolves.toEqual({ inserted: true });
    const runStateStore = new PicoReaderCustodySyncFileStateStore(
      createReaderSyncStatePath(),
    );
    const runPendingStore = new PicoReaderCustodySyncFilePendingStore(
      join(runStateStore.path, '..', 'pending.json'),
    );
    const runDeliveries: number[] = [];
    const boundedRunner = new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(runStateStore),
      runPendingStore,
      (projection) => {
        runDeliveries.push(projection.value.floor.sequence);
      },
    );
    await expect(boundedRunner.run({
      evaluatedAt: '2026-07-27T10:46:00.000Z',
      pageSize: 2,
      maxPages: 1,
      maxBatches: 3,
    }, { signal })).resolves.toMatchObject({
      ok: true,
      status: 'limit_reached',
      endCursor: 'cursor:0000000000000002',
      counters: {
        pagesRead: 1,
        batchesRead: 2,
        insertedBatches: 2,
      },
    });
    await expect(boundedRunner.run({
      evaluatedAt: '2026-07-27T10:46:00.000Z',
      pageSize: 2,
      maxPages: 2,
      maxBatches: 3,
    }, { signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      startCursor: 'cursor:0000000000000002',
      endCursor: 'cursor:0000000000000003',
      counters: {
        pagesRead: 1,
        batchesRead: 1,
        insertedBatches: 1,
      },
    });
    expect(runDeliveries).toEqual([1, 2, 3]);

    const materializedStateStore =
      new PicoReaderCustodySyncFileStateStore(
        createReaderSyncStatePath(),
      );
    const materializedPendingStore =
      new PicoReaderCustodySyncFilePendingStore(
        join(materializedStateStore.path, '..', 'pending.json'),
      );
    const materializedArchiveStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        join(materializedStateStore.path, '..', 'projections.json'),
        routeRef,
      );
    await expect(new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(materializedStateStore),
      materializedPendingStore,
      createPicoReaderCustodySyncProjectionMaterializationConsumer(
        materializedArchiveStore,
      ),
    ).run({
      evaluatedAt: '2026-07-27T10:46:00.000Z',
      pageSize: 3,
      maxPages: 1,
      maxBatches: 3,
    }, { signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      counters: {
        insertedBatches: 3,
        projectionsDelivered: 3,
      },
    });
    const materializedState = materializedStateStore.load()!;
    const restoredProjections = materializedArchiveStore.restore(
      pins,
      materializedState,
      ({ batchRecord, evaluatedAt }) =>
        openPicoReaderCustodySyncBatch(sodium, {
          readerKeyAgreementSession: readerAgreementSession,
          batchRecord,
          evaluatedAt,
        }),
    );
    expect(restoredProjections.map((restored) => ({
      sequence: restored.receipt.sequence,
      batchId: restored.receipt.syncBatchId,
      itemPackageIds: restored.value.itemPackageIds,
    }))).toEqual([
      {
        sequence: 1,
        batchId: batch1.batchRecord.syncBatchId,
        itemPackageIds: ['reader_sync_package_0001'],
      },
      {
        sequence: 2,
        batchId: batch2.batchRecord.syncBatchId,
        itemPackageIds: ['reader_sync_package_0001'],
      },
      {
        sequence: 3,
        batchId: batch3.batchRecord.syncBatchId,
        itemPackageIds: ['reader_sync_package_0001'],
      },
    ]);
    const openMaterializedProjection = ({
      batchRecord,
      evaluatedAt,
    }: {
      batchRecord: PicoReaderCustodySyncBatchRecord;
      evaluatedAt: string;
    }) => openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord,
      evaluatedAt,
    });
    const decryptMaterializedItem = (
      evidence: PicoReaderCustodySyncItemDecryptionEvidence,
    ) => decryptPicoReaderCustodyItem(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      domainRecord: evidence.domainRecord,
      rotationRecords: evidence.rotationRecords,
      readerGrantRecord: evidence.readerGrantRecord,
      writerGrantRecord: evidence.writerGrantRecord,
      itemRecord: evidence.itemRecord,
    });
    const evidenceSummaries: Array<{
      sequence: number;
      readerLifecycles: number;
      writerLifecycles: number;
      rotations: number;
      kekVersion: number;
    }> = [];
    const itemAccess = new PicoReaderCustodySyncItemAccess(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      openMaterializedProjection,
      (evidence) => {
        evidenceSummaries.push({
          sequence: evidence.receipt.sequence,
          readerLifecycles:
            evidence.readerGrantLifecycleRecords.length,
          writerLifecycles:
            evidence.writerGrantLifecycleRecords.length,
          rotations: evidence.rotationRecords.length,
          kekVersion: evidence.itemRecord.item.kekVersion,
        });
        return decryptMaterializedItem(evidence);
      },
    );
    let accessedPlaintext: string | undefined;
    itemAccess.access(
      'reader_sync_package_0001',
      (plaintext) => {
        accessedPlaintext = plaintext;
      },
      { signal },
    );
    expect(accessedPlaintext)
      .toBe('transport must never receive this plaintext');
    expect(evidenceSummaries).toEqual([{
      sequence: 3,
      readerLifecycles: 1,
      writerLifecycles: 1,
      rotations: 2,
      kekVersion: 1,
    }]);

    const forwardPins = {
      routeRef: forwardRouteRef,
      domainAuthorityId: domainRecord.domain.domainAuthorityId,
      homeId: domainRecord.domain.homeId,
      hostSigningKeyFingerprintHex:
        domainRecord.domain.hostSigningKeyFingerprintHex,
      domainId: domainRecord.domain.domainId,
      ownerIdentityKeyFingerprintHex:
        domainRecord.domain.ownerIdentityKeyFingerprintHex,
      readerGrantId:
        forwardReaderGrantRecord.grant.readerGrantId,
      readerIdentityKeyFingerprintHex:
        forwardReaderGrantRecord.grant.readerIdentityKeyFingerprintHex,
      readerKeyFingerprintHex:
        forwardReaderGrantRecord.grant.readerKeyFingerprintHex,
    };
    const forwardStateStore = new PicoReaderCustodySyncFileStateStore(
      createReaderSyncStatePath(),
    );
    const openForwardProjection = ({
      batchRecord,
      evaluatedAt,
    }: {
      batchRecord: PicoReaderCustodySyncBatchRecord;
      evaluatedAt: string;
    }) => openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: wrongAgreementSession,
      batchRecord,
      evaluatedAt,
    });
    const forwardProjection = new PicoReaderCustodySyncClient(
      sodium,
      forwardPins,
      forwardStateStore,
      openForwardProjection,
    ).apply({
      batchRecord: forwardBatch.batchRecord,
      evaluatedAt: '2026-07-27T10:10:00.000Z',
      transportCursor: 'cursor:0000000000000001',
    });
    expect(forwardProjection).toMatchObject({
      ok: true,
      inserted: true,
      value: {
        readerEnvelopeVersions: [1],
        itemPackageIds: ['reader_sync_package_0001'],
      },
    });
    if (!forwardProjection.ok) {
      throw new Error('expected_forward_projection');
    }
    const forwardArchiveStore =
      new PicoReaderCustodySyncProtectedProjectionFileStore(
        sodium,
        join(forwardStateStore.path, '..', 'forward-projections.json'),
        forwardRouteRef,
      );
    forwardArchiveStore.materialize(forwardProjection);
    let forwardPlaintext: string | undefined;
    let forwardAccessMode: string | undefined;
    new PicoReaderCustodySyncItemAccess(
      forwardArchiveStore,
      forwardPins,
      forwardStateStore,
      openForwardProjection,
      (evidence) => {
        forwardAccessMode =
          evidence.readerGrantRecord.grant.accessMode;
        return decryptPicoReaderCustodyItem(sodium, {
          readerKeyAgreementSession: wrongAgreementSession,
          domainRecord: evidence.domainRecord,
          rotationRecords: evidence.rotationRecords,
          readerGrantRecord: evidence.readerGrantRecord,
          writerGrantRecord: evidence.writerGrantRecord,
          itemRecord: evidence.itemRecord,
        });
      },
    ).access(
      'reader_sync_package_0001',
      (plaintext) => {
        forwardPlaintext = plaintext;
      },
      { signal },
    );
    expect(forwardAccessMode).toBe('forward_only');
    expect(forwardPlaintext)
      .toBe('transport must never receive this plaintext');

    const itemCatalog = new PicoReaderCustodySyncItemCatalog(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      openMaterializedProjection,
      decryptMaterializedItem,
    );
    let catalogDescriptors:
      readonly PicoReaderCustodySyncItemDescriptor[] = [];
    let listReentrancyRejected = false;
    itemCatalog.list((items) => {
      catalogDescriptors = items;
      expect(() => itemCatalog.present(
        items[0]!.selection,
        () => undefined,
        { signal },
      )).toThrow('reader_sync_item_catalog_in_progress');
      listReentrancyRejected = true;
    }, { signal });
    expect(listReentrancyRejected).toBe(true);
    expect(catalogDescriptors).toHaveLength(1);
    expect(Object.keys(catalogDescriptors[0]!).sort()).toEqual([
      'contentType',
      'createdAt',
      'memoryItemId',
      'selection',
    ]);
    expect(catalogDescriptors[0]).toMatchObject({
      memoryItemId: 'reader_sync_memory_0001',
      contentType: 'text/plain',
      createdAt: '2026-07-27T10:03:00.000Z',
    });
    expect(Object.isFrozen(catalogDescriptors)).toBe(true);
    expect(Object.isFrozen(catalogDescriptors[0])).toBe(true);
    expect(Object.keys(catalogDescriptors[0]!.selection)).toEqual([]);
    expect(JSON.stringify(catalogDescriptors[0]!.selection)).toBe('{}');

    let presentedItem: PicoReaderCustodySyncPresentedItem | undefined;
    let presentationWasFrozen = false;
    itemCatalog.present(
      catalogDescriptors[0]!.selection,
      (item) => {
        presentationWasFrozen = Object.isFrozen(item);
        presentedItem = { ...item };
      },
      { signal },
    );
    expect(presentationWasFrozen).toBe(true);
    expect(presentedItem).toEqual({
      memoryItemId: 'reader_sync_memory_0001',
      contentType: 'text/plain',
      createdAt: '2026-07-27T10:03:00.000Z',
      plaintext: 'transport must never receive this plaintext',
    });
    let presentationReentrancyRejected = false;
    itemCatalog.present(
      catalogDescriptors[0]!.selection,
      () => {
        expect(() => itemCatalog.present(
          catalogDescriptors[0]!.selection,
          () => undefined,
          { signal },
        )).toThrow('reader_sync_item_catalog_in_progress');
        presentationReentrancyRejected = true;
      },
      { signal },
    );
    expect(presentationReentrancyRejected).toBe(true);
    expect(() => itemCatalog.list(
      async () => undefined,
      { signal },
    )).toThrow(
      'reader_sync_item_catalog_consumer_must_be_synchronous',
    );
    expect(() => itemCatalog.present(
      catalogDescriptors[0]!.selection,
      async () => undefined,
      { signal },
    )).toThrow(
      'reader_sync_item_plaintext_consumer_must_be_synchronous',
    );
    expect(() => itemCatalog.present(
      new PicoReaderCustodySyncItemSelection(),
      () => undefined,
      { signal },
    )).toThrow('invalid_reader_sync_item_selection');
    const forwardCatalog = new PicoReaderCustodySyncItemCatalog(
      forwardArchiveStore,
      forwardPins,
      forwardStateStore,
      openForwardProjection,
      (evidence) => decryptPicoReaderCustodyItem(sodium, {
        readerKeyAgreementSession: wrongAgreementSession,
        domainRecord: evidence.domainRecord,
        rotationRecords: evidence.rotationRecords,
        readerGrantRecord: evidence.readerGrantRecord,
        writerGrantRecord: evidence.writerGrantRecord,
        itemRecord: evidence.itemRecord,
      }),
    );
    let forwardCatalogSelection:
      PicoReaderCustodySyncItemSelection | undefined;
    forwardCatalog.list((items) => {
      forwardCatalogSelection = items[0]!.selection;
    }, { signal });
    let forwardPresentedPlaintext: string | undefined;
    forwardCatalog.present(
      forwardCatalogSelection!,
      (item) => {
        forwardPresentedPlaintext = item.plaintext;
      },
      { signal },
    );
    expect(forwardPresentedPlaintext)
      .toBe('transport must never receive this plaintext');
    expect(() => forwardCatalog.present(
      catalogDescriptors[0]!.selection,
      () => undefined,
      { signal },
    )).toThrow('invalid_reader_sync_item_selection');

    let accessNowMs = 1_000;
    let accessUnlockCalls = 0;
    let lastAccessVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    const unlockAccessSession:
      PicoReaderCustodySyncAccessSessionUnlockPort = (input) => {
        const {
          readerKeyFingerprintHex,
          openedAtMs,
          maxDurationMs,
        } = input;
        accessUnlockCalls += 1;
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.keys(input).sort()).toEqual([
          'maxDurationMs',
          'openedAtMs',
          'readerKeyFingerprintHex',
        ]);
        expect(readerKeyFingerprintHex)
          .toBe(pins.readerKeyFingerprintHex);
        expect(openedAtMs).toBe(accessNowMs);
        expect(maxDurationMs).toBe(50);
        lastAccessVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          autoLockAfterMs: 25,
          nowMs: openedAtMs,
        });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          lastAccessVaultSession,
        );
      };
    const accessSession = new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      unlockAccessSession,
      { maxDurationMs: 50 },
    );
    let oneShotPresentation:
      PicoReaderCustodySyncPresentedItem | undefined;
    accessSession.run({
      selectItem: (items) => {
        expect(Object.isFrozen(items)).toBe(true);
        return items[0]!.selection;
      },
      presentItem: (item) => {
        oneShotPresentation = { ...item };
      },
    }, { signal });
    expect(oneShotPresentation).toEqual({
      memoryItemId: 'reader_sync_memory_0001',
      contentType: 'text/plain',
      createdAt: '2026-07-27T10:03:00.000Z',
      plaintext: 'transport must never receive this plaintext',
    });
    expect(accessUnlockCalls).toBe(1);
    expect(lastAccessVaultSession!.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    let asyncSelectorVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      ({ openedAtMs }) => {
        asyncSelectorVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          nowMs: openedAtMs,
        });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          asyncSelectorVaultSession,
        );
      },
    ).run({
      selectItem: (() => Promise.resolve(undefined)) as unknown as
        (items: readonly PicoReaderCustodySyncItemDescriptor[]) =>
          PicoReaderCustodySyncItemSelection | undefined,
    }, { signal })).toThrow(
      'reader_sync_access_session_selector_must_be_synchronous',
    );
    expect(asyncSelectorVaultSession!.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    let nestedSessionRejected = false;
    accessSession.run({
      selectItem: () => {
        expect(() => accessSession.run({
          selectItem: () => undefined,
        }, { signal })).toThrow(
          'reader_sync_access_session_in_progress',
        );
        nestedSessionRejected = true;
        return undefined;
      },
    }, { signal });
    expect(nestedSessionRejected).toBe(true);
    expect(accessUnlockCalls).toBe(2);
    expect(lastAccessVaultSession!.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    const wrongRoleVaultSession = openPicoVaultKeyfile(sodium, {
      keyfile: writerSigning.keyfile,
      passphrase: 'writer signing passphrase',
      nowMs: accessNowMs,
    });
    let wrongRoleUnlockCalls = 0;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      () => {
        wrongRoleUnlockCalls += 1;
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          wrongRoleVaultSession,
        );
      },
    ).run({
      selectItem: () => undefined,
    }, { signal })).toThrow(
      'reader_sync_access_session_key_role_mismatch',
    );
    expect(wrongRoleUnlockCalls).toBe(1);
    expect(wrongRoleVaultSession.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    const wrongFingerprintVaultSession = openPicoVaultKeyfile(
      sodium,
      {
        keyfile: wrongAgreement.keyfile,
        passphrase: 'wrong agreement passphrase',
        nowMs: accessNowMs,
      },
    );
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      () => createPicoVaultReaderCustodySyncAccessSession(
        sodium,
        wrongFingerprintVaultSession,
      ),
    ).run({
      selectItem: () => undefined,
    }, { signal })).toThrow(
      'reader_sync_access_session_key_fingerprint_mismatch',
    );
    expect(wrongFingerprintVaultSession.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    const initiallyLockedVaultSession = openPicoVaultKeyfile(
      sodium,
      {
        keyfile: readerAgreement.keyfile,
        passphrase: 'reader agreement passphrase',
        nowMs: accessNowMs,
      },
    );
    initiallyLockedVaultSession.lock();
    let lockedUnlockCalls = 0;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      () => {
        lockedUnlockCalls += 1;
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          initiallyLockedVaultSession,
        );
      },
    ).run({
      selectItem: () => undefined,
    }, { signal })).toThrow('reader_sync_access_session_locked');
    expect(lockedUnlockCalls).toBe(1);

    let expiringNowMs = 2_000;
    let expiredVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => expiringNowMs },
      ({ openedAtMs }) => {
        expiredVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          nowMs: openedAtMs,
        });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          expiredVaultSession,
        );
      },
      { maxDurationMs: 10 },
    ).run({
      selectItem: () => {
        expiringNowMs += 11;
        return undefined;
      },
    }, { signal })).toThrow('reader_sync_access_session_expired');
    expect(expiredVaultSession!.isLocked({
      nowMs: expiringNowMs,
    })).toBe(true);

    let idleNowMs = 3_000;
    let idleVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => idleNowMs },
      ({ openedAtMs }) => {
        idleVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          autoLockAfterMs: 5,
          nowMs: openedAtMs,
        });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          idleVaultSession,
        );
      },
      { maxDurationMs: 10 },
    ).run({
      selectItem: () => {
        idleNowMs += 6;
        return undefined;
      },
    }, { signal })).toThrow('reader_sync_access_session_locked');
    expect(idleVaultSession!.isLocked({
      nowMs: idleNowMs,
    })).toBe(true);

    const rollbackClockValues = [4_000, 3_999];
    let rollbackClockIndex = 0;
    let rollbackVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      {
        nowMs: () =>
          rollbackClockValues[rollbackClockIndex++]!,
      },
      ({ openedAtMs }) => {
        rollbackVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          nowMs: openedAtMs,
        });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          rollbackVaultSession,
        );
      },
    ).run({
      selectItem: () => undefined,
    }, { signal })).toThrow(
      'reader_sync_access_session_clock_rollback',
    );
    expect(rollbackVaultSession!.isLocked({
      nowMs: rollbackClockValues[0]!,
    })).toBe(true);

    const sessionAbortController = new AbortController();
    let abortedVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      ({ openedAtMs }) => {
        abortedVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          nowMs: openedAtMs,
        });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          abortedVaultSession,
        );
      },
    ).run({
      selectItem: (items) => {
        sessionAbortController.abort();
        return items[0]!.selection;
      },
      presentItem: () => undefined,
    }, { signal: sessionAbortController.signal })).toThrow(
      'sync_transport_aborted',
    );
    expect(abortedVaultSession!.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    let decryptFailureVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      ({ openedAtMs }) => {
        decryptFailureVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          nowMs: openedAtMs,
        });
        const adapter =
          createPicoVaultReaderCustodySyncAccessSession(
            sodium,
            decryptFailureVaultSession,
          );
        return {
          ...adapter,
          decryptItem: () => {
            throw new Error('simulated_reader_decrypt_failure');
          },
        };
      },
    ).run({
      selectItem: (items) => items[0]!.selection,
      presentItem: () => undefined,
    }, { signal })).toThrow('simulated_reader_decrypt_failure');
    expect(decryptFailureVaultSession!.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    let presentationFailureVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      ({ openedAtMs }) => {
        presentationFailureVaultSession =
          openPicoVaultKeyfile(sodium, {
            keyfile: readerAgreement.keyfile,
            passphrase: 'reader agreement passphrase',
            nowMs: openedAtMs,
          });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          presentationFailureVaultSession,
        );
      },
    ).run({
      selectItem: (items) => items[0]!.selection,
      presentItem: () => {
        throw new Error('simulated_presentation_failure');
      },
    }, { signal })).toThrow('simulated_presentation_failure');
    expect(presentationFailureVaultSession!.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    let selectionRaceState = structuredClone(materializedState);
    let selectionRaceVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      {
        restore: () => structuredClone(restoredProjections),
      },
      pins,
      {
        load: () => structuredClone(selectionRaceState),
      },
      { nowMs: () => accessNowMs },
      ({ openedAtMs }) => {
        selectionRaceVaultSession =
          openPicoVaultKeyfile(sodium, {
            keyfile: readerAgreement.keyfile,
            passphrase: 'reader agreement passphrase',
            nowMs: openedAtMs,
          });
        return createPicoVaultReaderCustodySyncAccessSession(
          sodium,
          selectionRaceVaultSession,
        );
      },
    ).run({
      selectItem: (items) => {
        selectionRaceState = {
          ...selectionRaceState,
          revision: selectionRaceState.revision + 1,
        };
        return items[0]!.selection;
      },
      presentItem: () => undefined,
    }, { signal })).toThrow('reader_sync_item_selection_stale');
    expect(selectionRaceVaultSession!.isLocked({
      nowMs: accessNowMs,
    })).toBe(true);

    let lockFailureVaultSession:
      ReturnType<typeof openPicoVaultKeyfile> | undefined;
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      ({ openedAtMs }) => {
        lockFailureVaultSession = openPicoVaultKeyfile(sodium, {
          keyfile: readerAgreement.keyfile,
          passphrase: 'reader agreement passphrase',
          nowMs: openedAtMs,
        });
        const adapter =
          createPicoVaultReaderCustodySyncAccessSession(
            sodium,
            lockFailureVaultSession,
          );
        return {
          ...adapter,
          lock: () => undefined,
        };
      },
    ).run({
      selectItem: () => undefined,
    }, { signal })).toThrow(
      'reader_sync_access_session_lock_failed',
    );
    lockFailureVaultSession!.lock();

    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      () => undefined,
    ).run({
      selectItem: () => undefined,
    }, { signal })).toThrow('reader_sync_access_session_unavailable');
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      (() => Promise.resolve(undefined)) as unknown as
        PicoReaderCustodySyncAccessSessionUnlockPort,
    ).run({
      selectItem: () => undefined,
    }, { signal })).toThrow(
      'reader_sync_access_session_unlock_must_be_synchronous',
    );
    expect(() => new PicoReaderCustodySyncAccessSession(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      { nowMs: () => accessNowMs },
      unlockAccessSession,
      {
        maxDurationMs:
          MAX_PICO_READER_CUSTODY_SYNC_ACCESS_SESSION_MS + 1,
      },
    )).toThrow('invalid_reader_sync_access_session_duration');

    const catalogAbortController = new AbortController();
    catalogAbortController.abort();
    expect(() => itemCatalog.list(
      () => undefined,
      { signal: catalogAbortController.signal },
    )).toThrow('sync_transport_aborted');
    expect(() => itemCatalog.present(
      catalogDescriptors[0]!.selection,
      () => undefined,
      { signal: catalogAbortController.signal },
    )).toThrow('sync_transport_aborted');
    const presentationAbortController = new AbortController();
    const abortingCatalog = new PicoReaderCustodySyncItemCatalog(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      openMaterializedProjection,
      (evidence) => {
        const plaintext = decryptMaterializedItem(evidence);
        presentationAbortController.abort();
        return plaintext;
      },
    );
    let abortingCatalogSelection:
      PicoReaderCustodySyncItemSelection | undefined;
    abortingCatalog.list((items) => {
      abortingCatalogSelection = items[0]!.selection;
    }, { signal: presentationAbortController.signal });
    let abortedPresentationDelivered = false;
    expect(() => abortingCatalog.present(
      abortingCatalogSelection!,
      () => {
        abortedPresentationDelivered = true;
      },
      { signal: presentationAbortController.signal },
    )).toThrow('sync_transport_aborted');
    expect(abortedPresentationDelivered).toBe(false);

    let nestedAccessRejected = false;
    itemAccess.access(
      'reader_sync_package_0001',
      () => {
        expect(() => itemAccess.access(
          'reader_sync_package_0001',
          () => undefined,
          { signal },
        )).toThrow('reader_sync_item_access_in_progress');
        nestedAccessRejected = true;
      },
      { signal },
    );
    expect(nestedAccessRejected).toBe(true);
    expect(() => itemAccess.access(
      'reader_sync_package_0001',
      async () => undefined,
      { signal },
    )).toThrow(
      'reader_sync_item_plaintext_consumer_must_be_synchronous',
    );

    const decryptAbortController = new AbortController();
    let abortedPlaintextDelivered = false;
    const abortingAccess = new PicoReaderCustodySyncItemAccess(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      openMaterializedProjection,
      (evidence) => {
        const plaintext = decryptMaterializedItem(evidence);
        decryptAbortController.abort();
        return plaintext;
      },
    );
    expect(() => abortingAccess.access(
      'reader_sync_package_0001',
      () => {
        abortedPlaintextDelivered = true;
      },
      { signal: decryptAbortController.signal },
    )).toThrow('sync_transport_aborted');
    expect(abortedPlaintextDelivered).toBe(false);

    const wrongReaderAccess = new PicoReaderCustodySyncItemAccess(
      materializedArchiveStore,
      pins,
      materializedStateStore,
      openMaterializedProjection,
      (evidence) => decryptPicoReaderCustodyItem(sodium, {
        readerKeyAgreementSession: wrongAgreementSession,
        domainRecord: evidence.domainRecord,
        rotationRecords: evidence.rotationRecords,
        readerGrantRecord: evidence.readerGrantRecord,
        writerGrantRecord: evidence.writerGrantRecord,
        itemRecord: evidence.itemRecord,
      }),
    );
    expect(() => wrongReaderAccess.access(
      'reader_sync_package_0001',
      () => undefined,
      { signal },
    )).toThrow('reader_key_mismatch');

    const restoredSource = (
      projections: typeof restoredProjections,
    ) => ({
      restore: () => structuredClone(projections),
    });
    const currentStateSource = {
      load: () => structuredClone(materializedState),
    };
    const accessFrom = (projections: typeof restoredProjections) =>
      new PicoReaderCustodySyncItemAccess(
        restoredSource(projections),
        pins,
        currentStateSource,
        openMaterializedProjection,
        decryptMaterializedItem,
      );
    const catalogFrom = (
      projections: typeof restoredProjections,
      options: { maxEntries?: number } = {},
    ) => new PicoReaderCustodySyncItemCatalog(
      restoredSource(projections),
      pins,
      currentStateSource,
      openMaterializedProjection,
      decryptMaterializedItem,
      options,
    );

    const staleProjections = structuredClone(restoredProjections);
    staleProjections.at(-1)!.payload.itemRecords = [];
    staleProjections.at(-1)!.value.itemPackageIds = [];
    expect(() => accessFrom(staleProjections).access(
      'reader_sync_package_0001',
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_evidence_stale');
    let emptyCatalog:
      readonly PicoReaderCustodySyncItemDescriptor[] | undefined;
    catalogFrom(staleProjections).list((items) => {
      emptyCatalog = items;
    }, { signal });
    expect(emptyCatalog).toEqual([]);

    const forkedProjections = structuredClone(restoredProjections);
    forkedProjections.at(-1)!.payload.itemRecords[0]!
      .item.contentType = 'text/markdown';
    expect(() => accessFrom(forkedProjections).access(
      'reader_sync_package_0001',
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_evidence_fork');
    expect(() => catalogFrom(forkedProjections).list(
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_catalog_evidence_fork');

    const ambiguousProjections = structuredClone(restoredProjections);
    ambiguousProjections.at(-1)!.payload.itemRecords.push(
      structuredClone(
        ambiguousProjections.at(-1)!.payload.itemRecords[0]!,
      ),
    );
    expect(() => accessFrom(ambiguousProjections).access(
      'reader_sync_package_0001',
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_evidence_ambiguous');
    expect(() => catalogFrom(ambiguousProjections).list(
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_catalog_ambiguous');

    const crossWriterProjections = structuredClone(restoredProjections);
    for (const projection of crossWriterProjections) {
      projection.payload.itemRecords[0]!.item.writerGrantId =
        'reader_sync_writer_grant_cross_scope';
    }
    expect(() => accessFrom(crossWriterProjections).access(
      'reader_sync_package_0001',
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_writer_evidence_ambiguous');
    expect(() => catalogFrom(crossWriterProjections).list(
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_writer_evidence_ambiguous');

    const crossDomainProjections = structuredClone(restoredProjections);
    crossDomainProjections.at(-1)!.payload.domainRecord.domain.domainId =
      'reader_sync_domain_cross_scope';
    expect(() => accessFrom(crossDomainProjections).access(
      'reader_sync_package_0001',
      () => undefined,
      { signal },
    )).toThrow('invalid_reader_sync_item_evidence');
    expect(() => catalogFrom(crossDomainProjections).list(
      () => undefined,
      { signal },
    )).toThrow('invalid_reader_sync_item_evidence');

    const oversizedCatalogProjections =
      structuredClone(restoredProjections);
    const oversizedHead = oversizedCatalogProjections.at(-1)!;
    const secondItem = structuredClone(
      oversizedHead.payload.itemRecords[0]!,
    );
    secondItem.item.packageId = 'reader_sync_package_0002';
    secondItem.item.memoryItemId = 'reader_sync_memory_0002';
    oversizedHead.payload.itemRecords.push(secondItem);
    oversizedHead.value.itemPackageIds.push(
      secondItem.item.packageId,
    );
    oversizedHead.value.itemPackageIds.sort();
    expect(() => catalogFrom(
      oversizedCatalogProjections,
      { maxEntries: 1 },
    ).list(
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_catalog_limit_exceeded');
    expect(() => catalogFrom(
      restoredProjections,
      { maxEntries: 0 },
    )).toThrow('invalid_reader_sync_item_catalog_limit');
    expect(() => catalogFrom(
      restoredProjections,
      {
        maxEntries:
          MAX_PICO_READER_CUSTODY_SYNC_ITEM_CATALOG_ENTRIES + 1,
      },
    )).toThrow('invalid_reader_sync_item_catalog_limit');

    let catalogStateChanged = false;
    const catalogChangingStateSource = {
      load: () => {
        const state = structuredClone(materializedState);
        if (catalogStateChanged) {
          state.revision += 1;
        }
        return state;
      },
    };
    let changedCatalogDelivered = false;
    expect(() => new PicoReaderCustodySyncItemCatalog(
      {
        restore: () => {
          catalogStateChanged = true;
          return structuredClone(restoredProjections);
        },
      },
      pins,
      catalogChangingStateSource,
      openMaterializedProjection,
      decryptMaterializedItem,
    ).list(
      () => {
        changedCatalogDelivered = true;
      },
      { signal },
    )).toThrow('reader_sync_item_catalog_state_changed');
    expect(changedCatalogDelivered).toBe(false);

    let selectionState = structuredClone(materializedState);
    const staleSelectionCatalog = new PicoReaderCustodySyncItemCatalog(
      restoredSource(restoredProjections),
      pins,
      { load: () => structuredClone(selectionState) },
      openMaterializedProjection,
      decryptMaterializedItem,
    );
    let staleSelection:
      PicoReaderCustodySyncItemSelection | undefined;
    staleSelectionCatalog.list((items) => {
      staleSelection = items[0]!.selection;
    }, { signal });
    selectionState = {
      ...selectionState,
      revision: selectionState.revision + 1,
    };
    let staleSelectionPresented = false;
    expect(() => staleSelectionCatalog.present(
      staleSelection!,
      () => {
        staleSelectionPresented = true;
      },
      { signal },
    )).toThrow('reader_sync_item_selection_stale');
    expect(staleSelectionPresented).toBe(false);

    let raceMode = false;
    let raceStateLoads = 0;
    let raceDecryptCalled = false;
    const racingSelectionCatalog =
      new PicoReaderCustodySyncItemCatalog(
        restoredSource(restoredProjections),
        pins,
        {
          load: () => {
            const state = structuredClone(materializedState);
            if (raceMode) {
              raceStateLoads += 1;
              if (raceStateLoads > 1) {
                state.revision += 1;
              }
            }
            return state;
          },
        },
        openMaterializedProjection,
        (evidence) => {
          raceDecryptCalled = true;
          return decryptMaterializedItem(evidence);
        },
      );
    let racingSelection:
      PicoReaderCustodySyncItemSelection | undefined;
    racingSelectionCatalog.list((items) => {
      racingSelection = items[0]!.selection;
    }, { signal });
    raceMode = true;
    expect(() => racingSelectionCatalog.present(
      racingSelection!,
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_selection_stale');
    expect(raceDecryptCalled).toBe(false);

    const crossScopeState = structuredClone(materializedState);
    crossScopeState.pins.domainId = 'reader_sync_domain_cross_scope';
    expect(() => new PicoReaderCustodySyncItemCatalog(
      restoredSource(restoredProjections),
      pins,
      { load: () => structuredClone(crossScopeState) },
      openMaterializedProjection,
      decryptMaterializedItem,
    ).list(
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_catalog_scope_mismatch');

    let accessStateChanged = false;
    const changingStateSource = {
      load: () => {
        const state = structuredClone(materializedState);
        if (accessStateChanged) {
          state.revision += 1;
        }
        return state;
      },
    };
    let changedStatePlaintextDelivered = false;
    expect(() => new PicoReaderCustodySyncItemAccess(
      restoredSource(restoredProjections),
      pins,
      changingStateSource,
      openMaterializedProjection,
      (evidence) => {
        const plaintext = decryptMaterializedItem(evidence);
        accessStateChanged = true;
        return plaintext;
      },
    ).access(
      'reader_sync_package_0001',
      () => {
        changedStatePlaintextDelivered = true;
      },
      { signal },
    )).toThrow('reader_sync_item_access_state_changed');
    expect(changedStatePlaintextDelivered).toBe(false);

    expect(() => itemAccess.access(
      'reader_sync_package_missing',
      () => undefined,
      { signal },
    )).toThrow('reader_sync_item_not_found');
    expect(readFileSync(materializedArchiveStore.path, 'utf8'))
      .not.toContain(domainRecord.domain.homeId);
    expect(readFileSync(materializedArchiveStore.path, 'utf8'))
      .not.toContain('transport must never receive this plaintext');
    expect(() => materializedArchiveStore.restore(
      pins,
      {
        ...materializedState,
        floor: { ...restoredProjections[1]!.value.floor },
      },
      ({ batchRecord, evaluatedAt }) =>
        openPicoReaderCustodySyncBatch(sodium, {
          readerKeyAgreementSession: readerAgreementSession,
          batchRecord,
          evaluatedAt,
        }),
    )).toThrow('reader_sync_projection_archive_state_mismatch');
    const materializedArchive = JSON.parse(
      readFileSync(materializedArchiveStore.path, 'utf8'),
    ) as {
      records: Array<{
        receipt: { manifestDigestHex: string };
      }>;
    };
    materializedArchive.records.at(-1)!.receipt.manifestDigestHex =
      'ab'.repeat(32);
    writeFileSync(
      materializedArchiveStore.path,
      `${JSON.stringify(materializedArchive)}\n`,
    );
    expect(() => materializedArchiveStore.restore(
      pins,
      materializedState,
      ({ batchRecord, evaluatedAt }) =>
        openPicoReaderCustodySyncBatch(sodium, {
          readerKeyAgreementSession: readerAgreementSession,
          batchRecord,
          evaluatedAt,
        }),
    )).toThrow('invalid_reader_sync_projection_archive');

    const midPageStateStore = new PicoReaderCustodySyncFileStateStore(
      createReaderSyncStatePath(),
    );
    const midPagePendingStore =
      new PicoReaderCustodySyncFilePendingStore(
        join(midPageStateStore.path, '..', 'pending.json'),
      );
    let failMidPageOnce = true;
    const midPageRunner = new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(midPageStateStore),
      midPagePendingStore,
      (projection) => {
        if (projection.value.floor.sequence === 2 && failMidPageOnce) {
          failMidPageOnce = false;
          throw new Error('simulated_real_projection_consumer_crash');
        }
      },
    );
    await expect(midPageRunner.run({
      evaluatedAt: '2026-07-27T10:46:00.000Z',
      pageSize: 3,
      maxPages: 1,
      maxBatches: 3,
    }, { signal })).rejects.toThrow(
      'simulated_real_projection_consumer_crash',
    );
    expect(midPageStateStore.load()).toMatchObject({
      floor: { sequence: 2 },
      transportCursor: null,
    });
    const resumedDeliveries: number[] = [];
    await expect(new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(midPageStateStore),
      midPagePendingStore,
      (projection) => {
        resumedDeliveries.push(projection.value.floor.sequence);
      },
    ).run({
      evaluatedAt: '2026-07-27T10:46:00.000Z',
      pageSize: 3,
      maxPages: 1,
      maxBatches: 4,
    }, { signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      endCursor: 'cursor:0000000000000003',
      counters: {
        insertedBatches: 1,
        replayedBatches: 1,
        obsoleteBatches: 2,
      },
    });
    expect(resumedDeliveries).toEqual([2, 3]);

    const expiryStateStore = new PicoReaderCustodySyncFileStateStore(
      createReaderSyncStatePath(),
    );
    const expiryPendingStore =
      new PicoReaderCustodySyncFilePendingStore(
        join(expiryStateStore.path, '..', 'pending.json'),
      );
    await expect(new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(expiryStateStore),
      expiryPendingStore,
      () => {
        throw new Error('simulated_crash_before_pending_ack');
      },
    ).run({
      evaluatedAt: '2026-07-27T10:11:00.000Z',
      pageSize: 1,
      maxPages: 1,
      maxBatches: 1,
    }, { signal })).rejects.toThrow(
      'simulated_crash_before_pending_ack',
    );
    expect(expiryStateStore.load()?.floor.sequence).toBe(1);
    const originalPending = expiryPendingStore.load()!;
    const mismatchedVerifiedAtPending = {
      ...originalPending,
      stagedAt: '2026-07-27T10:12:00.000Z',
    };
    writeFileSync(
      expiryPendingStore.path,
      `${JSON.stringify(mismatchedVerifiedAtPending)}\n`,
    );
    await expect(new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(expiryStateStore),
      expiryPendingStore,
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T12:00:00.000Z',
      pageSize: 1,
      maxPages: 1,
      maxBatches: 1,
    }, { signal })).rejects.toThrow('invalid_reader_sync_batch');
    expect(expiryPendingStore.load())
      .toEqual(mismatchedVerifiedAtPending);

    const sealedPayloadHex =
      originalPending.batchRecord.sealedPayloadHex;
    const tamperedPending = {
      ...originalPending,
      batchRecord: {
        ...originalPending.batchRecord,
        sealedPayloadHex:
          `${sealedPayloadHex.startsWith('00') ? '01' : '00'}`
          + sealedPayloadHex.slice(2),
      },
    };
    writeFileSync(
      expiryPendingStore.path,
      `${JSON.stringify(tamperedPending)}\n`,
    );
    await expect(new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(expiryStateStore),
      expiryPendingStore,
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T12:00:00.000Z',
      pageSize: 1,
      maxPages: 1,
      maxBatches: 1,
    }, { signal })).rejects.toThrow('invalid_reader_sync_batch');
    expect(expiryPendingStore.load()).toEqual(tamperedPending);

    writeFileSync(
      expiryPendingStore.path,
      `${JSON.stringify(originalPending)}\n`,
    );
    const expiredReplayDeliveries: number[] = [];
    await expect(new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(expiryStateStore),
      expiryPendingStore,
      (projection) => {
        expiredReplayDeliveries.push(
          projection.value.floor.sequence,
        );
      },
    ).run({
      evaluatedAt: '2026-07-27T12:00:00.000Z',
      pageSize: 1,
      maxPages: 1,
      maxBatches: 2,
    }, { signal })).resolves.toMatchObject({
      ok: true,
      status: 'source_drained',
      counters: {
        replayedBatches: 1,
        projectionsDelivered: 1,
      },
    });
    expect(expiredReplayDeliveries).toEqual([1]);
    expect(expiryPendingStore.load()).toBeUndefined();

    const unverifiedExpiryStateStore =
      new PicoReaderCustodySyncFileStateStore(
        createReaderSyncStatePath(),
      );
    const unverifiedExpiryPendingStore =
      new PicoReaderCustodySyncFilePendingStore(
        join(unverifiedExpiryStateStore.path, '..', 'pending.json'),
      );
    const failBeforeApplyClient = new PicoReaderCustodySyncClient(
      sodium,
      pins,
      unverifiedExpiryStateStore,
      () => {
        throw new Error('simulated_crash_before_apply');
      },
    );
    await expect(new PicoReaderCustodySyncRunner(
      source,
      failBeforeApplyClient,
      unverifiedExpiryPendingStore,
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T10:11:00.000Z',
      pageSize: 1,
      maxPages: 1,
      maxBatches: 1,
    }, { signal })).rejects.toThrow('simulated_crash_before_apply');
    expect(unverifiedExpiryStateStore.load()).toBeUndefined();
    const unverifiedPending =
      unverifiedExpiryPendingStore.load();
    expect(unverifiedPending?.batchRecord.syncBatchId)
      .toBe(batch1.batchRecord.syncBatchId);

    await expect(new PicoReaderCustodySyncRunner(
      source,
      createDurableClient(unverifiedExpiryStateStore),
      unverifiedExpiryPendingStore,
      () => undefined,
    ).run({
      evaluatedAt: '2026-07-27T12:00:00.000Z',
      pageSize: 1,
      maxPages: 1,
      maxBatches: 1,
    }, { signal })).rejects.toThrow('invalid_reader_sync_batch');
    expect(unverifiedExpiryStateStore.load()).toBeUndefined();
    expect(unverifiedExpiryPendingStore.load())
      .toEqual(unverifiedPending);

    const crashAfterCommitStore: PicoReaderCustodySyncClientStateStore = {
      load: () => durableStateStore.load(),
      commit: (state, expectedRevision) => {
        durableStateStore.commit(state, expectedRevision);
        throw new Error('simulated_crash_after_commit');
      },
    };
    expect(() => createDurableClient(crashAfterCommitStore).apply({
      batchRecord: batch3.batchRecord,
      evaluatedAt: '2026-07-27T10:46:00.000Z',
      transportCursor: 'cursor:0000000000000003',
    })).toThrow('simulated_crash_after_commit');
    expect(durableStateStore.load()).toMatchObject({
      floor: { sequence: 3 },
      transportCursor: 'cursor:0000000000000003',
    });
    expect(createDurableClient(durableStateStore).apply({
      batchRecord: batch3.batchRecord,
      evaluatedAt: '2026-07-27T10:46:00.000Z',
      transportCursor: 'cursor:0000000000000003',
    })).toMatchObject({
      ok: true,
      inserted: false,
      state: { floor: { sequence: 3 } },
    });

    const restoredProjector = new PicoReaderCustodySyncProjector(
      sodium,
      pins,
      projector.floor(),
    );
    expect(restoredProjector.accept(
      payload3,
      '2026-07-27T10:46:00.000Z',
    )).toMatchObject({ ok: true, inserted: false });
    expect(restoredProjector.accept(
      payload2,
      '2026-07-27T10:46:00.000Z',
    )).toEqual({ ok: false, reason: 'rollback' });
    const storedFloor = projector.floor()!;
    expect(new PicoReaderCustodySyncProjector(sodium, pins, {
      ...storedFloor,
      throughKekVersion: storedFloor.throughKekVersion + 1,
    }).accept(
      payload3,
      '2026-07-27T10:46:00.000Z',
    )).toEqual({ ok: false, reason: 'fork' });

    expect(() => createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      writerGrantRecords: [writerGrantRecord],
      rotationRecords: [rotation2],
      itemRecords: [itemRecord],
      syncBatchId: 'reader_sync_batch_missing_cause',
      routeRef,
      sequence: 3,
      previousManifestDigestHex: batch2.manifestDigestHex,
      createdAt: '2026-07-27T10:45:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    })).toThrow('invalid_sync_rotation_causes');
    const missingCausePayload = structuredClone(payload3);
    missingCausePayload.readerGrantLifecycleRecords = [];
    const interruptedProjector =
      new PicoReaderCustodySyncProjector(sodium, pins);
    expect(interruptedProjector.accept(
      payload1,
      '2026-07-27T10:11:00.000Z',
    )).toMatchObject({ ok: true });
    expect(interruptedProjector.accept(
      payload2,
      '2026-07-27T10:21:00.000Z',
    )).toMatchObject({ ok: true });
    expect(interruptedProjector.accept(
      missingCausePayload,
      '2026-07-27T10:46:00.000Z',
    )).toEqual({ ok: false, reason: 'invalid_payload' });

    const forkProjector =
      new PicoReaderCustodySyncProjector(sodium, pins);
    expect(forkProjector.accept(
      payload1,
      '2026-07-27T10:11:00.000Z',
    )).toMatchObject({ ok: true });
    expect(forkProjector.accept(
      payload2,
      '2026-07-27T10:21:00.000Z',
    )).toMatchObject({ ok: true });
    const forkBatch = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      writerGrantRecords: [writerGrantRecord],
      itemRecords: [itemRecord],
      syncBatchId: 'reader_sync_batch_0002_fork',
      routeRef,
      sequence: 2,
      previousManifestDigestHex: batch1.manifestDigestHex,
      createdAt: '2026-07-27T10:20:00.000Z',
      expiresAt: '2026-07-27T11:00:00.000Z',
    });
    const forkPayload = openPicoReaderCustodySyncBatch(sodium, {
      readerKeyAgreementSession: readerAgreementSession,
      batchRecord: forkBatch.batchRecord,
      evaluatedAt: '2026-07-27T10:21:00.000Z',
    });
    expect(forkProjector.accept(
      forkPayload,
      '2026-07-27T10:21:00.000Z',
    )).toEqual({ ok: false, reason: 'fork' });

    const forkStateStore = new PicoReaderCustodySyncFileStateStore(
      createReaderSyncStatePath(),
    );
    const forkDurableClient = createDurableClient(forkStateStore);
    expect(forkDurableClient.apply({
      batchRecord: batch1.batchRecord,
      evaluatedAt: '2026-07-27T10:11:00.000Z',
    })).toMatchObject({ ok: true, inserted: true });
    expect(forkDurableClient.apply({
      batchRecord: batch2.batchRecord,
      evaluatedAt: '2026-07-27T10:21:00.000Z',
    })).toMatchObject({ ok: true, inserted: true });
    expect(createDurableClient(forkStateStore).apply({
      batchRecord: forkBatch.batchRecord,
      evaluatedAt: '2026-07-27T10:21:00.000Z',
    })).toEqual({ ok: false, reason: 'fork' });
    expect(forkStateStore.load()?.floor.sequence).toBe(2);

    const tamperedPayload = structuredClone(payload1);
    tamperedPayload.itemRecords[0]!.item.contentType = 'text/markdown';
    expect(new PicoReaderCustodySyncProjector(sodium, pins).accept(
      tamperedPayload,
      '2026-07-27T10:11:00.000Z',
    )).toEqual({ ok: false, reason: 'invalid_payload' });
    expect(new PicoReaderCustodySyncProjector(sodium, {
      ...pins,
      homeId: 'home_reader_sync_foreign',
    }).accept(
      payload1,
      '2026-07-27T10:11:00.000Z',
    )).toEqual({ ok: false, reason: 'wrong_scope' });
  }, 30_000);
});

function createReaderSyncStatePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pico-reader-sync-state-'));
  temporaryDirectories.push(directory);
  return join(directory, 'state.json');
}

function createReaderSyncPendingPath(): string {
  const directory = mkdtempSync(
    join(tmpdir(), 'pico-reader-sync-pending-'),
  );
  temporaryDirectories.push(directory);
  return join(directory, 'pending.json');
}

function createReaderSyncProjectionArchivePath(): string {
  const directory = mkdtempSync(
    join(tmpdir(), 'pico-reader-sync-projections-'),
  );
  temporaryDirectories.push(directory);
  return join(directory, 'projections.json');
}

function protectedProjection(
  sequence: number,
  previousManifestDigestHex =
    sequence === 1 ? '00'.repeat(32) : 'ff'.repeat(32),
  suffix = '',
): PicoReaderCustodySyncClientApplySuccess {
  const pins = readerSyncClientPins();
  const syncBatchId =
    `reader_sync_batch_${String(sequence).padStart(4, '0')}${suffix}`;
  const createdAt =
    `2026-07-27T10:${String(sequence).padStart(2, '0')}:00.000Z`;
  const expiresAt = '2026-07-27T11:00:00.000Z';
  const manifest = {
    suite: picoMemoryContentSuite,
    syncBatchId,
    routeRef: pins.routeRef,
    domainAuthorityId: pins.domainAuthorityId,
    homeId: pins.homeId,
    hostSigningKeyFingerprintHex:
      pins.hostSigningKeyFingerprintHex,
    domainId: pins.domainId,
    ownerIdentityKeyFingerprintHex:
      pins.ownerIdentityKeyFingerprintHex,
    readerGrantId: pins.readerGrantId,
    readerKeyFingerprintHex: pins.readerKeyFingerprintHex,
    sequence,
    previousManifestDigestHex,
    evidenceDigestHex: 'ee'.repeat(32),
    throughKekVersion: sequence,
    observedThroughLifecycleOrder:
      `seq:${String(sequence).padStart(16, '0')}`,
    createdAt,
    expiresAt,
  };
  const manifestDigestHex = Buffer.from(
    sodium.crypto_generichash(
      32,
      buildPicoReaderCustodySyncManifestSignatureInput(manifest),
      null,
    ),
  ).toString('hex');
  const sealedPayloadHex = Buffer.from(
    `sealed-reader-projection:${syncBatchId}`,
    'utf8',
  ).toString('hex');
  const batchRecord: PicoReaderCustodySyncBatchRecord = {
    schema: picoReaderCustodySyncBatchRecordSchema,
    routeRef: pins.routeRef,
    syncBatchId,
    sealedPayloadHex,
    sealedPayloadDigestHex: Buffer.from(
      sodium.crypto_generichash(
        32,
        Buffer.from(sealedPayloadHex, 'hex'),
        null,
      ),
    ).toString('hex'),
    expiresAt,
  };
  const floor = {
    routeRef: pins.routeRef,
    syncBatchId,
    sequence,
    manifestDigestHex,
    throughKekVersion: sequence,
    observedThroughLifecycleOrder:
      manifest.observedThroughLifecycleOrder,
    createdAt,
  };
  const state: PicoReaderCustodySyncClientState = {
    schema: picoReaderCustodySyncClientStateSchema,
    schemaVersion: 1,
    revision: sequence,
    pins,
    floor,
    verifiedAt: '2026-07-27T10:30:00.000Z',
    transportCursor: null,
  };
  return {
    ok: true,
    inserted: true,
    batchRecord,
    payload: {
      schema: picoReaderCustodySyncPayloadSchema,
      manifest,
    } as unknown as PicoReaderCustodySyncPayload,
    value: {
      floor: { ...floor },
      readerStatus: 'active',
      readerEnvelopeVersions: [sequence],
      writerGrantIds: [],
      itemPackageIds: [],
    },
    state,
  };
}

function createProjectionRunnerClient(
  projection: PicoReaderCustodySyncClientApplySuccess,
): {
  client: PicoReaderCustodySyncRunClient;
  getState: () => PicoReaderCustodySyncClientState | undefined;
} {
  let state: PicoReaderCustodySyncClientState | undefined;
  const client: PicoReaderCustodySyncRunClient = {
    routeRef: () => projection.state.pins.routeRef,
    syncPins: () => ({ ...projection.state.pins }),
    state: () => state === undefined
      ? undefined
      : structuredClone(state),
    commitTransportCursor: (transportCursor) => {
      if (state === undefined) {
        throw new Error('reader_sync_cursor_without_floor');
      }
      state = {
        ...state,
        revision: state.revision + 1,
        pins: { ...state.pins },
        floor: { ...state.floor },
        transportCursor,
      };
      return structuredClone(state);
    },
    apply: ({ batchRecord, evaluatedAt }) => {
      if (JSON.stringify(batchRecord)
        !== JSON.stringify(projection.batchRecord)) {
        return { ok: false, reason: 'fork' };
      }
      const inserted = state === undefined;
      if (state === undefined) {
        state = {
          ...structuredClone(projection.state),
          verifiedAt: evaluatedAt ?? projection.state.verifiedAt,
        };
      }
      const result = structuredClone(projection);
      result.inserted = inserted;
      result.state = structuredClone(state);
      return result;
    },
  };
  return {
    client,
    getState: () => state === undefined
      ? undefined
      : structuredClone(state),
  };
}

function readerSyncPendingRecord(
  sequence: number,
): PicoReaderCustodySyncPendingRecord {
  return {
    schema: picoReaderCustodySyncPendingRecordSchema,
    schemaVersion: 1,
    pins: readerSyncClientPins(),
    stagedAt: '2026-07-27T10:30:00.000Z',
    baseFloor: sequence === 1
      ? null
      : readerSyncClientState(sequence - 1, sequence - 1).floor,
    batchRecord: runnerBatchRecord(sequence),
  };
}

function runnerBatchRecord(
  sequence: number,
  suffix = '',
): PicoReaderCustodySyncBatchRecord {
  return {
    schema: picoReaderCustodySyncBatchRecordSchema,
    routeRef: `route_${'A'.repeat(48)}`,
    syncBatchId:
      `reader_sync_batch_${String(sequence).padStart(4, '0')}${suffix}`,
    sealedPayloadHex: '00',
    sealedPayloadDigestHex: '11'.repeat(32),
    expiresAt: '2026-07-27T11:00:00.000Z',
  };
}

function createMemoryPendingStore(): PicoReaderCustodySyncPendingStore {
  let pending: PicoReaderCustodySyncPendingRecord | undefined;
  return {
    load: () => pending === undefined
      ? undefined
      : structuredClone(pending),
    stage: (nextPending) => {
      if (pending !== undefined) {
        if (JSON.stringify(pending) === JSON.stringify(nextPending)) {
          return { inserted: false };
        }
        throw new Error('reader_sync_pending_conflict');
      }
      pending = structuredClone(nextPending);
      return { inserted: true };
    },
    acknowledge: (expected) => {
      if (pending === undefined) {
        return { removed: false };
      }
      if (JSON.stringify(pending) !== JSON.stringify(expected)) {
        throw new Error('reader_sync_pending_ack_mismatch');
      }
      pending = undefined;
      return { removed: true };
    },
  };
}

function createFakeRunnerClient(options: {
  initialState?: PicoReaderCustodySyncClientState;
  rejectSequence?: number;
  rejection?: Extract<PicoReaderCustodySyncClientApplyResult, { ok: false }>;
  throwSequence?: number;
} = {}): {
  client: PicoReaderCustodySyncRunClient;
  getState: () => PicoReaderCustodySyncClientState | undefined;
} {
  let state = options.initialState === undefined
    ? undefined
    : structuredClone(options.initialState);
  const client: PicoReaderCustodySyncRunClient = {
    routeRef: () => `route_${'A'.repeat(48)}`,
    syncPins: () => readerSyncClientPins(),
    state: () => state === undefined ? undefined : structuredClone(state),
    commitTransportCursor: (transportCursor) => {
      if (state === undefined) {
        throw new Error('reader_sync_cursor_without_floor');
      }
      state = {
        ...state,
        revision: state.revision + 1,
        pins: { ...state.pins },
        floor: { ...state.floor },
        transportCursor,
      };
      return structuredClone(state);
    },
    apply: ({ batchRecord, evaluatedAt }) => {
      const sequence = runnerBatchSequence(batchRecord);
      if (sequence === options.throwSequence) {
        throw new Error('simulated_vault_open_failure');
      }
      if (sequence === options.rejectSequence) {
        return options.rejection
          ?? { ok: false, reason: 'invalid_payload' };
      }

      const currentFloor = state?.floor;
      if (currentFloor !== undefined) {
        if (sequence < currentFloor.sequence) {
          return { ok: false, reason: 'rollback' };
        }
        if (sequence === currentFloor.sequence
          && batchRecord.syncBatchId !== currentFloor.syncBatchId) {
          return { ok: false, reason: 'fork' };
        }
        if (sequence > currentFloor.sequence + 1) {
          return { ok: false, reason: 'sequence_gap' };
        }
      } else if (sequence !== 1) {
        return { ok: false, reason: 'sequence_gap' };
      }

      const inserted =
        currentFloor === undefined || sequence > currentFloor.sequence;
      if (inserted) {
        const nextState = readerSyncClientState(
          (state?.revision ?? 0) + 1,
          sequence,
        );
        nextState.verifiedAt =
          evaluatedAt ?? nextState.verifiedAt;
        nextState.transportCursor = state?.transportCursor ?? null;
        state = nextState;
      } else if (evaluatedAt !== undefined
        && state!.verifiedAt !== evaluatedAt) {
        state = {
          ...state!,
          revision: state!.revision + 1,
          verifiedAt: evaluatedAt,
        };
      }
      const currentState = state!;
      return {
        ok: true,
        inserted,
        payload: {},
        value: {
          floor: { ...currentState.floor },
          readerStatus: 'active',
          readerEnvelopeVersions: [1],
          writerGrantIds: [],
          itemPackageIds: [],
        },
        state: structuredClone(currentState),
      } as unknown as PicoReaderCustodySyncClientApplyResult;
    },
  };
  return {
    client,
    getState: () => state === undefined ? undefined : structuredClone(state),
  };
}

function runnerBatchSequence(
  batchRecord: PicoReaderCustodySyncBatchRecord,
): number {
  const match = /reader_sync_batch_([0-9]{4})/.exec(
    batchRecord.syncBatchId,
  );
  if (match?.[1] === undefined) {
    throw new Error('invalid_test_sync_batch');
  }
  return Number.parseInt(match[1], 10);
}

/**
 * Befund B158. Die zwei Argumentpruefungen von `access` hatte nie jemand
 * ausgeloest, und sie stehen **vor** jedem Laden: was danach kommt, oeffnet
 * eine Projektion und entschluesselt einen Gegenstand, und dahin soll nichts
 * gelangen, dessen Name oder Verbraucher gar keiner ist.
 *
 * Ein Aufbau ist dafuer nicht noetig - genau das ist die Aussage. Die Attrappen
 * unten werden nie gerufen; wuerde eine von ihnen laufen, waere die Pruefung an
 * der falschen Stelle.
 */
describe('ADR 0086 - was `access` ablehnt, bevor irgendetwas geoeffnet wird (B158)', () => {
  const nie = () => {
    throw new Error('diese Attrappe haette nie laufen duerfen');
  };
  const access = (): PicoReaderCustodySyncItemAccess => new PicoReaderCustodySyncItemAccess(
    { restore: nie } as never,
    readerSyncClientPins(),
    { load: nie } as never,
    nie as never,
    nie as never,
  );

  /**
   * Die Laenge ist dabei nachgemessen und nicht geraten: `x`.repeat(300) geht
   * **durch**. `assertReaderSyncItemToken` nimmt die Vorgabe von
   * `isAsciiToken` - 1.024 Bytes -, waehrend `assertAsciiReference` eine Zeile
   * darueber ausdruecklich bei 256 begrenzt. Warum die beiden Nachbarn
   * verschieden binden, sagt nichts; gefunden habe ich keine Stelle, an der
   * die Differenz etwas entscheidet (der Name ist ein Nachschlageschluessel
   * und kein Pfadbestandteil). Der Test haelt deshalb die Grenze fest, die
   * wirklich gilt.
   */
  it('refuses a package id that is not one', () => {
    for (const packageId of ['', 'hat leerzeichen', 'x'.repeat(1025), 42, null]) {
      expect(
        () => access().access(packageId as never, () => undefined, {
          signal: new AbortController().signal,
        }),
        JSON.stringify(packageId),
      ).toThrow('invalid_reader_sync_item_package_id');
    }
  });

  it('refuses a consumer that cannot be called', () => {
    for (const consumer of [undefined, null, 'nope', {}]) {
      expect(
        () => access().access('reader_sync_package_0001', consumer as never, {
          signal: new AbortController().signal,
        }),
        JSON.stringify(consumer),
      ).toThrow('invalid_reader_sync_item_plaintext_consumer');
    }
  });
});

function readerSyncClientPins(): PicoReaderCustodySyncPins {
  return {
    routeRef: `route_${'A'.repeat(48)}`,
    domainAuthorityId: 'reader_sync_domain_authority_0001',
    homeId: 'home_reader_sync_0001',
    hostSigningKeyFingerprintHex: '11'.repeat(32),
    domainId: 'reader_sync_domain_0001',
    ownerIdentityKeyFingerprintHex: '22'.repeat(32),
    readerGrantId: 'reader_sync_reader_grant_0001',
    readerIdentityKeyFingerprintHex: '44'.repeat(32),
    readerKeyFingerprintHex: '66'.repeat(32),
  };
}

function readerSyncClientState(
  revision: number,
  sequence: number,
): PicoReaderCustodySyncClientState {
  return {
    schema: picoReaderCustodySyncClientStateSchema,
    schemaVersion: 1,
    revision,
    pins: readerSyncClientPins(),
    floor: {
      routeRef: `route_${'A'.repeat(48)}`,
      syncBatchId: `reader_sync_batch_${String(sequence).padStart(4, '0')}`,
      sequence,
      manifestDigestHex: sequence.toString(16).padStart(2, '0').repeat(32),
      throughKekVersion: sequence,
      observedThroughLifecycleOrder:
        `seq:${String(sequence).padStart(16, '0')}`,
      createdAt:
        `2026-07-27T10:${String(sequence).padStart(2, '0')}:00.000Z`,
    },
    verifiedAt:
      `2026-07-27T10:${String(sequence + 10).padStart(2, '0')}:00.000Z`,
    transportCursor: `cursor:${String(sequence).padStart(16, '0')}`,
  };
}
