import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeDomainReadGrantSignatureInput,
  buildPicoHomeMembershipSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityRotationSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeFoundingRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoIdentitySuite,
  type PicoHomeDomainReadGrantRecord,
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
  type PicoIdentityRotationSuccessorFirstDevice,
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
        successorFirstDeviceDelegationId: 'delegation_successor_first',
        successorFirstDeviceSigningKeyFingerprintHex:
          fixture.devices[0]!.signing.fingerprintHex,
        successorFirstDeviceKeyAgreementKeyFingerprintHex:
          fixture.devices[0]!.agreement.fingerprintHex,
        successorFirstDeviceProjectedAt: null,
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
      successorFirstDevice: successorFirstDevice(fixture),
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
        projectedSuccessorDevices: 1,
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
        projectedSuccessorDevices: 0,
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
        projectedSuccessorDevices: 0,
        quarantinedIdentities: [fixture.member.fingerprintHex],
      });
    reopened.close();
  });
});

describe('ADR 0114 T3 re-issue after a root rotation', () => {
  it('accepts only a first device the successor root itself delegated', () => {
    const fixture = createFixture();
    const signed = signRotation(fixture);

    // The predecessor may authorize the succession, never the successor's
    // devices - otherwise a card thief could name a device the new root
    // never agreed to hold.
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signed,
      successorFirstDevice: successorFirstDevice(fixture, fixture.member),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'invalid_successor_first_device' });

    // The agreement key record must be the one the delegation names, or the
    // device that ends up readable is not the device that was authorized.
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signed,
      successorFirstDevice: {
        ...signed.successorFirstDevice,
        deviceKeyAgreementKeyRecord: fixture.devices[1]!.agreement.keyRecord,
      },
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'invalid_successor_first_device' });
    fixture.store.close();
  });

  it('hands the successor its first device and states what the issuers still owe', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);

    const successorSender: PicoHomeDeviceLifecycleSponsor = {
      picoIdentityFingerprintHex: fixture.successor.fingerprintHex,
      deviceSigningKeyFingerprintHex: fixture.devices[0]!.signing.fingerprintHex,
      deviceKeyAgreementKeyFingerprintHex:
        fixture.devices[0]!.agreement.fingerprintHex,
      delegationId: 'delegation_successor_first',
    };

    // A domain the person could read before the rotation. Its controller is
    // the only one who can grant it again - the Home cannot rebind it.
    fixture.store.memory().create({
      memoryItemId: 'memory_root_rotation',
      privacyDomain: 'household',
      owner: 'test',
      controller: 'test',
      contentType: 'text/plain',
      content: 'shared',
    });
    expect(fixture.store.recordPicoHomeDomainReadGrant({
      sodium,
      record: issueReadGrant(fixture, {
        grantId: 'grant_before_rotation',
        readerPicoIdentityFingerprintHex: fixture.member.fingerprintHex,
      }),
    }).ok).toBe(true);

    expect(fixture.store.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toMatchObject({ effectiveRotations: 1, projectedSuccessorDevices: 1 });

    // The delegation is the successor root's own act and stands at once; the
    // reader key waits for the Home Host Pico, so the device is not yet
    // authorized. That wait is the stated cost of rotation, and it is named.
    let debt = fixture.store.picoIdentityRotationDebtView(
      fixture.successor.fingerprintHex,
      afterWindow,
    );
    expect(debt).toMatchObject({
      rotationId: 'rotation_0001',
      status: 'effective',
      successorFirstDevice: {
        delegationId: 'delegation_successor_first',
        delegated: true,
        readerKeyRegistered: false,
      },
      membershipsToReissue: [{ membershipId: expect.any(String) }],
      readGrantsToReissue: [{
        grantId: 'grant_before_rotation',
        privacyDomain: 'household',
      }],
    });
    expect(fixture.store.hasActivePicoIdentityDelegation({
      ...successorSender,
      sodium,
      at: afterWindow,
    })).toBe(false);

    // The Home Host Pico re-issues membership through the unchanged ceremony -
    // nothing is rebound, a new credential is issued naming the new subject.
    expect(fixture.store.recordPicoHomeMembershipCredential({
      sodium,
      credential: createMembershipCredential(
        fixture.founder,
        fixture.host,
        fixture.successor,
        'member_root_rotation_reissued',
      ),
      hostSigningPublicKeyHex: fixture.host.publicKeyHex,
      recordedAt: afterWindow,
    }).ok).toBe(true);

    // That single act is enough: the person's device works again without a
    // restart, and the debt it settled is gone from the view.
    expect(fixture.store.hasActivePicoIdentityDelegation({
      ...successorSender,
      sodium,
      at: afterWindow,
    })).toBe(true);
    debt = fixture.store.picoIdentityRotationDebtView(
      fixture.successor.fingerprintHex,
      afterWindow,
    );
    expect(debt).toMatchObject({
      successorFirstDevice: { readerKeyRegistered: true },
      membershipsToReissue: [],
      // Still owed: the domain controller has not acted yet, and no Home-side
      // act can stand in for it.
      readGrantsToReissue: [{ grantId: 'grant_before_rotation' }],
    });
    expect(fixture.store.mayReadDomain(
      fixture.successor.fingerprintHex,
      'household',
      HOME_ID,
      afterWindow,
    )).toBe(false);

    expect(fixture.store.recordPicoHomeDomainReadGrant({
      sodium,
      record: issueReadGrant(fixture, {
        grantId: 'grant_after_rotation',
        readerPicoIdentityFingerprintHex: fixture.successor.fingerprintHex,
        lifecycleOrder: 'seq:0000000000000002',
      }),
    }).ok).toBe(true);
    expect(fixture.store.picoIdentityRotationDebtView(
      fixture.successor.fingerprintHex,
      afterWindow,
    )).toMatchObject({ readGrantsToReissue: [] });
    expect(fixture.store.mayReadDomain(
      fixture.successor.fingerprintHex,
      'household',
      HOME_ID,
      afterWindow,
    )).toBe(true);

    // The predecessor's devices stay dead: re-issue restores the person, not
    // the root that was rotated away.
    expect(fixture.store.hasActivePicoIdentityDelegation({
      ...fixture.devices[1]!.sender,
      sodium,
      at: afterWindow,
    })).toBe(false);
    fixture.store.close();
  });

  it('does not project the successor device before the window passes', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);

    // A pending rotation hands out nothing - the successor gets its device
    // when the objection window has run, not while it is still open.
    expect(fixture.store.reconcilePicoIdentityRootRotations(sodium, beforeWindow))
      .toMatchObject({ effectiveRotations: 0, projectedSuccessorDevices: 0 });
    expect(fixture.store.picoIdentityRotationDebtView(
      fixture.successor.fingerprintHex,
      beforeWindow,
    )).toMatchObject({
      status: 'pending',
      successorFirstDevice: { delegated: false, readerKeyRegistered: false },
    });

    // Projection is idempotent: a second reconciliation neither duplicates
    // the device nor reports it as new work.
    expect(fixture.store.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toMatchObject({ projectedSuccessorDevices: 1 });
    expect(fixture.store.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toMatchObject({ projectedSuccessorDevices: 0, quarantinedIdentities: [] });
    fixture.store.close();
  });

  it('quarantines a first-device column that its own evidence does not name', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);
    fixture.store.close();

    // The column decides which device the Home hands the reader key to; the
    // evidence decides which device the successor actually signed for. They
    // must be the same device, and a row that says otherwise is not honored
    // in either direction.
    const tampering = new Database(fixture.databasePath);
    tampering
      .prepare(`
        UPDATE pico_identity_root_rotation
        SET successor_first_device_signing_key_fingerprint_hex = ?
      `)
      .run(fixture.devices[1]!.signing.fingerprintHex);
    tampering.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        quarantinedIdentities: [fixture.member.fingerprintHex],
      });
    reopened.close();
  });

  it('quarantines a stored first device whose terms no longer match its signature', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);
    fixture.store.close();

    // No column mirrors the delegation's validity, so only the signature
    // stands between the stored evidence and a device whose terms somebody
    // rewrote - here, one that outlives what the successor root signed for.
    const tampering = new Database(fixture.databasePath);
    const stored = JSON.parse((tampering
      .prepare('SELECT record_json AS json FROM pico_identity_root_rotation')
      .get() as { json: string }).json) as {
        successorFirstDevice: { delegation: { record: { validUntil: string } } };
      };
    stored.successorFirstDevice.delegation.record.validUntil =
      '2099-01-01T00:00:00.000Z';
    tampering
      .prepare('UPDATE pico_identity_root_rotation SET record_json = ?')
      .run(JSON.stringify(stored));
    tampering.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        quarantinedIdentities: [fixture.member.fingerprintHex],
      });
    reopened.close();
  });

  it('quarantines the successor when the stored first device was swapped', () => {
    const fixture = createFixture();
    expect(fixture.store.submitPicoIdentityRootRotation({
      ...signRotation(fixture),
      sender: fixture.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);
    fixture.store.close();

    // Swapping the device inside the evidence is how somebody would take over
    // the identity the rotation was meant to save.
    const tampering = new Database(fixture.databasePath);
    const stored = JSON.parse((tampering
      .prepare('SELECT record_json AS json FROM pico_identity_root_rotation')
      .get() as { json: string }).json) as {
        successorFirstDevice: { delegation: { record: { subjectSigningKeyFingerprintHex: string } } };
      };
    stored.successorFirstDevice.delegation.record.subjectSigningKeyFingerprintHex =
      fixture.devices[1]!.signing.fingerprintHex;
    tampering
      .prepare('UPDATE pico_identity_root_rotation SET record_json = ?')
      .run(JSON.stringify(stored));
    tampering.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
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
    successorFirstDevice: successorFirstDevice(fixture),
  };
}

/**
 * The device the successor root will hold. It re-uses the person's existing
 * device keys under a fresh delegation from the new root - the hardware does
 * not change, its authority does.
 */
function successorFirstDevice(
  fixture: ReturnType<typeof createFixture>,
  issuer: ReturnType<typeof createSigningKey> = fixture.successor,
): PicoIdentityRotationSuccessorFirstDevice {
  const record = delegation({
    delegationId: 'delegation_successor_first',
    identityFingerprintHex: issuer.fingerprintHex,
    signingFingerprintHex: fixture.devices[0]!.signing.fingerprintHex,
    agreementFingerprintHex: fixture.devices[0]!.agreement.fingerprintHex,
    lifecycleOrder: 'seq:0000000000000009',
  });
  return {
    delegation: {
      record,
      signatureHex: issuer.sign(
        buildPicoIdentityDelegationSignatureInput(record),
      ),
    },
    deviceKeyAgreementKeyRecord: fixture.devices[0]!.agreement.keyRecord,
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
  credentialId = 'member_root_rotation',
): PicoHomeMembershipCredential {
  const membership: PicoHomeMembershipSignatureInput = {
    suite: picoIdentitySuite,
    credentialId,
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

function issueReadGrant(
  fixture: ReturnType<typeof createFixture>,
  overrides: Partial<PicoHomeDomainReadGrantRecord['grant']>,
): PicoHomeDomainReadGrantRecord {
  const grant: PicoHomeDomainReadGrantRecord['grant'] = {
    suite: picoIdentitySuite,
    grantId: 'grant_root_rotation',
    homeId: HOME_ID,
    hostSigningKeyFingerprintHex: fixture.host.fingerprintHex,
    privacyDomain: 'household',
    controllerPicoIdentityFingerprintHex: fixture.founder.fingerprintHex,
    readerPicoIdentityFingerprintHex: fixture.founder.fingerprintHex,
    validFrom: foundedAt,
    validUntil: '2027-07-19T10:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
    ...overrides,
  };
  return {
    schema: picoHomeDomainReadGrantRecordSchema,
    grant,
    issuerIdentityKeyRecord: fixture.founder.keyRecord,
    issuerSignatureHex: fixture.founder.sign(
      buildPicoHomeDomainReadGrantSignatureInput(grant),
    ),
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
