import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openPicoHomeRecoveryAnchor } from './recovery-anchor.js';
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
import { createPicoTestFirstDeviceEvidence } from './test-first-device-evidence.js';

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
        foreignRotations: 0,
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

    const reopened = new EventStore(fixture.databasePath, {
      recoveryAnchor: observedAnchor(fixture.databasePath),
    });
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, beforeWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        foreignRotations: 0,
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

    const reopened = new EventStore(fixture.databasePath, {
      recoveryAnchor: observedAnchor(fixture.databasePath),
    });
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, beforeWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        foreignRotations: 0,
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

    const reopened = new EventStore(fixture.databasePath, {
      recoveryAnchor: observedAnchor(fixture.databasePath),
    });
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        foreignRotations: 0,
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

    const reopened = new EventStore(fixture.databasePath, {
      recoveryAnchor: observedAnchor(fixture.databasePath),
    });
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        foreignRotations: 0,
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

    const reopened = new EventStore(fixture.databasePath, {
      recoveryAnchor: observedAnchor(fixture.databasePath),
    });
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toEqual({
        verifiedRotations: 0,
        effectiveRotations: 0,
        projectedSuccessorDevices: 0,
        foreignRotations: 0,
        quarantinedIdentities: [fixture.member.fingerprintHex],
      });
    reopened.close();
  });
});

/**
 * The identity itself, independent of any Home. Sharing it across two
 * fixtures is what makes a cross-Home test possible: one person, one root,
 * two Homes that decide separately.
 */
describe('ADR 0114 T5 a rotation is decided per Home', () => {
  const laterAt = '2026-08-02T10:00:00.000Z';
  const afterLaterWindow = '2026-08-04T10:00:00.001Z';

  it('lets two Homes decide the same signed rotation independently', () => {
    const identity = createIdentity();
    const homeA = createFixture({ identity });
    const homeB = createFixture({ homeId: 'home_root_rotation_b', identity });

    // One record, no Home named in it - that absence is what lets a person
    // carry it to their other Homes at all.
    const signed = signRotation(homeA);

    expect(homeA.store.submitPicoIdentityRootRotation({
      ...signed,
      sender: homeA.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);

    // The second Home has not seen it. It must not guess: it keeps honoring
    // the root it knows, and says nothing about a rotation it never got.
    expect(homeB.store.picoIdentityRootRotationView(
      identity.member.fingerprintHex,
    )).toBeNull();
    expect(homeB.store.hasActivePicoIdentityDelegation({
      ...homeB.devices[1]!.sender,
      sodium,
      at: afterWindow,
    })).toBe(true);
    expect(homeA.store.hasActivePicoIdentityDelegation({
      ...homeA.devices[1]!.sender,
      sodium,
      at: afterWindow,
    })).toBe(false);

    // Presenting the same record to the second Home is a fresh local
    // ceremony: its own window, decided by the devices this Home knows.
    expect(homeB.store.submitPicoIdentityRootRotation({
      ...signed,
      sender: homeB.devices[0]!.sender,
      sodium,
      acceptedAt: laterAt,
    })).toMatchObject({
      ok: true,
      rotation: { effectiveAt: '2026-08-04T10:00:00.000Z' },
    });

    // Accepted at one Home, refused at the other - and neither decision
    // reaches across. This is the identity split the ADR names: the same
    // person is rotated here and not there, and no code can hide that.
    expect(homeB.store.vetoPicoIdentityRootRotation({
      rotationId: 'rotation_0001',
      sender: homeB.devices[1]!.sender,
      sodium,
      vetoedAt: laterAt,
    })).toEqual({ ok: true });
    expect(homeB.store.hasActivePicoIdentityDelegation({
      ...homeB.devices[1]!.sender,
      sodium,
      at: afterLaterWindow,
    })).toBe(true);
    expect(homeA.store.picoIdentityRootRotationView(
      identity.member.fingerprintHex,
    )).toMatchObject({ status: 'pending', rotationId: 'rotation_0001' });

    // Each Home owes its own re-issue: the debt is local, because the
    // issuers are.
    expect(homeA.store.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toMatchObject({ effectiveRotations: 1, foreignRotations: 0 });
    expect(homeA.store.picoIdentityRotationDebtView(
      identity.successor.fingerprintHex,
      afterWindow,
    )).toMatchObject({ membershipsToReissue: [{ homeId: HOME_ID }] });
    expect(homeB.store.picoIdentityRotationDebtView(
      identity.successor.fingerprintHex,
      afterWindow,
    )).toBeNull();

    homeA.store.close();
    homeB.store.close();
  });

  it('ignores a rotation that arrived as data instead of as a ceremony', () => {
    const identity = createIdentity();
    const homeA = createFixture({ identity });
    const homeB = createFixture({ homeId: 'home_root_rotation_b', identity });
    expect(homeA.store.submitPicoIdentityRootRotation({
      ...signRotation(homeA),
      sender: homeA.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);
    homeA.store.close();
    homeB.store.close();

    // A database restored from the wrong Home, or two merged. The row is
    // genuine and every signature in it verifies - it simply was not
    // accepted here, and accepting is the local act.
    const source = new Database(homeA.databasePath);
    const row = source
      .prepare('SELECT * FROM pico_identity_root_rotation')
      .get() as Record<string, unknown>;
    source.close();
    const target = new Database(homeB.databasePath);
    const columns = Object.keys(row);
    target
      .prepare(`
        INSERT INTO pico_identity_root_rotation (${columns.join(', ')})
        VALUES (${columns.map(() => '?').join(', ')})
      `)
      .run(...columns.map((column) => row[column]));
    target.close();

    const reopened = new EventStore(homeB.databasePath, {
      recoveryAnchor: observedAnchor(homeB.databasePath),
    });
    // Ignored, but not silently: a merged database must not read as an empty
    // one, so the row is counted and named at boot.
    expect(reopened.reconcilePicoIdentityRootRotations(sodium, afterWindow))
      .toMatchObject({
        verifiedRotations: 0,
        effectiveRotations: 0,
        foreignRotations: 1,
        quarantinedIdentities: [],
      });
    expect(reopened.picoIdentityRootRotationView(
      identity.member.fingerprintHex,
    )).toBeNull();
    // Nor may it invent work: naming a debt for a rotation that decides
    // nothing here would send the person to issuers who owe them nothing.
    expect(reopened.picoIdentityRotationDebtView(
      identity.successor.fingerprintHex,
      afterWindow,
    )).toBeNull();
    expect(reopened.hasActivePicoIdentityDelegation({
      ...homeB.devices[1]!.sender,
      sodium,
      at: afterWindow,
    })).toBe(true);

    // The person can still rotate here - the carried-in row neither blocks
    // the ceremony nor stands in for it.
    expect(reopened.submitPicoIdentityRootRotation({
      ...signRotation(homeB),
      sender: homeB.devices[0]!.sender,
      sodium,
      acceptedAt,
    }).ok).toBe(true);
    reopened.close();
  });
});

function createIdentity() {
  return {
    member: createSigningKey('pico_identity'),
    successor: createSigningKey('pico_identity'),
    deviceKeys: [0, 1].map(() => ({
      signing: createSigningKey('device_signing'),
      agreement: createAgreementKey(),
    })),
  };
}

/**
 * ADR 0120 N2. A rotation veto is an objection window, so promotion needs a
 * durable floor as well as a wall clock. These tests model a Home that was
 * actually running through the window: the floor is bootstrapped at the
 * instant the test reconciles against.
 */
function observedAnchor(databasePath: string, floorAt: string = afterWindow) {
  const anchor = openPicoHomeRecoveryAnchor(
    join(dirname(databasePath), "recovery-anchor", "anchor.json"),
    { now: () => new Date(floorAt) },
  );
  if (anchor.isEmpty()) {
    anchor.seed({ homeId: null, entries: [] });
  }
  return anchor;
}

function createFixture(options: {
  homeId?: string;
  identity?: ReturnType<typeof createIdentity>;
} = {}) {
  const homeId = options.homeId ?? HOME_ID;
  const dir = mkdtempSync(join(tmpdir(), 'pico-root-rotation-test-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath, {
    recoveryAnchor: observedAnchor(databasePath),
  });

  const founder = createSigningKey('pico_identity');
  const host = createSigningKey('home_host_signing');
  const identity = options.identity ?? createIdentity();
  const { member, successor } = identity;

  const founding = createFoundingRecord(founder, host, homeId);
  store.claimPicoHome({
    homeId,
    hostAdminPicoId: `pico:identity:${founder.fingerprintHex}`,
    hostSigningKeyFingerprintHex: host.fingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      founding.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: founding,
    claimedAt: foundedAt,
    sodium,
  });

  // The rotating identity is a member, not the founder: the founder's root is
  // Home handover and out of ADR 0114's scope.
  expect(store.recordPicoHomeMembershipCredential({
    sodium,
    credential: createMembershipCredential(
      founder,
      host,
      member,
      'member_root_rotation',
      homeId,
    ),
    hostSigningPublicKeyHex: host.publicKeyHex,
  }).ok).toBe(true);

  // Two delegated devices: one co-signs the rotation, the other is the
  // independent objection the veto window exists for.
  const devices = identity.deviceKeys.map((keys, index) => {
    const { signing, agreement } = keys;
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

  return {
    databasePath, store, homeId, founder, host, member, successor, devices,
    identity,
  };
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
    privateKey: pair.privateKey,
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
  homeId = HOME_ID,
): PicoHomeMembershipCredential {
  const membership: PicoHomeMembershipSignatureInput = {
    suite: picoIdentitySuite,
    credentialId,
    homeId,
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
  homeId = HOME_ID,
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
      foundingId: 'founding_root_rotation',
      homeId,
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
        claimId: 'claim_root_rotation',
        homeId,
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
