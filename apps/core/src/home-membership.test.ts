import { bytesToHex } from '@pico/protocol/canonical-bytes';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPicoHomeMembershipLifecycleSignatureInput,
  buildPicoHomeMembershipSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeFoundingRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoHomeMembershipLifecycleRecordSchema,
  picoIdentitySuite,
} from '@pico/protocol';
import type {
  PicoHomeFoundingRecord,
  PicoHomeMembershipCredential,
  PicoHomeMembershipLifecycleRecord,
  PicoHomeMembershipSignatureInput,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import {
  verifyPicoHomeMembershipActivation,
  verifyPicoHomeMembershipAuthority,
  verifyPicoHomeMembershipLifecycleRecord,
} from './home-membership.js';
import { createPicoTestFirstDeviceEvidence } from './test-first-device-evidence.js';

const tempDirs: string[] = [];
const stores: EventStore[] = [];

let homeHostPico: { publicKey: Uint8Array; privateKey: Uint8Array };
let hostSigning: { publicKey: Uint8Array; privateKey: Uint8Array };
let strangerPico: { publicKey: Uint8Array; privateKey: Uint8Array };

const HOME_ID = 'home_20260719_0001';
const SUBJECT_FINGERPRINT = 'b'.repeat(64);

beforeAll(async () => {
  await sodium.ready;
  homeHostPico = sodium.crypto_sign_keypair();
  hostSigning = sodium.crypto_sign_keypair();
  strangerPico = sodium.crypto_sign_keypair();
});

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Pico Home membership credentials (ADR 0080 H6)', () => {
  it('accepts a credential the Home Host Pico issued and the host activated', () => {
    const credential = issueCredential();

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential,
      foundingRecord: foundingRecord(),
    })).toEqual({ ok: true });
    expect(verifyPicoHomeMembershipActivation(sodium, {
      credential,
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    })).toEqual({ ok: true });
  });

  it('treats a host countersignature over an issuer-less credential as nothing', () => {
    // H6 in its sharpest form: the host can deny service but never mint
    // membership, so a credential the host activated but nobody issued must
    // fail on the authority, not squeak through on the acknowledgment.
    const forged = issueCredential({ issuerKeypair: strangerPico });

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: forged,
      foundingRecord: foundingRecord(),
    })).toEqual({ ok: false, reason: 'issuer_delegation_unsupported' });

    // The host half verifies perfectly — which is exactly why it decides nothing.
    expect(verifyPicoHomeMembershipActivation(sodium, {
      credential: forged,
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    })).toEqual({ ok: true });
  });

  it('rejects credentials that do not reach this founding record', () => {
    const founding = foundingRecord();

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: issueCredential({ membership: { homeId: 'home_somewhere_else' } }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'foreign_home' });

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: issueCredential({ membership: { hostSigningKeyFingerprintHex: 'c'.repeat(64) } }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'foreign_host_key' });

    // The founding record is the Home Host Pico's own membership root and is
    // never re-issued as a credential by its own subject.
    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: issueCredential({ membership: { role: 'home_host' } }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'home_host_membership_is_not_reissued' });

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: issueCredential({
        membership: { subjectPicoIdentityFingerprintHex: identityFingerprintHex(homeHostPico.publicKey) },
      }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'home_host_membership_is_not_reissued' });
  });

  it('refuses a credential edited after it was signed', () => {
    // Every refusal above is a field the verifier compares itself, so each
    // would fail with no signature check at all. **The subject is not one of
    // them**: it is checked only against the Home Host Pico, so a credential
    // re-pointed at another resident passes every explicit rule here and is
    // stopped by the signature alone. What it would buy is somebody else's
    // membership of this Home.
    const founding = foundingRecord();
    const signed = issueCredential();

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: {
        ...signed,
        membership: { ...signed.membership, subjectPicoIdentityFingerprintHex: 'e'.repeat(64) },
      },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_issuer_signature' });

    // The window and the scopes are the other two nothing else compares.
    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: {
        ...signed,
        membership: { ...signed.membership, validUntil: '2099-07-19T11:00:00.000Z' },
      },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_issuer_signature' });

    // A well-formed scope list that is not the one signed: refused by the
    // signature.
    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: {
        ...signed,
        membership: { ...signed.membership, scopes: ['host.use'] },
      },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_issuer_signature' });

    // And a scope outside the closed list never reaches the signature at all:
    // the builder refuses to canonicalise a vocabulary it does not have, which
    // is a stronger refusal and a different one.
    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: {
        ...signed,
        membership: {
          ...signed.membership,
          scopes: ['host.use', 'packet.receive', 'host.admin' as never],
        },
      },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'malformed_membership_record' });
  });

  it('refuses another schema and another suite before it reads anything else', () => {
    // ADR 0025. A record in a language this Home does not read is not a weaker
    // claim about membership; it is not a claim about membership.
    const founding = foundingRecord();
    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: { ...issueCredential(), schema: 'pico.home.membership.v0' as never },
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_credential_schema' });

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: issueCredential({ membership: { suite: 'somebody.elses.suite.v1' as never } }),
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'foreign_suite' });
  });

  it('keeps a credential from a previous era exactly as long as the chain says', () => {
    // ADR 0115. The accepted host-key chain vouches for a credential's era:
    // boot re-verification passes the whole chain, new intake passes the head.
    // Without the first, a host rotation would evict every member at the next
    // start; without the second, a retired key could still admit people.
    const founding = foundingRecord();
    const earlier = issueCredential({
      membership: { hostSigningKeyFingerprintHex: '9'.repeat(64) },
    });

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: earlier,
      foundingRecord: founding,
      acceptedHostSigningKeyFingerprintHexes: [hostSigningFingerprintHex(), '9'.repeat(64)],
    })).toEqual({ ok: true });

    expect(verifyPicoHomeMembershipAuthority(sodium, {
      credential: earlier,
      foundingRecord: founding,
      acceptedHostSigningKeyFingerprintHexes: [hostSigningFingerprintHex()],
    })).toEqual({ ok: false, reason: 'foreign_host_key' });
  });

  it('refuses a lifecycle statement that names a different member', () => {
    const credential = issueCredential();
    const evicted = issueLifecycle(credential, {
      status: 'evicted',
      subjectPicoIdentityFingerprintHex: 'd'.repeat(64),
    });

    expect(verifyPicoHomeMembershipLifecycleRecord(sodium, {
      record: evicted,
      credential,
      foundingRecord: foundingRecord(),
    })).toEqual({ ok: false, reason: 'subject_mismatch' });
  });

  /**
   * Befund B151. Zwei Ablehnungen dieser Urkunde hatte nie jemand ausgeloest.
   *
   * `invalid_host_activation_signature` ist die Haelfte, die das Home
   * verweigern kann: es mintet keine Mitgliedschaft (H6), aber ohne seine
   * Gegenzeichnung gilt keine. Eine Gegenzeichnung, die nicht von diesem Host
   * stammt, muss deshalb fallen - und zwar hier und nicht erst beim Einlesen.
   */
  it('refuses a host countersignature from a different host key', () => {
    const credential = issueCredential();
    expect(verifyPicoHomeMembershipActivation(sodium, {
      credential,
      hostSigningPublicKeyHex: bytesToHex(strangerPico.publicKey),
    })).toEqual({ ok: false, reason: 'invalid_host_activation_signature' });
  });

  it('refuses a lifecycle with a foreign schema or a credential it does not name', () => {
    const credential = issueCredential();
    const founding = foundingRecord();

    expect(verifyPicoHomeMembershipLifecycleRecord(sodium, {
      record: {
        ...issueLifecycle(credential),
        schema: 'pico.home.something-else.v1' as never,
      },
      credential,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'invalid_lifecycle_schema' });

    expect(verifyPicoHomeMembershipLifecycleRecord(sodium, {
      record: issueLifecycle(credential, { credentialId: 'member_somebody_elses_0001' }),
      credential,
      foundingRecord: founding,
    })).toEqual({ ok: false, reason: 'unknown_credential' });
  });

  it('projects a verified credential into an active membership and evicts it on the freshest statement', () => {
    const store = openClaimedStore();
    const credential = issueCredential();

    const recorded = store.recordPicoHomeMembershipCredential({
      sodium,
      credential,
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    });
    expect(recorded).toMatchObject({
      ok: true,
      membership: {
        homeId: HOME_ID,
        picoIdentityFingerprintHex: SUBJECT_FINGERPRINT,
        role: 'home_member',
        status: 'active',
        source: 'membership_credential',
        sourceRef: credential.membership.credentialId,
      },
    });
    expect(store.hasActivePicoHomeMembership(SUBJECT_FINGERPRINT, HOME_ID, '2026-08-01T00:00:00.000Z')).toBe(true);

    // An older statement must not win over a fresher one, whichever order they
    // arrive in (ADR 0079 I9).
    expect(store.recordPicoHomeMembershipLifecycle({
      sodium,
      record: issueLifecycle(credential, { status: 'evicted', lifecycleOrder: 'seq:0000000000000009' }),
    })).toMatchObject({ ok: true, membership: { status: 'evicted' } });
    expect(store.recordPicoHomeMembershipLifecycle({
      sodium,
      record: issueLifecycle(credential, {
        lifecycleId: 'memberlc_stale',
        status: 'active',
        lifecycleOrder: 'seq:0000000000000002',
      }),
    })).toMatchObject({ ok: true, membership: { status: 'evicted' } });

    expect(store.hasActivePicoHomeMembership(SUBJECT_FINGERPRINT, HOME_ID, '2026-08-01T00:00:00.000Z')).toBe(false);
  });

  it('does not count a membership outside its validity window as active', () => {
    const store = openClaimedStore();
    const credential = issueCredential({
      membership: { validFrom: '2026-08-01T00:00:00.000Z', validUntil: '2026-09-01T00:00:00.000Z' },
    });

    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential,
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    }).ok).toBe(true);

    // The stored status stays `active`; expiry is a function of the clock, so
    // the window is part of the question rather than a state a sweep must set.
    expect(store.hasActivePicoHomeMembership(SUBJECT_FINGERPRINT, HOME_ID, '2026-07-15T00:00:00.000Z')).toBe(false);
    expect(store.hasActivePicoHomeMembership(SUBJECT_FINGERPRINT, HOME_ID, '2026-08-15T00:00:00.000Z')).toBe(true);
    expect(store.hasActivePicoHomeMembership(SUBJECT_FINGERPRINT, HOME_ID, '2026-09-02T00:00:00.000Z')).toBe(false);
  });

  it('drops a stored credential whose authority no longer verifies', () => {
    const store = openClaimedStore();
    const credential = issueCredential();
    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential,
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    }).ok).toBe(true);

    // Tamper with the stored scope set the way a restored or edited database
    // could: the issuer signature no longer covers what the row claims.
    const database = (store as unknown as { db: { prepare(sql: string): { run(...args: unknown[]): void } } }).db;
    const tampered = { ...credential.membership, scopes: ['host.use', 'sync.exchange', 'packet.receive'] };
    database
      .prepare('UPDATE pico_home_membership_credential SET membership_json = ?')
      .run(JSON.stringify(tampered));

    expect(store.reconcilePicoHomeMembershipsFromCredentials(sodium)).toEqual({
      verifiedCredentials: 0,
      droppedCredentials: 1,
      projectedMemberships: 0,
    });
    expect(store.hasActivePicoHomeMembership(SUBJECT_FINGERPRINT, HOME_ID, '2026-08-01T00:00:00.000Z')).toBe(false);
    expect(store.picoHomeMembershipCredential(credential.membership.credentialId)).toBeUndefined();
  });

  it('refuses to reuse one credential id for two different statements', () => {
    const store = openClaimedStore();
    const credential = issueCredential();
    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential,
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    }).ok).toBe(true);

    // The same statement again is a replay and is fine.
    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential,
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    }).ok).toBe(true);

    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential: issueCredential({ membership: { scopes: ['host.use'] } }),
      hostSigningPublicKeyHex: bytesToHex(hostSigning.publicKey),
    })).toEqual({ ok: false, reason: 'conflicting_record' });
  });
});

function openClaimedStore(): EventStore {
  const dir = mkdtempSync(join(tmpdir(), 'pico-membership-test-'));
  tempDirs.push(dir);

  const store = new EventStore(join(dir, 'pico.sqlite'));
  stores.push(store);

  const record = foundingRecord();
  store.claimPicoHome({
    homeId: record.founding.homeId,
    hostAdminPicoId: `pico:identity:${record.founding.homeHostPicoIdentityFingerprintHex}`,
    hostSigningKeyFingerprintHex: record.founding.hostSigningKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: record.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: record,
    claimedAt: record.founding.foundedAt,
    sodium,
  });

  return store;
}

function foundingRecord(): PicoHomeFoundingRecord {
  const homeHostPicoIdentityFingerprintHex = identityFingerprintHex(homeHostPico.publicKey);
  const hostSigningKeyFingerprintHex = hostSigningFingerprintHex();
  const evidence = createPicoTestFirstDeviceEvidence({
    sodium,
    claimantIdentityPrivateKey: homeHostPico.privateKey,
    claimantIdentityKeyFingerprintHex: homeHostPicoIdentityFingerprintHex,
  });

  return {
    schema: picoHomeFoundingRecordSchema,
    founding: {
      suite: picoIdentitySuite,
      foundingId: 'founding_20260719_0001',
      homeId: HOME_ID,
      hostSigningKeyFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
      homeHostPicoIdentityFingerprintHex,
      claimantNonceHex: '4'.repeat(64),
      hostNonceHex: '5'.repeat(64),
      foundedAt: '2026-07-19T10:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000001',
      ...evidence.foundingFields,
    },
    firstDeviceSigningKeyRecord: evidence.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: evidence.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: evidence.firstDeviceDelegation,
    firstDeviceRevocations: evidence.firstDeviceRevocations,
    claimantIdentityKeyRecord: identityKeyRecord(homeHostPico.publicKey),
    claimantFoundingSignatureHex: '8'.repeat(128),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: {
        suite: picoIdentitySuite,
        claimId: 'claim_20260719_0001',
        homeId: HOME_ID,
        hostSigningKeyFingerprintHex,
        hostKeyAgreementKeyFingerprintHex: '2'.repeat(64),
        claimantIdentityKeyFingerprintHex: homeHostPicoIdentityFingerprintHex,
        claimantNonceHex: '4'.repeat(64),
        hostNonceHex: '5'.repeat(64),
        foundingRecordId: 'founding_20260719_0001',
      },
      hostSignatureHex: '9'.repeat(128),
    },
    hostFoundingSignatureHex: 'a'.repeat(128),
    createdAt: '2026-07-19T10:00:00.000Z',
  };
}

function issueCredential(options: {
  membership?: Partial<PicoHomeMembershipSignatureInput>;
  issuerKeypair?: { publicKey: Uint8Array; privateKey: Uint8Array };
} = {}): PicoHomeMembershipCredential {
  const issuer = options.issuerKeypair ?? homeHostPico;
  const membership: PicoHomeMembershipSignatureInput = {
    suite: picoIdentitySuite,
    credentialId: 'member_20260719_0001',
    homeId: HOME_ID,
    issuerPicoIdentityFingerprintHex: identityFingerprintHex(issuer.publicKey),
    subjectPicoIdentityFingerprintHex: SUBJECT_FINGERPRINT,
    hostSigningKeyFingerprintHex: hostSigningFingerprintHex(),
    role: 'home_member',
    scopes: ['host.use', 'packet.receive'],
    validFrom: '2026-07-19T11:00:00.000Z',
    validUntil: '2027-07-19T11:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
    ...options.membership,
  };
  const signatureInput = buildPicoHomeMembershipSignatureInput(membership);

  return {
    schema: picoHomeMembershipCredentialSchema,
    membership,
    issuerIdentityKeyRecord: identityKeyRecord(issuer.publicKey),
    issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(signatureInput, issuer.privateKey)),
    hostActivationSignatureHex: bytesToHex(sodium.crypto_sign_detached(signatureInput, hostSigning.privateKey)),
    createdAt: '2026-07-19T11:00:00.000Z',
  };
}

function issueLifecycle(
  credential: PicoHomeMembershipCredential,
  overrides: Partial<PicoHomeMembershipLifecycleRecord['lifecycle']> = {},
): PicoHomeMembershipLifecycleRecord {
  const lifecycle: PicoHomeMembershipLifecycleRecord['lifecycle'] = {
    suite: picoIdentitySuite,
    lifecycleId: 'memberlc_20260719_0001',
    homeId: HOME_ID,
    credentialId: credential.membership.credentialId,
    issuerPicoIdentityFingerprintHex: identityFingerprintHex(homeHostPico.publicKey),
    subjectPicoIdentityFingerprintHex: credential.membership.subjectPicoIdentityFingerprintHex,
    status: 'evicted',
    reasonCategory: 'member_removed',
    changedAt: '2026-08-01T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000005',
    ...overrides,
  };

  return {
    schema: picoHomeMembershipLifecycleRecordSchema,
    lifecycle,
    issuerIdentityKeyRecord: identityKeyRecord(homeHostPico.publicKey),
    issuerSignatureHex: bytesToHex(sodium.crypto_sign_detached(
      buildPicoHomeMembershipLifecycleSignatureInput(lifecycle),
      homeHostPico.privateKey,
    )),
    createdAt: '2026-08-01T10:00:00.000Z',
  };
}

function identityKeyRecord(publicKey: Uint8Array): PicoHomeFoundingRecord['claimantIdentityKeyRecord'] {
  return {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: bytesToHex(publicKey),
  };
}

function identityFingerprintHex(publicKey: Uint8Array): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(identityKeyRecord(publicKey)),
    null,
  ));
}

function hostSigningFingerprintHex(): string {
  return bytesToHex(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput({
      suite: picoIdentitySuite,
      keyRole: 'home_host_signing',
      publicKeyHex: bytesToHex(hostSigning.publicKey),
    }),
    null,
  ));
}

