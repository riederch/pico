import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { openPicoHomeRecoveryAnchor } from './recovery-anchor.js';
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
import {
  createPicoTestFirstDeviceEvidence,
  type PicoTestFirstDeviceEvidence,
} from './test-first-device-evidence.js';

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

  /**
   * The prepare phase answers a root it can verify, about an identity this
   * Home may know nothing about - and the two are different questions
   * (Befund B71).
   *
   * The signature check comes first and is the whole authentication; the
   * lifecycle lookup comes after, and the code says why in that order: "a
   * random pre-authority caller therefore cannot use this phase as a
   * membership/status oracle." So a stranger's *correctly signed* preparation
   * gets past everything and then finds nothing, which is a different refusal
   * from a forged one. Nothing had ever been through it.
   */
  it('refuses a correctly signed preparation for an identity it does not know', () => {
    const fixture = createFixture();
    const stranger = createSigningKey('pico_identity');
    const target = createDeviceKeys();
    const request = {
      suite: picoIdentitySuite,
      preparationId: 'preparation_from_a_stranger',
      homeId: fixture.homeId,
      hostSigningKeyFingerprintHex: fixture.host.fingerprintHex,
      hostKeyAgreementKeyFingerprintHex: 'aa'.repeat(32),
      picoIdentityFingerprintHex: stranger.fingerprintHex,
      targetDelegationId: 'delegation_stranger_target',
      targetDeviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
      targetDeviceKeyAgreementKeyFingerprintHex: target.agreement.fingerprintHex,
      createdAt: '2026-07-31T09:59:00.000Z',
      expiresAt: '2026-07-31T10:04:00.000Z',
    };
    expect(fixture.store.preparePicoHomeDeviceRecovery({
      preparation: {
        request,
        identityKeyRecord: stranger.keyRecord,
        rootSignatureHex: stranger.sign(
          buildPicoHomeDeviceRecoveryPrepareSignatureInput(request),
        ),
      },
      sender: {
        picoIdentityFingerprintHex: stranger.fingerprintHex,
        deviceSigningKeyFingerprintHex: target.signing.fingerprintHex,
        deviceKeyAgreementKeyFingerprintHex: target.agreement.fingerprintHex,
        delegationId: request.targetDelegationId,
      },
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'recovery_prepare_unavailable' });
    fixture.store.close();
  });

  /**
   * Eine volle Platte ist keine Antwort an die Person (Befund B72).
   *
   * `conflicting_record` heisst in ADR 0110s Sprache: jemand war schneller,
   * oder dieselbe Kennung wurde zweimal benutzt. Das ist etwas ueber die Lage
   * der Person. Ein Schreibfehler der Datenbank ist etwas ueber das Geraet,
   * und wer ihn als `conflicting_record` ausgibt, schickt jemanden, der gerade
   * kein Geraet mehr hat, in die falsche Richtung - warten statt nachsehen.
   *
   * Der Geraetelebenszyklus unterschied das schon und warf alles weiter, was
   * keine Eindeutigkeitsverletzung ist; die Wiederherstellung tat es nicht.
   * Hier fehlt die Tabelle, was genau kein Konflikt ist.
   */
  it('throws instead of calling a broken database a conflicting record', () => {
    const fixture = createFixture();
    const submission = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_no_table',
      target: createDeviceKeys(),
    });
    const sender = recoverySender(fixture, submission);

    // Der Fehler muss *im* Schreibblock entstehen und nicht davor: ein
    // Auslöser auf INSERT lässt jedes Lesen unberührt und bricht genau die
    // Transaktion ab, um die es geht. Ein erster Anlauf liess statt dessen
    // die Tabelle verschwinden - da warf schon das Lesen, und der Test wäre
    // grün gewesen, ohne den Fang je erreicht zu haben.
    const surgery = new Database(fixture.databasePath);
    surgery.exec(`
      CREATE TRIGGER pico_test_disk_full
      BEFORE INSERT ON pico_home_device_recovery
      BEGIN SELECT RAISE(ABORT, 'database or disk is full'); END
    `);
    surgery.close();

    expect(() => fixture.store.initiatePicoHomeDeviceRecovery({
      submission,
      sender,
      sodium,
      acceptedAt,
    })).toThrow(/database or disk is full/u);
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

    const reopened = new EventStore(fixture.databasePath, {
      recoveryAnchor: reopenAnchor(fixture.anchorPath),
    });
    expect(reopened.reconcilePicoHomeDeviceRecoveries(
      sodium,
      '2026-08-01T10:00:00.000Z',
    )).toEqual({
      verifiedRecoveries: 0,
      reprojectedRecoveries: 0,
      lapsedPending: 0,
      quarantinedIdentities: [],
      anchorStatus: 'live',
      resurrectedRecoveryIds: [],
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

    const reconciled = new EventStore(fixture.databasePath, {
      recoveryAnchor: reopenAnchor(fixture.anchorPath),
    });
    expect(reconciled.reconcilePicoHomeDeviceRecoveries(
      sodium,
      completedAt,
    )).toEqual({
      verifiedRecoveries: 1,
      reprojectedRecoveries: 1,
      lapsedPending: 0,
      quarantinedIdentities: [],
      anchorStatus: 'live',
      resurrectedRecoveryIds: [],
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

  /**
   * ADR 0110's veto, and the three answers it gives (Befund B71).
   *
   * Nothing named `recovery_not_found` or `recovery_not_pending` before this:
   * both are refusals a running Home returns through
   * `home.device.recovery.veto`, and no test had ever been through either.
   *
   * **What walking them shows, stated rather than fixed here.** The completion
   * path one screen up collapses unknown id, wrong digest and wrong target
   * into a single `recovery_unavailable`, and says why: "no caller may turn a
   * learned recovery id into a status oracle." The veto path distinguishes -
   * an id nobody knows, an id belonging to somebody else, and an id that is
   * already resolved are three different sentences.
   *
   * The two are not the same question: completion answers a pre-authority
   * caller, the veto answers a principal whose identity the Home has already
   * proven, and it is that principal's own fingerprint that goes in. The
   * difference is nevertheless undecided rather than decided - ADR 0110 says
   * nothing about it - so this test pins what the Home does today instead of
   * quietly making it agree with its neighbour.
   */
  it('answers an unknown, a foreign and an already resolved veto apart', () => {
    const fixture = createFixture();
    const submission = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_veto_answers',
      target: createDeviceKeys(),
    });
    expect(fixture.store.initiatePicoHomeDeviceRecovery({
      submission,
      sender: recoverySender(fixture, submission),
      sodium,
      acceptedAt,
    }).ok).toBe(true);

    // An id this Home has never seen.
    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_nobody_has',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      vetoedAt: acceptedAt,
    })).toEqual({ ok: false, reason: 'recovery_not_found' });

    // An id this Home has, under somebody else's identity.
    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_veto_answers',
      picoIdentityFingerprintHex: '11'.repeat(32),
      vetoedAt: acceptedAt,
    })).toEqual({ ok: false, reason: 'identity_mismatch' });

    // The veto itself, and then the same veto again: a recovery leaves
    // `pending` exactly once, so the second attempt is not a second veto.
    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_veto_answers',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      vetoedAt: acceptedAt,
    })).toEqual({ ok: true });
    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_veto_answers',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      vetoedAt: acceptedAt,
    })).toEqual({ ok: false, reason: 'recovery_not_pending' });
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
    const quarantining = new EventStore(clean.databasePath, {
      recoveryAnchor: reopenAnchor(clean.anchorPath),
    });
    expect(quarantining.reconcilePicoHomeDeviceRecoveries(
      sodium,
      completedAt,
    )).toEqual({
      verifiedRecoveries: 0,
      reprojectedRecoveries: 0,
      lapsedPending: 0,
      quarantinedIdentities: [clean.identity.fingerprintHex],
      anchorStatus: 'live',
      resurrectedRecoveryIds: [],
    });
    expect(quarantining.hasActivePicoIdentityDelegation({
      ...validSender,
      sodium,
      at: completedAt,
    })).toBe(false);
    quarantining.close();
  });
});

/**
 * ADR 0110 A9 drops anchor entries whose completion window has passed, and it
 * measures that against the anchor's *own* clock. An anchor opened without one
 * borrows the machine's, and every entry this file creates expires at
 * `postWindowAt` - so on 2026-08-09T10:00Z these tests began failing with no
 * line of the tree having changed, because real time had walked past the
 * fixture horizon and the reopened anchors pruned their own evidence.
 *
 * Moving the dates forward would only re-arm that. A reopened anchor states
 * the moment it models instead, exactly as `createFixture` already does for
 * the first one. Nothing in this file may take the ambient clock.
 */
function reopenAnchor(
  anchorPath: string,
  at: string = completedAt,
): ReturnType<typeof openPicoHomeRecoveryAnchor> {
  return openPicoHomeRecoveryAnchor(anchorPath, { now: () => new Date(at) });
}

function createFixture(options: {
  databasePath?: string;
  anchorPath?: string;
  anchorNow?: () => Date;
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pico-device-recovery-test-'));
  tempDirs.push(dir);
  const databasePath = options.databasePath ?? join(dir, 'pico.sqlite');
  const anchorPath = options.anchorPath ?? join(dir, 'recovery-anchor', 'anchor.json');
  // ADR 0120 N2. The veto delay is an objection window, so completion needs a
  // durable floor as well as a wall clock, and the floor rises only with time
  // the Home actually observed. These tests model a Home that was running
  // through the window; one that needs to observe more calls
  // `advanceObservedTime`. A test that wants the opposite - a wound-forward
  // wall clock over an unmoved floor - builds its own anchor.
  let observedMonotonicMs = 0;
  const store = new EventStore(databasePath, {
    recoveryAnchor: openPicoHomeRecoveryAnchor(anchorPath, {
      now: options.anchorNow ?? (() => new Date(completedAt)),
      monotonicNowMs: () => observedMonotonicMs,
    }),
  });
  const advanceObservedTime = (milliseconds: number): void => {
    observedMonotonicMs += milliseconds;
  };
  const identity = createSigningKey('pico_identity');
  const host = createSigningKey('home_host_signing');
  const sponsorSigning = createSigningKey('device_signing');
  const sponsorAgreement = createAgreementKey();
  const homeId = 'home_device_recovery';
  const sponsorEvidence = createPicoTestFirstDeviceEvidence({
    sodium,
    claimantIdentityPrivateKey: identity.privateKey,
    claimantIdentityKeyFingerprintHex: identity.fingerprintHex,
    signingKeyRecord: sponsorSigning.keyRecord,
    keyAgreementKeyRecord: sponsorAgreement.keyRecord,
    delegationId: 'delegation_sponsor',
    validFrom: '2026-07-31T09:00:00.000Z',
    validUntil: '2027-07-31T09:00:00.000Z',
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
    hostKeyAgreementKeyFingerprintHex:
      founding.founding.hostKeyAgreementKeyFingerprintHex,
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
    deviceKeyAgreementKeyFingerprintHex:
      sponsorAgreement.fingerprintHex,
    delegationId: sponsorDelegation.delegationId,
  };
  return {
    databasePath,
    anchorPath,
    store,
    advanceObservedTime,
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
    /** Set when a recovery follows an earlier one and the head has moved. */
    revokesDelegationId?: string;
    delegationLifecycleOrder?: string;
    revocationLifecycleOrder?: string;
    observedLifecycleOrder?: string;
    createdAt?: string;
    expiresAt?: string;
  },
): PicoHomeDeviceRecoverySubmission {
  const targetDelegation = delegation({
    delegationId: `delegation_${input.recoveryId}`,
    identityFingerprintHex: fixture.identity.fingerprintHex,
    signingFingerprintHex: input.target.signing.fingerprintHex,
    agreementFingerprintHex: input.target.agreement.fingerprintHex,
    lifecycleOrder: input.delegationLifecycleOrder ?? 'seq:0000000000000002',
  });
  const revocation: PicoIdentityRevocationSignatureInput = {
    suite: picoIdentitySuite,
    revocationId:
      `revocation_${input.recoveryId}_delegation_sponsor`,
    issuerIdentityKeyFingerprintHex: fixture.identity.fingerprintHex,
    subjectKind: 'delegation',
    subjectRef: input.revokesDelegationId ?? fixture.sponsor.delegationId,
    reasonCategory: 'lost_device',
    revokedAt: acceptedAt,
    lifecycleOrder: input.revocationLifecycleOrder ?? 'seq:0000000000000003',
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
    observedLifecycleOrder: input.observedLifecycleOrder ?? 'seq:0000000000000001',
    createdAt: input.createdAt ?? '2026-07-31T09:59:00.000Z',
    expiresAt: input.expiresAt ?? '2026-07-31T10:04:00.000Z',
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
  identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  evidence: PicoTestFirstDeviceEvidence;
  hostFingerprintHex: string;
}): PicoHomeFoundingRecord {
  const foundedAt = '2026-07-31T09:00:00.000Z';
  const { evidence } = input;
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
      ...evidence.foundingFields,
    },
    firstDeviceSigningKeyRecord: evidence.firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord: evidence.firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation: evidence.firstDeviceDelegation,
    firstDeviceRevocations: evidence.firstDeviceRevocations,
    claimantIdentityKeyRecord: input.identityKeyRecord,
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

/**
 * ADR 0110 R6. The attack these prove: a Foundation backup taken while a
 * recovery was still pending is restored after that recovery was resolved.
 * Every in-database defence is restored with it, so the rollback is done at
 * the file level - copy the SQLite files, act, copy them back - exactly the
 * way a Supervisor restore or a `cp -a` would.
 */
describe('ADR 0110 R6 restore-proof consumption anchor', () => {
  function snapshotDatabase(fixture: ReturnType<typeof createFixture>): () => void {
    const sources = [
      fixture.databasePath,
      `${fixture.databasePath}-wal`,
      `${fixture.databasePath}-shm`,
    ];
    const captured = sources.map((path) => ({
      path,
      bytes: existsSync(path) ? readFileSync(path) : undefined,
    }));
    return () => {
      for (const entry of captured) {
        if (entry.bytes === undefined) {
          rmSync(entry.path, { force: true });
        } else {
          writeFileSync(entry.path, entry.bytes);
        }
      }
    };
  }

  function reopen(fixture: ReturnType<typeof createFixture>): EventStore {
    return new EventStore(fixture.databasePath, {
      recoveryAnchor: reopenAnchor(fixture.anchorPath),
    });
  }

  function acceptRecovery(
    fixture: ReturnType<typeof createFixture>,
    recoveryId: string,
    options: {
      acceptedAt?: string;
      submission?: Partial<Parameters<typeof createRecoverySubmission>[1]>;
    } = {},
  ): {
    claimDigestHex: string;
    sender: PicoHomeDeviceLifecycleSponsor;
    target: ReturnType<typeof createDeviceKeys>;
  } {
    const target = createDeviceKeys();
    const submission = createRecoverySubmission(fixture, {
      recoveryId,
      target,
      ...options.submission,
    });
    const sender = recoverySender(fixture, submission);
    const initiated = fixture.store.initiatePicoHomeDeviceRecovery({
      submission,
      sender,
      sodium,
      acceptedAt: options.acceptedAt ?? acceptedAt,
    });
    if (!initiated.ok) {
      throw new Error(`accept_failed:${initiated.reason}`);
    }
    return { claimDigestHex: initiated.pending.claimDigestHex, sender, target };
  }

  it('refuses to let a restored snapshot resurrect and re-consume a spent recovery', () => {
    const fixture = createFixture();
    const { claimDigestHex, sender } = acceptRecovery(fixture, 'recovery_r6_consumed');

    // The attacker's copy: taken while the recovery is still pending.
    const restorePreConsumption = snapshotDatabase(fixture);

    const completed = fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_consumed',
      claimDigestHex,
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    });
    expect(completed.ok).toBe(true);
    fixture.store.close();

    // Roll the Foundation data back underneath the anchor.
    restorePreConsumption();
    const rolledBack = reopen(fixture);
    const reconciliation = rolledBack.reconcilePicoHomeDeviceRecoveries(sodium, completedAt);
    expect(reconciliation.anchorStatus).toBe('rollback_detected');
    expect(reconciliation.resurrectedRecoveryIds).toEqual(['recovery_r6_consumed']);
    expect(reconciliation.quarantinedIdentities)
      .toEqual([fixture.identity.fingerprintHex]);

    // The restored row is back to its resolved state and the spent root
    // authorization cannot be replayed a second time.
    expect(rolledBack.picoHomeDeviceRecoveryPendingView(
      fixture.identity.fingerprintHex,
    )).toBeNull();
    expect(rolledBack.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_consumed',
      claimDigestHex,
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    })).toEqual({ ok: false, reason: 'recovery_consumed' });
    rolledBack.close();
  });

  it('refuses to let a restored snapshot undo a veto', () => {
    const fixture = createFixture();
    const { claimDigestHex, sender } = acceptRecovery(fixture, 'recovery_r6_vetoed');
    const restorePreVeto = snapshotDatabase(fixture);

    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_vetoed',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      vetoedAt: '2026-07-31T12:00:00.000Z',
    })).toEqual({ ok: true });
    fixture.store.close();

    restorePreVeto();
    const rolledBack = reopen(fixture);
    expect(rolledBack.reconcilePicoHomeDeviceRecoveries(sodium, completedAt).anchorStatus)
      .toBe('rollback_detected');
    expect(rolledBack.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_vetoed',
      claimDigestHex,
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    })).toEqual({ ok: false, reason: 'recovery_vetoed' });
    rolledBack.close();
  });

  it('fails closed when the anchor is lost, and a re-seed restores service without reviving anything', () => {
    const fixture = createFixture();
    const { claimDigestHex, sender } = acceptRecovery(fixture, 'recovery_r6_lost');
    fixture.store.close();

    // A restore that wiped the excluded directory: rows have history, the
    // anchor does not. That is indistinguishable from a rollback.
    rmSync(dirname(fixture.anchorPath), { recursive: true, force: true });
    const withoutAnchor = reopen(fixture);
    const lost = withoutAnchor.reconcilePicoHomeDeviceRecoveries(sodium, completedAt);
    expect(lost.anchorStatus).toBe('anchor_lost');
    expect(withoutAnchor.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_lost',
      claimDigestHex,
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    })).toEqual({ ok: false, reason: 'recovery_anchor_unavailable' });

    // The explicit operator re-seed brings the Home back into service - and
    // deliberately does not bless the pending recovery it found.
    expect(withoutAnchor.reseedPicoHomeRecoveryAnchor())
      .toEqual({ ok: true, seededEntries: 0 });
    expect(withoutAnchor.reseedPicoHomeRecoveryAnchor())
      .toEqual({ ok: false, seededEntries: 0, reason: 'anchor_not_empty' });
    expect(withoutAnchor.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_lost',
      claimDigestHex,
      sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    })).toEqual({ ok: false, reason: 'recovery_anchor_unavailable' });
    withoutAnchor.close();
  });

  it('seeds a fresh Home silently and refuses every recovery decision without an anchor', () => {
    const fixture = createFixture();
    fixture.store.close();
    rmSync(dirname(fixture.anchorPath), { recursive: true, force: true });

    const fresh = reopen(fixture);
    expect(fresh.reconcilePicoHomeDeviceRecoveries(sodium, acceptedAt))
      .toMatchObject({ anchorStatus: 'seeded', resurrectedRecoveryIds: [] });
    // Seeded, so a normal installation notices nothing on the next boot.
    expect(fresh.reconcilePicoHomeDeviceRecoveries(sodium, acceptedAt).anchorStatus)
      .toBe('live');
    fresh.close();

    // A store built without an anchor at all must never quietly permit what
    // the anchor exists to refuse.
    const anchorless = new EventStore(fixture.databasePath);
    const target = createDeviceKeys();
    const submission = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_r6_anchorless',
      target,
    });
    expect(anchorless.initiatePicoHomeDeviceRecovery({
      submission,
      sender: recoverySender(fixture, submission),
      sodium,
      acceptedAt,
    })).toEqual({ ok: false, reason: 'recovery_anchor_unavailable' });
    expect(anchorless.reconcilePicoHomeDeviceRecoveries(sodium, acceptedAt).anchorStatus)
      .toBe('absent');
    // Re-seeding is the repair for a *lost* anchor, so on a store that has
    // none at all it must say so rather than report a successful seeding of
    // nothing. Nothing had been through this refusal before (Befund B71).
    expect(anchorless.reseedPicoHomeRecoveryAnchor())
      .toEqual({ ok: false, seededEntries: 0, reason: 'anchor_absent' });
    anchorless.close();
  });

  it('clears the projection of an identity whose consumed recovery the rollback erased', () => {
    const fixture = createFixture();
    // A first recovery completes, so the database really carries projected
    // device authority - the state a restore would otherwise leave standing.
    const first = acceptRecovery(fixture, 'recovery_r6_first');
    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_first',
      claimDigestHex: first.claimDigestHex,
      sender: first.sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt,
    }).ok).toBe(true);
    const projected = new Database(fixture.databasePath)
      .prepare('SELECT delegation_id FROM pico_identity_delegation')
      .all() as { delegation_id: string }[];
    expect(projected.map((row) => row.delegation_id))
      .toContain('delegation_recovery_r6_first');

    // The backup an operator would restore: taken between the two recoveries.
    const restoreBetween = snapshotDatabase(fixture);

    const second = acceptRecovery(fixture, 'recovery_r6_second', {
      acceptedAt: '2026-08-02T11:00:00.000Z',
      submission: {
        revokesDelegationId: 'delegation_recovery_r6_first',
        delegationLifecycleOrder: 'seq:0000000000000004',
        revocationLifecycleOrder: 'seq:0000000000000005',
        observedLifecycleOrder: 'seq:0000000000000003',
        createdAt: '2026-08-02T10:59:00.000Z',
        expiresAt: '2026-08-02T11:04:00.000Z',
      },
    });
    // Two more days pass with the Home running, so its floor reaches the
    // second recovery's window end.
    fixture.advanceObservedTime(49 * 60 * 60 * 1_000);
    expect(fixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_second',
      claimDigestHex: second.claimDigestHex,
      sender: second.sender,
      hostSigningKeyRecord: fixture.host.keyRecord,
      signHostReceipt: fixture.host.sign,
      sodium,
      completedAt: '2026-08-04T11:00:00.000Z',
    }).ok).toBe(true);
    fixture.store.close();

    // Restoring rewinds past the second recovery's very existence: its row is
    // gone, so nothing in the database can be corrected - only the anchor
    // still knows it happened.
    restoreBetween();
    const rolledBack = reopen(fixture);
    const reconciliation = rolledBack.reconcilePicoHomeDeviceRecoveries(
      sodium,
      '2026-08-04T12:00:00.000Z',
    );
    expect(reconciliation).toMatchObject({
      anchorStatus: 'rollback_detected',
      resurrectedRecoveryIds: ['recovery_r6_second'],
      quarantinedIdentities: [fixture.identity.fingerprintHex],
    });
    // Quarantine has to mean something: this Home is showing a device set it
    // can no longer prove, so the projection goes rather than being reported
    // as quarantined while staying live.
    expect(new Database(fixture.databasePath)
      .prepare('SELECT delegation_id FROM pico_identity_delegation')
      .all()).toEqual([]);
    expect(rolledBack.hasActivePicoIdentityDelegation({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      deviceSigningKeyFingerprintHex: first.target.signing.fingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: first.target.agreement.fingerprintHex,
      delegationId: 'delegation_recovery_r6_first',
      sodium,
      at: '2026-08-04T12:00:00.000Z',
    })).toBe(false);
    rolledBack.close();
  });

  it('restores a rolled-back veto without quarantining an identity that never lost authority', () => {
    const fixture = createFixture();
    acceptRecovery(fixture, 'recovery_r6_veto_scope');
    const restorePreVeto = snapshotDatabase(fixture);
    expect(fixture.store.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_veto_scope',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      vetoedAt: '2026-07-31T12:00:00.000Z',
    })).toEqual({ ok: true });
    fixture.store.close();

    restorePreVeto();
    const rolledBack = reopen(fixture);
    expect(rolledBack.reconcilePicoHomeDeviceRecoveries(sodium, completedAt))
      .toMatchObject({
        anchorStatus: 'rollback_detected',
        resurrectedRecoveryIds: ['recovery_r6_veto_scope'],
        quarantinedIdentities: [],
      });
    // The sponsor device never lost its authority: a veto changes no device
    // set, so an operator's restore must not cost the identity its projection.
    expect(rolledBack.hasActivePicoIdentityDelegation({
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      deviceSigningKeyFingerprintHex: fixture.sponsorSigning.fingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: fixture.sponsorAgreement.fingerprintHex,
      delegationId: 'delegation_sponsor',
      sodium,
      at: completedAt,
    })).toBe(true);
    rolledBack.close();
  });

  it('lets a re-seeded Home veto and re-initiate the recovery its anchor never saw', () => {
    const fixture = createFixture();
    acceptRecovery(fixture, 'recovery_r6_reseed_flow');
    fixture.store.close();
    rmSync(dirname(fixture.anchorPath), { recursive: true, force: true });

    const reseeded = reopen(fixture);
    expect(reseeded.reconcilePicoHomeDeviceRecoveries(sodium, acceptedAt).anchorStatus)
      .toBe('anchor_lost');
    expect(reseeded.reseedPicoHomeRecoveryAnchor()).toEqual({ ok: true, seededEntries: 0 });

    // The living device can silence the alarm it is being shown, even though
    // the re-seed deliberately left that recovery unknown to the anchor.
    expect(reseeded.vetoPicoHomeDeviceRecovery({
      recoveryId: 'recovery_r6_reseed_flow',
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      vetoedAt: '2026-07-31T12:00:00.000Z',
    })).toEqual({ ok: true });
    reseeded.close();

    // And a fresh recovery is possible without waiting out the old window -
    // this is the person who lost every device, so a lockout here would
    // defeat the feature.
    const revived = reopen(fixture);
    const second = createDeviceKeys();
    const submission = createRecoverySubmission(fixture, {
      recoveryId: 'recovery_r6_reseed_second',
      target: second,
    });
    const initiated = revived.initiatePicoHomeDeviceRecovery({
      submission,
      sender: recoverySender(fixture, submission),
      sodium,
      acceptedAt,
    });
    expect(initiated).toMatchObject({ ok: true, status: 'pending' });
    revived.close();
  });

  it('prunes anchor entries once their completion window has passed (ADR 0110 A9)', () => {
    const fixture = createFixture();
    acceptRecovery(fixture, 'recovery_r6_pruned');
    fixture.store.close();

    // Still inside the window: the entry is load-bearing and stays.
    const live = openPicoHomeRecoveryAnchor(fixture.anchorPath, {
      now: () => new Date(completedAt),
    });
    expect(live.lookup('recovery_r6_pruned')?.state).toBe('accepted');

    // Past the window a restored row lapses on the Home clock anyway, so
    // keeping the entry would only grow an unbounded file.
    const afterWindow = openPicoHomeRecoveryAnchor(fixture.anchorPath, {
      now: () => new Date('2026-08-09T10:00:00.001Z'),
    });
    expect(afterWindow.lookup('recovery_r6_pruned')).toBeUndefined();
    // The counter never rewinds, so a pruned id can never be re-accepted
    // under an older sequence.
    expect(afterWindow.document().sequence).toBe(1);
    // And a Home that simply had no recovery for nine days must not read as
    // an anchor-less one: pruning may not turn quiet into fail-closed.
    expect(afterWindow.isEmpty()).toBe(false);
    const quiet = new EventStore(fixture.databasePath, {
      recoveryAnchor: afterWindow,
    });
    expect(quiet.reconcilePicoHomeDeviceRecoveries(
      sodium,
      '2026-08-09T10:00:00.001Z',
    ).anchorStatus).toBe('live');
    quiet.close();
  });

  it('refuses a veto delay retired by winding the wall clock forward (ADR 0120 N2)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-device-recovery-wound-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');
    const anchorPath = join(dir, 'recovery-anchor', 'anchor.json');
    // The Home observes no time at all after accepting: its floor stays at
    // acceptance, which is the state an attacker creates by rebooting with a
    // clock set two days ahead.
    const woundFixture = createFixture({
      databasePath,
      anchorPath,
      anchorNow: () => new Date(acceptedAt),
    });
    const accepted = acceptRecovery(woundFixture, 'recovery_wound_clock');

    const refused = woundFixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_wound_clock',
      claimDigestHex: accepted.claimDigestHex,
      sender: accepted.sender,
      hostSigningKeyRecord: woundFixture.host.keyRecord,
      signHostReceipt: woundFixture.host.sign,
      sodium,
      // The wall clock says the 48 hours are long gone.
      completedAt: '2027-01-01T00:00:00.000Z',
    });
    expect(refused).toEqual({ ok: false, reason: 'recovery_not_effective' });

    // The same completion succeeds once the Home has actually observed the
    // window - the rule delays the recovery, it does not break it.
    woundFixture.advanceObservedTime(49 * 60 * 60 * 1_000);
    expect(woundFixture.store.completePicoHomeDeviceRecovery({
      recoveryId: 'recovery_wound_clock',
      claimDigestHex: accepted.claimDigestHex,
      sender: accepted.sender,
      hostSigningKeyRecord: woundFixture.host.keyRecord,
      signHostReceipt: woundFixture.host.sign,
      sodium,
      completedAt: completedAt,
    }).ok).toBe(true);
    woundFixture.store.close();
  });

  it('advances the high-water floor only by observed time (ADR 0120 N2/N3)', () => {
    const fixture = createFixture();
    let monotonicMs = 1_000;
    const anchor = openPicoHomeRecoveryAnchor(fixture.anchorPath, {
      now: () => new Date(acceptedAt),
      monotonicNowMs: () => monotonicMs,
    });

    // An anchor that never took ownership has no floor, and absence refuses.
    expect(anchor.highWaterInstant()).toBeNull();

    anchor.record({
      recoveryId: 'recovery_floor_0001',
      claimDigestHex: 'ab'.repeat(32),
      picoIdentityFingerprintHex: 'cd'.repeat(32),
      state: 'accepted',
      expiresAt: '2026-08-09T10:00:00.000Z',
    });
    // Taking ownership bootstraps the floor from the wall clock exactly once.
    expect(anchor.highWaterInstant()).toBe(acceptedAt);

    // Observed time raises it, and nothing else does.
    monotonicMs += 6 * 60 * 60 * 1_000;
    expect(Date.parse(anchor.highWaterInstant()!))
      .toBe(Date.parse(acceptedAt) + 6 * 60 * 60 * 1_000);
    anchor.observe();

    // The attack: a wall clock wound a year forward. The floor is unmoved,
    // because a claim is not observed time.
    const wound = openPicoHomeRecoveryAnchor(fixture.anchorPath, {
      now: () => new Date('2027-08-01T10:00:00.000Z'),
      monotonicNowMs: () => 0,
    });
    expect(Date.parse(wound.highWaterInstant()!))
      .toBe(Date.parse(acceptedAt) + 6 * 60 * 60 * 1_000);

    // And it never rewinds: a reopen with an earlier wall clock keeps it.
    wound.record({
      recoveryId: 'recovery_floor_0001',
      claimDigestHex: 'ab'.repeat(32),
      picoIdentityFingerprintHex: 'cd'.repeat(32),
      state: 'consumed',
      expiresAt: '2026-08-09T10:00:00.000Z',
    });
    const reopened = openPicoHomeRecoveryAnchor(fixture.anchorPath, {
      now: () => new Date('2020-01-01T00:00:00.000Z'),
      monotonicNowMs: () => 0,
    });
    expect(Date.parse(reopened.highWaterInstant()!))
      .toBeGreaterThanOrEqual(Date.parse(acceptedAt) + 6 * 60 * 60 * 1_000);

    fixture.store.close();
  });

  it('refuses an unreadable floor rather than reading it as no floor', () => {
    const fixture = createFixture();
    const anchor = openPicoHomeRecoveryAnchor(fixture.anchorPath, {
      now: () => new Date(acceptedAt),
    });
    anchor.record({
      recoveryId: 'recovery_floor_0002',
      claimDigestHex: 'ab'.repeat(32),
      picoIdentityFingerprintHex: 'cd'.repeat(32),
      state: 'accepted',
      expiresAt: '2026-08-09T10:00:00.000Z',
    });

    const document = JSON.parse(readFileSync(fixture.anchorPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(
      fixture.anchorPath,
      JSON.stringify({ ...document, highWaterAt: 'not-an-instant' }),
    );
    // Collapsing this into "no floor" would open every objection window the
    // anchor exists to hold shut.
    expect(() => reopenAnchor(fixture.anchorPath))
      .toThrow('unreadable_recovery_anchor');
    fixture.store.close();
  });

  it('keeps the anchor monotonic: terminal states never walk back and a torn anchor fails closed', () => {
    const fixture = createFixture();
    acceptRecovery(fixture, 'recovery_r6_monotonic');
    fixture.store.close();

    const anchor = reopenAnchor(fixture.anchorPath);
    const entry = anchor.lookup('recovery_r6_monotonic');
    expect(entry?.state).toBe('accepted');
    anchor.record({
      recoveryId: 'recovery_r6_monotonic',
      claimDigestHex: entry!.claimDigestHex,
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      state: 'consumed',
      expiresAt: entry!.expiresAt,
    });
    // Terminal is terminal: no rewind, no swap, no second resolution.
    for (const state of ['accepted', 'vetoed', 'superseded'] as const) {
      expect(() => anchor.record({
        recoveryId: 'recovery_r6_monotonic',
        claimDigestHex: entry!.claimDigestHex,
        picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
        state,
        expiresAt: entry!.expiresAt,
      })).toThrow(/terminal|already_accepted/);
    }
    // A different claim digest under a known id is a substitution attempt.
    expect(() => anchor.record({
      recoveryId: 'recovery_r6_monotonic',
      claimDigestHex: 'ff'.repeat(32),
      picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
      state: 'consumed',
      expiresAt: entry!.expiresAt,
    })).toThrow('recovery_anchor_claim_digest_conflict');

    writeFileSync(fixture.anchorPath, '{"schema":"pico.home.recovery-anchor.v1"');
    expect(() => reopenAnchor(fixture.anchorPath))
      .toThrow('unreadable_recovery_anchor');
  });

  it('refuses an anchor that is there and cannot be read, rather than reading it as none', () => {
    const fixture = createFixture();
    fixture.store.close();
    rmSync(fixture.anchorPath, { force: true });

    /**
     * Ein Verzeichnis statt einer Datei, weil das unabhaengig von Rechten
     * fehlschlaegt - `chmod 000` sagt einem Prozess mit genug Rechten nichts,
     * und ein Test, der als root leise gruen wird, prueft nichts (Befund B73).
     * EISDIR ist derselbe Fall wie EACCES oder EIO: der Anker ist da und
     * schweigt.
     */
    mkdirSync(fixture.anchorPath, { recursive: true });
    expect(() => reopenAnchor(fixture.anchorPath))
      .toThrow('unreadable_recovery_anchor');

    // Und der Fall, der wirklich ein leerer Anker ist, bleibt einer: kein
    // Anker da, frisches Home, kein Aufheulen.
    rmSync(fixture.anchorPath, { recursive: true, force: true });
    expect(() => reopenAnchor(fixture.anchorPath)).not.toThrow();
  });

  it('reports a failed flush instead of claiming a durability it did not get', () => {
    const fixture = createFixture();
    fixture.store.close();
    const anchor = reopenAnchor(fixture.anchorPath);
    // Durability is the entire point of this file, so a flush that cannot
    // happen must surface as a refusal rather than a silent success - the
    // rule the ADR 0090 reader-sync store already follows.
    chmodSync(dirname(fixture.anchorPath), 0o500);
    try {
      expect(() => anchor.record({
        recoveryId: 'recovery_r6_fsync',
        claimDigestHex: 'aa'.repeat(32),
        picoIdentityFingerprintHex: fixture.identity.fingerprintHex,
        state: 'accepted',
        expiresAt: '2099-01-01T00:00:00.000Z',
      })).toThrow();
      expect(anchor.lookup('recovery_r6_fsync')).toBeUndefined();
    } finally {
      chmodSync(dirname(fixture.anchorPath), 0o700);
    }
  });
});
