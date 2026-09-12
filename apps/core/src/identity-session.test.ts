import {
  buildPicoIdentityDelegationSignatureInput,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityPossessionSignatureInput,
  buildPicoIdentityRevocationSignatureInput,
  picoIdentitySuite,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  type PicoIdentityRevocationSignatureInput,
} from '@pico/protocol';
import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IdentitySessionChallengeStore,
  verifyIdentitySessionProof,
  type IdentitySessionChallenge,
  type IdentitySessionProof,
} from './identity-session.js';
import { EventStore } from './event-store.js';

let identity: { publicKey: Uint8Array; privateKey: Uint8Array };
let device: { publicKey: Uint8Array; privateKey: Uint8Array };
let deviceAgreement: { publicKey: Uint8Array; privateKey: Uint8Array };
let identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
let deviceKeyRecord: PicoIdentityKeyRecordSignatureInput;
let deviceAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
let identityFingerprint: string;
let deviceFingerprint: string;
let deviceAgreementFingerprint: string;

beforeAll(async () => {
  await sodium.ready;
  identity = sodium.crypto_sign_keypair();
  device = sodium.crypto_sign_keypair();
  deviceAgreement = sodium.crypto_box_keypair();
  identityKeyRecord = keyRecord('pico_identity', identity.publicKey);
  deviceKeyRecord = keyRecord('device_signing', device.publicKey);
  deviceAgreementKeyRecord = keyRecord('device_key_agreement', deviceAgreement.publicKey);
  identityFingerprint = fingerprint(identityKeyRecord);
  deviceFingerprint = fingerprint(deviceKeyRecord);
  deviceAgreementFingerprint = fingerprint(deviceAgreementKeyRecord);
});

describe('identity-bound Foundation sessions (ADR 0082)', () => {
  it('issues bounded one-use instance-bound challenges', () => {
    let nowMs = 1_000;
    const challenges = new IdentitySessionChallengeStore({
      ttlMs: 100,
      maxChallenges: 1,
      now: () => nowMs,
    });
    const first = challenges.issue('1'.repeat(64));
    expect(first.verifierContext).toBe(`pico.home.surface-session.v1:${'1'.repeat(64)}`);

    const second = challenges.issue('2'.repeat(64));
    expect(challenges.consume(first.challengeId)).toBeUndefined();
    expect(challenges.consume(second.challengeId)).toEqual(second);
    expect(challenges.consume(second.challengeId)).toBeUndefined();

    const expired = challenges.issue('3'.repeat(64));
    nowMs += 101;
    expect(challenges.consume(expired.challengeId)).toBeUndefined();
  });

  it('does not let a wall clock wound backward revive a challenge (ADR 0120 N1)', () => {
    let nowMs = 1_000_000;
    let monotonicMs = 0;
    const challenges = new IdentitySessionChallengeStore({
      ttlMs: 100,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
    });
    const challenge = challenges.issue('4'.repeat(64));

    // The attack: rewind the wall clock so the replay window looks fresh. The
    // monotonic clock counted the window out regardless.
    nowMs -= 60 * 60 * 1_000;
    monotonicMs += 101;
    expect(challenges.consume(challenge.challengeId)).toBeUndefined();
  });

  it('accepts device possession only through an active surface-session delegation', () => {
    const challenge = fixedChallenge();
    const proof = signedProof(challenge);

    expect(verifyIdentitySessionProof(sodium, {
      proof,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toMatchObject({
      ok: true,
      principal: {
        kind: 'pico_identity',
        picoIdentityFingerprintHex: identityFingerprint,
        deviceSigningKeyFingerprintHex: deviceFingerprint,
        deviceKeyAgreementKeyFingerprintHex: deviceAgreementFingerprint,
        delegationId: 'delegation_identity_session_0001',
      },
    });
  });

  it('rejects a cross-device key-agreement record and key-role confusion', () => {
    const challenge = fixedChallenge();
    const swapped = signedProof(challenge);
    swapped.deviceKeyAgreementKeyRecord = keyRecord(
      'device_key_agreement',
      sodium.crypto_box_keypair().publicKey,
    );
    expect(verifyIdentitySessionProof(sodium, {
      proof: swapped,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'invalid_device_key_agreement_key' });

    const confused = signedProof(challenge);
    confused.deviceKeyAgreementKeyRecord = {
      ...deviceAgreementKeyRecord,
      keyRole: 'device_signing',
    };
    expect(verifyIdentitySessionProof(sodium, {
      proof: confused,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'invalid_device_key_agreement_key' });
  });

  /**
   * Befund B151/B152. Drei der Ablehnungen dieser Tuer hatte nie jemand
   * ausgeloest: der Identitaetsschluessel, der Unterschriftsschluessel des
   * Geraets, und die Lebenszyklus-Evidenz. Geprueft war nur der dritte
   * Schluessel - der Schluesselaustausch - und der Besitznachweis.
   *
   * Was hier faellt, ist die Bindung "dieser Datensatz ist der, den die
   * Delegation benennt". Ohne sie koennte ein fremder Schluessel unter einer
   * echten Delegation auftreten.
   */
  it('rejects an identity or device-signing record the delegation does not name', () => {
    const challenge = fixedChallenge();

    const foreignIdentity = signedProof(challenge);
    foreignIdentity.identityKeyRecord = keyRecord(
      'pico_identity',
      sodium.crypto_sign_keypair().publicKey,
    );
    expect(verifyIdentitySessionProof(sodium, {
      proof: foreignIdentity,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'invalid_identity_key' });

    // Und dieselbe Verwechslung ueber die Rolle statt ueber den Schluessel.
    const confusedIdentity = signedProof(challenge);
    confusedIdentity.identityKeyRecord = {
      ...identityKeyRecord,
      keyRole: 'device_signing',
    };
    expect(verifyIdentitySessionProof(sodium, {
      proof: confusedIdentity,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'invalid_identity_key' });

    const foreignDevice = signedProof(challenge);
    foreignDevice.deviceSigningKeyRecord = keyRecord(
      'device_signing',
      sodium.crypto_sign_keypair().publicKey,
    );
    expect(verifyIdentitySessionProof(sodium, {
      proof: foreignDevice,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'invalid_device_signing_key' });
  });

  /**
   * Befund B151. Die Evidenz selbst: eine Delegation, deren Unterschrift nicht
   * zum Aussteller passt, faellt beim Bau des geprueften Lebenszyklus - und
   * nicht erst beim Nachschlagen. Der Grund dafuer hatte keinen Test.
   */
  it('rejects lifecycle evidence whose delegation signature does not verify', () => {
    const challenge = fixedChallenge();
    const tampered = signedProof(challenge);
    tampered.delegation = {
      record: tampered.delegation.record,
      signatureHex: '0'.repeat(128),
    };
    expect(verifyIdentitySessionProof(sodium, {
      proof: tampered,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'invalid_identity_lifecycle_evidence' });
  });

  it('rejects a valid device signature over a foreign verifier context', () => {
    const challenge = fixedChallenge();
    const proof = signedProof({
      ...challenge,
      verifierContext: `pico.home.surface-session.v1:${'4'.repeat(64)}`,
    });

    expect(verifyIdentitySessionProof(sodium, {
      proof,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'invalid_device_possession' });
  });

  it('rejects a delegation when a signed revocation is already present', () => {
    const challenge = fixedChallenge();
    const proof = signedProof(challenge);
    const revocation: PicoIdentityRevocationSignatureInput = {
      suite: picoIdentitySuite,
      revocationId: 'revocation_identity_session_0001',
      issuerIdentityKeyFingerprintHex: identityFingerprint,
      subjectKind: 'delegation',
      subjectRef: proof.delegation.record.delegationId,
      reasonCategory: 'device_retired',
      revokedAt: '2026-07-27T09:00:00.000Z',
      lifecycleOrder: 'seq:0000000000000002',
    };
    proof.revocations = [{
      record: revocation,
      signatureHex: sign(buildPicoIdentityRevocationSignatureInput(revocation), identity.privateKey),
    }];

    expect(verifyIdentitySessionProof(sodium, {
      proof,
      challenge,
      at: '2026-07-27T10:00:00.000Z',
    })).toEqual({ ok: false, reason: 'inactive_surface_session_delegation' });
  });

  it('persists and reconciles monotonic lifecycle evidence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-identity-evidence-test-'));
    const store = new EventStore(join(dir, 'pico.sqlite'));
    try {
      const proof = signedProof(fixedChallenge());
      expect(store.recordPicoIdentityLifecycleEvidence({
        sodium,
        identityKeyRecord,
        delegation: proof.delegation,
        revocations: [],
      })).toEqual({ ok: true });
      expect(store.reconcilePicoIdentityLifecycleEvidence(sodium)).toEqual({
        droppedDelegations: 0,
        droppedRevocations: 0,
        droppedReaderKeys: 0,
      });

      const revocation: PicoIdentityRevocationSignatureInput = {
        suite: picoIdentitySuite,
        revocationId: 'revocation_identity_session_store_0001',
        issuerIdentityKeyFingerprintHex: identityFingerprint,
        subjectKind: 'delegation',
        subjectRef: proof.delegation.record.delegationId,
        reasonCategory: 'device_retired',
        revokedAt: '2026-07-27T10:01:00.000Z',
        lifecycleOrder: 'seq:0000000000000002',
      };
      expect(store.recordPicoIdentityLifecycleEvidence({
        sodium,
        identityKeyRecord,
        delegation: proof.delegation,
        revocations: [{
          record: revocation,
          signatureHex: sign(buildPicoIdentityRevocationSignatureInput(revocation), identity.privateKey),
        }],
      })).toEqual({ ok: true });
      expect(store.reconcilePicoIdentityLifecycleEvidence(sodium)).toEqual({
        droppedDelegations: 0,
        droppedRevocations: 0,
        droppedReaderKeys: 0,
      });
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function fixedChallenge(): IdentitySessionChallenge {
  return {
    challengeId: 'identity_challenge_test',
    verifierNonceHex: 'a'.repeat(64),
    verifierContext: `pico.home.surface-session.v1:${'1'.repeat(64)}`,
    expiresAtMs: 10_000,
  };
}

function signedProof(challenge: IdentitySessionChallenge): IdentitySessionProof {
  const delegation: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: 'delegation_identity_session_0001',
    issuerIdentityKeyFingerprintHex: identityFingerprint,
    subjectSigningKeyFingerprintHex: deviceFingerprint,
    subjectKeyAgreementKeyFingerprintHex: deviceAgreementFingerprint,
    scopes: ['surface_session'],
    /**
     * Fest, weil diese Datei ihre Uhr angibt: jede Prüfung geht mit einem
     * ausdrücklichen `at` hinein. Ein Fenster um die Wanduhr herum läge dann
     * neben der Zeit, gegen die geprüft wird.
     */
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
    lifecycleOrder: 'seq:0000000000000001',
  };
  const possession = {
    suite: picoIdentitySuite,
    subjectKeyFingerprintHex: deviceFingerprint,
    verifierNonceHex: challenge.verifierNonceHex,
    verifierContext: challenge.verifierContext,
  };

  return {
    identityKeyRecord,
    deviceSigningKeyRecord: deviceKeyRecord,
    deviceKeyAgreementKeyRecord: deviceAgreementKeyRecord,
    delegation: {
      record: delegation,
      signatureHex: sign(buildPicoIdentityDelegationSignatureInput(delegation), identity.privateKey),
    },
    revocations: [],
    possessionSignatureHex: sign(
      buildPicoIdentityPossessionSignatureInput(possession),
      device.privateKey,
    ),
  };
}

function keyRecord(
  keyRole: PicoIdentityKeyRecordSignatureInput['keyRole'],
  publicKey: Uint8Array,
): PicoIdentityKeyRecordSignatureInput {
  return {
    suite: picoIdentitySuite,
    keyRole,
    publicKeyHex: Buffer.from(publicKey).toString('hex'),
  };
}

function fingerprint(record: PicoIdentityKeyRecordSignatureInput): string {
  return Buffer.from(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(record),
    null,
  )).toString('hex');
}

function sign(input: Uint8Array, privateKey: Uint8Array): string {
  return Buffer.from(sodium.crypto_sign_detached(input, privateKey)).toString('hex');
}
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
