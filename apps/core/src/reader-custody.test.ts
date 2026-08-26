import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoReaderCustodyDomainSignatureInput,
  buildPicoReaderCustodyItemSignatureInput,
  buildPicoReaderCustodyKekRotationSignatureInput,
  buildPicoReaderCustodyReaderGrantLifecycleSignatureInput,
  buildPicoReaderCustodyReaderGrantSignatureInput,
  buildPicoReaderCustodyWriterGrantLifecycleSignatureInput,
  buildPicoReaderCustodyWriterGrantSignatureInput,
  buildPicoShareEnvelopeSignatureInput,
  buildPicoShareWrapPayload,
  picoIdentitySuite,
  picoMemoryContentSuite,
  picoReaderCustodyDomainRecordSchema,
  picoReaderCustodyItemRecordSchema,
  picoReaderCustodyKekRotationRecordSchema,
  picoReaderCustodyReaderGrantLifecycleRecordSchema,
  picoReaderCustodyReaderGrantRecordSchema,
  picoReaderCustodyWriterGrantLifecycleRecordSchema,
  picoReaderCustodyWriterGrantRecordSchema,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
} from '@pico/protocol';
import type {
  PicoHomeFoundingRecord,
  PicoIdentityKeyRecordSignatureInput,
  PicoReaderCustodyDomainRecord,
  PicoReaderCustodyItemRecord,
  PicoReaderCustodyKekRotationRecord,
  PicoReaderCustodyReaderGrantLifecycleRecord,
  PicoReaderCustodyReaderGrantRecord,
  PicoReaderCustodyWriterGrantLifecycleRecord,
  PicoReaderCustodyWriterGrantRecord,
  PicoShareEnvelopeRecord,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrations.js';
import { ReaderCustodyStore } from './reader-custody.js';
import {
  makeReaderCustodyRecords,
  type ReaderCustodyRecords,
} from './test-reader-custody-records.js';

const tempDirs: string[] = [];
const databases: Database.Database[] = [];
const HOME_ID = 'home_reader_custody_0001';
const HOST_FINGERPRINT = '11'.repeat(32);
const DOMAIN_ID = 'domain_reader_private';
const AUTHORIZED_AT = '2026-07-27T10:00:00.000Z';

interface Harness {
  db: Database.Database;
  store: ReaderCustodyStore;
  activeMembers: Set<string>;
  eligibleReaders: Map<string, {
    identityFingerprintHex: string;
    deviceSigningKeyFingerprintHex: string;
    delegationId: string;
    keyRecord: PicoIdentityKeyRecordSignatureInput;
  }>;
}

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'pico-reader-custody-'));
  tempDirs.push(dir);
  const db = new Database(join(dir, 'pico.sqlite'));
  databases.push(db);
  runMigrations(db);
  const activeMembers = new Set<string>();
  const eligibleReaders = new Map<string, {
    identityFingerprintHex: string;
    deviceSigningKeyFingerprintHex: string;
    delegationId: string;
    keyRecord: PicoIdentityKeyRecordSignatureInput;
  }>();
  const foundingRecord = {
    founding: {
      homeId: HOME_ID,
      hostSigningKeyFingerprintHex: HOST_FINGERPRINT,
    },
  } as PicoHomeFoundingRecord;
  const store = new ReaderCustodyStore(db, sodium, {
    foundingRecord: () => foundingRecord,
    hasActiveMembership: (fingerprint) => activeMembers.has(fingerprint),
    selectReaderKey: async (input) => {
      const eligible = eligibleReaders.get(
        input.deviceKeyAgreementKeyFingerprintHex,
      );
      if (eligible === undefined
        || eligible.identityFingerprintHex
          !== input.picoIdentityFingerprintHex
        || eligible.delegationId !== input.delegationId) {
        return { ok: false, reason: 'reader_key_is_not_locally_eligible' };
      }
      return {
        ok: true,
        candidate: {
          homeId: input.homeId,
          picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
          deviceSigningKeyFingerprintHex:
            eligible.deviceSigningKeyFingerprintHex,
          deviceKeyAgreementKeyFingerprintHex:
            input.deviceKeyAgreementKeyFingerprintHex,
          deviceKeyAgreementKeyRecord: eligible.keyRecord,
          delegationId: input.delegationId,
          delegationLifecycleOrder: 'seq:0000000000000001',
          locallyObservedThroughLifecycleOrder:
            'seq:0000000000000001',
          validUntil: '2027-07-27T10:00:00.000Z',
        },
        freshness: {
          status: 'current',
          sourceRef: 'test-reader-registry',
          homeId: input.homeId,
          picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
          deviceSigningKeyFingerprintHex:
            eligible.deviceSigningKeyFingerprintHex,
          deviceKeyAgreementKeyFingerprintHex:
            input.deviceKeyAgreementKeyFingerprintHex,
          delegationId: input.delegationId,
          observedThroughLifecycleOrder: 'seq:0000000000000001',
          checkedAt: input.at,
          freshUntil: '2027-07-27T10:00:00.000Z',
        },
      };
    },
  });
  return { db, store, activeMembers, eligibleReaders };
}

/**
 * Die Fabrik liegt seit dem 2026-08-26 in `test-reader-custody-records.ts`,
 * weil der Link-Test daneben sie gegen ein *echtes* Home braucht - dessen
 * `homeId` steht erst zur Laufzeit fest. Eine zweite daneben wäre eine zweite
 * Auffassung davon, wie ein gültiger Satz Aufzeichnungen aussieht.
 */
function makeRecords(): ReaderCustodyRecords {
  return makeReaderCustodyRecords({
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: HOST_FINGERPRINT,
    domainId: DOMAIN_ID,
    authorizedAt: AUTHORIZED_AT,
  });
}

describe('ReaderCustodyStore (ADR 0086)', () => {
  it('stores only signed authority and opaque ciphertext on a separate path', () => {
    const harness = openHarness();
    const records = makeRecords();
    harness.activeMembers.add(
      records.domain.domain.ownerIdentityKeyFingerprintHex,
    );
    harness.activeMembers.add(records.writerIdentityFingerprint);

    expect(harness.store.recordDomain(records.domain).ok).toBe(true);
    expect(harness.store.recordWriterGrant(records.writerGrant).ok).toBe(true);
    const first = harness.store.recordItem(records.item);
    expect(first).toMatchObject({ ok: true, inserted: true });
    expect(harness.store.recordItem(records.item)).toMatchObject({
      ok: true,
      inserted: false,
    });
    expect(harness.store.domains()).toHaveLength(1);
    expect(harness.store.writerGrants()).toHaveLength(1);
    expect(harness.store.items()).toEqual([
      expect.objectContaining({
        memoryItemId: 'memory_reader_0001',
        contentCiphertextHex: records.item.contentCiphertextHex,
        // ADR 0116 W2: the Home holds authenticity for this item and no
        // evidence about whether it may instruct, so the projection says so
        // beside the writer identity rather than leaving it to be guessed.
        originClass: 'remote_pico',
      }),
    ]);

    const columns = (harness.db
      .prepare("PRAGMA table_info('pico_reader_custody_item')")
      .all() as { name: string }[])
      .map((column) => column.name);
    expect(columns).not.toContain('content');
    expect(columns).not.toContain('plaintext');
    expect(columns).not.toContain('kek');
    expect(columns).not.toContain('dek');
    const storedJson = harness.db
      .prepare(`
        SELECT item_record_json AS itemJson
        FROM pico_reader_custody_item
      `)
      .get() as { itemJson: string };
    expect(storedJson.itemJson).not.toContain('secret');
    expect(harness.db
      .prepare(`
        SELECT custody_class AS custodyClass
        FROM memory_domain_custody
        WHERE privacy_domain = ?
      `)
      .get(DOMAIN_ID)).toEqual({ custodyClass: 'reader_custody' });
  });

  it('rejects plaintext fields, cross-domain swaps and writes after owner revocation', () => {
    const harness = openHarness();
    const records = makeRecords();
    harness.activeMembers.add(
      records.domain.domain.ownerIdentityKeyFingerprintHex,
    );
    harness.activeMembers.add(records.writerIdentityFingerprint);
    expect(harness.store.recordDomain(records.domain).ok).toBe(true);
    expect(harness.store.recordWriterGrant(records.writerGrant).ok).toBe(true);

    const withPlaintext = {
      ...records.item,
      plaintext: 'must never cross Foundation',
    } as unknown as PicoReaderCustodyItemRecord;
    expect(harness.store.recordItem(withPlaintext)).toEqual({
      ok: false,
      reason: 'invalid_record',
    });

    const crossDomain = structuredClone(records.item);
    crossDomain.item.domainId = 'domain_reader_other';
    expect(harness.store.recordItem(crossDomain)).toEqual({
      ok: false,
      reason: 'invalid_record',
    });

    const lifecycle = makeLifecycle(records);
    expect(harness.store.recordWriterGrantLifecycle(lifecycle)).toMatchObject({
      ok: true,
      inserted: true,
    });
    expect(harness.store.recordItem(records.item)).toEqual({
      ok: false,
      reason: 'rotation_required',
    });
  });

  it('requires fresh exact readers and closes rotation debt before new writes', async () => {
    const harness = openHarness();
    const records = makeRecords();
    const owner = records.domain.domain.ownerIdentityKeyFingerprintHex;
    const readerIdentity = 'bb'.repeat(32);
    const readerSigning = 'cc'.repeat(32);
    const readerKeypair = sodium.crypto_box_keypair();
    const readerKeyRecord = keyRecord(
      'device_key_agreement',
      readerKeypair.publicKey,
    );
    const readerKeyFingerprint = fingerprint(readerKeyRecord);
    harness.activeMembers.add(owner);
    harness.activeMembers.add(records.writerIdentityFingerprint);
    harness.activeMembers.add(readerIdentity);
    harness.eligibleReaders.set(readerKeyFingerprint, {
      identityFingerprintHex: readerIdentity,
      deviceSigningKeyFingerprintHex: readerSigning,
      delegationId: 'reader_delegation_0001',
      keyRecord: readerKeyRecord,
    });

    expect(harness.store.recordDomain(records.domain, AUTHORIZED_AT).ok)
      .toBe(true);
    expect(harness.store.recordWriterGrant(
      records.writerGrant,
      AUTHORIZED_AT,
    ).ok).toBe(true);
    const readerGrant = makeReaderGrant(records, {
      readerIdentityFingerprintHex: readerIdentity,
      readerDeviceSigningKeyFingerprintHex: readerSigning,
      readerKeyRecord,
    });
    expect(await harness.store.recordReaderGrant(
      readerGrant,
      '2026-07-27T10:00:30.000Z',
    )).toMatchObject({
      ok: true,
      inserted: true,
      value: {
        accessMode: 'from_version',
        envelopeKekVersions: [1],
        status: 'active',
      },
    });

    const writerRevoked = makeLifecycle(records);
    expect(harness.store.recordWriterGrantLifecycle(
      writerRevoked,
      writerRevoked.lifecycle.changedAt,
    ).ok).toBe(true);
    expect(harness.store.recordItem(
      records.item,
      '2026-07-27T10:02:30.000Z',
    )).toEqual({ ok: false, reason: 'rotation_required' });

    const rotationV2 = makeRotation(records, {
      rotationId: 'reader_rotation_0002',
      previousKekVersion: 1,
      causeLifecycleIds: [writerRevoked.lifecycle.lifecycleId],
      remainingReaders: [readerGrant],
      rotatedAt: '2026-07-27T10:03:00.000Z',
      lifecycleOrder: 'seq:0000000000000004',
    });
    expect(harness.store.recordKekRotation(rotationV2)).toMatchObject({
      ok: true,
      inserted: true,
      value: {
        previousKekVersion: 1,
        kekVersion: 2,
        remainingReaderGrantIds: [readerGrant.grant.readerGrantId],
      },
    });

    const writerV2 = makeWriterVersion(records, 2, {
      writerGrantId: 'reader_writer_grant_0002',
      lifecycleOrder: 'seq:0000000000000005',
      validFrom: '2026-07-27T10:03:00.000Z',
    });
    const itemV2 = makeItemVersion(records, writerV2, 2, {
      packageId: 'reader_item_package_0002',
      memoryItemId: 'memory_reader_0002',
      createdAt: '2026-07-27T10:04:00.000Z',
    });
    expect(harness.store.recordWriterGrant(
      writerV2,
      '2026-07-27T10:03:30.000Z',
    ).ok).toBe(true);
    expect(harness.store.recordItem(
      itemV2,
      itemV2.item.createdAt,
    ).ok).toBe(true);

    const readerRevoked = makeReaderLifecycle(records, readerGrant);
    expect(harness.store.recordReaderGrantLifecycle(
      readerRevoked,
      readerRevoked.lifecycle.changedAt,
    )).toMatchObject({
      ok: true,
      value: { status: 'revoked' },
    });
    expect(harness.store.recordItem(
      itemV2,
      '2026-07-27T10:06:30.000Z',
    )).toEqual({ ok: false, reason: 'rotation_required' });

    const wrongRemainingSet = makeRotation(records, {
      rotationId: 'reader_rotation_0003_wrong',
      previousKekVersion: 2,
      causeLifecycleIds: [readerRevoked.lifecycle.lifecycleId],
      remainingReaders: [readerGrant],
      rotatedAt: '2026-07-27T10:07:00.000Z',
      lifecycleOrder: 'seq:0000000000000007',
    });
    expect(harness.store.recordKekRotation(wrongRemainingSet)).toEqual({
      ok: false,
      reason: 'invalid_rotation',
    });
    const rotationV3 = makeRotation(records, {
      rotationId: 'reader_rotation_0003',
      previousKekVersion: 2,
      causeLifecycleIds: [readerRevoked.lifecycle.lifecycleId],
      remainingReaders: [],
      rotatedAt: '2026-07-27T10:07:00.000Z',
      lifecycleOrder: 'seq:0000000000000007',
    });

    /**
     * ADR 0088's completeness, in the direction that costs something.
     *
     * The envelopes are not covered by the owner's signature - it signs the
     * rotation, and the envelopes are what the rotation is *for* - so the
     * counting is the only thing standing between a revoked reader and the
     * next KEK version. An extra envelope hands them the key they were just
     * removed from; a missing owner envelope leaves the owner locked out of
     * their own domain.
     */
    const withRevokedReaderEnvelope = structuredClone(rotationV3);
    withRevokedReaderEnvelope.envelopes.push(makeEnvelope(records, {
      grantId: readerGrant.grant.readerGrantId,
      kekVersion: rotationV3.rotation.kekVersion,
      readerKeyRecord: readerGrant.readerKeyRecord,
      grantedAt: rotationV3.rotation.rotatedAt,
    }));
    expect(harness.store.recordKekRotation(
      withRevokedReaderEnvelope,
      rotationV3.rotation.rotatedAt,
    )).toEqual({ ok: false, reason: 'invalid_rotation' });

    const withoutOwnerEnvelope = structuredClone(rotationV3);
    withoutOwnerEnvelope.envelopes = [];
    expect(harness.store.recordKekRotation(
      withoutOwnerEnvelope,
      rotationV3.rotation.rotatedAt,
    )).toEqual({ ok: false, reason: 'invalid_rotation' });

    // ADR 0088. A rotation that names no cause at all is not a rotation this
    // protocol can even express: the signature input refuses an empty set, so
    // it fails before anything is signed rather than at the store.
    expect(() => makeRotation(records, {
      rotationId: 'reader_rotation_0003_no_cause',
      previousKekVersion: 2,
      causeLifecycleIds: [],
      remainingReaders: [],
      rotatedAt: '2026-07-27T10:07:00.000Z',
      lifecycleOrder: 'seq:0000000000000007',
    })).toThrow('invalid_rotation_causes');

    // One that names *a* cause, correctly signed, and not the debt that is
    // actually open: accepting it would clear the write barrier a revocation
    // opened while the revoked reader still holds the current key.
    expect(harness.store.recordKekRotation(makeRotation(records, {
      rotationId: 'reader_rotation_0003_wrong_cause',
      previousKekVersion: 2,
      causeLifecycleIds: ['memberlc_that_never_happened'],
      remainingReaders: [],
      rotatedAt: '2026-07-27T10:07:00.000Z',
      lifecycleOrder: 'seq:0000000000000007',
    }), '2026-07-27T10:07:00.000Z')).toEqual({ ok: false, reason: 'invalid_rotation' });

    // And one that skips a version: `n+1` or nothing, or the chain stops
    // saying which key any envelope belongs to.
    expect(harness.store.recordKekRotation(makeRotation(records, {
      rotationId: 'reader_rotation_0003_skips',
      previousKekVersion: 3,
      causeLifecycleIds: [readerRevoked.lifecycle.lifecycleId],
      remainingReaders: [],
      rotatedAt: '2026-07-27T10:07:00.000Z',
      lifecycleOrder: 'seq:0000000000000007',
    }), '2026-07-27T10:07:00.000Z')).toEqual({ ok: false, reason: 'invalid_rotation' });
    expect(harness.store.recordKekRotation(
      rotationV3,
      '2026-07-27T10:06:59.999Z',
    )).toEqual({
      ok: false,
      reason: 'invalid_rotation',
    });
    expect(harness.store.recordKekRotation(
      rotationV3,
      rotationV3.rotation.rotatedAt,
    ).ok).toBe(true);

    const corrupted = structuredClone(rotationV3);
    corrupted.envelopes[0].sealedWrapHex = 'ff'.repeat(80);
    harness.db
      .prepare(`
        UPDATE pico_reader_custody_kek_rotation
        SET rotation_record_json = ?
        WHERE rotation_id = ?
      `)
      .run(JSON.stringify(corrupted), rotationV3.rotation.rotationId);
    expect(harness.store.reconcile()).toMatchObject({
      droppedRotations: 1,
    });
  });

  it('drops tampered restore rows and owner domains without active membership', () => {
    const harness = openHarness();
    const records = makeRecords();
    const owner = records.domain.domain.ownerIdentityKeyFingerprintHex;
    harness.activeMembers.add(owner);
    harness.activeMembers.add(records.writerIdentityFingerprint);
    expect(harness.store.recordDomain(records.domain).ok).toBe(true);
    expect(harness.store.recordWriterGrant(records.writerGrant).ok).toBe(true);
    expect(harness.store.recordItem(records.item).ok).toBe(true);

    const corrupted = structuredClone(records.item);
    corrupted.contentCiphertextHex = 'ff'.repeat(64);
    harness.db
      .prepare(`
        UPDATE pico_reader_custody_item
        SET item_record_json = ?
        WHERE package_id = ?
      `)
      .run(JSON.stringify(corrupted), records.item.item.packageId);
    expect(harness.store.reconcile()).toMatchObject({ droppedItems: 1 });

    // Losing writer membership drops restored writer authority and dependent
    // opaque items while preserving the owner's domain authority.
    expect(harness.store.recordItem(records.item).ok).toBe(true);
    harness.activeMembers.delete(records.writerIdentityFingerprint);
    expect(harness.store.reconcile()).toMatchObject({
      droppedDomains: 0,
      droppedWriterGrants: 1,
      droppedItems: 1,
    });
    expect(harness.store.domains()).toHaveLength(1);

    // Recreate the dependency chain so the owner-loss cascade is exercised
    // independently.
    harness.activeMembers.add(records.writerIdentityFingerprint);
    expect(harness.store.recordWriterGrant(records.writerGrant).ok).toBe(true);
    expect(harness.store.recordItem(records.item).ok).toBe(true);
    harness.activeMembers.delete(owner);
    expect(harness.store.reconcile()).toMatchObject({
      droppedDomains: 1,
      droppedWriterGrants: 1,
    });
    expect(harness.store.items()).toEqual([]);
  });
});

function makeReaderGrant(
  records: ReaderCustodyRecords,
  input: {
    readerIdentityFingerprintHex: string;
    readerDeviceSigningKeyFingerprintHex: string;
    readerKeyRecord: PicoIdentityKeyRecordSignatureInput;
  },
): PicoReaderCustodyReaderGrantRecord {
  const domain = records.domain.domain;
  const grant = {
    suite: picoMemoryContentSuite,
    readerGrantId: 'reader_grant_0001',
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    readerIdentityKeyFingerprintHex: input.readerIdentityFingerprintHex,
    readerDeviceSigningKeyFingerprintHex:
      input.readerDeviceSigningKeyFingerprintHex,
    readerKeyFingerprintHex: fingerprint(input.readerKeyRecord),
    readerDelegationId: 'reader_delegation_0001',
    accessMode: 'from_version' as const,
    firstKekVersion: 1,
    validFrom: AUTHORIZED_AT,
    validUntil: '2026-08-27T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000003',
  };
  return {
    schema: picoReaderCustodyReaderGrantRecordSchema,
    grant,
    ownerIdentityKeyRecord: records.domain.ownerIdentityKeyRecord,
    readerKeyRecord: input.readerKeyRecord,
    envelopes: [
      makeEnvelope(records, {
        grantId: grant.readerGrantId,
        kekVersion: 1,
        readerKeyRecord: input.readerKeyRecord,
        grantedAt: grant.validFrom,
      }),
    ],
    ownerSignatureHex: signHex(
      buildPicoReaderCustodyReaderGrantSignatureInput(grant),
      records.identityKeypair.privateKey,
    ),
    receivedAt: grant.validFrom,
  };
}

function makeReaderLifecycle(
  records: ReaderCustodyRecords,
  readerGrant: PicoReaderCustodyReaderGrantRecord,
): PicoReaderCustodyReaderGrantLifecycleRecord {
  const domain = records.domain.domain;
  const grant = readerGrant.grant;
  const lifecycle = {
    suite: picoMemoryContentSuite,
    lifecycleId: 'reader_grant_lifecycle_0001',
    readerGrantId: grant.readerGrantId,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    readerIdentityKeyFingerprintHex: grant.readerIdentityKeyFingerprintHex,
    readerKeyFingerprintHex: grant.readerKeyFingerprintHex,
    status: 'revoked' as const,
    reasonCategory: 'reader_removed' as const,
    changedAt: '2026-07-27T10:06:00.000Z',
    lifecycleOrder: 'seq:0000000000000006',
  };
  return {
    schema: picoReaderCustodyReaderGrantLifecycleRecordSchema,
    lifecycle,
    ownerIdentityKeyRecord: records.domain.ownerIdentityKeyRecord,
    ownerSignatureHex: signHex(
      buildPicoReaderCustodyReaderGrantLifecycleSignatureInput(lifecycle),
      records.identityKeypair.privateKey,
    ),
    receivedAt: lifecycle.changedAt,
  };
}

function makeRotation(
  records: ReaderCustodyRecords,
  input: {
    rotationId: string;
    previousKekVersion: number;
    causeLifecycleIds: string[];
    remainingReaders: PicoReaderCustodyReaderGrantRecord[];
    rotatedAt: string;
    lifecycleOrder: string;
  },
): PicoReaderCustodyKekRotationRecord {
  const domain = records.domain.domain;
  const rotation = {
    suite: picoMemoryContentSuite,
    rotationId: input.rotationId,
    domainAuthorityId: domain.domainAuthorityId,
    homeId: domain.homeId,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    domainId: domain.domainId,
    ownerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    previousKekVersion: input.previousKekVersion,
    kekVersion: input.previousKekVersion + 1,
    causeLifecycleIds: [...input.causeLifecycleIds].sort(),
    remainingReaderGrantIds: input.remainingReaders
      .map((record) => record.grant.readerGrantId)
      .sort(),
    rotatedAt: input.rotatedAt,
    lifecycleOrder: input.lifecycleOrder,
  };
  return {
    schema: picoReaderCustodyKekRotationRecordSchema,
    rotation,
    ownerIdentityKeyRecord: records.domain.ownerIdentityKeyRecord,
    envelopes: [
      makeEnvelope(records, {
        grantId: rotation.rotationId,
        kekVersion: rotation.kekVersion,
        readerKeyRecord: records.domain.ownerReaderKeyRecord,
        grantedAt: rotation.rotatedAt,
      }),
      ...input.remainingReaders.map((readerGrant) =>
        makeEnvelope(records, {
          grantId: readerGrant.grant.readerGrantId,
          kekVersion: rotation.kekVersion,
          readerKeyRecord: readerGrant.readerKeyRecord,
          grantedAt: rotation.rotatedAt,
        })),
    ],
    ownerSignatureHex: signHex(
      buildPicoReaderCustodyKekRotationSignatureInput(rotation),
      records.identityKeypair.privateKey,
    ),
    receivedAt: rotation.rotatedAt,
  };
}

function makeEnvelope(
  records: ReaderCustodyRecords,
  input: {
    grantId: string;
    kekVersion: number;
    readerKeyRecord: PicoIdentityKeyRecordSignatureInput;
    grantedAt: string;
  },
): PicoShareEnvelopeRecord {
  const domain = records.domain.domain;
  const readerKeyFingerprintHex = fingerprint(input.readerKeyRecord);
  const wrap = buildPicoShareWrapPayload({
    suite: picoShareSuite,
    domainId: domain.domainId,
    kekVersion: input.kekVersion,
    readerKeyFingerprintHex,
    kekHex: 'dd'.repeat(32),
  });
  const sealedWrap = sodium.crypto_box_seal(
    wrap,
    Buffer.from(input.readerKeyRecord.publicKeyHex, 'hex'),
  );
  const envelope = {
    suite: picoShareSuite,
    grantId: input.grantId,
    domainId: domain.domainId,
    kekVersion: input.kekVersion,
    hostSigningKeyFingerprintHex: domain.hostSigningKeyFingerprintHex,
    issuerIdentityKeyFingerprintHex: domain.ownerIdentityKeyFingerprintHex,
    readerKeyFingerprintHex,
    wrapDigestHex: hashHex(sealedWrap),
    grantedAt: input.grantedAt,
  };
  return {
    schema: picoShareEnvelopeRecordSchema,
    envelope,
    sealedWrapHex: Buffer.from(sealedWrap).toString('hex'),
    issuerIdentityKeyRecord: records.domain.ownerIdentityKeyRecord,
    issuerSignatureHex: signHex(
      buildPicoShareEnvelopeSignatureInput(envelope),
      records.identityKeypair.privateKey,
    ),
    createdAt: input.grantedAt,
  };
}

function makeWriterVersion(
  records: ReaderCustodyRecords,
  kekVersion: number,
  input: {
    writerGrantId: string;
    lifecycleOrder: string;
    validFrom: string;
  },
): PicoReaderCustodyWriterGrantRecord {
  const domain = records.domain.domain;
  const grant = {
    ...records.writerGrant.grant,
    writerGrantId: input.writerGrantId,
    kekVersion,
    validFrom: input.validFrom,
    lifecycleOrder: input.lifecycleOrder,
  };
  return {
    schema: picoReaderCustodyWriterGrantRecordSchema,
    grant,
    ownerIdentityKeyRecord: records.domain.ownerIdentityKeyRecord,
    writerDeviceSigningKeyRecord:
      records.writerGrant.writerDeviceSigningKeyRecord,
    ownerSignatureHex: signHex(
      buildPicoReaderCustodyWriterGrantSignatureInput(grant),
      records.identityKeypair.privateKey,
    ),
    receivedAt: input.validFrom,
  };
}

function makeItemVersion(
  records: ReaderCustodyRecords,
  writerGrant: PicoReaderCustodyWriterGrantRecord,
  kekVersion: number,
  input: {
    packageId: string;
    memoryItemId: string;
    createdAt: string;
  },
): PicoReaderCustodyItemRecord {
  const contentCiphertext = sodium.randombytes_buf(64);
  const wrappedDek = sodium.randombytes_buf(48);
  const item = {
    ...records.item.item,
    packageId: input.packageId,
    writerGrantId: writerGrant.grant.writerGrantId,
    memoryItemId: input.memoryItemId,
    kekVersion,
    contentCiphertextDigestHex: hashHex(contentCiphertext),
    wrappedDekDigestHex: hashHex(wrappedDek),
    createdAt: input.createdAt,
  };
  return {
    schema: picoReaderCustodyItemRecordSchema,
    item,
    contentCiphertextHex: Buffer.from(contentCiphertext).toString('hex'),
    wrappedDekHex: Buffer.from(wrappedDek).toString('hex'),
    writerDeviceSigningKeyRecord:
      writerGrant.writerDeviceSigningKeyRecord,
    writerSignatureHex: signHex(
      buildPicoReaderCustodyItemSignatureInput(item),
      records.writerKeypair.privateKey,
    ),
    receivedAt: input.createdAt,
  };
}

function makeLifecycle(records: ReaderCustodyRecords): PicoReaderCustodyWriterGrantLifecycleRecord {
  const grant = records.writerGrant.grant;
  const lifecycle = {
    suite: picoMemoryContentSuite,
    lifecycleId: 'reader_writer_lifecycle_0001',
    writerGrantId: grant.writerGrantId,
    domainAuthorityId: grant.domainAuthorityId,
    homeId: grant.homeId,
    hostSigningKeyFingerprintHex: grant.hostSigningKeyFingerprintHex,
    domainId: grant.domainId,
    ownerIdentityKeyFingerprintHex: grant.ownerIdentityKeyFingerprintHex,
    writerIdentityKeyFingerprintHex: grant.writerIdentityKeyFingerprintHex,
    writerDeviceSigningKeyFingerprintHex:
      grant.writerDeviceSigningKeyFingerprintHex,
    status: 'revoked' as const,
    reasonCategory: 'writer_removed' as const,
    changedAt: '2026-07-27T10:02:00.000Z',
    lifecycleOrder: 'seq:0000000000000003',
  };
  return {
    schema: picoReaderCustodyWriterGrantLifecycleRecordSchema,
    lifecycle,
    ownerIdentityKeyRecord: records.domain.ownerIdentityKeyRecord,
    ownerSignatureHex: signHex(
      buildPicoReaderCustodyWriterGrantLifecycleSignatureInput(lifecycle),
      records.identityKeypair.privateKey,
    ),
    receivedAt: lifecycle.changedAt,
  };
}

function keyRecord(
  keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'],
  publicKey: Uint8Array,
): PicoIdentityKeyRecordSignatureInput {
  return {
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
  };
}

function fingerprint(record: PicoIdentityKeyRecordSignatureInput): string {
  return hashHex(buildPicoIdentityKeyRecordSignatureInput(record));
}

function hashHex(bytes: Uint8Array): string {
  return Buffer.from(sodium.crypto_generichash(32, bytes, null)).toString('hex');
}

function signHex(input: Uint8Array, privateKey: Uint8Array): string {
  return Buffer.from(sodium.crypto_sign_detached(input, privateKey)).toString(
    'hex',
  );
}
