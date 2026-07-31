import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  buildPicoHomeDeviceActivationSignatureInput,
  buildPicoHomeDeviceRecoveryClaimSignatureInput,
  buildPicoHomeDeviceRecoveryPrepareSignatureInput,
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoHomeClaimResponseRecordSchema,
  picoHomeDeviceLifecycleEvidenceDigestHex,
  picoHomeDeviceLifecycleSubmissionSchema,
  picoHomeDeviceRecoveryEvidenceDigestHex,
  picoHomeDeviceRecoverySubmissionSchema,
  picoHomeFoundingRecordSchema,
  picoIdentitySuite,
  type PicoHomeDeviceLifecycleSubmission,
  type PicoHomeDeviceRecoverySubmission,
  type PicoHomeDeviceRecoveryPreparation,
  type PicoHomeFoundingRecord,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import {
  EventStore,
  type PicoHomeDeviceLifecycleSponsor,
} from './event-store.js';

const tempDirs: string[] = [];
const acceptedAt = '2026-07-31T10:00:00.000Z';
const effectiveAt = '2026-08-02T10:00:00.000Z';
const completedAt = '2026-08-02T10:00:00.001Z';
const postWindowAt = '2026-08-09T10:00:00.000Z';

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ADR 0110 durable device recovery', () => {
  it('reveals the current replacement set only to a root-authorized target', () => {
    const fixture = createFixture();
    const target = createDeviceKeys();
    const preparation = createRecoveryPreparation(fixture, target);
    const sender: PicoHomeDeviceLifecycleSponsor = {
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      deviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: target.agreement.fingerprintHex,
      delegationId: preparation.request.targetDelegationId,
    };
    expect(fixture.store.preparePicoHomeDeviceRecovery({
      preparation,
      sender,
      sodium,
      acceptedAt,
    })).toMatchObject({
      ok: true,
      view: {
        observedLifecycleOrder: 'seq:0000000000000001',
        devices: [{
          delegationId: fixture.sponsor.delegationId,
          status: 'active',
        }],
      },
    });
    expect(fixture.store.preparePicoHomeDeviceRecovery({
      preparation: {
        ...preparation,
        rootSignatureHex: '00'.repeat(64),
      },
      sender,
      sodium,
      acceptedAt,
    })).toEqual({
      ok: false,
      reason: 'invalid_recovery_prepare',
    });
    expect(fixture.store.preparePicoHomeDeviceRecovery({
      preparation,
      sender: {
        ...sender,
        deviceSigningKeyFingerprintHex: '00'.repeat(32),
      },
      sodium,
      acceptedAt,
    })).toEqual({
      ok: false,
      reason: 'invalid_recovery_prepare',
    });
    fixture.store.close();
  });

  it('survives restart, enforces the clock, commits total replacement and reprojects its receipt', () => {
    const fixture = createFixture();
    const target = createDeviceKeys();
    const submission = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_restart',
      target,
    });
    const sender = recoverySender(fixture, submission);

    const initiated = fixture.store.initiatePicoHomeDeviceRecovery({
      submission,
      sender,
      sodium,
      acceptedAt,
    });
    expect(initiated).toMatchObject({
      ok: true,
      status: 'pending',
      pending: {
        recoveryId: 'recovery_restart',
        acceptedAt,
        effectiveAt,
        completionExpiresAt: postWindowAt,
      },
    });
    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_restart',
      claimDigestHex: initiated.ok
        ? initiated.pending.claimDigestHex
        : '',
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt: '2026-08-02T09:59:59.999Z',
    })).toEqual({ ok: false, reason: 'recovery_not_effective' });
    fixture.store.close();

    const reopened = new EventStore(fixture.databasePath);
    expect(reopened.reconcilePicoHomeDeviceRecoveries(
      sodium,
      '2026-08-01T10:00:00.000Z',
    )).toEqual({
      verifiedRecoveries: 0,
      reprojectedRecoveries: 0,
      lapsedPending: 0,
      quarantinedIdentities: [],
    });
    expect(reopened.picoHomeDeviceRecoveryPendingView(
      fixture.identity.fingerprintHex,
    )?.recoveryId).toBe('recovery_restart');
    const completed = reopened.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_restart',
      claimDigestHex: initiated.ok
        ? initiated.pending.claimDigestHex
        : '',
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    });
    expect(completed).toMatchObject({
      ok: true,
      record: {
        receipt: {
          acceptedLifecycleOrder: 'seq:0000000000000001',
          resultingLifecycleOrder: 'seq:0000000000000003',
          leavesExactlyOneActiveDevice: true,
        },
      },
    });
    expect(reopened.picoHomeDeviceLifecycleView({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      sodium,
      at: completedAt,
    })).toMatchObject({
      observedLifecycleOrder: 'seq:0000000000000003',
      devices: [
        {
          delegationId: 'delegation_recovery_restart',
          status: 'active',
        },
        { delegationId: 'delegation_sponsor', status: 'revoked' },
      ],
    });
    reopened.close();

    const staleProjection = new Database(fixture.databasePath);
    staleProjection.prepare(`
      DELETE FROM pico_identity_reader_key
      WHERE delegation_id = 'delegation_recovery_restart'
    `).run();
    staleProjection.prepare(`
      DELETE FROM pico_identity_revocation
      WHERE revocation_id = 'revocation_recovery_restart_delegation_sponsor'
    `).run();
    staleProjection.prepare(`
      DELETE FROM pico_identity_delegation
      WHERE delegation_id = 'delegation_recovery_restart'
    `).run();
    staleProjection.close();

    const reconciled = new EventStore(fixture.databasePath);
    expect(reconciled.reconcilePicoHomeDeviceRecoveries(
      sodium,
      completedAt,
    )).toEqual({
      verifiedRecoveries: 1,
      reprojectedRecoveries: 1,
      lapsedPending: 0,
      quarantinedIdentities: [],
    });
    expect(reconciled.hasActivePicoIdentityDelegation({
      ...sender,
      sodium,
      at: completedAt,
    })).toBe(true);
    reconciled.close();
  });

  it('supersedes, refuses reuse, supports same-identity veto and lapses the completion window', () => {
    const fixture = createFixture();
    const first = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_first',
      target: createDeviceKeys(),
    });
    const firstSender = recoverySender(fixture, first);
    const firstResult = fixture.store.initiatePicoHomeDeviceRecovery({
      submission: first,
      sender: firstSender,
      sodium,
      acceptedAt,
    });
    expect(firstResult.ok).toBe(true);

    const second = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_second',
      target: createDeviceKeys(),
    });
    const secondSender = recoverySender(fixture, second);
    const secondResult = fixture.store.initiatePicoHomeDeviceRecovery({
      submission: second,
      sender: secondSender,
      sodium,
      acceptedAt: '2026-07-31T10:01:00.000Z',
    });
    expect(secondResult).toMatchObject({
      ok: true,
      status: 'superseded',
      pending: { recoveryId: 'recovery_second' },
    });
    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_first',
      claimDigestHex: firstResult.ok
        ? firstResult.pending.claimDigestHex
        : '',
      sender: firstSender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    })).toEqual({ ok: false, reason: 'recovery_superseded' });
    expect(fixture.store.initiatePicoHomeDeviceRecovery({
      submission: first,
      sender: firstSender,
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'recovery_id_reused' });
    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_second',
      picoIdentityFingerprintHex: '00'.repeat(32),
      vetoedAt: acceptedAt,
    })).toEqual({ ok: false, reason: 'identity_mismatch' });
    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_second',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      vetoedAt: acceptedAt,
    })).toEqual({ ok: true });
    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_second',
      claimDigestHex: secondResult.ok
        ? secondResult.pending.claimDigestHex
        : '',
      sender: secondSender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt: '2026-08-02T11:00:00.001Z',
    })).toEqual({ ok: false, reason: 'recovery_vetoed' });

    const lapsed = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_lapsed',
      target: createDeviceKeys(),
    });
    const lapsedSender = recoverySender(fixture, lapsed);
    const lapsedResult = fixture.store.initiatePicoHomeDeviceRecovery({
      submission: lapsed,
      sender: lapsedSender,
      sodium,
      acceptedAt,
    });
    expect(lapsedResult.ok).toBe(true);
    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_lapsed',
      claimDigestHex: lapsedResult.ok
        ? lapsedResult.pending.claimDigestHex
        : '',
      sender: lapsedSender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt: postWindowAt,
    })).toEqual({ ok: false, reason: 'recovery_lapsed' });
    fixture.store.close();
  });

  it('refuses uncovered authority and target substitution, while a living lifecycle transition cancels pending', () => {
    const fixture = createFixture();
    const uncovered = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_uncovered',
      target: createDeviceKeys(),
      coverActive: false,
    });
    expect(fixture.store.initiatePicoHomeDeviceRecovery({
      submission: uncovered,
      sender: recoverySender(fixture, uncovered),
      sodium,
      acceptedAt,
    })).toEqual({
      ok: false,
      reason: 'active_delegation_not_covered',
    });

    const pending = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_cancelled',
      target: createDeviceKeys(),
    });
    expect(fixture.store.initiatePicoHomeDeviceRecovery({
      submission: pending,
      sender: {
        ...recoverySender(fixture, pending),
        delegationId: 'delegation_substituted',
      },
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'invalid_recovery' });
    const pendingResult = fixture.store.initiatePicoHomeDeviceRecovery({
      submission: pending,
      sender: recoverySender(fixture, pending),
      sodium,
      acceptedAt,
    });
    expect(pendingResult.ok).toBe(true);

    const enrollment = createEnrollment(fixture, createDeviceKeys());
    expect(fixture.store.recordPicoHomeDeviceLifecycleTransition({
      submission: enrollment,
      sponsor: fixture.sponsor,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      acceptedAt,
    })).toMatchObject({ ok: true, inserted: true });
    expect(fixture.store.picoHomeDeviceRecoveryPendingView(
      fixture.identity.fingerprintHex,
    )).toBeNull();
    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_cancelled',
      claimDigestHex: pendingResult.ok
        ? pendingResult.pending.claimDigestHex
        : '',
      sender: recoverySender(fixture, pending),
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    })).toEqual({ ok: false, reason: 'recovery_vetoed' });
    fixture.store.close();
  });

  it('does not expose recovery status to a non-target pre-authority caller', () => {
    const fixture = createFixture();
    const target = createDeviceKeys();
    const submission = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_private_status',
      target,
    });
    const sender = recoverySender(fixture, submission);
    const initiated = fixture.store.initiatePicoHomeDeviceRecovery({
      submission,
      sender,
      sodium,
      acceptedAt,
    });
    expect(initiated.ok).toBe(true);
    const completion = {
      recoveryId: submission.claim.recoveryId,
      claimDigestHex: initiated.ok
        ? initiated.pending.claimDigestHex
        : '',
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    };
    expect(fixture.store.completePicoHomeDeviceRecovery({
      ...completion,
      recoveryId: 'unknown_recovery',
      sender,
    })).toEqual({ ok: false, reason: 'recovery_unavailable' });
    expect(fixture.store.completePicoHomeDeviceRecovery({
      ...completion,
      claimDigestHex: '00'.repeat(32),
      sender,
    })).toEqual({ ok: false, reason: 'recovery_unavailable' });
    expect(fixture.store.completePicoHomeDeviceRecovery({
      ...completion,
      sender: {
        ...sender,
        deviceSigningKeyFingerprintHex: '00'.repeat(32),
      },
    })).toEqual({ ok: false, reason: 'recovery_unavailable' });
    fixture.store.close();
  });

  it('rolls back every authority projection on a completion conflict and quarantines altered receipts', () => {
    const fixture = createFixture();
    const target = createDeviceKeys();
    const submission = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_rollback',
      target,
    });
    const sender = recoverySender(fixture, submission);
    const initiated = fixture.store.initiatePicoHomeDeviceRecovery({
      submission,
      sender,
      sodium,
      acceptedAt,
    });
    expect(initiated.ok).toBe(true);
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
      sender.delegationId,
      fixture.homeId,
      'ff'.repeat(32),
      'ee'.repeat(32),
      'dd'.repeat(32),
      JSON.stringify({
        suite: picoIdentitySuite,
        keyRole: 'device_key_agreement',
        publicKeyHex: 'cc'.repeat(32),
      }),
      acceptedAt,
    );
    foreign.close();

    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: submission.claim.recoveryId,
      claimDigestHex: initiated.ok
        ? initiated.pending.claimDigestHex
        : '',
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    })).toEqual({ ok: false, reason: 'conflicting_record' });
    const inspected = new Database(fixture.databasePath, {
      readonly: true,
    });
    expect(inspected.prepare(`
      SELECT status
      FROM pico_home_device_recovery
      WHERE recovery_id = 'recovery_rollback'
    `).get()).toEqual({ status: 'pending' });
    expect(inspected.prepare(`
      SELECT COUNT(*) AS count
      FROM pico_identity_delegation
      WHERE delegation_id = 'delegation_recovery_rollback'
    `).get()).toEqual({ count: 0 });
    inspected.close();
    fixture.store.close();

    const clean = createFixture();
    const valid = createRecoverySubmission(clean, {
      recoveryId: 'recovery_corrupt',
      target: createDeviceKeys(),
    });
    const validSender = recoverySender(clean, valid);
    const validInitiated = clean.store.initiatePicoHomeDeviceRecovery({
      submission: valid,
      sender: validSender,
      sodium,
      acceptedAt,
    });
    expect(validInitiated.ok).toBe(true);
    expect(clean.store.completePicoHomeDeviceRecovery({
      recoveryId: valid.claim.recoveryId,
      claimDigestHex: validInitiated.ok
        ? validInitiated.pending.claimDigestHex
        : '',
      sender: validSender,
      hostSigningKeyRecord: clean.host.keyRecord,
      signHostReceipt: clean.host.sign,
      sodium,
      completedAt,
    }).ok).toBe(true);
    clean.store.close();
    const corrupted = new Database(clean.databasePath);
    const row = corrupted.prepare(`
      SELECT recovery_record_json AS recordJson
      FROM pico_home_device_recovery
      WHERE recovery_id = 'recovery_corrupt'
    `).get() as { recordJson: string };
    const record = JSON.parse(row.recordJson) as {
      receipt: { claimDigestHex: string };
    };
    record.receipt.claimDigestHex = '00'.repeat(32);
    corrupted.prepare(`
      UPDATE pico_home_device_recovery
      SET recovery_record_json = ?
      WHERE recovery_id = 'recovery_corrupt'
    `).run(JSON.stringify(record));
    corrupted.close();
    const quarantining = new EventStore(clean.databasePath);
    expect(quarantining.reconcilePicoHomeDeviceRecoveries(
      sodium,
      completedAt,
    )).toEqual({
      verifiedRecoveries: 0,
      reprojectedRecoveries: 0,
      lapsedPending: 0,
      quarantinedIdentities: [clean.identity.fingerprintHex],
    });
    expect(quarantining.hasActivePicoIdentityDelegation({
      ...validSender,
      sodium,
      at: completedAt,
    })).toBe(false);
    quarantining.close();
  });
});

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-device-recovery-test-'));
  tempDirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const store = new EventStore(databasePath);
  const identity = createSigningKey('pico_identity');
  const host = createSigningKey('home_host_signing');
  const sponsorSigning = createSigningKey('device_signing');
  const sponsorAgreement = createAgreementKey();
  const homeId = 'home_device_recovery';
  const founding = createFoundingRecord({
    homeId,
    identityFingerprintHex: identity.fingerprintHex,
    hostFingerprintHex: host.fingerprintHex,
  });
  store.claimPicoHome({
    homeId,
    hostAdminPicoId: `pico:identity:${identity.fingerprintHex}`,
    hostSigningKeyFingerprintHex: host.fingerprintHex,
    hostKeyAgreementKeyFingerprintHex:
      founding.founding.hostKeyAgreementKeyFingerprintHex,
    foundingRecord: founding,
  });
  const sponsorDelegation = delegation({
    delegationId: 'delegation_sponsor',
    identityFingerprintHex: identity.fingerprintHex,
    signingFingerprintHex: sponsorSigning.fingerprintHex,
    agreementFingerprintHex: sponsorAgreement.fingerprintHex,
    lifecycleOrder: 'seq:0000000000000001',
  });
  expect(store.recordPicoIdentityLifecycleEvidence({
    identityKeyRecord: identity.keyRecord,
    delegation: {
      record: sponsorDelegation,
      signatureHex: identity.sign(
        buildPicoIdentityDelegationSignatureInput(sponsorDelegation),
      ),
    },
    revocations: [],
    sodium,
    recordedAt: acceptedAt,
  })).toEqual({ ok: true });
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
    deviceKeyAgreementKeyFingerprintHex:
      sponsorAgreement.fingerprintHex,
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
  };
}

function createRecoverySubmission(
  fixture: ReturnType<typeof createFixture>,
  input: {
    recoveryId: string;
    target: ReturnType<typeof createDeviceKeys>;
    coverActive?: boolean;
  },
): PicoHomeDeviceRecoverySubmission {
  const targetDelegation = delegation({
    delegationId: `delegation_${input.recoveryId}`,
    identityFingerprintHex: fixture.identity.fingerprintHex,
    signingFingerprintHex: input.target.signing.fingerprintHex,
    agreementFingerprintHex: input.target.agreement.fingerprintHex,
    lifecycleOrder: 'seq:0000000000000002',
  });
  const revocation: PicoIdentityRevocationSignatureInput = {
    suite: picoIdentitySuite,
    revocationId:
      `revocation_${input.recoveryId}_delegation_sponsor`,
    issuerIdentityKeyFingerprintHex: fixture.identity.fingerprintHex,
    subjectKind: 'delegation',
    subjectRef: fixture.sponsor.delegationId,
    reasonCategory: 'lost_device',
    revokedAt: acceptedAt,
    lifecycleOrder: 'seq:0000000000000003',
  };
  const evidence: PicoHomeDeviceRecoverySubmission['evidence'] = {
    identityKeyRecord: fixture.identity.keyRecord,
    targetDeviceSigningKeyRecord: input.target.signing.keyRecord,
    targetDeviceKeyAgreementKeyRecord: input.target.agreement.keyRecord,
    delegation: {
      record: targetDelegation,
      signatureHex: fixture.identity.sign(
        buildPicoIdentityDelegationSignatureInput(targetDelegation),
      ),
    },
    revocations: input.coverActive === false
      ? []
      : [{
        record: revocation,
        signatureHex: fixture.identity.sign(
          buildPicoIdentityRevocationSignatureInput(revocation),
        ),
      }],
  };
  const claim: PicoHomeDeviceRecoverySubmission['claim'] = {
    suite: picoIdentitySuite,
    recoveryId: input.recoveryId,
    homeId: fixture.homeId,
    hostSigningKeyFingerprintHex: fixture.host.fingerprintHex,
    hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    targetDelegationId: targetDelegation.delegationId,
    targetDeviceSigningKeyFingerprintHex:
      input.target.signing.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      input.target.agreement.fingerprintHex,
    evidenceDigestHex:
      picoHomeDeviceRecoveryEvidenceDigestHex(sodium, evidence),
    observedLifecycleOrder: 'seq:0000000000000001',
    createdAt: '2026-07-31T09:59:00.000Z',
    expiresAt: '2026-07-31T10:04:00.000Z',
  };
  const signatureInput =
    buildPicoHomeDeviceRecoveryClaimSignatureInput(claim);
  return {
    schema: picoHomeDeviceRecoverySubmissionSchema,
    claim,
    evidence,
    rootSignatureHex: fixture.identity.sign(signatureInput),
    targetSignatureHex: input.target.signing.sign(signatureInput),
  };
}

function createRecoveryPreparation(
  fixture: ReturnType<typeof createFixture>,
  target: ReturnType<typeof createDeviceKeys>,
): PicoHomeDeviceRecoveryPreparation {
  const request = {
    suite: picoIdentitySuite,
    preparationId: 'preparation_recovery_test',
    homeId: fixture.homeId,
    hostSigningKeyFingerprintHex: fixture.host.fingerprintHex,
    hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    targetDelegationId: 'delegation_prepared_target',
    targetDeviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      target.agreement.fingerprintHex,
    createdAt: '2026-07-31T09:59:00.000Z',
    expiresAt: '2026-07-31T10:04:00.000Z',
  };
  return {
    request,
    identityKeyRecord: fixture.identity.keyRecord,
    rootSignatureHex: fixture.identity.sign(
      buildPicoHomeDeviceRecoveryPrepareSignatureInput(request),
    ),
  };
}

function recoverySender(
  fixture: ReturnType<typeof createFixture>,
  submission: PicoHomeDeviceRecoverySubmission,
): PicoHomeDeviceLifecycleSponsor {
  return {
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    deviceSigningKeyFingerprintHex:
      submission.claim.targetDeviceSigningKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex:
      submission.claim.targetDeviceKeyAgreementKeyFingerprintHex,
    delegationId: submission.claim.targetDelegationId,
  };
}

function createEnrollment(
  fixture: ReturnType<typeof createFixture>,
  target: ReturnType<typeof createDeviceKeys>,
): PicoHomeDeviceLifecycleSubmission {
  const targetDelegation = delegation({
    delegationId: 'delegation_living_transition',
    identityFingerprintHex: fixture.identity.fingerprintHex,
    signingFingerprintHex: target.signing.fingerprintHex,
    agreementFingerprintHex: target.agreement.fingerprintHex,
    lifecycleOrder: 'seq:0000000000000002',
  });
  const evidence: PicoHomeDeviceLifecycleSubmission['evidence'] = {
    transitionId: 'transition_living_cancels_recovery',
    action: 'enroll',
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    targetDelegationId: targetDelegation.delegationId,
    targetDeviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      target.agreement.fingerprintHex,
    replacedDelegationId: null,
    observedLifecycleOrder: 'seq:0000000000000001',
    identityKeyRecord: fixture.identity.keyRecord,
    targetDeviceSigningKeyRecord: target.signing.keyRecord,
    targetDeviceKeyAgreementKeyRecord: target.agreement.keyRecord,
    delegation: {
      record: targetDelegation,
      signatureHex: fixture.identity.sign(
        buildPicoIdentityDelegationSignatureInput(targetDelegation),
      ),
    },
    revocations: [],
  };
  const activation = {
    suite: picoIdentitySuite,
    activationId: evidence.transitionId,
    action: 'enroll' as const,
    homeId: fixture.homeId,
    hostSigningKeyFingerprintHex: fixture.host.fingerprintHex,
    picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
    sponsorDelegationId: fixture.sponsor.delegationId,
    sponsorDeviceSigningKeyFingerprintHex:
      fixture.sponsor.deviceSigningKeyFingerprintHex,
    sponsorDeviceKeyAgreementKeyFingerprintHex:
      fixture.sponsor.deviceKeyAgreementKeyFingerprintHex,
    targetDelegationId: targetDelegation.delegationId,
    targetDeviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
    targetDeviceKeyAgreementKeyFingerprintHex:
      target.agreement.fingerprintHex,
    lifecycleEvidenceDigestHex:
      picoHomeDeviceLifecycleEvidenceDigestHex(sodium, evidence),
    observedLifecycleOrder: evidence.observedLifecycleOrder,
    createdAt: '2026-07-31T09:59:00.000Z',
    expiresAt: '2026-07-31T10:04:00.000Z',
  };
  return {
    schema: picoHomeDeviceLifecycleSubmissionSchema,
    evidence,
    activation: {
      input: activation,
      targetSignatureHex: target.signing.sign(
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

function createSigningKey(
  keyRole: 'pico_identity' | 'device_signing' | 'home_host_signing',
) {
  const pair = sodium.crypto_sign_keypair();
  const keyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex: Buffer.from(pair.publicKey).toString('hex'),
  };
  return {
    keyRecord,
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
  return {
    keyRecord,
    fingerprintHex: fingerprint(keyRecord),
  };
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
    subjectKeyAgreementKeyFingerprintHex:
      input.agreementFingerprintHex,
    scopes: ['surface_session'],
    validFrom: '2026-07-31T09:00:00.000Z',
    validUntil: '2027-07-31T09:00:00.000Z',
    lifecycleOrder: input.lifecycleOrder,
  };
}

function createFoundingRecord(input: {
  homeId: string;
  identityFingerprintHex: string;
  hostFingerprintHex: string;
}): PicoHomeFoundingRecord {
  const foundedAt = '2026-07-31T09:00:00.000Z';
  return {
    schema: picoHomeFoundingRecordSchema,
    founding: {
      suite: picoIdentitySuite,
      foundingId: 'founding_device_recovery',
      homeId: input.homeId,
      hostSigningKeyFingerprintHex: input.hostFingerprintHex,
      hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
      homeHostPicoIdentityFingerprintHex:
        input.identityFingerprintHex,
      claimantNonceHex: 'bb'.repeat(32),
      hostNonceHex: 'cc'.repeat(32),
      foundedAt,
      lifecycleOrder: 'seq:0000000000000001',
    },
    claimantIdentityKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: 'dd'.repeat(32),
    },
    claimantFoundingSignatureHex: 'ee'.repeat(64),
    hostClaimResponse: {
      schema: picoHomeClaimResponseRecordSchema,
      claimResponse: {
        suite: picoIdentitySuite,
        claimId: 'claim_device_recovery',
        homeId: input.homeId,
        hostSigningKeyFingerprintHex: input.hostFingerprintHex,
        hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
        claimantIdentityKeyFingerprintHex:
          input.identityFingerprintHex,
        claimantNonceHex: 'bb'.repeat(32),
        hostNonceHex: 'cc'.repeat(32),
        foundingRecordId: 'founding_device_recovery',
      },
      hostSignatureHex: 'ff'.repeat(64),
    },
    hostFoundingSignatureHex: '11'.repeat(64),
    createdAt: foundedAt,
  };
}
