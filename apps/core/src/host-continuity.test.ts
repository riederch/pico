import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeContinuitySignatureInput,
  buildPicoHomeMembershipSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeContinuityRecordSchema,
  picoHomeFoundingRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoIdentitySuite,
  type PicoHomeContinuityRecord,
  type PicoHomeContinuitySignatureInput,
  type PicoHomeFoundingRecord,
  type PicoHomeMembershipCredential,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import { buildPicoIdentityKeyRecordSignatureInput } from '@pico/protocol';
import { followPicoHomeContinuityChain } from '@pico/identity';
import { EventStore } from './event-store.js';
import { createPicoTestFirstDeviceEvidence } from './test-first-device-evidence.js';

const tempDirs: string[] = [];
const HOME_ID = 'home_host_continuity';
const foundedAt = '2026-07-19T10:00:00.000Z';
const rotatedAt = '2026-08-02T10:00:00.000Z';

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ADR 0115 host-key continuity chain', () => {
  it('accepts a proven link, moves the claim state pins and keeps history vouched', () => {
    const fixture = createFixture();
    const { store } = fixture;

    // A membership of the founding era, activated by the founding host key.
    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential: membershipCredential(fixture, {
        credentialId: 'member_before_rotation',
        subject: 'b'.repeat(64),
        activatedBy: fixture.hostA,
      }),
      hostSigningPublicKeyHex: fixture.hostA.publicKeyHex,
    }).ok).toBe(true);

    const link = continuityRecord(fixture, {});
    expect(store.recordPicoHomeHostContinuity({ record: link, sodium }))
      .toMatchObject({
        ok: true,
        inserted: true,
        link: { chainPosition: 0, continuityId: 'continuity_0001' },
      });

    // The claim state answers to the new head from the same instant.
    expect(store.picoHomeClaimState()).toMatchObject({
      hostSigningKeyFingerprintHex: fixture.hostB.fingerprintHex,
      hostKeyAgreementKeyFingerprintHex: 'bb'.repeat(32),
    });
    expect(store.currentPicoHomeHostKeyHead()).toEqual({
      hostSigningKeyFingerprintHex: fixture.hostB.fingerprintHex,
      hostKeyAgreementKeyFingerprintHex: 'bb'.repeat(32),
    });
    expect(store.acceptedPicoHomeHostSigningKeyFingerprintHexes()).toEqual([
      fixture.hostA.fingerprintHex,
      fixture.hostB.fingerprintHex,
    ]);
    // The founding-era public key survives in the chain, so founding evidence
    // stays re-verifiable after custody moved on.
    expect(store.foundingEraHostSigningPublicKeyHex())
      .toBe(fixture.hostA.publicKeyHex);

    // Idempotent replay, but never a second statement under the same name.
    expect(store.recordPicoHomeHostContinuity({ record: link, sodium }))
      .toMatchObject({ ok: true, inserted: false });
    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, { changedAt: '2026-08-03T10:00:00.000Z' }),
      sodium,
    })).toEqual({ ok: false, reason: 'conflicting_record' });

    // History is vouched for by the chain: the old-era membership survives
    // boot re-verification instead of being dropped as foreign.
    expect(store.reconcilePicoHomeMembershipsFromCredentials(sodium))
      .toMatchObject({ verifiedCredentials: 1, droppedCredentials: 0 });

    // Only the head stamps anything new: a fresh credential naming the
    // retired key is refused, one naming the head is accepted.
    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential: membershipCredential(fixture, {
        credentialId: 'member_stale_era',
        subject: 'c'.repeat(64),
        activatedBy: fixture.hostA,
      }),
      hostSigningPublicKeyHex: fixture.hostA.publicKeyHex,
    })).toMatchObject({ ok: false, reason: 'foreign_host_key' });
    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential: membershipCredential(fixture, {
        credentialId: 'member_new_era',
        subject: 'c'.repeat(64),
        hostSigningKeyFingerprintHex: fixture.hostB.fingerprintHex,
        activatedBy: fixture.hostB,
      }),
      hostSigningPublicKeyHex: fixture.hostB.publicKeyHex,
    }).ok).toBe(true);
    fixture.store.close();
  });

  it('refuses a link that skips the head, reuses stale order, or lacks the right acceptor', () => {
    const fixture = createFixture();
    const { store } = fixture;
    const hostC = createSigningKey('home_host_signing');

    // Retiring a key that is not the current head would fork the chain.
    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {
        outgoing: { signing: fixture.hostB, agreementFingerprintHex: 'bb'.repeat(32) },
        incoming: { signing: hostC, agreementFingerprintHex: 'cc'.repeat(32) },
      }),
      sodium,
    })).toEqual({ ok: false, reason: 'chain_gap' });

    // Acceptance by any root but the Home Host Pico is a stranger's
    // signature, however validly it verifies.
    const strangerRoot = createSigningKey('pico_identity');
    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, { acceptor: strangerRoot }),
      sodium,
    })).toEqual({ ok: false, reason: 'invalid_continuity' });

    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, { homeId: 'home_somewhere_else' }),
      sodium,
    })).toEqual({ ok: false, reason: 'foreign_home' });

    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {}),
      sodium,
    }).ok).toBe(true);

    // A second link must retire the new head and advance the order.
    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {
        continuityId: 'continuity_0002',
        outgoing: { signing: fixture.hostB, agreementFingerprintHex: 'bb'.repeat(32) },
        incoming: { signing: hostC, agreementFingerprintHex: 'cc'.repeat(32) },
        lifecycleOrder: 'seq:0000000000000002',
      }),
      sodium,
    })).toEqual({ ok: false, reason: 'stale_lifecycle_order' });
    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {
        continuityId: 'continuity_0002',
        outgoing: { signing: fixture.hostB, agreementFingerprintHex: 'bb'.repeat(32) },
        incoming: { signing: hostC, agreementFingerprintHex: 'cc'.repeat(32) },
        lifecycleOrder: 'seq:0000000000000003',
      }),
      sodium,
    })).toMatchObject({ ok: true, link: { chainPosition: 1 } });
    expect(store.acceptedPicoHomeHostSigningKeyFingerprintHexes()).toEqual([
      fixture.hostA.fingerprintHex,
      fixture.hostB.fingerprintHex,
      hostC.fingerprintHex,
    ]);
    fixture.store.close();
  });

  it('keeps a middle-era membership vouched across a second rotation', () => {
    const fixture = createFixture();
    const { store } = fixture;
    const hostC = createSigningKey('home_host_signing');

    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {}),
      sodium,
    }).ok).toBe(true);
    // A membership of the middle era: issued while hostB was the head.
    expect(store.recordPicoHomeMembershipCredential({
      sodium,
      credential: membershipCredential(fixture, {
        credentialId: 'member_middle_era',
        subject: 'b'.repeat(64),
        hostSigningKeyFingerprintHex: fixture.hostB.fingerprintHex,
        activatedBy: fixture.hostB,
      }),
      hostSigningPublicKeyHex: fixture.hostB.publicKeyHex,
    }).ok).toBe(true);
    expect(store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {
        continuityId: 'continuity_0002',
        outgoing: { signing: fixture.hostB, agreementFingerprintHex: 'bb'.repeat(32) },
        incoming: { signing: hostC, agreementFingerprintHex: 'cc'.repeat(32) },
        lifecycleOrder: 'seq:0000000000000003',
      }),
      sodium,
    }).ok).toBe(true);

    // Neither the founding key nor the head: only the full chain vouches for
    // the middle era, so this is the case that distinguishes the era set
    // from any single-key fallback.
    expect(store.reconcilePicoHomeMembershipsFromCredentials(sodium))
      .toMatchObject({ verifiedCredentials: 1, droppedCredentials: 0 });
    expect(store.hasActivePicoHomeMembership('b'.repeat(64), HOME_ID, rotatedAt))
      .toBe(true);
    fixture.store.close();
  });

  it('refuses to rotate while a device recovery is pending', () => {
    const fixture = createFixture();

    // A pending recovery embedded the current host pins in its claim; a
    // rotation underneath it would leave a receipt no later boot could
    // re-verify. The recovery is time-critical, the rotation waits.
    fixture.store.close();
    const db = new Database(fixture.databasePath);
    db.prepare(`
      INSERT INTO pico_home_device_recovery (
        recovery_id, home_id, pico_identity_fingerprint_hex, status,
        target_delegation_id, target_device_signing_key_fingerprint_hex,
        target_device_key_agreement_key_fingerprint_hex,
        observed_lifecycle_order, evidence_digest_hex, claim_digest_hex,
        submission_json, accepted_at, effective_at, completion_expires_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'recovery_blocks_rotation', HOME_ID, 'd'.repeat(64),
      'delegation_recovery', 'e'.repeat(64), 'f'.repeat(64),
      'seq:0000000000000001', '1'.repeat(64), '2'.repeat(64),
      '{}', rotatedAt, rotatedAt, rotatedAt,
    );
    db.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {}),
      sodium,
    })).toEqual({ ok: false, reason: 'recovery_pending' });
    reopened.close();
  });

  it('drops a tampered link with everything chained on it and repairs the pins', () => {
    const fixture = createFixture();
    const hostC = createSigningKey('home_host_signing');
    expect(fixture.store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {}),
      sodium,
    }).ok).toBe(true);
    expect(fixture.store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {
        continuityId: 'continuity_0002',
        outgoing: { signing: fixture.hostB, agreementFingerprintHex: 'bb'.repeat(32) },
        incoming: { signing: hostC, agreementFingerprintHex: 'cc'.repeat(32) },
        lifecycleOrder: 'seq:0000000000000003',
      }),
      sodium,
    }).ok).toBe(true);
    fixture.store.close();

    // Editing the first link is how somebody with database access would hand
    // the Home to a key nobody ever accepted.
    const tampering = new Database(fixture.databasePath);
    const attacker = createSigningKey('home_host_signing');
    const stored = JSON.parse((tampering
      .prepare("SELECT record_json AS json FROM pico_home_host_continuity WHERE chain_position = 0")
      .get() as { json: string }).json) as PicoHomeContinuityRecord;
    stored.continuity.incomingHostSigningKeyFingerprintHex =
      attacker.fingerprintHex;
    tampering
      .prepare(`
        UPDATE pico_home_host_continuity
        SET record_json = ?, incoming_host_signing_key_fingerprint_hex = ?
        WHERE chain_position = 0
      `)
      .run(JSON.stringify(stored), attacker.fingerprintHex);
    tampering.close();

    const reopened = new EventStore(fixture.databasePath);
    // The weakest prefix decides: the tampered link and the honest one
    // chained on it are both dropped, and the pins return to the founding
    // keys - the last proven head.
    expect(reopened.reconcilePicoHomeHostContinuity(sodium)).toEqual({
      verifiedLinks: 0,
      droppedLinks: 2,
      repairedClaimState: true,
      currentHostSigningKeyFingerprintHex: fixture.hostA.fingerprintHex,
    });
    expect(reopened.picoHomeClaimState()).toMatchObject({
      hostSigningKeyFingerprintHex: fixture.hostA.fingerprintHex,
    });
    expect(reopened.picoHomeHostKeyChain()).toEqual([]);
    reopened.close();
  });

  it('re-verifies an intact chain on boot without touching it', () => {
    const fixture = createFixture();
    expect(fixture.store.recordPicoHomeHostContinuity({
      record: continuityRecord(fixture, {}),
      sodium,
    }).ok).toBe(true);
    fixture.store.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoHomeHostContinuity(sodium)).toEqual({
      verifiedLinks: 1,
      droppedLinks: 0,
      repairedClaimState: false,
      currentHostSigningKeyFingerprintHex: fixture.hostB.fingerprintHex,
    });
    reopened.close();
  });

  it('serves the stored records verbatim, and a stranded pin can follow them (U4)', () => {
    const fixture = createFixture();
    const { store } = fixture;
    const hostC = createSigningKey('home_host_signing');
    expect(store.picoHomeHostContinuityRecords()).toEqual([]);

    const first = continuityRecord(fixture, {});
    const second = continuityRecord(fixture, {
      continuityId: 'continuity_0002',
      outgoing: { signing: fixture.hostB, agreementFingerprintHex: 'bb'.repeat(32) },
      incoming: { signing: hostC, agreementFingerprintHex: 'cc'.repeat(32) },
      lifecycleOrder: 'seq:0000000000000003',
    });
    expect(store.recordPicoHomeHostContinuity({ record: first, sodium }).ok).toBe(true);
    expect(store.recordPicoHomeHostContinuity({ record: second, sodium }).ok).toBe(true);

    // Verbatim and founding-first: the unsealed read exists for clients that
    // verify, so anything less than the full signed records would be an
    // assertion.
    expect(store.picoHomeHostContinuityRecords()).toEqual([first, second]);

    // The Foundation projection and the client verification agree: a client
    // still pinned to the founding era follows the served records to the
    // current head - this is the pair of halves U4 consists of.
    expect(followPicoHomeContinuityChain(sodium, {
      records: store.picoHomeHostContinuityRecords(),
      pinnedHostSigningKeyFingerprintHex: fixture.hostA.fingerprintHex,
      pinnedHostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
      pinnedHomeHostPicoIdentityFingerprintHex: fixture.founder.fingerprintHex,
    })).toEqual({
      rotated: true,
      followedLinks: 2,
      head: {
        hostSigningKeyFingerprintHex: hostC.fingerprintHex,
        hostKeyAgreementKeyFingerprintHex: 'cc'.repeat(32),
        hostSigningPublicKeyHex: hostC.publicKeyHex,
      },
    });
    fixture.store.close();
  });
});

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-host-continuity-test-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath);

  const founder = createSigningKey('pico_identity');
  const hostA = createSigningKey('home_host_signing');
  const hostB = createSigningKey('home_host_signing');

  store.claimPicoHome({
    homeId: HOME_ID,
    hostAdminPicoId: `pico:identity:${founder.fingerprintHex}`,
    hostSigningKeyFingerprintHex: hostA.fingerprintHex,
    hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
    foundingRecord: createFoundingRecord(founder, hostA),
    claimedAt: foundedAt,
    sodium,
  });

  return { databasePath, store, founder, hostA, hostB };
}

function continuityRecord(
  fixture: ReturnType<typeof createFixture>,
  options: {
    continuityId?: string;
    homeId?: string;
    changedAt?: string;
    lifecycleOrder?: string;
    outgoing?: {
      signing: ReturnType<typeof createSigningKey>;
      agreementFingerprintHex: string;
    };
    incoming?: {
      signing: ReturnType<typeof createSigningKey>;
      agreementFingerprintHex: string;
    };
    acceptor?: ReturnType<typeof createSigningKey>;
  },
): PicoHomeContinuityRecord {
  const outgoing = options.outgoing
    ?? { signing: fixture.hostA, agreementFingerprintHex: 'aa'.repeat(32) };
  const incoming = options.incoming
    ?? { signing: fixture.hostB, agreementFingerprintHex: 'bb'.repeat(32) };
  const acceptor = options.acceptor ?? fixture.founder;
  const continuity: PicoHomeContinuitySignatureInput = {
    suite: picoIdentitySuite,
    continuityId: options.continuityId ?? 'continuity_0001',
    homeId: options.homeId ?? HOME_ID,
    outgoingHostSigningKeyFingerprintHex: outgoing.signing.fingerprintHex,
    outgoingHostKeyAgreementKeyFingerprintHex: outgoing.agreementFingerprintHex,
    incomingHostSigningKeyFingerprintHex: incoming.signing.fingerprintHex,
    incomingHostKeyAgreementKeyFingerprintHex: incoming.agreementFingerprintHex,
    homeHostPicoIdentityFingerprintHex: acceptor.fingerprintHex,
    reasonCategory: 'host_key_rotated',
    changedAt: options.changedAt ?? rotatedAt,
    lifecycleOrder: options.lifecycleOrder ?? 'seq:0000000000000002',
  };
  const input = buildPicoHomeContinuitySignatureInput(continuity);
  return {
    schema: picoHomeContinuityRecordSchema,
    continuity,
    outgoingHostSigningKeyRecord: outgoing.signing.keyRecord,
    incomingHostSigningKeyRecord: incoming.signing.keyRecord,
    homeHostPicoIdentityKeyRecord: acceptor.keyRecord,
    outgoingHostSignatureHex: outgoing.signing.sign(input),
    incomingHostSignatureHex: incoming.signing.sign(input),
    homeHostPicoSignatureHex: acceptor.sign(input),
    createdAt: options.changedAt ?? rotatedAt,
  };
}

function membershipCredential(
  fixture: ReturnType<typeof createFixture>,
  options: {
    credentialId: string;
    subject: string;
    hostSigningKeyFingerprintHex?: string;
    activatedBy: ReturnType<typeof createSigningKey>;
  },
): PicoHomeMembershipCredential {
  const membership: PicoHomeMembershipSignatureInput = {
    suite: picoIdentitySuite,
    credentialId: options.credentialId,
    homeId: HOME_ID,
    issuerPicoIdentityFingerprintHex: fixture.founder.fingerprintHex,
    subjectPicoIdentityFingerprintHex: options.subject,
    hostSigningKeyFingerprintHex:
      options.hostSigningKeyFingerprintHex ?? fixture.hostA.fingerprintHex,
    role: 'home_member',
    scopes: ['host.use', 'packet.receive'],
    validFrom: foundedAt,
    validUntil: '2027-07-19T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  };
  const input = buildPicoHomeMembershipSignatureInput(membership);
  return {
    schema: picoHomeMembershipCredentialSchema,
    membership,
    issuerIdentityKeyRecord: fixture.founder.keyRecord,
    issuerSignatureHex: fixture.founder.sign(input),
    hostActivationSignatureHex: options.activatedBy.sign(input),
    createdAt: foundedAt,
  };
}

function createSigningKey(
  keyRole: 'pico_identity' | 'home_host_signing',
) {
  const pair = sodium.crypto_sign_keypair();
  const publicKeyHex = Buffer.from(pair.publicKey).toString('hex');
  const keyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex,
  };
  return {
    keyRecord,
    publicKeyHex,
    privateKey: pair.privateKey,
    fingerprintHex: Buffer.from(sodium.crypto_generichash(
      32,
      buildPicoIdentityKeyRecordSignatureInput(keyRecord),
      null,
    )).toString('hex'),
    sign: (input: Uint8Array) =>
      Buffer.from(
        sodium.crypto_sign_detached(input, pair.privateKey),
      ).toString('hex'),
  };
}

function createFoundingRecord(
  founder: ReturnType<typeof createSigningKey>,
  host: ReturnType<typeof createSigningKey>,
): PicoHomeFoundingRecord {
  const evidence = createPicoTestFirstDeviceEvidence({
    sodium,
    claimantIdentityPrivateKey: founder.privateKey,
    claimantIdentityKeyFingerprintHex: founder.fingerprintHex,
  });
  return {
    schema: picoHomeFoundingRecordSchema,
    founding: {
      suite: picoIdentitySuite,
      foundingId: 'founding_host_continuity',
      homeId: HOME_ID,
      hostSigningKeyFingerprintHex: host.fingerprintHex,
      hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
      homeHostPicoIdentityFingerprintHex: founder.fingerprintHex,
      claimantNonceHex: 'bb'.repeat(32),
      hostNonceHex: 'cc'.repeat(32),
      foundedAt,
      lifecycleOrder: 'seq:0000000000000001',
      ...evidence.foundingFields,
    },
    firstDeviceSigningKeyRecord: evidence.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: evidence.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: evidence.firstDeviceDelegation,
    firstDeviceRevocations: evidence.firstDeviceRevocations,
    claimantIdentityKeyRecord: founder.keyRecord,
    claimantFoundingSignatureHex: 'ee'.repeat(64),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: {
        suite: picoIdentitySuite,
        claimId: 'claim_host_continuity',
        homeId: HOME_ID,
        hostSigningKeyFingerprintHex: host.fingerprintHex,
        hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
        claimantIdentityKeyFingerprintHex: founder.fingerprintHex,
        claimantNonceHex: 'bb'.repeat(32),
        hostNonceHex: 'cc'.repeat(32),
        foundingRecordId: 'founding_host_continuity',
      },
      hostSignatureHex: '99'.repeat(64),
    },
    hostFoundingSignatureHex: 'dd'.repeat(64),
    createdAt: foundedAt,
  };
}
