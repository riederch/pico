import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeDeviceLifecycleEvidenceDigestHex,
  picoHomeDeviceLifecycleSubmissionSchema,
  picoHomeFoundingRecordSchema,
  picoIdentitySuite,
  type PicoHomeDeviceLifecycleSubmission,
  type PicoHomeFoundingRecord,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import { EventStore, type PicoHomeDeviceLifecycleSponsor } from './event-store.js';
import {
  createPicoTestFirstDeviceEvidence,
  type PicoTestFirstDeviceEvidence,
} from './test-first-device-evidence.js';

const tempDirs: string[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ADR 0109 device lifecycle store', () => {
  /**
   * ADR 0109 D2 checks the sponsor *before* the transaction, and the receipt
   * is then built from that historical fact. So the refusal matters twice:
   * once because a device without a living delegation may not sponsor a
   * lifecycle change, and once because everything downstream is constructed
   * as if the check had happened. Nothing had ever been through it
   * (Befund B71).
   *
   * The identity here is a member in good standing - it is the *delegation*
   * that is not there, which is the case the membership check one line above
   * cannot see.
   */
  it('refuses a sponsor whose identity is a member but whose delegation is not active', () => {
    const fixture = createFoundedLifecycleFixture();
    const target = createDeviceKeys();
    const enrollment = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_unsponsored',
      delegationId: 'delegation_unsponsored_target',
      lifecycleOrder: 'seq:0000000000000002',
      observedLifecycleOrder: 'seq:0000000000000001',
      target,
    });
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: enrollment,
      sponsor: {
        ...fixture.sponsor,
        delegationId: 'delegation_that_was_never_issued',
      },
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    })).toEqual({ ok: false, reason: 'inactive_sponsor' });

    // The same submission with the real sponsor is accepted, so the refusal
    // is about the sponsor and not about the submission.
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: enrollment,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    }).ok).toBe(true);
  });

  it('enrolls atomically, accepts an older authentic revocation, and permits last-device self-revocation', () => {
    const fixture = createFoundedLifecycleFixture();
    const target = createDeviceKeys();
    const enrollment = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_enroll_target',
      delegationId: 'delegation_target',
      lifecycleOrder: 'seq:0000000000000002',
      observedLifecycleOrder: 'seq:0000000000000001',
      target,
    });

    const enrolled = fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: enrollment,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    });

    expect(enrolled).toMatchObject({
      ok: true,
      inserted: true,
      record: {
        receipt: {
          acceptedLifecycleOrder: 'seq:0000000000000001',
          resultingLifecycleOrder: 'seq:0000000000000002',
          leavesNoActiveDevice: false,
        },
      },
    });
    expect(fixture.store.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      sodium,
      at: fixture.acceptedAt,
    })).toMatchObject({
      observedLifecycleOrder: 'seq:0000000000000002',
      devices: [
        { delegationId: 'delegation_sponsor', status: 'active' },
        { delegationId: 'delegation_target', status: 'active' },
      ],
    });

    const staleTarget = createDeviceKeys();
    const staleEnrollment = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_stale_target',
      delegationId: 'delegation_stale_target',
      lifecycleOrder: 'seq:0000000000000003',
      observedLifecycleOrder: 'seq:0000000000000001',
      target: staleTarget,
    });
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: staleEnrollment,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    })).toEqual({ ok: false, reason: 'stale_lifecycle_head' });

    const overlongTarget = createDeviceKeys();
    const overlongEnrollment = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_overlong_target',
      delegationId: 'delegation_overlong_target',
      lifecycleOrder: 'seq:0000000000000003',
      observedLifecycleOrder: 'seq:0000000000000002',
      target: overlongTarget,
    });
    const overlongInput = {
      ...overlongEnrollment.activation!.input,
      expiresAt: '2026-07-30T10:10:00.001Z',
    };
    overlongEnrollment.activation = {
      input: overlongInput,
      targetSignatureHex: overlongTarget.signing.sign(
        buildPicoHomeDeviceActivationSignatureInput(overlongInput),
      ),
    };
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: overlongEnrollment,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    })).toEqual({ ok: false, reason: 'invalid_transition' });

    const wrongAudienceTarget = createDeviceKeys();
    const wrongAudienceEnrollment = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_wrong_activation_audience',
      delegationId: 'delegation_wrong_activation_audience',
      lifecycleOrder: 'seq:0000000000000003',
      observedLifecycleOrder: 'seq:0000000000000002',
      target: wrongAudienceTarget,
    });
    const wrongAudienceInput = {
      ...wrongAudienceEnrollment.activation!.input,
      homeId: 'home_substituted',
    };
    wrongAudienceEnrollment.activation = {
      input: wrongAudienceInput,
      targetSignatureHex: wrongAudienceTarget.signing.sign(
        buildPicoHomeDeviceActivationSignatureInput(wrongAudienceInput),
      ),
    };
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: wrongAudienceEnrollment,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    })).toEqual({ ok: false, reason: 'invalid_transition' });

    const wrongDigestTarget = createDeviceKeys();
    const wrongDigestEnrollment = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_wrong_activation_digest',
      delegationId: 'delegation_wrong_activation_digest',
      lifecycleOrder: 'seq:0000000000000003',
      observedLifecycleOrder: 'seq:0000000000000002',
      target: wrongDigestTarget,
    });
    const wrongDigestInput = {
      ...wrongDigestEnrollment.activation!.input,
      lifecycleEvidenceDigestHex: '00'.repeat(32),
    };
    wrongDigestEnrollment.activation = {
      input: wrongDigestInput,
      targetSignatureHex: wrongDigestTarget.signing.sign(
        buildPicoHomeDeviceActivationSignatureInput(wrongDigestInput),
      ),
    };
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: wrongDigestEnrollment,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    })).toEqual({ ok: false, reason: 'invalid_transition' });

    const revokeTarget = createRevocationSubmission(fixture, {
      transitionId: 'transition_revoke_target',
      targetDelegationId: 'delegation_target',
      target,
      lifecycleOrder: 'seq:0000000000000000',
      observedLifecycleOrder: 'seq:0000000000000001',
    });
    const revoked = fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: revokeTarget,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    });

    expect(revoked).toMatchObject({
      ok: true,
      record: {
        receipt: {
          acceptedLifecycleOrder: 'seq:0000000000000002',
          resultingLifecycleOrder: 'seq:0000000000000002',
          leavesNoActiveDevice: false,
        },
      },
    });
    expect(fixture.store.hasActivePicoIdentityDelegation({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      deviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: target.agreement.fingerprintHex,
      delegationId: 'delegation_target',
      sodium,
      at: fixture.acceptedAt,
    })).toBe(false);

    const revokeSponsor = createRevocationSubmission(fixture, {
      transitionId: 'transition_revoke_sponsor',
      targetDelegationId: fixture.sponsor.delegationId,
      target: {
        signing: fixture.sponsorSigning,
        agreement: fixture.sponsorAgreement,
      },
      lifecycleOrder: 'seq:0000000000000003',
      observedLifecycleOrder: 'seq:0000000000000002',
    });
    const selfRevoked = fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: revokeSponsor,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    });

    expect(selfRevoked).toMatchObject({
      ok: true,
      record: { receipt: { leavesNoActiveDevice: true } },
    });
    expect(fixture.store.hasActivePicoIdentityDelegation({
      ...fixture.sponsor,
      sodium,
      at: fixture.acceptedAt,
    })).toBe(false);
    fixture.store.close();
  });

  it('rolls back lifecycle and receipt when the reader-key projection conflicts', () => {
    const fixture = createFoundedLifecycleFixture();
    const target = createDeviceKeys();
    const submission = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_rollback',
      delegationId: 'delegation_collision',
      lifecycleOrder: 'seq:0000000000000002',
      observedLifecycleOrder: 'seq:0000000000000001',
      target,
    });
    const foreign = new Database(fixture.databasePath);
    foreign.prepare(`
      INSERT INTO pico_identity_reader_key (
        delegation_id,
        home_id,
        pico_identity_fingerprint_hex,
        device_signing_key_fingerprint_hex,
        device_key_agreement_key_fingerprint_hex,
        device_key_agreement_key_record_json,
        registered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'delegation_collision',
      fixture.homeId,
      'f'.repeat(64),
      'e'.repeat(64),
      'd'.repeat(64),
      JSON.stringify({
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: 'c'.repeat(64),
      }),
      fixture.acceptedAt,
    );
    foreign.close();

    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    })).toEqual({ ok: false, reason: 'conflicting_record' });

    const inspected = new Database(fixture.databasePath, { readonly: true });
    expect(inspected.prepare(`
      SELECT COUNT(*) AS count
      FROM pico_home_device_lifecycle_transition
      WHERE transition_id = 'transition_rollback'
    `).get()).toEqual({ count: 0 });
    expect(inspected.prepare(`
      SELECT COUNT(*) AS count
      FROM pico_identity_delegation
      WHERE delegation_id = 'delegation_collision'
    `).get()).toEqual({ count: 0 });
    inspected.close();
    expect(fixture.store.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      sodium,
      at: fixture.acceptedAt,
    })?.observedLifecycleOrder).toBe('seq:0000000000000001');
    fixture.store.close();
  });

  it('renews by projecting the replacement reader binding before revoking the old delegation', () => {
    const fixture = createFoundedLifecycleFixture();
    const renewal = createRenewalSubmission(fixture);

    const renewed = fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: renewal,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    });

    expect(renewed).toMatchObject({
      ok: true,
      inserted: true,
      record: {
        receipt: {
          acceptedLifecycleOrder: 'seq:0000000000000001',
          resultingLifecycleOrder: 'seq:0000000000000003',
          leavesNoActiveDevice: false,
        },
      },
    });
    expect(fixture.store.hasActivePicoIdentityDelegation({
      ...fixture.sponsor,
      sodium,
      at: fixture.acceptedAt,
    })).toBe(false);
    expect(fixture.store.hasActivePicoIdentityDelegation({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      deviceSigningKeyFingerprintHex: fixture.sponsorSigning.fingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: fixture.sponsorAgreement.fingerprintHex,
      delegationId: 'delegation_sponsor_renewed',
      sodium,
      at: fixture.acceptedAt,
    })).toBe(true);
    expect(fixture.store.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      sodium,
      at: fixture.acceptedAt,
    })).toMatchObject({
      observedLifecycleOrder: 'seq:0000000000000003',
      devices: [
        { delegationId: 'delegation_sponsor', status: 'revoked' },
        { delegationId: 'delegation_sponsor_renewed', status: 'active' },
      ],
    });
    fixture.store.close();
  });

  it('reprojects a valid receipt after restore and quarantines an identity when the receipt is changed', () => {
    const fixture = createFoundedLifecycleFixture();
    const target = createDeviceKeys();
    const submission = createEnrollmentSubmission(fixture, {
      transitionId: 'transition_restart',
      delegationId: 'delegation_restart_target',
      lifecycleOrder: 'seq:0000000000000002',
      observedLifecycleOrder: 'seq:0000000000000001',
      target,
    });
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt: fixture.acceptedAt,
    }).ok).toBe(true);
    fixture.store.close();

    const stale = new Database(fixture.databasePath);
    stale.prepare("DELETE FROM pico_identity_reader_key WHERE delegation_id = 'delegation_restart_target'").run();
    stale.prepare("DELETE FROM pico_identity_delegation WHERE delegation_id = 'delegation_restart_target'").run();
    stale.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoHomeDeviceLifecycleTransitions(sodium)).toEqual({
      verifiedTransitions: 1,
      reprojectedTransitions: 1,
      quarantinedIdentities: [],
    });
    expect(reopened.hasActivePicoIdentityDelegation({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      deviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: target.agreement.fingerprintHex,
      delegationId: 'delegation_restart_target',
      sodium,
      at: fixture.acceptedAt,
    })).toBe(true);
    reopened.close();

    const corrupted = new Database(fixture.databasePath);
    const row = corrupted.prepare(`
      SELECT lifecycle_record_json AS recordJson
      FROM pico_home_device_lifecycle_transition
      WHERE transition_id = 'transition_restart'
    `).get() as { recordJson: string };
    const record = JSON.parse(row.recordJson) as {
      receipt: { transitionDigestHex: string };
    };
    record.receipt.transitionDigestHex = '00'.repeat(32);
    corrupted.prepare(`
      UPDATE pico_home_device_lifecycle_transition
      SET lifecycle_record_json = ?
      WHERE transition_id = 'transition_restart'
    `).run(JSON.stringify(record));
    corrupted.close();

    const quarantining = new EventStore(fixture.databasePath);
    expect(quarantining.reconcilePicoHomeDeviceLifecycleTransitions(sodium)).toEqual({
      verifiedTransitions: 0,
      reprojectedTransitions: 0,
      quarantinedIdentities: [fixture.identity.fingerprintHex],
    });
    expect(quarantining.hasActivePicoIdentityDelegation({
      ...fixture.sponsor,
      sodium,
      at: fixture.acceptedAt,
    })).toBe(false);
    quarantining.close();
  });
});

function createFoundedLifecycleFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-device-lifecycle-test-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath);
  const identity = createSigningKey('pico_identity');
  const host = createSigningKey('home_host_signing');
  const sponsorSigning = createSigningKey('device_signing');
  const sponsorAgreement = createAgreementKey();
  const homeId = 'home_device_lifecycle';
  const acceptedAt = '2026-07-30T10:05:00.000Z';
  // The founding delegates to the sponsor device: a Home founded on one device
  // has exactly one delegation until it enrolls a second.
  const sponsorEvidence = createPicoTestFirstDeviceEvidence({
    sodium,
    claimantIdentityPrivateKey: identity.privateKey,
    claimantIdentityKeyFingerprintHex: identity.fingerprintHex,
    signingKeyRecord: sponsorSigning.keyRecord,
    keyAgreementKeyRecord: sponsorAgreement.keyRecord,
    delegationId: 'delegation_sponsor',
    validFrom: '2026-07-30T10:00:00.000Z',
    validUntil: '2027-07-30T10:00:00.000Z',
  });
  const founding = createFoundingRecord({
    homeId,
    identityFingerprintHex: identity.fingerprintHex,
    identityKeyRecord: identity.keyRecord,
    evidence: sponsorEvidence,
    hostFingerprintHex: host.fingerprintHex,
  });
  store.claimPicoHome({
    homeId,
    hostAdminPicoId: `pico:identity:${identity.fingerprintHex}`,
    hostSigningKeyFingerprintHex: host.fingerprintHex,
    hostKeyAgreementKeyFingerprintHex: founding.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: founding,
    sodium,
  });

  const sponsorDelegation = sponsorEvidence.firstDeviceDelegation.record;
  expect(store.registerPicoIdentityReaderKey({
    picoIdentityFingerprintHex: identity.fingerprintHex,
    deviceSigningKeyFingerprintHex: sponsorSigning.fingerprintHex,
    delegationId: sponsorDelegation.delegationId,
    deviceKeyAgreementKeyRecord: sponsorAgreement.keyRecord,
    sodium,
    at: acceptedAt,
  }).ok).toBe(true);

  const sponsor: PicoHomeDeviceLifecycleSponsor = {
    picoIdentityFingerprintHex: identity.fingerprintHex,
    deviceSigningKeyFingerprintHex: sponsorSigning.fingerprintHex,
    deviceKeyAgreementKeyFingerprintHex: sponsorAgreement.fingerprintHex,
    delegationId: sponsorDelegation.delegationId,
  };
  return {
    databasePath,
    store,
    identity,
    host,
    sponsorSigning,
    sponsorAgreement,
    sponsor,
    homeId,
    acceptedAt,
  };
}

function createEnrollmentSubmission(
  fixture: ReturnType<typeof createFoundedLifecycleFixture>,
  input: {
    transitionId: string;
    delegationId: string;
    lifecycleOrder: string;
    observedLifecycleOrder: string;
    target: ReturnType<typeof createDeviceKeys>;
  },
): PicoHomeDeviceLifecycleSubmission {
  const signedDelegation = delegation({
    delegationId: input.delegationId,
    issuerIdentityKeyFingerprintHex: fixture.identity.fingerprintHex,
    signingFingerprintHex: input.target.signing.fingerprintHex,
    agreementFingerprintHex: input.target.agreement.fingerprintHex,
    lifecycleOrder: input.lifecycleOrder,
  });
  const evidence: PicoHomeDeviceLifecycleSubmission['evidence'] = {
    transitionId: input.transitionId,
    action: 'enroll',
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    targetDelegationId: input.delegationId,
    targetDeviceSigningKeyFingerprintHex: input.target.signing.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex: input.target.agreement.fingerprintHex,
    replacedDelegationId: null,
    observedLifecycleOrder: input.observedLifecycleOrder,
    identityKeyRecord: fixture.identity.keyRecord,
    targetDeviceSigningKeyRecord: input.target.signing.keyRecord,
    targetDeviceKeyAgreementKeyRecord: input.target.agreement.keyRecord,
    delegation: {
      record: signedDelegation,
      signatureHex: fixture.identity.sign(
        buildPicoIdentityDelegationSignatureInput(signedDelegation),
      ),
    },
    revocations: [],
  };
  const activation = {
    suite: picoIdentitySuite,
    activationId: input.transitionId,
    action: 'enroll' as const,
    homeId: fixture.homeId,
    hostSigningKeyFingerprintHex: fixture.host.fingerprintHex,
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    sponsorDelegationId: fixture.sponsor.delegationId,
    sponsorDeviceSigningKeyFingerprintHex: fixture.sponsor.deviceSigningKeyFingerprintHex,
    sponsorDeviceKeyAgreementKeyFingerprintHex:
      fixture.sponsor.deviceKeyAgreementKeyFingerprintHex,
    targetDelegationId: input.delegationId,
    targetDeviceSigningKeyFingerprintHex: input.target.signing.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex: input.target.agreement.fingerprintHex,
    lifecycleEvidenceDigestHex: picoHomeDeviceLifecycleEvidenceDigestHex(sodium, evidence),
    observedLifecycleOrder: input.observedLifecycleOrder,
    createdAt: '2026-07-30T10:04:00.000Z',
    expiresAt: '2026-07-30T10:09:00.000Z',
  };
  return {
    schema: picoHomeDeviceLifecycleSubmissionSchema,
    evidence,
    activation: {
      input: activation,
      targetSignatureHex: input.target.signing.sign(
        buildPicoHomeDeviceActivationSignatureInput(activation),
      ),
    },
  };
}

function createRevocationSubmission(
  fixture: ReturnType<typeof createFoundedLifecycleFixture>,
  input: {
    transitionId: string;
    targetDelegationId: string;
    target: ReturnType<typeof createDeviceKeys>;
    lifecycleOrder: string;
    observedLifecycleOrder: string;
  },
): PicoHomeDeviceLifecycleSubmission {
  const record: PicoIdentityRevocationSignatureInput = {
    suite: picoIdentitySuite,
    revocationId: `revocation_${input.transitionId}`,
    issuerIdentityKeyFingerprintHex: fixture.identity.fingerprintHex,
    subjectKind: 'delegation',
    subjectRef: input.targetDelegationId,
    reasonCategory: 'device_retired',
    revokedAt: fixture.acceptedAt,
    lifecycleOrder: input.lifecycleOrder,
  };
  return {
    schema: picoHomeDeviceLifecycleSubmissionSchema,
    evidence: {
      transitionId: input.transitionId,
      action: 'revoke',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      targetDelegationId: input.targetDelegationId,
      targetDeviceSigningKeyFingerprintHex: input.target.signing.fingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex: input.target.agreement.fingerprintHex,
      replacedDelegationId: null,
      observedLifecycleOrder: input.observedLifecycleOrder,
      identityKeyRecord: fixture.identity.keyRecord,
      targetDeviceSigningKeyRecord: null,
      targetDeviceKeyAgreementKeyRecord: null,
      delegation: null,
      revocations: [{
        record,
        signatureHex: fixture.identity.sign(
          buildPicoIdentityRevocationSignatureInput(record),
        ),
      }],
    },
    activation: null,
  };
}

function createRenewalSubmission(
  fixture: ReturnType<typeof createFoundedLifecycleFixture>,
): PicoHomeDeviceLifecycleSubmission {
  const renewedDelegation = delegation({
    delegationId: 'delegation_sponsor_renewed',
    issuerIdentityKeyFingerprintHex: fixture.identity.fingerprintHex,
    signingFingerprintHex: fixture.sponsorSigning.fingerprintHex,
    agreementFingerprintHex: fixture.sponsorAgreement.fingerprintHex,
    lifecycleOrder: 'seq:0000000000000002',
  });
  const revocation: PicoIdentityRevocationSignatureInput = {
    suite: picoIdentitySuite,
    revocationId: 'revocation_sponsor_replaced',
    issuerIdentityKeyFingerprintHex: fixture.identity.fingerprintHex,
    subjectKind: 'delegation',
    subjectRef: fixture.sponsor.delegationId,
    reasonCategory: 'key_rotated',
    revokedAt: fixture.acceptedAt,
    lifecycleOrder: 'seq:0000000000000003',
  };
  const evidence: PicoHomeDeviceLifecycleSubmission['evidence'] = {
    transitionId: 'transition_renew_sponsor',
    action: 'renew',
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    targetDelegationId: renewedDelegation.delegationId,
    targetDeviceSigningKeyFingerprintHex: fixture.sponsorSigning.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex: fixture.sponsorAgreement.fingerprintHex,
    replacedDelegationId: fixture.sponsor.delegationId,
    observedLifecycleOrder: 'seq:0000000000000001',
    identityKeyRecord: fixture.identity.keyRecord,
    targetDeviceSigningKeyRecord: fixture.sponsorSigning.keyRecord,
    targetDeviceKeyAgreementKeyRecord: fixture.sponsorAgreement.keyRecord,
    delegation: {
      record: renewedDelegation,
      signatureHex: fixture.identity.sign(
        buildPicoIdentityDelegationSignatureInput(renewedDelegation),
      ),
    },
    revocations: [{
      record: revocation,
      signatureHex: fixture.identity.sign(
        buildPicoIdentityRevocationSignatureInput(revocation),
      ),
    }],
  };
  const activation = {
    suite: picoIdentitySuite,
    activationId: evidence.transitionId,
    action: 'renew' as const,
    homeId: fixture.homeId,
    hostSigningKeyFingerprintHex: fixture.host.fingerprintHex,
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    sponsorDelegationId: fixture.sponsor.delegationId,
    sponsorDeviceSigningKeyFingerprintHex: fixture.sponsor.deviceSigningKeyFingerprintHex,
    sponsorDeviceKeyAgreementKeyFingerprintHex:
      fixture.sponsor.deviceKeyAgreementKeyFingerprintHex,
    targetDelegationId: renewedDelegation.delegationId,
    targetDeviceSigningKeyFingerprintHex: fixture.sponsorSigning.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex: fixture.sponsorAgreement.fingerprintHex,
    lifecycleEvidenceDigestHex: picoHomeDeviceLifecycleEvidenceDigestHex(sodium, evidence),
    observedLifecycleOrder: evidence.observedLifecycleOrder,
    createdAt: '2026-07-30T10:04:00.000Z',
    expiresAt: '2026-07-30T10:09:00.000Z',
  };
  return {
    schema: picoHomeDeviceLifecycleSubmissionSchema,
    evidence,
    activation: {
      input: activation,
      targetSignatureHex: fixture.sponsorSigning.sign(
        buildPicoHomeDeviceActivationSignatureInput(activation),
      ),
    },
  };
}

function createDeviceKeys() {
  return {
    signing: createSigningKey('device_signing'),
    agreement: createAgreementKey(),
  };
}

function createSigningKey(keyRole: 'pico_identity' | 'device_signing' | 'home_host_signing') {
  const pair = sodium.crypto_sign_keypair();
  const keyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex: Buffer.from(pair.publicKey).toString('hex'),
  };
  return {
    keyRecord,
    privateKey: pair.privateKey,
    fingerprintHex: fingerprint(keyRecord),
    sign: (input: Uint8Array) =>
      Buffer.from(sodium.crypto_sign_detached(input, pair.privateKey)).toString('hex'),
  };
}

function createAgreementKey() {
  const pair = sodium.crypto_box_keypair();
  const keyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_key_agreement',
    publicKeyHex: Buffer.from(pair.publicKey).toString('hex'),
  };
  return {
    keyRecord,
    fingerprintHex: fingerprint(keyRecord),
  };
}

function fingerprint(keyRecord: PicoIdentityKeyRecordSignatureInput): string {
  return Buffer.from(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(keyRecord),
    null,
  )).toString('hex');
}

function delegation(input: {
  delegationId: string;
  issuerIdentityKeyFingerprintHex: string;
  signingFingerprintHex: string;
  agreementFingerprintHex: string;
  lifecycleOrder: string;
}): PicoIdentityDelegationSignatureInput {
  return {
    suite: picoIdentitySuite,
    delegationId: input.delegationId,
    issuerIdentityKeyFingerprintHex: input.issuerIdentityKeyFingerprintHex,
    subjectSigningKeyFingerprintHex: input.signingFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: input.agreementFingerprintHex,
    scopes: ['surface_session'],
    validFrom: '2026-07-30T10:00:00.000Z',
    validUntil: '2027-07-30T10:00:00.000Z',
    lifecycleOrder: input.lifecycleOrder,
  };
}

function createFoundingRecord(input: {
  homeId: string;
  identityFingerprintHex: string;
  identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  evidence: PicoTestFirstDeviceEvidence;
  hostFingerprintHex: string;
}): PicoHomeFoundingRecord {
  const foundingId = 'founding_device_lifecycle';
  const claimId = 'claim_device_lifecycle';
  const foundedAt = '2026-07-30T10:00:00.000Z';
  return {
    schema: picoHomeFoundingRecordSchema,
    founding: {
      suite: picoIdentitySuite,
      foundingId,
      homeId: input.homeId,
      hostSigningKeyFingerprintHex: input.hostFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: 'a'.repeat(64),
      homeHostPicoIdentityFingerprintHex: input.identityFingerprintHex,
      claimantNonceHex: 'b'.repeat(64),
      hostNonceHex: 'c'.repeat(64),
      foundedAt,
      lifecycleOrder: 'seq:0000000000000001',
      ...input.evidence.foundingFields,
    },
    firstDeviceSigningKeyRecord: input.evidence.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: input.evidence.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: input.evidence.firstDeviceDelegation,
    firstDeviceRevocations: input.evidence.firstDeviceRevocations,
    claimantIdentityKeyRecord: input.identityKeyRecord,
    claimantFoundingSignatureHex: 'e'.repeat(128),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: {
        suite: picoIdentitySuite,
        claimId,
        homeId: input.homeId,
        hostSigningKeyFingerprintHex: input.hostFingerprintHex,
        hostKeyAgreementKeyFingerprintHex: 'a'.repeat(64),
        claimantIdentityKeyFingerprintHex: input.identityFingerprintHex,
        claimantNonceHex: 'b'.repeat(64),
        hostNonceHex: 'c'.repeat(64),
        foundingRecordId: foundingId,
      },
      hostSignatureHex: 'f'.repeat(128),
    },
    hostFoundingSignatureHex: '1'.repeat(128),
    createdAt: foundedAt,
  };
}
