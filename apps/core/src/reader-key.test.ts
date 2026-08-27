import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoIdentitySuite,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import {
  PicoIdentityReaderKeySelector,
  type PicoIdentityReaderKeyFreshnessQuery,
  type PicoIdentityReaderKeyFreshnessResult,
} from './reader-key.js';

const HOME_ID = 'home_reader_key_test';
const AT = '2026-07-27T10:00:00.000Z';
const FRESH_UNTIL = '2026-07-27T10:05:00.000Z';

let identity: { publicKey: Uint8Array; privateKey: Uint8Array };
let signing: { publicKey: Uint8Array; privateKey: Uint8Array };
let agreement: { publicKey: Uint8Array; privateKey: Uint8Array };
let identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
let signingKeyRecord: PicoIdentityKeyRecordSignatureInput;
let agreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
let identityFingerprint: string;
let signingFingerprint: string;
let agreementFingerprint: string;

beforeAll(async () => {
  await sodium.ready;
  identity = sodium.crypto_sign_keypair();
  signing = sodium.crypto_sign_keypair();
  agreement = sodium.crypto_box_keypair();
  identityKeyRecord = keyRecord('pico_identity', identity.publicKey);
  signingKeyRecord = keyRecord('device_signing', signing.publicKey);
  agreementKeyRecord = keyRecord('device_key_agreement', agreement.publicKey);
  identityFingerprint = fingerprint(identityKeyRecord);
  signingFingerprint = fingerprint(signingKeyRecord);
  agreementFingerprint = fingerprint(agreementKeyRecord);
});

describe('reader-key registration and freshness contract (ADR 0083)', () => {
  it('persists an exact delegation/key binding idempotently and selects it with verified freshness', async () => {
    const fixture = storeFixture();
    try {
      const delegation = recordReaderDelegation(fixture.store);
      expect(fixture.store.registerPicoIdentityReaderKey({
        sodium,
        picoIdentityFingerprintHex: identityFingerprint,
        deviceSigningKeyFingerprintHex: signingFingerprint,
        delegationId: delegation.record.delegationId,
        deviceKeyAgreementKeyRecord: agreementKeyRecord,
        at: AT,
      })).toEqual({ ok: true, inserted: true });
      expect(fixture.store.registerPicoIdentityReaderKey({
        sodium,
        picoIdentityFingerprintHex: identityFingerprint,
        deviceSigningKeyFingerprintHex: signingFingerprint,
        delegationId: delegation.record.delegationId,
        deviceKeyAgreementKeyRecord: agreementKeyRecord,
        at: AT,
      })).toEqual({ ok: true, inserted: false });
      expect(fixture.store.hasActivePicoIdentityDelegation({
        sodium,
        picoIdentityFingerprintHex: identityFingerprint,
        deviceSigningKeyFingerprintHex: signingFingerprint,
        deviceKeyAgreementKeyFingerprintHex: agreementFingerprint,
        delegationId: delegation.record.delegationId,
        at: AT,
      })).toBe(true);

      const selector = new PicoIdentityReaderKeySelector(
        fixture.store,
        sodium,
        { check: async (query) => currentCheckpoint(query) },
      );
      await expect(selector.select(selectionInput(delegation.record.delegationId))).resolves.toMatchObject({
        ok: true,
        candidate: {
          homeId: HOME_ID,
          picoIdentityFingerprintHex: identityFingerprint,
          deviceKeyAgreementKeyFingerprintHex: agreementFingerprint,
          delegationId: delegation.record.delegationId,
        },
        freshness: {
          status: 'current',
          sourceRef: 'registry:test',
        },
      });
    } finally {
      fixture.close();
    }
  });

  it('fails closed when external freshness is missing or older than local evidence', async () => {
    const fixture = registeredFixture();
    try {
      const unavailable = new PicoIdentityReaderKeySelector(
        fixture.store,
        sodium,
      );
      await expect(unavailable.select(selectionInput(fixture.delegationId))).resolves.toEqual({
        ok: false,
        reason: 'freshness_unavailable',
      });

      const stale = new PicoIdentityReaderKeySelector(
        fixture.store,
        sodium,
        {
          check: async (query) => currentCheckpoint(query, {
            observedThroughLifecycleOrder: 'seq:0000000000000000',
          }),
        },
      );
      await expect(stale.select(selectionInput(fixture.delegationId))).resolves.toEqual({
        ok: false,
        reason: 'freshness_stale',
      });

      const overlong = new PicoIdentityReaderKeySelector(
        fixture.store,
        sodium,
        {
          check: async (query) => currentCheckpoint(query, {
            freshUntil: '2026-07-27T10:05:00.001Z',
          }),
        },
      );
      await expect(overlong.select(selectionInput(fixture.delegationId))).resolves.toEqual({
        ok: false,
        reason: 'invalid_freshness_checkpoint',
      });

      /**
       * The same overlong window, hidden in an instant that sorts before every
       * ordinary year.
       *
       * These are compared as strings here - `checkedAt > at`,
       * `freshUntil <= checkedAt`, `at >= freshUntil` - which is only sound
       * while every writer uses one fixed-width form. `@pico/core` carried a
       * round-trip-only check until 2026-08-20, one of nine copies of that
       * rule, and the extended-year form round-trips exactly:
       * `+275760-09-13T00:00:00.000Z` is a real Date that re-serializes to
       * itself. `+` is 0x2B, below every digit, so a `checkedAt` in that form
       * reads as earlier than everything - the window between it and
       * `freshUntil` computes negative, the max-freshness bound never fires,
       * and the checkpoint above is accepted after all.
       */
      const groundInstant = new PicoIdentityReaderKeySelector(
        fixture.store,
        sodium,
        {
          check: async (query) => currentCheckpoint(query, {
            checkedAt: '+275760-09-13T00:00:00.000Z',
            freshUntil: '2026-07-27T10:05:00.001Z',
          }),
        },
      );
      await expect(groundInstant.select(selectionInput(fixture.delegationId))).resolves.toEqual({
        ok: false,
        reason: 'invalid_freshness_checkpoint',
      });
      expect('+275760-09-13T00:00:00.000Z' < '2026-07-27T10:00:00.000Z').toBe(true);
    } finally {
      fixture.close();
    }
  });

  it('lets an authenticated source reject a key after a stale database restore', async () => {
    const fixture = registeredFixture();
    try {
      const selector = new PicoIdentityReaderKeySelector(
        fixture.store,
        sodium,
        { check: async () => ({ status: 'revoked' }) },
      );
      await expect(selector.select(selectionInput(fixture.delegationId))).resolves.toEqual({
        ok: false,
        reason: 'reader_key_revoked',
      });
    } finally {
      fixture.close();
    }
  });

  it('rejects locally revoked keys and expired delegations before consulting freshness', async () => {
    const revokedFixture = registeredFixture();
    try {
      const revocation: PicoIdentityRevocationSignatureInput = {
        suite: picoIdentitySuite,
        revocationId: 'revocation_reader_key_test_0001',
        issuerIdentityKeyFingerprintHex: identityFingerprint,
        subjectKind: 'key',
        subjectRef: agreementFingerprint,
        reasonCategory: 'suspected_compromise',
        revokedAt: '2026-07-27T10:01:00.000Z',
        lifecycleOrder: 'seq:0000000000000002',
      };
      expect(revokedFixture.store.recordPicoIdentityLifecycleEvidence({
        sodium,
        identityKeyRecord,
        delegation: revokedFixture.delegation,
        revocations: [{
          record: revocation,
          signatureHex: sign(
            buildPicoIdentityRevocationSignatureInput(revocation),
            identity.privateKey,
          ),
        }],
      })).toEqual({ ok: true });

      let freshnessCalls = 0;
      const selector = new PicoIdentityReaderKeySelector(
        revokedFixture.store,
        sodium,
        {
          check: async (query) => {
            freshnessCalls += 1;
            return currentCheckpoint(query);
          },
        },
      );
      await expect(selector.select({
        ...selectionInput(revokedFixture.delegationId),
        at: '2026-07-27T10:02:00.000Z',
      })).resolves.toEqual({
        ok: false,
        reason: 'reader_key_is_not_locally_eligible',
      });
      expect(freshnessCalls).toBe(0);
    } finally {
      revokedFixture.close();
    }

    const expiredFixture = registeredFixture();
    try {
      const selector = new PicoIdentityReaderKeySelector(
        expiredFixture.store,
        sodium,
        {
          check: async () => {
            throw new Error('freshness must not be consulted');
          },
        },
      );
      await expect(selector.select({
        ...selectionInput(expiredFixture.delegationId),
        at: '2027-01-01T00:00:00.000Z',
      })).resolves.toEqual({
        ok: false,
        reason: 'reader_key_is_not_locally_eligible',
      });
    } finally {
      expiredFixture.close();
    }
  });

  it('drops a corrupted reader-key projection during restore reconciliation', () => {
    const fixture = registeredFixture();
    fixture.store.close();
    const db = new Database(fixture.databasePath);
    db.prepare(`
      UPDATE pico_identity_reader_key
      SET device_key_agreement_key_record_json = ?
      WHERE delegation_id = ?
    `).run(JSON.stringify(signingKeyRecord), fixture.delegationId);
    db.close();

    const restored = new EventStore(fixture.databasePath);
    try {
      expect(restored.reconcilePicoIdentityLifecycleEvidence(sodium)).toEqual({
        droppedDelegations: 0,
        droppedRevocations: 0,
        droppedReaderKeys: 1,
      });
      expect(restored.picoIdentityReaderKeyCandidate({
        sodium,
        ...selectionInput(fixture.delegationId),
      })).toBeUndefined();
    } finally {
      restored.close();
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });

  it('drops reader keys whose restored Home membership is no longer active', () => {
    const fixture = registeredFixture();
    fixture.store.close();
    const db = new Database(fixture.databasePath);
    db.prepare(`
      UPDATE pico_home_membership
      SET status = 'revoked'
      WHERE pico_identity_fingerprint_hex = ?
    `).run(identityFingerprint);
    db.close();

    const restored = new EventStore(fixture.databasePath);
    try {
      expect(restored.reconcilePicoIdentityLifecycleEvidence(sodium)).toEqual({
        droppedDelegations: 0,
        droppedRevocations: 0,
        droppedReaderKeys: 1,
      });
    } finally {
      restored.close();
      rmSync(fixture.dir, { recursive: true, force: true });
    }
  });
});

function storeFixture(): {
  dir: string;
  databasePath: string;
  store: EventStore;
  close(): void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'pico-reader-key-test-'));
  const databasePath = join(dir, 'pico.sqlite');
  new EventStore(databasePath).close();
  const db = new Database(databasePath);
  db.prepare(`
    UPDATE pico_home_claim_state
    SET state = 'claimed',
        host_admin_pico_id = 'pico_reader_key_admin',
        home_id = ?,
        host_signing_key_fingerprint_hex = ?,
        host_key_agreement_key_fingerprint_hex = ?,
        claimed_at = ?,
        updated_at = ?
    WHERE id = 1
  `).run(HOME_ID, '1'.repeat(64), '2'.repeat(64), AT, AT);
  db.prepare(`
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
    ) VALUES (?, ?, ?, 'home_member', 'active', ?, 'membership_credential', ?, ?, ?, ?, ?)
  `).run(
    'membership_reader_key_test',
    HOME_ID,
    identityFingerprint,
    '["memory_read"]',
    'credential_reader_key_test',
    '2026-01-01T00:00:00.000Z',
    '2028-01-01T00:00:00.000Z',
    AT,
    AT,
  );
  db.close();

  const store = new EventStore(databasePath);
  return {
    dir,
    databasePath,
    store,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function registeredFixture() {
  const fixture = storeFixture();
  const delegation = recordReaderDelegation(fixture.store);
  const registration = fixture.store.registerPicoIdentityReaderKey({
    sodium,
    picoIdentityFingerprintHex: identityFingerprint,
    deviceSigningKeyFingerprintHex: signingFingerprint,
    delegationId: delegation.record.delegationId,
    deviceKeyAgreementKeyRecord: agreementKeyRecord,
    at: AT,
  });
  if (!registration.ok) {
    fixture.close();
    throw new Error(`reader key fixture registration failed: ${registration.reason}`);
  }
  return {
    ...fixture,
    delegation,
    delegationId: delegation.record.delegationId,
  };
}

function recordReaderDelegation(store: EventStore) {
  const record: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: 'delegation_reader_key_test_0001',
    issuerIdentityKeyFingerprintHex: identityFingerprint,
    subjectSigningKeyFingerprintHex: signingFingerprint,
    subjectKeyAgreementKeyFingerprintHex: agreementFingerprint,
    scopes: ['surface_session', 'decrypt_domain', 'receive_key_envelope'],
    /**
     * Das feste Fenster bleibt hier: dieser Test sagt etwas *über* das Fenster
     * aus und misst gegen eigene Zeitpunkte, nicht gegen die Wanduhr.
     * `picoTestValidityWindow()` ist für die vielen anderen, denen es
     * gleichgültig ist.
     */
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  };
  const delegation = {
    record,
    signatureHex: sign(buildPicoIdentityDelegationSignatureInput(record), identity.privateKey),
  };
  const recorded = store.recordPicoIdentityLifecycleEvidence({
    sodium,
    identityKeyRecord,
    delegation,
    revocations: [],
  });
  if (!recorded.ok) {
    throw new Error(`reader key fixture delegation failed: ${recorded.reason}`);
  }
  return delegation;
}

function selectionInput(delegationId: string) {
  return {
    homeId: HOME_ID,
    picoIdentityFingerprintHex: identityFingerprint,
    delegationId,
    deviceKeyAgreementKeyFingerprintHex: agreementFingerprint,
    at: AT,
  };
}

function currentCheckpoint(
  query: PicoIdentityReaderKeyFreshnessQuery,
  overrides: Partial<Extract<PicoIdentityReaderKeyFreshnessResult, { status: 'current' }>> = {},
): Extract<PicoIdentityReaderKeyFreshnessResult, { status: 'current' }> {
  return {
    status: 'current',
    sourceRef: 'registry:test',
    homeId: query.homeId,
    picoIdentityFingerprintHex: query.picoIdentityFingerprintHex,
    deviceSigningKeyFingerprintHex: query.deviceSigningKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex: query.deviceKeyAgreementKeyFingerprintHex,
    delegationId: query.delegationId,
    observedThroughLifecycleOrder: query.locallyObservedThroughLifecycleOrder,
    checkedAt: query.evaluatedAt,
    freshUntil: FRESH_UNTIL,
    ...overrides,
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
  return Buffer.from(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  )).toString('hex');
}

function sign(input: Uint8Array, privateKey: Uint8Array): string {
  return Buffer.from(sodium.crypto_sign_detached(input, privateKey)).toString('hex');
}
