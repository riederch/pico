import { isHexOfBytes } from '@pico/protocol/canonical-bytes';
import { randomBytes } from 'node:crypto';
import {
  buildPicoIdentityPossessionSignatureInput,
  hasPicoExposureWindowElapsed,
  picoIdentitySuite,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import {
  createVerifiedPicoIdentityLifecycleIndex,
  verifyPicoIdentityKeyRecordFingerprint,
  verifyPicoIdentityPossessionSignature,
  type IdentityVerificationSodium,
  type PicoIdentitySignedDelegation,
  type PicoIdentitySignedRevocation,
} from '@pico/identity';
import type { SessionPrincipal } from './session-store.js';

const CHALLENGE_BYTES = 32;

export const IDENTITY_SESSION_CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const MAX_IDENTITY_SESSION_CHALLENGES = 128;

export interface IdentitySessionChallenge {
  challengeId: string;
  verifierNonceHex: string;
  verifierContext: string;
  expiresAtMs: number;
}

export interface IdentitySessionProof {
  identityKeyRecord: PicoIdentityKeyRecordSignatureInput;
  deviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
  deviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput;
  delegation: PicoIdentitySignedDelegation;
  revocations: PicoIdentitySignedRevocation[];
  possessionSignatureHex: string;
}

export type IdentitySessionProofFailure =
  | 'invalid_identity_key'
  | 'invalid_device_signing_key'
  | 'invalid_device_key_agreement_key'
  | 'delegation_subject_mismatch'
  | 'inactive_surface_session_delegation'
  | 'invalid_identity_lifecycle_evidence'
  | 'invalid_device_possession';

export type IdentitySessionProofVerification =
  | {
    ok: true;
    principal: Extract<SessionPrincipal, { kind: 'pico_identity' }>;
    delegation: PicoIdentitySignedDelegation;
    revocations: PicoIdentitySignedRevocation[];
  }
  | { ok: false; reason: IdentitySessionProofFailure };

interface IdentitySessionChallengeStoreOptions {
  ttlMs?: number;
  maxChallenges?: number;
  now?: () => number;
  /** ADR 0120 N1. The second clock; defaults to the process monotonic one. */
  monotonicNow?: () => number;
}

/**
 * Bounded one-use challenges. `consume` deletes before returning, including for
 * an invalid proof, so a captured response cannot be retried against the same
 * verifier nonce.
 */
/**
 * ADR 0120 N1. A challenge is an exposure window - it bounds replay - so it
 * expires at the earliest instant either clock allows. The monotonic reading
 * is kept beside the challenge rather than inside it: the challenge itself is
 * handed to callers, and this is bookkeeping, not part of the proof.
 */
interface IdentitySessionChallengeRecord {
  challenge: IdentitySessionChallenge;
  startedAtMonotonicMs: number;
}

export class IdentitySessionChallengeStore {
  private readonly challenges = new Map<string, IdentitySessionChallengeRecord>();
  private readonly ttlMs: number;
  private readonly maxChallenges: number;
  private readonly now: () => number;
  private readonly monotonicNow: () => number;

  public constructor(options: IdentitySessionChallengeStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? IDENTITY_SESSION_CHALLENGE_TTL_MS;
    this.maxChallenges = options.maxChallenges ?? MAX_IDENTITY_SESSION_CHALLENGES;
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
  }

  public issue(hostSigningKeyFingerprintHex: string): IdentitySessionChallenge {
    assertFingerprint(hostSigningKeyFingerprintHex);
    this.purgeExpired();

    while (this.challenges.size >= this.maxChallenges) {
      const oldest = this.challenges.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.challenges.delete(oldest);
    }

    const challenge: IdentitySessionChallenge = {
      challengeId: `identity_challenge_${randomBytes(16).toString('hex')}`,
      verifierNonceHex: randomBytes(CHALLENGE_BYTES).toString('hex'),
      verifierContext: `pico.home.surface-session.v1:${hostSigningKeyFingerprintHex}`,
      expiresAtMs: this.now() + this.ttlMs,
    };
    this.challenges.set(challenge.challengeId, {
      challenge,
      startedAtMonotonicMs: this.monotonicNow(),
    });

    return { ...challenge };
  }

  public consume(challengeId: string): IdentitySessionChallenge | undefined {
    this.purgeExpired();
    const record = this.challenges.get(challengeId);
    if (record === undefined) {
      return undefined;
    }

    this.challenges.delete(challengeId);
    return { ...record.challenge };
  }

  public clear(): void {
    this.challenges.clear();
  }

  private purgeExpired(): void {
    const nowMs = this.now();
    const monotonicNowMs = this.monotonicNow();
    for (const [challengeId, record] of this.challenges) {
      if (hasPicoExposureWindowElapsed({
        endsAtMs: record.challenge.expiresAtMs,
        nowMs,
        monotonic: {
          startedAtMs: record.startedAtMonotonicMs,
          nowMs: monotonicNowMs,
          durationMs: this.ttlMs,
        },
      })) {
        this.challenges.delete(challengeId);
      }
    }
  }
}

export function verifyIdentitySessionProof(
  sodium: IdentityVerificationSodium,
  input: {
    proof: IdentitySessionProof;
    challenge: IdentitySessionChallenge;
    at: string;
  },
): IdentitySessionProofVerification {
  const { proof } = input;
  const delegation: PicoIdentityDelegationSignatureInput = proof.delegation.record;
  const identityFingerprint = delegation.issuerIdentityKeyFingerprintHex;
  const deviceSigningFingerprint = delegation.subjectSigningKeyFingerprintHex;
  const deviceKeyAgreementFingerprint = delegation.subjectKeyAgreementKeyFingerprintHex;

  try {
    if (proof.identityKeyRecord.suite !== picoIdentitySuite
      || proof.identityKeyRecord.keyRole !== 'pico_identity'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: proof.identityKeyRecord,
        expectedFingerprintHex: identityFingerprint,
      })) {
      return { ok: false, reason: 'invalid_identity_key' };
    }

    if (proof.deviceSigningKeyRecord.suite !== picoIdentitySuite
      || proof.deviceSigningKeyRecord.keyRole !== 'device_signing'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: proof.deviceSigningKeyRecord,
        expectedFingerprintHex: deviceSigningFingerprint,
      })) {
      return { ok: false, reason: 'invalid_device_signing_key' };
    }

    if (proof.deviceKeyAgreementKeyRecord.suite !== picoIdentitySuite
      || proof.deviceKeyAgreementKeyRecord.keyRole !== 'device_key_agreement'
      || !verifyPicoIdentityKeyRecordFingerprint(sodium, {
        keyRecord: proof.deviceKeyAgreementKeyRecord,
        expectedFingerprintHex: deviceKeyAgreementFingerprint,
      })) {
      return { ok: false, reason: 'invalid_device_key_agreement_key' };
    }

    if (delegation.issuerIdentityKeyFingerprintHex !== identityFingerprint
      || delegation.subjectSigningKeyFingerprintHex !== deviceSigningFingerprint
      || delegation.subjectKeyAgreementKeyFingerprintHex !== deviceKeyAgreementFingerprint) {
      return { ok: false, reason: 'delegation_subject_mismatch' };
    }

    let lifecycle;
    try {
      lifecycle = createVerifiedPicoIdentityLifecycleIndex(sodium, {
        issuerIdentityKeyRecord: proof.identityKeyRecord,
        signedDelegations: [proof.delegation],
        signedRevocations: proof.revocations,
      });
    } catch {
      return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
    }

    const active = lifecycle.lookupDelegation(delegation.delegationId, {
      at: input.at,
      requiredScopes: ['surface_session'],
    });
    if (active.status !== 'active') {
      return { ok: false, reason: 'inactive_surface_session_delegation' };
    }

    const possession = {
      suite: picoIdentitySuite,
      subjectKeyFingerprintHex: deviceSigningFingerprint,
      verifierNonceHex: input.challenge.verifierNonceHex,
      verifierContext: input.challenge.verifierContext,
    };
    // Build once before verification so malformed fields map to this bounded
    // failure vocabulary instead of escaping from protocol validation.
    buildPicoIdentityPossessionSignatureInput(possession);
    if (!verifyPicoIdentityPossessionSignature(sodium, {
      subjectKeyRecord: proof.deviceSigningKeyRecord,
      possession,
      signatureHex: proof.possessionSignatureHex,
    })) {
      return { ok: false, reason: 'invalid_device_possession' };
    }
  } catch {
    return { ok: false, reason: 'invalid_identity_lifecycle_evidence' };
  }

  return {
    ok: true,
    principal: {
      kind: 'pico_identity',
      picoIdentityFingerprintHex: identityFingerprint,
      deviceSigningKeyFingerprintHex: deviceSigningFingerprint,
      deviceKeyAgreementKeyFingerprintHex: deviceKeyAgreementFingerprint,
      delegationId: delegation.delegationId,
    },
    delegation: proof.delegation,
    revocations: [...proof.revocations],
  };
}

function assertFingerprint(value: string): void {
  if (!isHexOfBytes(value, 32)) {
    throw new Error('invalid_host_signing_key_fingerprint');
  }
}
