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
  PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
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
  verifyPicoIdentityRevocationSignature,
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
const verifierNonceHex = '44'.repeat(32);

beforeAll(async () => {
  await testSodium.ready;
});

interface IdentityLifecycleFixtureInput {
  acceptedDelegations?: PicoIdentityDelegationSignatureInput[];
  acceptedRevocations?: PicoIdentityRevocationSignatureInput[];
  lookup?: {
    delegationId: string;
    at?: string;
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

    expect(index.delegationsForSubjectKey(signingFingerprint)).toEqual([delegation()]);
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

  it('deduplicates identical replica records and rejects conflicting ids', () => {
    expect(createPicoIdentityLifecycleIndex({
      acceptedDelegations: [delegation(), delegation()],
      acceptedRevocations: [revocation(), revocation()],
    }).snapshot()).toMatchObject({
      delegations: [delegation()],
      revocations: [revocation()],
      freshestLifecycleOrder: 'seq:0000000000000002',
    });

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
