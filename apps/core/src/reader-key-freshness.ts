import { hasExactKeys } from '@pico/protocol/canonical-bytes';
import { isPicoLifecycleOrder } from '@pico/protocol/lifecycle-order';
import {
  verifyPicoIdentityReaderKeyFreshnessSignature,
  type IdentityVerificationSodium,
} from '@pico/identity';
import {
  isPicoInstant,
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoIdentityReaderKeyFreshnessSignatureInput,
  maxPicoIdentityReaderKeyFreshnessMs,
  picoIdentityReaderKeyFreshnessCheckpointSchema,
  picoIdentitySuite,
  type PicoIdentityReaderKeyFreshnessCheckpoint,
} from '@pico/protocol';
import {
  type PicoIdentityReaderKeyFreshnessQuery,
  type PicoIdentityReaderKeyFreshnessResult,
  type PicoIdentityReaderKeyFreshnessSource,
} from './reader-key.js';

export const MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_FLOORS = 1_024;
export const DEFAULT_PICO_IDENTITY_READER_KEY_FRESHNESS_LOOKUP_TIMEOUT_MS =
  5_000;

export type PicoIdentityReaderKeyFreshnessCheckpointLookupResult =
  | {
    status: 'checkpoint';
    sourceRef: string;
    record: PicoIdentityReaderKeyFreshnessCheckpoint;
  }
  | { status: 'unavailable' };

/**
 * Transport-only seam. HTTP, Pico Link or another sync mechanism may implement
 * this lookup, but none may return a bare "current" assertion: the complete
 * identity-root-signed checkpoint is mandatory.
 */
export interface PicoIdentityReaderKeyFreshnessCheckpointSource {
  lookup(
    query: PicoIdentityReaderKeyFreshnessQuery,
    options: { signal: AbortSignal },
  ): Promise<PicoIdentityReaderKeyFreshnessCheckpointLookupResult>;
}

interface BindingFloor {
  observedThroughLifecycleOrder: string;
  checkedAt: string;
}

/**
 * ADR 0085's authenticated Registry/Sync adapter.
 *
 * It performs a fresh transport lookup on every authority check. The maps are
 * bounded anti-rollback floors only; they are never used as positive
 * freshness, are not persisted and cannot authorize through a source error.
 */
export class AuthenticatedPicoIdentityReaderKeyFreshnessSource
implements PicoIdentityReaderKeyFreshnessSource {
  readonly #identityOrderFloors = new Map<string, string>();

  readonly #bindingFloors = new Map<string, BindingFloor>();

  public constructor(
    private readonly sodium: IdentityVerificationSodium,
    private readonly checkpointSource: PicoIdentityReaderKeyFreshnessCheckpointSource,
    private readonly maxFreshnessMs = maxPicoIdentityReaderKeyFreshnessMs,
    private readonly maxFloorEntries = MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_FLOORS,
    private readonly lookupTimeoutMs =
      DEFAULT_PICO_IDENTITY_READER_KEY_FRESHNESS_LOOKUP_TIMEOUT_MS,
  ) {
    if (!Number.isSafeInteger(maxFreshnessMs)
      || maxFreshnessMs < 1
      || maxFreshnessMs > maxPicoIdentityReaderKeyFreshnessMs) {
      throw new Error('Reader-key freshness adapter maximum must be between 1 ms and 5 minutes.');
    }
    if (!Number.isSafeInteger(maxFloorEntries) || maxFloorEntries < 1) {
      throw new Error('Reader-key freshness floor capacity must be a positive integer.');
    }
    if (!Number.isSafeInteger(lookupTimeoutMs) || lookupTimeoutMs < 1) {
      throw new Error('Reader-key freshness lookup timeout must be a positive integer.');
    }
  }

  public async check(
    query: PicoIdentityReaderKeyFreshnessQuery,
  ): Promise<PicoIdentityReaderKeyFreshnessResult> {
    if (!isCanonicalQuery(query)) {
      return { status: 'unavailable' };
    }

    let lookup: PicoIdentityReaderKeyFreshnessCheckpointLookupResult;
    const abortController = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      lookup = await Promise.race([
        this.checkpointSource.lookup(
          { ...query },
          { signal: abortController.signal },
        ),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            abortController.abort();
            reject(new Error('reader_key_freshness_lookup_timeout'));
          }, this.lookupTimeoutMs);
        }),
      ]);
    } catch {
      return { status: 'unavailable' };
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    }

    if (lookup.status !== 'checkpoint') {
      return { status: 'unavailable' };
    }

    try {
      if (!isAsciiReference(lookup.sourceRef)
        || !isStrictCheckpointRecord(lookup.record)) {
        return { status: 'unavailable' };
      }

      const checkpoint = lookup.record.checkpoint;
      buildPicoIdentityReaderKeyFreshnessSignatureInput({ ...checkpoint });
      buildPicoIdentityKeyRecordSignatureInput({
        ...lookup.record.issuerIdentityKeyRecord,
      });

      if (checkpoint.suite !== picoIdentitySuite
        || checkpoint.homeId !== query.homeId
        || checkpoint.issuerIdentityKeyFingerprintHex
          !== query.picoIdentityFingerprintHex
        || checkpoint.deviceSigningKeyFingerprintHex
          !== query.deviceSigningKeyFingerprintHex
        || checkpoint.deviceKeyAgreementKeyFingerprintHex
          !== query.deviceKeyAgreementKeyFingerprintHex
        || checkpoint.delegationId !== query.delegationId
        || lookup.record.issuerIdentityKeyRecord.suite !== picoIdentitySuite
        || lookup.record.issuerIdentityKeyRecord.keyRole !== 'pico_identity'
        || !verifyPicoIdentityReaderKeyFreshnessSignature(this.sodium, {
          issuerIdentityKeyRecord: lookup.record.issuerIdentityKeyRecord,
          checkpoint,
          signatureHex: lookup.record.issuerSignatureHex,
        })) {
        return { status: 'unavailable' };
      }

      const checkedAtMs = Date.parse(checkpoint.checkedAt);
      const freshUntilMs = Date.parse(checkpoint.freshUntil);
      if (checkpoint.checkedAt > query.evaluatedAt
        || freshUntilMs - checkedAtMs > this.maxFreshnessMs) {
        return { status: 'unavailable' };
      }

      if (checkpoint.observedThroughLifecycleOrder
          < query.locallyObservedThroughLifecycleOrder
        || query.evaluatedAt >= checkpoint.freshUntil
        || this.#isRollback(query, checkpoint.observedThroughLifecycleOrder, checkpoint.checkedAt)) {
        return { status: 'stale' };
      }

      this.#recordFloors(
        query,
        checkpoint.observedThroughLifecycleOrder,
        checkpoint.checkedAt,
      );

      if (checkpoint.status === 'revoked') {
        return { status: 'revoked' };
      }

      return {
        status: 'current',
        sourceRef: lookup.sourceRef,
        homeId: checkpoint.homeId,
        picoIdentityFingerprintHex: checkpoint.issuerIdentityKeyFingerprintHex,
        deviceSigningKeyFingerprintHex: checkpoint.deviceSigningKeyFingerprintHex,
        deviceKeyAgreementKeyFingerprintHex:
          checkpoint.deviceKeyAgreementKeyFingerprintHex,
        delegationId: checkpoint.delegationId,
        observedThroughLifecycleOrder:
          checkpoint.observedThroughLifecycleOrder,
        checkedAt: checkpoint.checkedAt,
        freshUntil: checkpoint.freshUntil,
      };
    } catch {
      return { status: 'unavailable' };
    }
  }

  #isRollback(
    query: PicoIdentityReaderKeyFreshnessQuery,
    observedThroughLifecycleOrder: string,
    checkedAt: string,
  ): boolean {
    const identityFloor = this.#identityOrderFloors.get(identityFloorKey(query));
    if (identityFloor !== undefined
      && observedThroughLifecycleOrder < identityFloor) {
      return true;
    }

    const bindingFloor = this.#bindingFloors.get(bindingFloorKey(query));
    return bindingFloor !== undefined
      && (observedThroughLifecycleOrder < bindingFloor.observedThroughLifecycleOrder
        || (observedThroughLifecycleOrder
            === bindingFloor.observedThroughLifecycleOrder
          && checkedAt < bindingFloor.checkedAt));
  }

  #recordFloors(
    query: PicoIdentityReaderKeyFreshnessQuery,
    observedThroughLifecycleOrder: string,
    checkedAt: string,
  ): void {
    setBounded(
      this.#identityOrderFloors,
      identityFloorKey(query),
      observedThroughLifecycleOrder,
      this.maxFloorEntries,
    );
    setBounded(
      this.#bindingFloors,
      bindingFloorKey(query),
      { observedThroughLifecycleOrder, checkedAt },
      this.maxFloorEntries,
    );
  }
}

function isStrictCheckpointRecord(
  record: PicoIdentityReaderKeyFreshnessCheckpoint,
): boolean {
  return isRecord(record)
    && hasExactKeys(record, [
      'schema',
      'checkpoint',
      'issuerIdentityKeyRecord',
      'issuerSignatureHex',
    ])
    && record.schema === picoIdentityReaderKeyFreshnessCheckpointSchema
    && isRecord(record.checkpoint)
    && isRecord(record.issuerIdentityKeyRecord)
    && hasExactKeys(record.issuerIdentityKeyRecord, [
      'suite',
      'keyRole',
      'publicKeyHex',
    ])
    && typeof record.issuerSignatureHex === 'string';
}

function isCanonicalQuery(query: PicoIdentityReaderKeyFreshnessQuery): boolean {
  return isAsciiReference(query.homeId)
    && isHexFingerprint(query.picoIdentityFingerprintHex)
    && isHexFingerprint(query.deviceSigningKeyFingerprintHex)
    && isHexFingerprint(query.deviceKeyAgreementKeyFingerprintHex)
    && isAsciiReference(query.delegationId)
    && isPicoLifecycleOrder(query.locallyObservedThroughLifecycleOrder)
    && isPicoInstant(query.evaluatedAt);
}

function identityFloorKey(query: PicoIdentityReaderKeyFreshnessQuery): string {
  return `${query.homeId}\u0000${query.picoIdentityFingerprintHex}`;
}

function bindingFloorKey(query: PicoIdentityReaderKeyFreshnessQuery): string {
  return [
    query.homeId,
    query.picoIdentityFingerprintHex,
    query.deviceSigningKeyFingerprintHex,
    query.deviceKeyAgreementKeyFingerprintHex,
    query.delegationId,
  ].join('\u0000');
}

function setBounded<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  value: TValue,
  maximumSize: number,
): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > maximumSize) {
    const oldestKey = map.keys().next().value as TKey | undefined;
    if (oldestKey === undefined) {
      return;
    }
    map.delete(oldestKey);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}



function isHexFingerprint(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function isAsciiReference(value: string): boolean {
  return /^[A-Za-z0-9._:/-]{1,256}$/.test(value);
}
