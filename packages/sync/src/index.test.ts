import { picoIdentitySuite } from '@pico/protocol';
import {
  createPicoReaderCustodyDomain,
  createPicoReaderCustodyReaderGrant,
  createPicoReaderCustodySyncBatch,
  createPicoReaderCustodyWriterGrant,
  createPicoVaultKeyfile,
  encryptPicoReaderCustodyItem,
  openPicoReaderCustodySyncBatch,
  openPicoVaultKeyfile,
  revokePicoReaderCustodyReaderGrant,
  rotatePicoReaderCustodyDomain,
} from '@pico/vault';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  InMemoryPicoSyncOpaqueTransport,
  LamportClock,
  PicoReaderCustodySyncBatchPublisher,
  PicoReaderCustodySyncBatchSource,
  PicoReaderCustodySyncProjector,
  mergeVersionVector,
  updateVersionVector,
} from './index.js';

beforeAll(async () => {
  await sodium.ready;
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

describe('authenticated reader-custody sync (ADR 0089)', () => {
  it('relays only a sealed batch and rejects wrong readers, tampering, rollback, gaps, forks and cross-scope projection', async () => {
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
      lifecycleOrder: 'seq:0000000000000004',
    });
    const rotation2 = rotatePicoReaderCustodyDomain(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantLifecycleRecords: [readerRevoked],
      rotationId: 'reader_sync_rotation_0002',
      rotatedAt: '2026-07-27T10:41:00.000Z',
      lifecycleOrder: 'seq:0000000000000005',
    });
    const batch3 = createPicoReaderCustodySyncBatch(sodium, {
      ownerIdentitySession,
      domainRecord,
      readerGrantRecord,
      readerGrantLifecycleRecords: [readerRevoked],
      writerGrantRecords: [writerGrantRecord],
      rotationRecords: [rotation2],
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
