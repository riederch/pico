import {
  computePicoIdentityKeyRecordFingerprintHex,
} from '@pico/identity';
import {
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentitySuite,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityReaderKeyFreshnessCheckpoint,
  type PicoIdentityReaderKeyFreshnessSignatureInput,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AuthenticatedPicoIdentityReaderKeyFreshnessSource,
  type PicoIdentityReaderKeyFreshnessCheckpointLookupResult,
  type PicoIdentityReaderKeyFreshnessCheckpointSource,
} from './reader-key-freshness.js';
import type { PicoIdentityReaderKeyFreshnessQuery } from './reader-key.js';

const CHECKED_AT = '2026-07-27T10:00:00.000Z';
const FRESH_UNTIL = '2026-07-27T10:05:00.000Z';

let identity: { publicKey: Uint8Array; privateKey: Uint8Array };
let wrongIdentity: { publicKey: Uint8Array; privateKey: Uint8Array };
let identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
let wrongIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput;
let identityFingerprint: string;

beforeAll(async () => {
  await sodium.ready;
  identity = sodium.crypto_sign_keypair();
  wrongIdentity = sodium.crypto_sign_keypair();
  identityKeyRecord = keyRecord(identity.publicKey);
  wrongIdentityKeyRecord = keyRecord(wrongIdentity.publicKey);
  identityFingerprint = computePicoIdentityKeyRecordFingerprintHex(
    sodium,
    identityKeyRecord,
  );
});

describe('authenticated reader-key freshness adapter (ADR 0085)', () => {
  it('accepts only an exact identity-root-signed current checkpoint and performs every lookup', async () => {
    const source = queuedSource([
      checkpointResult(),
      checkpointResult({
        checkpointId: 'freshness_checkpoint_0002',
        checkedAt: '2026-07-27T10:01:00.000Z',
        freshUntil: '2026-07-27T10:05:00.000Z',
      }),
    ]);
    const adapter = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
      sodium,
      source,
    );

    await expect(adapter.check(query())).resolves.toEqual({
      status: 'current',
      sourceRef: 'registry:test',
      homeId: 'home_freshness_test',
      picoIdentityFingerprintHex: identityFingerprint,
      deviceSigningKeyFingerprintHex: '22'.repeat(32),
      deviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      delegationId: 'delegation_freshness_test',
      observedThroughLifecycleOrder: 'seq:0000000000000002',
      checkedAt: CHECKED_AT,
      freshUntil: FRESH_UNTIL,
    });
    await expect(adapter.check(query({
      evaluatedAt: '2026-07-27T10:01:00.000Z',
    }))).resolves.toMatchObject({
      status: 'current',
      checkedAt: '2026-07-27T10:01:00.000Z',
    });
    expect(source.calls).toBe(2);
  });

  it('rejects wrong issuer keys, signature tampering and cross-binding swaps', async () => {
    const wrongIssuerFingerprint =
      computePicoIdentityKeyRecordFingerprintHex(sodium, wrongIdentityKeyRecord);
    const cases: PicoIdentityReaderKeyFreshnessCheckpointLookupResult[] = [
      checkpointResult({}, wrongIdentityKeyRecord, wrongIdentity.privateKey),
      checkpointResult({ homeId: 'home_foreign' }),
      checkpointResult({
        issuerIdentityKeyFingerprintHex: wrongIssuerFingerprint,
      }),
      checkpointResult({ deviceSigningKeyFingerprintHex: '44'.repeat(32) }),
      checkpointResult({ deviceKeyAgreementKeyFingerprintHex: '55'.repeat(32) }),
      checkpointResult({ delegationId: 'delegation_foreign' }),
      {
        ...checkpointResult(),
        record: {
          ...checkpointResult().record,
          issuerSignatureHex: '00'.repeat(sodium.crypto_sign_BYTES),
        },
      },
    ];

    for (const lookup of cases) {
      const adapter = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
        sodium,
        queuedSource([lookup]),
      );
      await expect(adapter.check(query())).resolves.toEqual({
        status: 'unavailable',
      });
    }
  });

  it('rejects lifecycle and same-binding checkpoint rollback while exact replay stays idempotent', async () => {
    const first = checkpointResult({
      observedThroughLifecycleOrder: 'seq:0000000000000003',
      checkedAt: '2026-07-27T10:01:00.000Z',
    });
    const exactReplay = checkpointResult({
      observedThroughLifecycleOrder: 'seq:0000000000000003',
      checkedAt: '2026-07-27T10:01:00.000Z',
    });
    const timeRollback = checkpointResult({
      checkpointId: 'freshness_checkpoint_time_rollback',
      observedThroughLifecycleOrder: 'seq:0000000000000003',
      checkedAt: CHECKED_AT,
      freshUntil: '2026-07-27T10:04:00.000Z',
    });
    const lifecycleRollback = checkpointResult({
      checkpointId: 'freshness_checkpoint_rollback',
      observedThroughLifecycleOrder: 'seq:0000000000000002',
      checkedAt: '2026-07-27T10:02:00.000Z',
      freshUntil: '2026-07-27T10:05:00.000Z',
    });
    const source = queuedSource([
      first,
      exactReplay,
      timeRollback,
      lifecycleRollback,
    ]);
    const adapter = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
      sodium,
      source,
    );

    await expect(adapter.check(query({
      evaluatedAt: '2026-07-27T10:01:00.000Z',
    }))).resolves.toMatchObject({
      status: 'current',
      observedThroughLifecycleOrder: 'seq:0000000000000003',
    });
    await expect(adapter.check(query({
      evaluatedAt: '2026-07-27T10:01:00.000Z',
    }))).resolves.toMatchObject({
      status: 'current',
    });
    await expect(adapter.check(query({
      evaluatedAt: '2026-07-27T10:02:00.000Z',
    }))).resolves.toEqual({ status: 'stale' });
    await expect(adapter.check(query({
      evaluatedAt: '2026-07-27T10:02:00.000Z',
    }))).resolves.toEqual({ status: 'stale' });
  });

  it('rejects future, overlong and expired checkpoints without clock-skew grace', async () => {
    const cases: Array<{
      lookup: PicoIdentityReaderKeyFreshnessCheckpointLookupResult;
      query?: Partial<PicoIdentityReaderKeyFreshnessQuery>;
      expected: 'unavailable' | 'stale';
    }> = [
      {
        lookup: checkpointResult({
          checkedAt: '2026-07-27T10:00:00.001Z',
          freshUntil: '2026-07-27T10:05:00.001Z',
        }),
        expected: 'unavailable',
      },
      {
        lookup: checkpointResult({
          freshUntil: '2026-07-27T10:05:00.001Z',
        }),
        expected: 'unavailable',
      },
      {
        lookup: checkpointResult(),
        query: { evaluatedAt: FRESH_UNTIL },
        expected: 'stale',
      },
    ];

    for (const testCase of cases) {
      const adapter = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
        sodium,
        queuedSource([testCase.lookup]),
      );
      await expect(adapter.check(query(testCase.query))).resolves.toEqual({
        status: testCase.expected,
      });
    }
  });

  it('never uses stale-while-error or restored in-memory authority', async () => {
    const liveSource = queuedSource([
      checkpointResult(),
      new Error('registry timeout'),
    ]);
    const adapter = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
      sodium,
      liveSource,
    );
    await expect(adapter.check(query())).resolves.toMatchObject({
      status: 'current',
    });
    await expect(adapter.check(query())).resolves.toEqual({
      status: 'unavailable',
    });

    const afterRestore = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
      sodium,
      queuedSource([{ status: 'unavailable' }]),
    );
    await expect(afterRestore.check(query())).resolves.toEqual({
      status: 'unavailable',
    });

    const timedOut = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
      sodium,
      {
        async lookup(_query, options) {
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            );
          });
        },
      },
      5 * 60 * 1_000,
      1_024,
      5,
    );
    await expect(timedOut.check(query())).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('returns revoked only from a current, valid identity-root-signed checkpoint', async () => {
    const adapter = new AuthenticatedPicoIdentityReaderKeyFreshnessSource(
      sodium,
      queuedSource([checkpointResult({ status: 'revoked' })]),
    );
    await expect(adapter.check(query())).resolves.toEqual({
      status: 'revoked',
    });
  });
});

function query(
  overrides: Partial<PicoIdentityReaderKeyFreshnessQuery> = {},
): PicoIdentityReaderKeyFreshnessQuery {
  return {
    homeId: 'home_freshness_test',
    picoIdentityFingerprintHex: identityFingerprint,
    deviceSigningKeyFingerprintHex: '22'.repeat(32),
    deviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
    delegationId: 'delegation_freshness_test',
    locallyObservedThroughLifecycleOrder: 'seq:0000000000000001',
    evaluatedAt: CHECKED_AT,
    ...overrides,
  };
}

function checkpointResult(
  overrides: Partial<PicoIdentityReaderKeyFreshnessSignatureInput> = {},
  issuerIdentityKeyRecord = identityKeyRecord,
  privateKey = identity.privateKey,
): Extract<PicoIdentityReaderKeyFreshnessCheckpointLookupResult, {
  status: 'checkpoint';
}> {
  const checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput = {
    suite: picoIdentitySuite,
    checkpointId: 'freshness_checkpoint_0001',
    homeId: 'home_freshness_test',
    issuerIdentityKeyFingerprintHex: identityFingerprint,
    deviceSigningKeyFingerprintHex: '22'.repeat(32),
    deviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
    delegationId: 'delegation_freshness_test',
    status: 'current',
    observedThroughLifecycleOrder: 'seq:0000000000000002',
    checkedAt: CHECKED_AT,
    freshUntil: FRESH_UNTIL,
    ...overrides,
  };
  const record: PicoIdentityReaderKeyFreshnessCheckpoint = {
    schema: picoIdentityReaderKeyFreshnessCheckpointSchema,
    checkpoint,
    issuerIdentityKeyRecord,
    issuerSignatureHex: Buffer.from(sodium.crypto_sign_detached(
      buildPicoIdentityReaderKeyFreshnessSignatureInput(checkpoint),
      privateKey,
    )).toString('hex'),
  };
  return {
    status: 'checkpoint',
    sourceRef: 'registry:test',
    record,
  };
}

function queuedSource(
  results: Array<PicoIdentityReaderKeyFreshnessCheckpointLookupResult | Error>,
): PicoIdentityReaderKeyFreshnessCheckpointSource & { calls: number } {
  return {
    calls: 0,
    async lookup() {
      const result = results[this.calls];
      this.calls += 1;
      if (result === undefined) {
        throw new Error('unexpected extra lookup');
      }
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
}

function keyRecord(publicKey: Uint8Array): PicoIdentityKeyRecordSignatureInput {
  return {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
  };
}
