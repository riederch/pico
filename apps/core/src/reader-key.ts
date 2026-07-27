import type { IdentityVerificationSodium } from '@pico/identity';
import type {
  EventStore,
  PicoIdentityReaderKeyCandidate,
} from './event-store.js';

export const MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_MS = 5 * 60 * 1000;

/**
 * The authenticated registry/sync adapter is the trust boundary for this
 * result. Implementations may return `current` only after they have verified
 * the source's authenticity and confirmed that the exact delegation/key
 * binding is active at the reported checkpoint.
 */
export type PicoIdentityReaderKeyFreshnessResult =
  | {
    status: 'current';
    sourceRef: string;
    homeId: string;
    picoIdentityFingerprintHex: string;
    deviceSigningKeyFingerprintHex: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    delegationId: string;
    observedThroughLifecycleOrder: string;
    checkedAt: string;
    freshUntil: string;
  }
  | { status: 'unavailable' }
  | { status: 'stale' }
  | { status: 'revoked' };

export interface PicoIdentityReaderKeyFreshnessQuery {
  homeId: string;
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
  locallyObservedThroughLifecycleOrder: string;
  evaluatedAt: string;
}

export interface PicoIdentityReaderKeyFreshnessSource {
  check(
    query: PicoIdentityReaderKeyFreshnessQuery,
  ): Promise<PicoIdentityReaderKeyFreshnessResult>;
}

export class UnavailablePicoIdentityReaderKeyFreshnessSource
  implements PicoIdentityReaderKeyFreshnessSource {
  public async check(): Promise<PicoIdentityReaderKeyFreshnessResult> {
    return { status: 'unavailable' };
  }
}

export type PicoIdentityReaderKeySelectionFailure =
  | 'identity_is_not_active_member'
  | 'reader_key_is_not_locally_eligible'
  | 'freshness_unavailable'
  | 'freshness_stale'
  | 'reader_key_revoked'
  | 'invalid_freshness_checkpoint';

export type PicoIdentityReaderKeySelectionResult =
  | {
    ok: true;
    candidate: PicoIdentityReaderKeyCandidate;
    freshness: Extract<PicoIdentityReaderKeyFreshnessResult, { status: 'current' }>;
  }
  | { ok: false; reason: PicoIdentityReaderKeySelectionFailure };

type PicoIdentityReaderKeyDirectory = Pick<
  EventStore,
  'hasActivePicoHomeMembership' | 'picoIdentityReaderKeyCandidate'
>;

/**
 * Pre-authorizes one exact public reader key for a future envelope issuer.
 * This class never wraps a KEK and never emits or stores an envelope.
 */
export class PicoIdentityReaderKeySelector {
  public constructor(
    private readonly directory: PicoIdentityReaderKeyDirectory,
    private readonly sodium: IdentityVerificationSodium,
    private readonly freshnessSource: PicoIdentityReaderKeyFreshnessSource
      = new UnavailablePicoIdentityReaderKeyFreshnessSource(),
    private readonly maxFreshnessMs: number = MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_MS,
  ) {
    if (!Number.isSafeInteger(maxFreshnessMs) || maxFreshnessMs < 1) {
      throw new Error('Reader-key freshness maximum must be a positive integer.');
    }
  }

  public async select(input: {
    homeId: string;
    picoIdentityFingerprintHex: string;
    delegationId: string;
    deviceKeyAgreementKeyFingerprintHex: string;
    at?: string;
  }): Promise<PicoIdentityReaderKeySelectionResult> {
    const at = input.at ?? new Date().toISOString();
    try {
      if (!this.directory.hasActivePicoHomeMembership(
        input.picoIdentityFingerprintHex,
        input.homeId,
        at,
      )) {
        return { ok: false, reason: 'identity_is_not_active_member' };
      }

      const candidate = this.directory.picoIdentityReaderKeyCandidate({
        ...input,
        sodium: this.sodium,
        at,
      });
      if (candidate === undefined) {
        return { ok: false, reason: 'reader_key_is_not_locally_eligible' };
      }

      let freshness: PicoIdentityReaderKeyFreshnessResult;
      try {
        freshness = await this.freshnessSource.check({
          homeId: candidate.homeId,
          picoIdentityFingerprintHex: candidate.picoIdentityFingerprintHex,
          deviceSigningKeyFingerprintHex: candidate.deviceSigningKeyFingerprintHex,
          deviceKeyAgreementKeyFingerprintHex: candidate.deviceKeyAgreementKeyFingerprintHex,
          delegationId: candidate.delegationId,
          locallyObservedThroughLifecycleOrder: candidate.locallyObservedThroughLifecycleOrder,
          evaluatedAt: at,
        });
      } catch {
        return { ok: false, reason: 'freshness_unavailable' };
      }

      if (freshness.status === 'unavailable') {
        return { ok: false, reason: 'freshness_unavailable' };
      }
      if (freshness.status === 'stale') {
        return { ok: false, reason: 'freshness_stale' };
      }
      if (freshness.status === 'revoked') {
        return { ok: false, reason: 'reader_key_revoked' };
      }

      const checkpointFailure = validateCurrentCheckpoint(
        candidate,
        freshness,
        at,
        this.maxFreshnessMs,
      );
      if (checkpointFailure !== undefined) {
        return { ok: false, reason: checkpointFailure };
      }

      return { ok: true, candidate, freshness };
    } catch {
      return { ok: false, reason: 'reader_key_is_not_locally_eligible' };
    }
  }
}

function validateCurrentCheckpoint(
  candidate: PicoIdentityReaderKeyCandidate,
  freshness: Extract<PicoIdentityReaderKeyFreshnessResult, { status: 'current' }>,
  at: string,
  maxFreshnessMs: number,
): 'freshness_stale' | 'invalid_freshness_checkpoint' | undefined {
  if (freshness.homeId !== candidate.homeId
    || freshness.picoIdentityFingerprintHex !== candidate.picoIdentityFingerprintHex
    || freshness.deviceSigningKeyFingerprintHex !== candidate.deviceSigningKeyFingerprintHex
    || freshness.deviceKeyAgreementKeyFingerprintHex
      !== candidate.deviceKeyAgreementKeyFingerprintHex
    || freshness.delegationId !== candidate.delegationId
    || !isAsciiReference(freshness.sourceRef)
    || !isLifecycleOrder(freshness.observedThroughLifecycleOrder)
    || !isCanonicalInstant(at)
    || !isCanonicalInstant(freshness.checkedAt)
    || !isCanonicalInstant(freshness.freshUntil)) {
    return 'invalid_freshness_checkpoint';
  }

  if (freshness.checkedAt > at
    || freshness.freshUntil <= freshness.checkedAt
    || freshness.freshUntil > candidate.validUntil
    || Date.parse(freshness.freshUntil) - Date.parse(freshness.checkedAt) > maxFreshnessMs) {
    return 'invalid_freshness_checkpoint';
  }

  if (freshness.observedThroughLifecycleOrder
      < candidate.locallyObservedThroughLifecycleOrder
    || at >= freshness.freshUntil) {
    return 'freshness_stale';
  }

  return undefined;
}

function isLifecycleOrder(value: string): boolean {
  return /^seq:[0-9]{16}$/.test(value);
}

function isCanonicalInstant(value: string): boolean {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isAsciiReference(value: string): boolean {
  return /^[A-Za-z0-9._:/-]{1,256}$/.test(value);
}
