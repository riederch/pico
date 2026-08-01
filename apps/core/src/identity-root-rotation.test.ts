import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeMembershipSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityRotationSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeFoundingRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoIdentitySuite,
  type PicoHomeFoundingRecord,
  type PicoHomeMembershipCredential,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRotationSignatureInput,
} from '@pico/protocol';
import {
  EventStore,
  PICO_IDENTITY_ROOT_ROTATION_VETO_WINDOW_MS,
  type PicoHomeDeviceLifecycleSponsor,
} from './event-store.js';

const tempDirs: string[] = [];
const HOME_ID = 'home_root_rotation';
const foundedAt = '2026-07-19T10:00:00.000Z';
const enrolledAt = '2026-07-19T12:00:00.000Z';
const acceptedAt = '2026-08-01T10:00:00.000Z';
const beforeWindow = '2026-08-03T09:59:59.999Z';
const afterWindow = '2026-08-03T10:00:00.001Z';

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ADR 0114 T2 identity root rotation projection', () => {
  it('needs a living device of the rotating identity to co-sign', () => {
    const fixture = createFixture();
    const signed = signRotation(fixture);

    // Nobody rotates somebody else's root, and no host role stands in for one.
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signed,
      sender: {
        ...fixture.devices[0]!.sender,
        picoIdentityFingerprintHex: fixture.successor.fingerprintHex,
      },
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'invalid_rotation' });

    // A device that is not delegated and active cannot carry the rotation -
    // the asymmetry a card thief cannot cross.
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signed,
      sender: {
        ...fixture.devices[0]!.sender,
        delegationId: 'delegation_not_real',
      },
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'co_signing_device_not_active' });

    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signed,
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    })).toEqual({
      ok: true,
      rotation: {
        rotationId: 'rotation_0001',
        predecessorIdentityFingerprintHex: fixture.member.fingerprintHex,
        successorIdentityFingerprintHex: fixture.successor.fingerprintHex,
        status: 'pending',
        reasonCategory: 'suspected_compromise',
        rotatedAt: acceptedAt,
        acceptedAt,
        effectiveAt: new Date(
          Date.parse(acceptedAt) + PICO_IDENTITY_ROOT_ROTATION_VETO_WINDOW_MS,
        ).toISOString(),
        coSigningDelegationId: 'delegation_device_0',
      },
    });
    fixture.store.close();
  });

  it('refuses to rotate the founder root, which is Home handover', () => {
    const fixture = createFixture();
    const rotation = rotationRecord({
      predecessorIdentityKeyFingerprintHex: fixture.founder.fingerprintHex,
      successorIdentityKeyFingerprintHex: fixture.successor.fingerprintHex,
    });
    const input = buildPicoIdentityRotationSignatureInput(rotation);

    // The record itself is valid - both roots signed it. Rotating the Home's
    // own governance root is refused because it is ADR 0080 handover, not
    // identity continuity (ADR 0114 scope).
    expect(fixture.store.submitPicoIdentityRootRotation({
      rotation,
      predecessorIdentityKeyRecord: fixture.founder.keyRecord,
      successorIdentityKeyRecord: fixture.successor.keyRecord,
      predecessorSignatureHex: fixture.founder.sign(input),
      successorSignatureHex: fixture.successor.sign(input),
      sender: {
        ...fixture.devices[0]!.sender,
        picoIdentityFingerprintHex: fixture.founder.fingerprintHex,
      },
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'founder_root_rotation_unsupported' });
    fixture.store.close();
  });

  it('leaves the predecessor fully authorized until the veto window passes', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);

    const authorized = (device: 0 | 1, at: string): boolean =>
      fixture.store.hasActivePicoIdentityDelegation({
        ...fixture.devices[device]!.sender,
        sodium,
        at,
      });

    // Pendency grants nothing and costs nothing: the person keeps working
    // through the window they are meant to be able to object in.
    expect(authorized(1, beforeWindow)).toBe(true);
    // Past it the predecessor authorizes nothing further - every device it
    // delegated, including the one that co-signed.
    expect(authorized(1, afterWindow)).toBe(false);
    expect(authorized(0, afterWindow)).toBe(false);

    const view = fixture.store.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: fixture.member.fingerprintHex,
      sodium,
      at: afterWindow,
    });
    expect(view?.devices.map((device) => device.status)).toEqual([
      'revoked',
      'revoked',
    ]);
    fixture.store.close();
  });

  it('lets another device veto, but never the device that co-signed', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);

    // The device that authorized the rotation is not an independent objection
    // to it; treating it as one would make the window look like a safeguard
    // it is not.
    expect(fixture.store.vetoPicoIdentityRootRotation({
      rotationId: 'rotation_0001',
      sender: fixture.devices[0]!.sender,
      sodium,
      vetoedAt: beforeWindow,
    })).toEqual({ ok: false, reason: 'veto_requires_another_device' });

    expect(fixture.store.vetoPicoIdentityRootRotation({
      rotationId: 'rotation_0001',
      sender: fixture.devices[1]!.sender,
      sodium,
      vetoedAt: beforeWindow,
    })).toEqual({ ok: true });
    expect(fixture.store.vetoPicoIdentityRootRotation({
      rotationId: 'rotation_0001',
      sender: fixture.devices[1]!.sender,
      sodium,
      vetoedAt: beforeWindow,
    })).toEqual({ ok: false, reason: 'rotation_not_pending' });

    // A vetoed rotation never takes effect, so the predecessor keeps its
    // authority past what would have been the effective instant.
    expect(fixture.store.hasActivePicoIdentityDelegation({
      ...fixture.devices[1]!.sender,
      sodium,
      at: afterWindow,
    })).toBe(true);
    expect(fixture.store.picoIdentityRootRotationView(
      fixture.member.fingerprintHex,
    )).toBeNull();
    fixture.store.close();
  });

  it('refuses a second pending rotation and any rotation after one took effect', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);

    // Superseding a pending rotation would let a root holder restart the
    // objection window at will.
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture, { rotationId: 'rotation_0002' }),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'rotation_already_pending' });
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'rotation_id_reused' });

    expect(fixture.store.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toEqual({
        verifiedRotations: 1,
        effectiveRotations: 1,
        quarantinedIdentities: [],
      });
    expect(fixture.store.picoIdentityRootRotationView(
      fixture.member.fingerprintHex,
    )).toMatchObject({ rotationId: 'rotation_0001', status: 'effective' });

    // A rotated root has no authority left to authorize a second succession.
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture, { rotationId: 'rotation_0003' }),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt: afterWindow,
    })).toEqual({ ok: false, reason: 'predecessor_already_rotated' });
    fixture.store.close();
  });

  it('re-verifies stored evidence on boot and quarantines a tampered rotation', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);
    fixture.store.close();

    // Editing the row is how somebody with database access would try to lock
    // a person out of their own Home without ever holding their root.
    const tampering = new Database(fixture.databasePath);
    const stored = JSON.parse((tampering
      .prepare('SELECT record_json AS json FROM pico_identity_root_rotation')
      .get() as { json: string }).json) as {
        rotation: PicoIdentityRotationSignatureInput;
      };
    stored.rotation.successorIdentityKeyFingerprintHex = 'cc'.repeat(32);
    tampering
      .prepare(`
        UPDATE pico_identity_root_rotation
        SET successor_identity_fingerprint_hex = ?,
            record_json = ?
      `)
      .run('cc'.repeat(32), JSON.stringify(stored));
    tampering.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, beforeWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        quarantinedIdentities: [fixture.member.fingerprintHex],
      });
    // The forged rotation is neither honored nor silently dropped: the
    // identity's device authority is withdrawn until a human looks.
    expect(reopened.hasActivePicoIdentityDelegation({
      ...fixture.devices[1]!.sender,
      sodium,
      at: beforeWindow,
    })).toBe(false);
    reopened.close();
  });

  it('quarantines a row whose columns no longer match their own evidence', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);
    fixture.store.close();

    // The columns drive what the Home enforces and shows; the evidence blob
    // drives what it can prove. Editing only the column would otherwise name
    // a successor nobody ever signed for.
    const tampering = new Database(fixture.databasePath);
    tampering
      .prepare(`
        UPDATE pico_identity_root_rotation
        SET successor_identity_fingerprint_hex = ?
      `)
      .run('cc'.repeat(32));
    tampering.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, beforeWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        quarantinedIdentities: [fixture.member.fingerprintHex],
      });
    reopened.close();
  });
});

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-root-rotation-test-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath);

  const founder = createSigningKey('pico_identity');
  const host = createSigningKey('home_host_signing');
  const member = createSigningKey('pico_identity');
  const successor = createSigningKey('pico_identity');

  const founding = createFoundingRecord(founder, host);
  store.claimPicoHome({
    homeId: HOME_ID,
    hostAdminPicoId: `pico:identity:${founder.fingerprintHex}`,
    hostSigningKeyFingerprintHex: host.fingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      founding.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: founding,
    claimedAt: foundedAt,
  });

  // The rotating identity is a member, not the founder: the founder's root is
  // Home handover and out of ADR 0114's scope.
  expect(store.recordPicoHomeMembershipCredential({
    sodium,
    credential: createMembershipCredential(founder, host, member),
    hostSigningPublicKeyHex: host.publicKeyHex,
  }).ok).toBe(true);

  // Two delegated devices: one co-signs the rotation, the other is the
  // independent objection the veto window exists for.
  const devices = [0, 1].map((index) => {
    const signing = createSigningKey('device_signing');
    const agreement = createAgreementKey();
    const record = delegation({
      delegationId: `delegation_device_${index}`,
      identityFingerprintHex: member.fingerprintHex,
      signingFingerprintHex: signing.fingerprintHex,
      agreementFingerprintHex: agreement.fingerprintHex,
      lifecycleOrder: `seq:000000000000000${index + 1}`,
    });
    expect(store.recordPicoIdentityLifecycleEvidence({
      identityKeyRecord: member.keyRecord,
      delegation: {
        record,
        signatureHex: member.sign(
          buildPicoIdentityDelegationSignatureInput(record),
        ),
      },
      revocations: [],
      sodium,
      recordedAt: enrolledAt,
    })).toEqual({ ok: true });
    expect(store.registerPicoIdentityReaderKey({
      picoIdentityFingerprintHex: member.fingerprintHex,
      deviceSigningKeyFingerprintHex: signing.fingerprintHex,
      delegationId: record.delegationId,
      deviceKeyAgreementKeyRecord: agreement.keyRecord,
      sodium,
      at: enrolledAt,
    }).ok).toBe(true);
    return {
      signing,
      agreement,
      sender: {
        picoIdentityFingerprintHex: member.fingerprintHex,
        deviceSigningKeyFingerprintHex: signing.fingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: agreement.fingerprintHex,
        delegationId: record.delegationId,
      } satisfies PicoHomeDeviceLifecycleSponsor,
    };
  });

  return { databasePath, store, founder, host, member, successor, devices };
}

function rotationRecord(
  overrides: Partial<PicoIdentityRotationSignatureInput>,
): PicoIdentityRotationSignatureInput {
  return {
    suite: picoIdentitySuite,
    rotationId: 'rotation_0001',
    predecessorIdentityKeyFingerprintHex: '00'.repeat(32),
    successorIdentityKeyFingerprintHex: '11'.repeat(32),
    reasonCategory: 'suspected_compromise',
    rotatedAt: acceptedAt,
    lifecycleOrder: 'seq:0000000000000009',
    ...overrides,
  };
}

function signRotation(
  fixture: ReturnType<typeof createFixture>,
  overrides: Partial<PicoIdentityRotationSignatureInput> = {},
) {
  const rotation = rotationRecord({
    predecessorIdentityKeyFingerprintHex: fixture.member.fingerprintHex,
    successorIdentityKeyFingerprintHex: fixture.successor.fingerprintHex,
    ...overrides,
  });
  const input = buildPicoIdentityRotationSignatureInput(rotation);
  return {
    rotation,
    predecessorIdentityKeyRecord: fixture.member.keyRecord,
    successorIdentityKeyRecord: fixture.successor.keyRecord,
    predecessorSignatureHex: fixture.member.sign(input),
    successorSignatureHex: fixture.successor.sign(input),
  };
}

function createSigningKey(
  keyRole: 'pico_identity' | 'device_signing' | 'home_host_signing',
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
    fingerprintHex: fingerprint(keyRecord),
    sign: (input: Uint8Array) =>
      Buffer.from(
        sodium.crypto_sign_detached(input, pair.privateKey),
      ).toString('hex'),
  };
}

function createAgreementKey() {
  const pair = sodium.crypto_box_keypair();
  const keyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_key_agreement',
    publicKeyHex: Buffer.from(pair.publicKey).toString('hex'),
  };
  return { keyRecord, fingerprintHex: fingerprint(keyRecord) };
}

function fingerprint(
  keyRecord: PicoIdentityKeyRecordSignatureInput,
): string {
  return Buffer.from(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(keyRecord),
    null,
  )).toString('hex');
}

function delegation(input: {
  delegationId: string;
  identityFingerprintHex: string;
  signingFingerprintHex: string;
  agreementFingerprintHex: string;
  lifecycleOrder: string;
}): PicoIdentityDelegationSignatureInput {
  return {
    suite: picoIdentitySuite,
    delegationId: input.delegationId,
    issuerIdentityKeyFingerprintHex: input.identityFingerprintHex,
    subjectSigningKeyFingerprintHex: input.signingFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: input.agreementFingerprintHex,
    scopes: ['surface_session'],
    validFrom: foundedAt,
    validUntil: '2027-07-19T10:00:00.000Z',
    lifecycleOrder: input.lifecycleOrder,
  };
}

function createMembershipCredential(
  founder: ReturnType<typeof createSigningKey>,
  host: ReturnType<typeof createSigningKey>,
  member: ReturnType<typeof createSigningKey>,
): PicoHomeMembershipCredential {
  const membership: PicoHomeMembershipSignatureInput = {
    suite: picoIdentitySuite,
    credentialId: 'member_root_rotation',
    homeId: HOME_ID,
    issuerPicoIdentityFingerprintHex: founder.fingerprintHex,
    subjectPicoIdentityFingerprintHex: member.fingerprintHex,
    hostSigningKeyFingerprintHex: host.fingerprintHex,
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
    issuerIdentityKeyRecord: founder.keyRecord,
    issuerSignatureHex: founder.sign(input),
    hostActivationSignatureHex: host.sign(input),
    createdAt: foundedAt,
  };
}

function createFoundingRecord(
  founder: ReturnType<typeof createSigningKey>,
  host: ReturnType<typeof createSigningKey>,
): PicoHomeFoundingRecord {
  return {
    schema: picoHomeFoundingRecordSchema,
    founding: {
      suite: picoIdentitySuite,
      foundingId: 'founding_root_rotation',
      homeId: HOME_ID,
      hostSigningKeyFingerprintHex: host.fingerprintHex,
      hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
      homeHostPicoIdentityFingerprintHex: founder.fingerprintHex,
      claimantNonceHex: 'bb'.repeat(32),
      hostNonceHex: 'cc'.repeat(32),
      foundedAt,
      lifecycleOrder: 'seq:0000000000000001',
    },
    claimantIdentityKeyRecord: founder.keyRecord,
    claimantFoundingSignatureHex: 'ee'.repeat(64),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: {
        suite: picoIdentitySuite,
        claimId: 'claim_root_rotation',
        homeId: HOME_ID,
        hostSigningKeyFingerprintHex: host.fingerprintHex,
        hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
        claimantIdentityKeyFingerprintHex: founder.fingerprintHex,
        claimantNonceHex: 'bb'.repeat(32),
        hostNonceHex: 'cc'.repeat(32),
        foundingRecordId: 'founding_root_rotation',
      },
      hostSignatureHex: '99'.repeat(64),
    },
    hostFoundingSignatureHex: 'dd'.repeat(64),
    createdAt: foundedAt,
  };
}
