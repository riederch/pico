import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  PicoIdentityKeyRecordSignatureInput,
  PicoIdentityDelegationScope,
  PicoIdentityDelegationSignatureInput,
  PicoIdentityPossessionSignatureInput,
  PicoIdentityReaderKeyFreshnessSignatureInput,
  PicoIdentityRevocationSignatureInput,
  PicoIdentityRotationSignatureInput,
} from '@pico/protocol';
import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  buildPicoIdentityRotationSignatureInput,
  picoIdentitySuite,
} from '@pico/protocol';
import type { IdentityVerificationSodium } from './index.js';
import {
  comparePicoIdentityLifecycleOrder,
  computePicoIdentityKeyRecordFingerprintHex,
  createPicoIdentityLifecycleIndex,
  createVerifiedPicoIdentityLifecycleIndex,
  parsePicoIdentityLifecycleOrder,
  reconcilePicoIdentityLifecycleInputs,
  verifyPicoIdentityDelegationSignature,
  verifyPicoIdentityDetachedSignature,
  verifyPicoIdentityKeyRecordFingerprint,
  verifyPicoIdentityPossessionSignature,
  verifyPicoIdentityReaderKeyFreshnessSignature,
  verifyPicoIdentityRevocationSignature,
  verifyPicoIdentityRotationSignatures,
} from './index.js';

interface TestSodium extends IdentityVerificationSodium {
  ready: Promise<void>;
  crypto_sign_SEEDBYTES: number;
  crypto_sign_seed_keypair(seed: Uint8Array): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_sign_detached(message: Uint8Array | string, privateKey: Uint8Array): Uint8Array;
}

const testSodium = sodium as unknown as TestSodium;
const repoRootPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const identityFingerprint = '66e6e80bcd9fc83d805ac5f7d9021aa10fb1166671c05ca9148bc92ac6e73616';
const signingFingerprint = '5dba9b41e6f3f034b84d142eeac499f404237f4dd9ff4add17b5f4843e2240b5';
const agreementFingerprint = '2263a4d54b123d8227780014ec313e7afe88a0f8f880a07026a3f931b098e06a';
const replacementSigningFingerprint = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const foreignIdentityFingerprint = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const verifierNonceHex = '44'.repeat(32);

beforeAll(async () => {
  await testSodium.ready;
});

interface IdentityLifecycleFixtureInput {
  acceptedDelegations?: PicoIdentityDelegationSignatureInput[];
  acceptedRevocations?: PicoIdentityRevocationSignatureInput[];
  lookup?: {
    delegationId: string;
    at: string;
    requiredScopes?: PicoIdentityDelegationScope[];
  };
}

interface IdentitySignatureVerificationFixtureInput {
  recordFamily: 'possession' | 'delegation' | 'revocation';
  issuerIdentityKeyRecord?: PicoIdentityKeyRecordSignatureInput;
  subjectKeyRecord?: PicoIdentityKeyRecordSignatureInput;
  possession?: PicoIdentityPossessionSignatureInput;
  delegation?: PicoIdentityDelegationSignatureInput;
  revocation?: PicoIdentityRevocationSignatureInput;
  signatureHex: string;
}

interface SigningFixture {
  keyRecord: PicoIdentityKeyRecordSignatureInput;
  privateKey: Uint8Array;
  fingerprintHex: string;
}

function signingFixture(keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'], seedByte: number): SigningFixture {
  const keypair = testSodium.crypto_sign_seed_keypair(new Uint8Array(testSodium.crypto_sign_SEEDBYTES).fill(seedByte));
  const keyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex: bytesToHex(keypair.publicKey),
  };
  return {
    keyRecord,
    privateKey: keypair.privateKey,
    fingerprintHex: computePicoIdentityKeyRecordFingerprintHex(testSodium, keyRecord),
  };
}

function signedDelegation(
  issuer: SigningFixture,
  overrides: Partial<PicoIdentityDelegationSignatureInput> = {},
): { record: PicoIdentityDelegationSignatureInput; signatureHex: string } {
  const record = delegation({
    issuerIdentityKeyFingerprintHex: issuer.fingerprintHex,
    ...overrides,
  });
  return {
    record,
    signatureHex: signHex(buildPicoIdentityDelegationSignatureInput(record), issuer.privateKey),
  };
}

function signedRevocation(
  issuer: SigningFixture,
  overrides: Partial<PicoIdentityRevocationSignatureInput> = {},
): { record: PicoIdentityRevocationSignatureInput; signatureHex: string } {
  const record = revocation({
    issuerIdentityKeyFingerprintHex: issuer.fingerprintHex,
    ...overrides,
  });
  return {
    record,
    signatureHex: signHex(buildPicoIdentityRevocationSignatureInput(record), issuer.privateKey),
  };
}

function possession(
  subjectFingerprintHex: string,
  overrides: Partial<PicoIdentityPossessionSignatureInput> = {},
): PicoIdentityPossessionSignatureInput {
  return {
    suite: picoIdentitySuite,
    subjectKeyFingerprintHex: subjectFingerprintHex,
    verifierNonceHex,
    verifierContext: 'pico-vault:device-claim',
    ...overrides,
  };
}

function delegation(overrides: Partial<PicoIdentityDelegationSignatureInput> = {}): PicoIdentityDelegationSignatureInput {
  return {
    suite: picoIdentitySuite,
    delegationId: 'del_01hzx8m9q4rt5v',
    issuerIdentityKeyFingerprintHex: identityFingerprint,
    subjectSigningKeyFingerprintHex: signingFingerprint,
    subjectKeyAgreementKeyFingerprintHex: agreementFingerprint,
    scopes: ['sign_history', 'receive_key_envelope', 'decrypt_domain'],
    validFrom: '2026-07-18T08:00:00.000Z',
    validUntil: '2026-10-18T08:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
    ...overrides,
  };
}

/**
 * What the index hands back: the same statement with the scope set in canonical
 * order, matching the bytes the signature input covers.
 */
function canonicalDelegation(
  overrides: Partial<PicoIdentityDelegationSignatureInput> = {},
): PicoIdentityDelegationSignatureInput {
  const record = delegation(overrides);
  return { ...record, scopes: [...record.scopes].sort() };
}

function revocation(overrides: Partial<PicoIdentityRevocationSignatureInput> = {}): PicoIdentityRevocationSignatureInput {
  return {
    suite: picoIdentitySuite,
    revocationId: 'rev_01hzx8m9q4rt5v',
    issuerIdentityKeyFingerprintHex: identityFingerprint,
    subjectKind: 'delegation',
    subjectRef: 'del_01hzx8m9q4rt5v',
    reasonCategory: 'device_retired',
    revokedAt: '2026-08-18T08:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000002',
    ...overrides,
  };
}

describe('PicoIdentityLifecycleIndex', () => {
  it('projects an accepted delegation as active at verification time', () => {
    const index = createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation()],
    });

    expect(index.delegationIds()).toEqual(['del_01hzx8m9q4rt5v']);
    expect(index.revocationIds()).toEqual([]);
    expect(index.freshestLifecycleOrder()).toBe('seq:0000000000000001');
    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-07-19T08:00:00.000Z',
      requiredScopes: ['decrypt_domain', 'sign_history'],
    })).toMatchObject({
      status: 'active',
      freshestLifecycleOrder: 'seq:0000000000000001',
    });
  });

  it('keeps restored stale delegations revoked when a fresher revocation is reconciled', () => {
    const restoredBackup = {
      acceptedDelegations: [delegation()],
    };
    const lifecycleRegistry = {
      acceptedRevocations: [revocation()],
    };

    const index = reconcilePicoIdentityLifecycleInputs([restoredBackup, lifecycleRegistry]);

    expect(index.freshestLifecycleOrder()).toBe('seq:0000000000000002');
    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-08-19T08:00:00.000Z',
      requiredScopes: ['decrypt_domain'],
    })).toMatchObject({
      status: 'revoked',
      revokedBy: {
        match: 'delegation',
        revocation: {
          revocationId: 'rev_01hzx8m9q4rt5v',
          lifecycleOrder: 'seq:0000000000000002',
        },
      },
    });
  });

  it('treats device key revocations as terminal for matching device delegations', () => {
    const index = createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation()],
      acceptedRevocations: [
        revocation({
          revocationId: 'rev_device_signing_key',
          subjectKind: 'key',
          subjectRef: signingFingerprint,
          reasonCategory: 'lost_device',
          lifecycleOrder: 'seq:0000000000000003',
        }),
      ],
    });

    expect(index.delegationsForSubjectKey(signingFingerprint)).toEqual([canonicalDelegation()]);
    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-07-19T08:00:00.000Z',
    })).toMatchObject({
      status: 'revoked',
      revokedBy: {
        match: 'subject_signing_key',
        revocation: {
          revocationId: 'rev_device_signing_key',
        },
      },
    });
  });

  it('reports validity and scope failures without granting authority', () => {
    const index = createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation()],
    });

    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-07-17T08:00:00.000Z',
    })).toMatchObject({ status: 'not_yet_valid' });
    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-10-18T08:00:00.000Z',
    })).toMatchObject({ status: 'expired' });
    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-07-19T08:00:00.000Z',
      requiredScopes: ['home_membership'],
    })).toMatchObject({
      status: 'missing_scope',
      missingScopes: ['home_membership'],
    });
    expect(index.lookupDelegation('missing', {
      at: '2026-07-19T08:00:00.000Z',
    })).toEqual({
      status: 'unknown',
      freshestLifecycleOrder: 'seq:0000000000000001',
    });
  });

  it('refuses to answer an authority question without a canonical lookup time', () => {
    const index = createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation()],
    });

    // An omitted lookup time used to skip the validity window entirely, so an
    // expired delegation answered `active` (ADR 0079 I8/I9).
    expect(() => index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: undefined as unknown as string,
    })).toThrow('invalid_lookup_time');
    // A same-instant offset form sorts before `Z` and would report the
    // delegation active an hour past its real expiry.
    expect(() => index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-10-18T10:00:00+02:00',
    })).toThrow('invalid_lookup_time');
    expect(() => index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-10-18T08:00:00Z',
    })).toThrow('invalid_lookup_time');
    // Shape alone admits impossible dates; `new Date` rolls this to March 2.
    expect(() => index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-02-30T08:00:00.000Z',
    })).toThrow('invalid_lookup_time');
  });

  it('ends every delegation an identity issued when that identity key is revoked', () => {
    const index = createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation()],
      acceptedRevocations: [
        revocation({
          revocationId: 'rev_identity_root',
          subjectKind: 'key',
          subjectRef: identityFingerprint,
          reasonCategory: 'suspected_compromise',
          lifecycleOrder: 'seq:0000000000000007',
        }),
      ],
    });

    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-08-19T08:00:00.000Z',
    })).toMatchObject({
      status: 'revoked',
      revokedBy: {
        match: 'issuer_identity_key',
        revocation: { revocationId: 'rev_identity_root' },
      },
    });

    // A thief holding the root can still mint delegations; ordering must not
    // let a newer one outlive the revocation of the key that signed it.
    expect(index.reconcile({
      acceptedDelegations: [
        delegation({
          delegationId: 'del_minted_after_theft',
          lifecycleOrder: 'seq:0000000000000009',
        }),
      ],
    }).lookupDelegation('del_minted_after_theft', {
      at: '2026-08-19T08:00:00.000Z',
    })).toMatchObject({ status: 'revoked', revokedBy: { match: 'issuer_identity_key' } });
  });

  it('lets only the issuing identity revoke its own delegations', () => {
    const index = createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation()],
      acceptedRevocations: [
        // A merged index holds several identities' statements. A foreign
        // issuer naming this delegation, or its subject key, must not end it.
        revocation({
          revocationId: 'rev_foreign_delegation_ref',
          issuerIdentityKeyFingerprintHex: foreignIdentityFingerprint,
          subjectKind: 'delegation',
          subjectRef: 'del_01hzx8m9q4rt5v',
          lifecycleOrder: 'seq:0000000000000004',
        }),
        revocation({
          revocationId: 'rev_foreign_key_ref',
          issuerIdentityKeyFingerprintHex: foreignIdentityFingerprint,
          subjectKind: 'key',
          subjectRef: signingFingerprint,
          lifecycleOrder: 'seq:0000000000000005',
        }),
      ],
    });

    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-08-19T08:00:00.000Z',
    })).toMatchObject({ status: 'active' });

    expect(index.reconcile({
      acceptedRevocations: [
        revocation({
          revocationId: 'rev_own_delegation_ref',
          subjectKind: 'delegation',
          subjectRef: 'del_01hzx8m9q4rt5v',
          lifecycleOrder: 'seq:0000000000000006',
        }),
      ],
    }).lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-08-19T08:00:00.000Z',
    })).toMatchObject({
      status: 'revoked',
      revokedBy: { revocation: { revocationId: 'rev_own_delegation_ref' } },
    });
  });

  it('deduplicates identical replica records and rejects conflicting ids', () => {
    expect(createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation(), delegation()],
      acceptedRevocations: [revocation(), revocation()],
    }).snapshot()).toMatchObject({
      delegations: [canonicalDelegation()],
      revocations: [revocation()],
      freshestLifecycleOrder: 'seq:0000000000000002',
    });

    // The signature input sorts the scope set, so two replicas that list one
    // statement's scopes in different order carry the same signed bytes and
    // must dedupe rather than collide.
    expect(reconcilePicoIdentityLifecycleInputs([
      { acceptedDelegations: [delegation()] },
      { acceptedDelegations: [delegation({ scopes: ['decrypt_domain', 'sign_history', 'receive_key_envelope'] })] },
    ]).snapshot().delegations).toEqual([canonicalDelegation()]);

    expect(() => createPicoIdentityLifecycleIndex({
      acceptedDelegations: [
        delegation(),
        delegation({ subjectSigningKeyFingerprintHex: replacementSigningFingerprint }),
      ],
    })).toThrow('conflicting_delegation_statement');
    expect(() => createPicoIdentityLifecycleIndex({
      acceptedRevocations: [
        revocation(),
        revocation({ subjectRef: 'another_delegation' }),
      ],
    })).toThrow('conflicting_revocation_statement');
  });

  it('reserves each lifecycle order for exactly one statement per issuer', () => {
    expect(() => createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation()],
      acceptedRevocations: [
        revocation({ lifecycleOrder: 'seq:0000000000000001' }),
      ],
    })).toThrow('conflicting_lifecycle_order_statement');

    expect(() => createPicoIdentityLifecycleIndex({
      acceptedDelegations: [
        delegation(),
        delegation({
          delegationId: 'del_same_order_different_statement',
          subjectSigningKeyFingerprintHex: replacementSigningFingerprint,
        }),
      ],
    })).toThrow('conflicting_lifecycle_order_statement');

    expect(createPicoIdentityLifecycleIndex({
      acceptedDelegations: [
        delegation(),
        delegation({
          delegationId: 'del_foreign_same_order',
          issuerIdentityKeyFingerprintHex: foreignIdentityFingerprint,
          subjectSigningKeyFingerprintHex: replacementSigningFingerprint,
        }),
      ],
    }).delegationIds()).toEqual([
      'del_01hzx8m9q4rt5v',
      'del_foreign_same_order',
    ]);
  });

  it('keeps lifecycle ordering numeric and fixed-width', () => {
    expect(parsePicoIdentityLifecycleOrder('seq:9007199254740992')).toBe(9007199254740992n);
    expect(comparePicoIdentityLifecycleOrder('seq:0000000000000010', 'seq:0000000000000009')).toBe(1);
    expect(() => parsePicoIdentityLifecycleOrder('seq:10')).toThrow('invalid_lifecycle_order');
  });

  it('rejects records outside the ADR 0079 G1 semantic envelope', () => {
    expect(() => createPicoIdentityLifecycleIndex({
      acceptedDelegations: [
        delegation({ scopes: ['administer_home' as never] }),
      ],
    })).toThrow('invalid_scope');
    expect(() => createPicoIdentityLifecycleIndex({
      acceptedRevocations: [
        revocation({ lifecycleOrder: '2' }),
      ],
    })).toThrow('invalid_lifecycle_order');
  });
});

describe('Pico identity signature verification runtime', () => {
  it('computes and checks full key-record fingerprints', () => {
    const identity = signingFixture('pico_identity', 0x11);

    expect(identity.fingerprintHex).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyPicoIdentityKeyRecordFingerprint(testSodium, {
      keyRecord: identity.keyRecord,
      expectedFingerprintHex: identity.fingerprintHex,
    })).toBe(true);
    expect(verifyPicoIdentityKeyRecordFingerprint(testSodium, {
      keyRecord: identity.keyRecord,
      expectedFingerprintHex: `${identity.fingerprintHex.slice(0, 62)}00`,
    })).toBe(false);
    expect(() => verifyPicoIdentityKeyRecordFingerprint(testSodium, {
      keyRecord: identity.keyRecord,
      expectedFingerprintHex: identity.fingerprintHex.slice(0, 62),
    })).toThrow('invalid_fingerprint_length');
  });

  it('verifies possession signatures only for signing-capable key records', () => {
    const deviceSigning = signingFixture('device_signing', 0x22);
    const challenge = possession(deviceSigning.fingerprintHex);
    const signatureInput = buildPicoIdentityPossessionSignatureInput(challenge);
    const signatureHex = signHex(signatureInput, deviceSigning.privateKey);

    expect(verifyPicoIdentityPossessionSignature(testSodium, {
      subjectKeyRecord: deviceSigning.keyRecord,
      possession: challenge,
      signatureHex,
    })).toBe(true);
    expect(verifyPicoIdentityPossessionSignature(testSodium, {
      subjectKeyRecord: deviceSigning.keyRecord,
      possession: possession(deviceSigning.fingerprintHex, { verifierContext: 'pico-home:move-in-claim' }),
      signatureHex,
    })).toBe(false);
    expect(() => verifyPicoIdentityPossessionSignature(testSodium, {
      subjectKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: '33'.repeat(32),
      },
      possession: challenge,
      signatureHex,
    })).toThrow('key_role_cannot_verify_possession');
  });

  it('verifies identity-signed delegations and revocations before lifecycle projection', () => {
    const identity = signingFixture('pico_identity', 0x11);
    const signedDeviceDelegation = signedDelegation(identity);
    const signedDeviceRevocation = signedRevocation(identity);

    expect(verifyPicoIdentityDelegationSignature(testSodium, {
      issuerIdentityKeyRecord: identity.keyRecord,
      delegation: signedDeviceDelegation.record,
      signatureHex: signedDeviceDelegation.signatureHex,
    })).toBe(true);
    expect(verifyPicoIdentityRevocationSignature(testSodium, {
      issuerIdentityKeyRecord: identity.keyRecord,
      revocation: signedDeviceRevocation.record,
      signatureHex: signedDeviceRevocation.signatureHex,
    })).toBe(true);

    const index = createVerifiedPicoIdentityLifecycleIndex(testSodium, {
      issuerIdentityKeyRecord: identity.keyRecord,
      signedDelegations: [signedDeviceDelegation],
      signedRevocations: [signedDeviceRevocation],
    });
    expect(index.lookupDelegation('del_01hzx8m9q4rt5v', {
      at: '2026-08-19T08:00:00.000Z',
    })).toMatchObject({
      status: 'revoked',
      revokedBy: {
        revocation: {
          revocationId: 'rev_01hzx8m9q4rt5v',
        },
      },
    });
  });

  it('verifies reader-key freshness checkpoints only under the exact identity root', () => {
    const identity = signingFixture('pico_identity', 0x11);
    const wrongIdentity = signingFixture('pico_identity', 0x12);
    const deviceSigningIssuer = signingFixture('device_signing', 0x22);
    const checkpoint: PicoIdentityReaderKeyFreshnessSignatureInput = {
      suite: picoIdentitySuite,
      checkpointId: 'freshness_identity_test_0001',
      homeId: 'home_identity_test',
      issuerIdentityKeyFingerprintHex: identity.fingerprintHex,
      deviceSigningKeyFingerprintHex: signingFingerprint,
      deviceKeyAgreementKeyFingerprintHex: agreementFingerprint,
      delegationId: 'del_01hzx8m9q4rt5v',
      status: 'current',
      observedThroughLifecycleOrder: 'seq:0000000000000002',
      checkedAt: '2026-07-27T10:00:00.000Z',
      freshUntil: '2026-07-27T10:05:00.000Z',
    };
    const signatureHex = signHex(
      buildPicoIdentityReaderKeyFreshnessSignatureInput(checkpoint),
      identity.privateKey,
    );

    expect(verifyPicoIdentityReaderKeyFreshnessSignature(testSodium, {
      issuerIdentityKeyRecord: identity.keyRecord,
      checkpoint,
      signatureHex,
    })).toBe(true);
    expect(verifyPicoIdentityReaderKeyFreshnessSignature(testSodium, {
      issuerIdentityKeyRecord: wrongIdentity.keyRecord,
      checkpoint,
      signatureHex,
    })).toBe(false);
    expect(verifyPicoIdentityReaderKeyFreshnessSignature(testSodium, {
      issuerIdentityKeyRecord: identity.keyRecord,
      checkpoint: {
        ...checkpoint,
        deviceKeyAgreementKeyFingerprintHex: '44'.repeat(32),
      },
      signatureHex,
    })).toBe(false);
    expect(() => verifyPicoIdentityReaderKeyFreshnessSignature(testSodium, {
      issuerIdentityKeyRecord: deviceSigningIssuer.keyRecord,
      checkpoint,
      signatureHex,
    })).toThrow('invalid_issuer_key_role');
  });

  it('fails closed for tampered signatures, mismatched issuer fingerprints and wrong issuer roles', () => {
    const identity = signingFixture('pico_identity', 0x11);
    const wrongIdentity = signingFixture('pico_identity', 0x12);
    const deviceSigningIssuer = signingFixture('device_signing', 0x22);
    const signedDeviceDelegation = signedDelegation(identity);

    expect(verifyPicoIdentityDelegationSignature(testSodium, {
      issuerIdentityKeyRecord: identity.keyRecord,
      delegation: {
        ...signedDeviceDelegation.record,
        scopes: ['sign_history', 'receive_key_envelope'],
      },
      signatureHex: signedDeviceDelegation.signatureHex,
    })).toBe(false);
    expect(verifyPicoIdentityDelegationSignature(testSodium, {
      issuerIdentityKeyRecord: wrongIdentity.keyRecord,
      delegation: signedDeviceDelegation.record,
      signatureHex: signedDeviceDelegation.signatureHex,
    })).toBe(false);
    expect(() => verifyPicoIdentityDelegationSignature(testSodium, {
      issuerIdentityKeyRecord: deviceSigningIssuer.keyRecord,
      delegation: signedDeviceDelegation.record,
      signatureHex: signedDeviceDelegation.signatureHex,
    })).toThrow('invalid_issuer_key_role');
    expect(() => verifyPicoIdentityDetachedSignature(testSodium, {
      publicKeyHex: identity.keyRecord.publicKeyHex,
      signatureInput: buildPicoIdentityDelegationSignatureInput(signedDeviceDelegation.record),
      signatureHex: signedDeviceDelegation.signatureHex.slice(0, 126),
    })).toThrow('invalid_signature_length');
    expect(() => createVerifiedPicoIdentityLifecycleIndex(testSodium, {
      issuerIdentityKeyRecord: identity.keyRecord,
      signedDelegations: [{
        record: {
          ...signedDeviceDelegation.record,
          scopes: ['sign_history', 'receive_key_envelope'],
        },
        signatureHex: signedDeviceDelegation.signatureHex,
      }],
    })).toThrow('invalid_delegation_signature');
  });
});

describe('ADR 0114 T1 identity-root rotation records', () => {
  function rotation(
    predecessor: SigningFixture,
    successor: SigningFixture,
    overrides: Partial<PicoIdentityRotationSignatureInput> = {},
  ): PicoIdentityRotationSignatureInput {
    return {
      suite: picoIdentitySuite,
      rotationId: 'rotation_0001',
      predecessorIdentityKeyFingerprintHex: predecessor.fingerprintHex,
      successorIdentityKeyFingerprintHex: successor.fingerprintHex,
      reasonCategory: 'suspected_compromise',
      rotatedAt: '2026-08-01T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000007',
      ...overrides,
    };
  }

  function signedRotation(
    predecessor: SigningFixture,
    successor: SigningFixture,
    overrides: Partial<PicoIdentityRotationSignatureInput> = {},
  ): {
    record: PicoIdentityRotationSignatureInput;
    predecessorSignatureHex: string;
    successorSignatureHex: string;
  } {
    const record = rotation(predecessor, successor, overrides);
    const signatureInput = buildPicoIdentityRotationSignatureInput(record);
    return {
      record,
      predecessorSignatureHex: signHex(signatureInput, predecessor.privateKey),
      successorSignatureHex: signHex(signatureInput, successor.privateKey),
    };
  }

  it('accepts a rotation only when both roots signed the same bytes', () => {
    const predecessor = signingFixture('pico_identity', 0x41);
    const successor = signingFixture('pico_identity', 0x42);
    const signed = signedRotation(predecessor, successor);

    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: predecessor.keyRecord,
      successorIdentityKeyRecord: successor.keyRecord,
      rotation: signed.record,
      predecessorSignatureHex: signed.predecessorSignatureHex,
      successorSignatureHex: signed.successorSignatureHex,
    })).toBe(true);

    // Authorization without possession: the predecessor may not hand the
    // identity to a key nobody proves they hold.
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: predecessor.keyRecord,
      successorIdentityKeyRecord: successor.keyRecord,
      rotation: signed.record,
      predecessorSignatureHex: signed.predecessorSignatureHex,
      successorSignatureHex: signed.predecessorSignatureHex,
    })).toBe(false);
    // Possession without authorization: a successor cannot appoint itself.
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: predecessor.keyRecord,
      successorIdentityKeyRecord: successor.keyRecord,
      rotation: signed.record,
      predecessorSignatureHex: signed.successorSignatureHex,
      successorSignatureHex: signed.successorSignatureHex,
    })).toBe(false);
  });

  it('refuses a stranger substituted for either side, and swapped roles', () => {
    const predecessor = signingFixture('pico_identity', 0x43);
    const successor = signingFixture('pico_identity', 0x44);
    const stranger = signingFixture('pico_identity', 0x45);
    const signed = signedRotation(predecessor, successor);

    // The key record presented must be the one the signed bytes name, or a
    // valid rotation could be re-pointed at a third party's root.
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: stranger.keyRecord,
      successorIdentityKeyRecord: successor.keyRecord,
      rotation: signed.record,
      predecessorSignatureHex: signed.predecessorSignatureHex,
      successorSignatureHex: signed.successorSignatureHex,
    })).toBe(false);
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: predecessor.keyRecord,
      successorIdentityKeyRecord: stranger.keyRecord,
      rotation: signed.record,
      predecessorSignatureHex: signed.predecessorSignatureHex,
      successorSignatureHex: signed.successorSignatureHex,
    })).toBe(false);
    // The dangerous substitution is a cooperating stranger: they sign the
    // real record's bytes with their own root and present their own key
    // record. Both signatures then verify on their own, and only the
    // fingerprint binding stops a caller from reading the stranger's key
    // record as the successor of somebody else's identity.
    const signatureInput = buildPicoIdentityRotationSignatureInput(signed.record);
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: predecessor.keyRecord,
      successorIdentityKeyRecord: stranger.keyRecord,
      rotation: signed.record,
      predecessorSignatureHex: signed.predecessorSignatureHex,
      successorSignatureHex: signHex(signatureInput, stranger.privateKey),
    })).toBe(false);
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: stranger.keyRecord,
      successorIdentityKeyRecord: successor.keyRecord,
      rotation: signed.record,
      predecessorSignatureHex: signHex(signatureInput, stranger.privateKey),
      successorSignatureHex: signed.successorSignatureHex,
    })).toBe(false);

    // Direction is part of the signed bytes, so the pair cannot be reversed.
    const reversed = signedRotation(successor, predecessor);
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: predecessor.keyRecord,
      successorIdentityKeyRecord: successor.keyRecord,
      rotation: reversed.record,
      predecessorSignatureHex: reversed.predecessorSignatureHex,
      successorSignatureHex: reversed.successorSignatureHex,
    })).toBe(false);
  });

  it('refuses any key role other than a root on either side (ADR 0079 I5)', () => {
    const predecessor = signingFixture('pico_identity', 0x46);
    const successor = signingFixture('pico_identity', 0x47);
    const deviceSigning = signingFixture('device_signing', 0x48);
    const hostSigning = signingFixture('home_host_signing', 0x49);
    const signed = signedRotation(predecessor, successor);

    for (const impostor of [deviceSigning, hostSigning]) {
      expect(() => verifyPicoIdentityRotationSignatures(testSodium, {
        predecessorIdentityKeyRecord: impostor.keyRecord,
        successorIdentityKeyRecord: successor.keyRecord,
        rotation: signed.record,
        predecessorSignatureHex: signed.predecessorSignatureHex,
        successorSignatureHex: signed.successorSignatureHex,
      })).toThrow('invalid_issuer_key_role');
      expect(() => verifyPicoIdentityRotationSignatures(testSodium, {
        predecessorIdentityKeyRecord: predecessor.keyRecord,
        successorIdentityKeyRecord: impostor.keyRecord,
        rotation: signed.record,
        predecessorSignatureHex: signed.predecessorSignatureHex,
        successorSignatureHex: signed.successorSignatureHex,
      })).toThrow('invalid_issuer_key_role');
    }
  });

  it('refuses malformed records before anything is signed or verified', () => {
    const predecessor = signingFixture('pico_identity', 0x4a);
    const successor = signingFixture('pico_identity', 0x4b);

    // A root succeeding itself would end the authority it grants.
    expect(() => buildPicoIdentityRotationSignatureInput(
      rotation(predecessor, successor, {
        successorIdentityKeyFingerprintHex: predecessor.fingerprintHex,
      }),
    )).toThrow('rotation_successor_equals_predecessor');
    expect(() => buildPicoIdentityRotationSignatureInput(
      rotation(predecessor, successor, { reasonCategory: 'because' as never }),
    )).toThrow('invalid_reason_category');
    expect(() => buildPicoIdentityRotationSignatureInput(
      rotation(predecessor, successor, { rotatedAt: '2026-08-01T10:00:00Z' }),
    )).toThrow('invalid_instant');
    expect(() => buildPicoIdentityRotationSignatureInput(
      rotation(predecessor, successor, { lifecycleOrder: '7' }),
    )).toThrow('invalid_lifecycle_order');
    expect(() => buildPicoIdentityRotationSignatureInput(
      rotation(predecessor, successor, {
        predecessorIdentityKeyFingerprintHex: predecessor.fingerprintHex.slice(0, 62),
      }),
    )).toThrow('invalid_fingerprint_length');
    expect(() => buildPicoIdentityRotationSignatureInput({
      ...rotation(predecessor, successor),
      extra: true,
    } as never)).toThrow('unexpected_field');
  });

  it('binds the suite into the signed bytes, so a downgrade is a different record', () => {
    const predecessor = signingFixture('pico_identity', 0x4c);
    const successor = signingFixture('pico_identity', 0x4d);
    const signed = signedRotation(predecessor, successor);
    const downgraded = {
      ...signed.record,
      suite: 'pico.suite.id.v0',
    };

    // The key records still verify as roots of the real suite, but the
    // signatures were made over the real suite's bytes.
    expect(verifyPicoIdentityRotationSignatures(testSodium, {
      predecessorIdentityKeyRecord: predecessor.keyRecord,
      successorIdentityKeyRecord: successor.keyRecord,
      rotation: downgraded,
      predecessorSignatureHex: signed.predecessorSignatureHex,
      successorSignatureHex: signed.successorSignatureHex,
    })).toBe(false);
  });
});

describe('Pico identity signature verification fixture vectors', () => {
  it('binds the ADR 0079 signature verification suite to the runtime verifier', () => {
    const suite = readRepoJsonObject('docs/protocol/fixtures/identity-signature-verification/suite.json');
    const fixturePaths = stringArray(suite.fixtures, 'fixtures');

    expect(stringField(suite, 'schema')).toBe('pico.identity.signature-verification.vector.suite');
    expect(stringField(suite, 'suiteId')).toBe('pico.identity-signature-verification.pico_suite_id_v1');
    expect(stringField(suite, 'suiteVersion')).toBe('0.1.7');
    expect(stringField(suite, 'suite')).toBe(picoIdentitySuite);
    expect(stringField(suite, 'surface')).toBe('identity-signature-verification');
    expect(stringArray(suite.families, 'families')).toEqual(['verify-positive', 'verify-negative']);
    expect(readRepoText('docs/protocol/fixtures/README.md')).toContain('identity-signature-verification/suite.json');
    expect(listFixtureDirectories('docs/protocol/fixtures/identity-signature-verification').sort()).toEqual([
      'suite.json',
      ...fixturePaths.map((fixturePath) => `${fixturePath}/`),
    ].sort());

    for (const fixturePath of fixturePaths) {
      const base = `docs/protocol/fixtures/identity-signature-verification/${fixturePath}`;
      const fixture = readRepoJsonObject(`${base}/fixture.json`);
      const input = readRepoJsonObject(`${base}/input.json`) as unknown as IdentitySignatureVerificationFixtureInput;
      const [suiteSegment, family, caseName] = fixturePath.split('/');

      expect(suiteSegment).toBe(picoIdentitySuite);
      expect(stringField(fixture, 'schema')).toBe('pico.identity.signature-verification.vector');
      expect(stringField(fixture, 'fixtureId')).toBe(`identity-signature-verification.pico_suite_id_v1.${family}.${caseName}`);
      expect(stringField(fixture, 'suite')).toBe(picoIdentitySuite);
      expect(stringField(fixture, 'surface')).toBe('identity-signature-verification');
      expect(stringField(fixture, 'family')).toBe(family);
      expect(stringField(fixture, 'recordFamily')).toBe(input.recordFamily);
      expect(stringField(fixture, 'adr')).toBe('0079');
      expect(stringField(recordField(fixture, 'source'), 'file')).toBe('input.json');

      const expectBlock = recordField(fixture, 'expect');
      const expectedVerification = stringField(expectBlock, 'verify');
      if (expectedVerification === 'accept') {
        expect(verifyIdentitySignatureFixture(input)).toBe(true);
        if ('issuerIdentityKeyFingerprintHex' in expectBlock) {
          expect(input.issuerIdentityKeyRecord).toBeDefined();
          expect(computePicoIdentityKeyRecordFingerprintHex(
            testSodium,
            required(input.issuerIdentityKeyRecord, 'issuerIdentityKeyRecord'),
          )).toBe(stringField(expectBlock, 'issuerIdentityKeyFingerprintHex'));
        }
        if ('subjectKeyFingerprintHex' in expectBlock) {
          expect(input.subjectKeyRecord).toBeDefined();
          expect(computePicoIdentityKeyRecordFingerprintHex(
            testSodium,
            required(input.subjectKeyRecord, 'subjectKeyRecord'),
          )).toBe(stringField(expectBlock, 'subjectKeyFingerprintHex'));
        }
        continue;
      }

      expect(expectedVerification).toBe('reject');
      if ('error' in expectBlock) {
        expect(() => verifyIdentitySignatureFixture(input)).toThrow(stringField(expectBlock, 'error'));
      } else {
        expect(verifyIdentitySignatureFixture(input)).toBe(false);
      }
    }
  });
});

describe('Pico identity lifecycle fixture vectors', () => {
  it('binds the ADR 0079 G3 lifecycle suite to the runtime projector', () => {
    const suite = readRepoJsonObject('docs/protocol/fixtures/identity-lifecycle/suite.json');
    const fixturePaths = stringArray(suite.fixtures, 'fixtures');

    expect(stringField(suite, 'schema')).toBe('pico.identity.lifecycle.vector.suite');
    expect(stringField(suite, 'suiteId')).toBe('pico.identity-lifecycle.pico_suite_id_v1');
    expect(stringField(suite, 'suiteVersion')).toBe('0.1.7');
    expect(stringField(suite, 'suite')).toBe(picoIdentitySuite);
    expect(stringField(suite, 'surface')).toBe('identity-lifecycle');
    expect(stringArray(suite.families, 'families')).toEqual(['lifecycle-positive', 'lifecycle-negative']);
    expect(readRepoText('docs/protocol/fixtures/README.md')).toContain('identity-lifecycle/suite.json');
    expect(listFixtureDirectories('docs/protocol/fixtures/identity-lifecycle').sort()).toEqual([
      'suite.json',
      ...fixturePaths.map((fixturePath) => `${fixturePath}/`),
    ].sort());

    for (const fixturePath of fixturePaths) {
      const base = `docs/protocol/fixtures/identity-lifecycle/${fixturePath}`;
      const fixture = readRepoJsonObject(`${base}/fixture.json`);
      const input = readRepoJsonObject(`${base}/input.json`) as unknown as IdentityLifecycleFixtureInput;
      const [, family, caseName] = fixturePath.split('/');

      expect(stringField(fixture, 'schema')).toBe('pico.identity.lifecycle.vector');
      expect(stringField(fixture, 'fixtureId')).toBe(`identity-lifecycle.pico_suite_id_v1.${family}.${caseName}`);
      expect(stringField(fixture, 'suite')).toBe(picoIdentitySuite);
      expect(stringField(fixture, 'surface')).toBe('identity-lifecycle');
      expect(stringField(fixture, 'family')).toBe(family);
      expect(stringField(fixture, 'adr')).toBe('0079');
      expect(stringField(recordField(fixture, 'source'), 'file')).toBe('input.json');
      expect(stringField(fixture, 'notes')).not.toMatch(/signature verification|L4 compatibility/i);

      const expectBlock = recordField(fixture, 'expect');
      if (stringField(expectBlock, 'build') === 'reject') {
        expect(() => createPicoIdentityLifecycleIndex(input)).toThrow(stringField(expectBlock, 'error'));
        continue;
      }

      const index = createPicoIdentityLifecycleIndex(input);
      expect(input.lookup).toBeDefined();
      const lookup = input.lookup!;
      const result = index.lookupDelegation(lookup.delegationId, {
        at: lookup.at,
        requiredScopes: lookup.requiredScopes,
      });

      expect(result.status).toBe(stringField(expectBlock, 'status'));
      expect(result.freshestLifecycleOrder).toBe(stringField(expectBlock, 'freshestLifecycleOrder'));
      if ('revokedBy' in expectBlock) {
        const revokedBy = recordField(expectBlock, 'revokedBy');
        expect(result.revokedBy).toMatchObject({
          match: stringField(revokedBy, 'match'),
          revocation: {
            revocationId: stringField(revokedBy, 'revocationId'),
          },
        });
      }
      if ('missingScopes' in expectBlock) {
        expect(result.missingScopes).toEqual(stringArray(expectBlock.missingScopes, 'missingScopes'));
      }
    }
  });
});

function verifyIdentitySignatureFixture(input: IdentitySignatureVerificationFixtureInput): boolean {
  if (input.recordFamily === 'possession') {
    return verifyPicoIdentityPossessionSignature(testSodium, {
      subjectKeyRecord: required(input.subjectKeyRecord, 'subjectKeyRecord'),
      possession: required(input.possession, 'possession'),
      signatureHex: input.signatureHex,
    });
  }

  if (input.recordFamily === 'delegation') {
    return verifyPicoIdentityDelegationSignature(testSodium, {
      issuerIdentityKeyRecord: required(input.issuerIdentityKeyRecord, 'issuerIdentityKeyRecord'),
      delegation: required(input.delegation, 'delegation'),
      signatureHex: input.signatureHex,
    });
  }

  return verifyPicoIdentityRevocationSignature(testSodium, {
    issuerIdentityKeyRecord: required(input.issuerIdentityKeyRecord, 'issuerIdentityKeyRecord'),
    revocation: required(input.revocation, 'revocation'),
    signatureHex: input.signatureHex,
  });
}

function readRepoText(path: string): string {
  return readFileSync(resolve(repoRootPath, path), 'utf8');
}

function readRepoJsonObject(path: string): Record<string, unknown> {
  const value = JSON.parse(readRepoText(path));
  if (!isRecord(value)) {
    throw new Error(`${path} must contain a JSON object.`);
  }
  return value;
}

function listFixtureDirectories(directoryPath: string): string[] {
  const absoluteDirectoryPath = resolve(repoRootPath, directoryPath);
  const paths: string[] = [];

  for (const entry of readdirSync(absoluteDirectoryPath)) {
    const absoluteEntryPath = resolve(absoluteDirectoryPath, entry);
    const relativePath = relative(absoluteDirectoryPath, absoluteEntryPath);
    const stat = statSync(absoluteEntryPath);
    if (stat.isDirectory()) {
      const childPaths = listFixtureDirectories(`${directoryPath}/${relativePath}`);
      if (childPaths.length === 0) {
        paths.push(`${relativePath}/`);
      } else {
        paths.push(...childPaths.map((childPath) => `${relativePath}/${childPath}`));
      }
    } else if (entry === 'suite.json') {
      paths.push(entry);
    }
  }

  return paths;
}

function recordField(value: Record<string, unknown>, field: string): Record<string, unknown> {
  const nested = value[field];
  if (!isRecord(nested)) {
    throw new Error(`${field} must be an object.`);
  }
  return nested;
}

function stringField(value: Record<string, unknown>, field: string): string {
  const nested = value[field];
  if (typeof nested !== 'string') {
    throw new Error(`${field} must be a string.`);
  }
  return nested;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function signHex(message: Uint8Array, privateKey: Uint8Array): string {
  return bytesToHex(testSodium.crypto_sign_detached(message, privateKey));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
