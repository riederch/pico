import type { PicoIdentityReaderKeyFreshnessCheckpoint } from '@pico/protocol';
import type {
  PicoIdentityReaderKeyFreshnessCheckpointLookupResult,
  PicoIdentityReaderKeyFreshnessCheckpointSource,
} from './reader-key-freshness.js';
import type { PicoIdentityReaderKeyFreshnessQuery } from './reader-key.js';

/**
 * Local delivery point for ADR 0085 freshness checkpoints (ADR 0089's
 * transport seam, filled for a deployment with no registry).
 *
 * The Vault daemon deliberately has no network surface (ADR 0097), so the
 * Foundation cannot pull a checkpoint from the person's Vault. The owner
 * pushes one instead, and this holds it until the next authority check reads
 * it back through the unchanged `AuthenticatedPicoIdentityReaderKeyFreshnessSource`
 * verifier. Nothing here judges a checkpoint: it stores bytes and hands them
 * over, and every signature, binding, age and anti-rollback rule still runs
 * in the verifier.
 *
 * Deliberately in memory. A checkpoint is valid for five minutes by
 * construction, so persisting one would only ever preserve something already
 * expired across a restart, and a durable store of freshness assertions is
 * exactly the shape a rollback attack wants. Losing them on restart is the
 * correct behaviour, not a limitation: the owner republishes.
 */
export class PicoIdentityReaderKeyFreshnessInbox
implements PicoIdentityReaderKeyFreshnessCheckpointSource {
  readonly #checkpoints = new Map<string, PicoIdentityReaderKeyFreshnessCheckpoint>();

  readonly #maxEntries: number;

  public constructor(maxEntries = 256) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new Error('Invalid freshness inbox bound.');
    }
    this.#maxEntries = maxEntries;
  }

  /**
   * Accepts a checkpoint for later lookup. The key is the exact binding the
   * verifier will query on, so a checkpoint for one reader can never be
   * returned for another; a newer one for the same binding replaces the older.
   */
  public publish(checkpoint: PicoIdentityReaderKeyFreshnessCheckpoint): void {
    // The issuer is the reader's own identity root: a reader asserts the
    // freshness of its own device keys, which is what the verifier binds
    // `issuerIdentityKeyFingerprintHex` against `query.picoIdentityFingerprintHex`
    // for (reader-key-freshness.ts:131). Keying on it here means a checkpoint
    // is only ever returned for the reader it was issued by.
    const key = bindingKey({
      homeId: checkpoint.checkpoint.homeId,
      picoIdentityFingerprintHex: checkpoint.checkpoint.issuerIdentityKeyFingerprintHex,
      deviceSigningKeyFingerprintHex: checkpoint.checkpoint.deviceSigningKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex:
        checkpoint.checkpoint.deviceKeyAgreementKeyFingerprintHex,
      delegationId: checkpoint.checkpoint.delegationId,
    });

    // Bounded so a caller cannot grow this without limit. Oldest insertion
    // goes first; every entry is short-lived anyway.
    if (!this.#checkpoints.has(key) && this.#checkpoints.size >= this.#maxEntries) {
      const oldest = this.#checkpoints.keys().next();
      if (!oldest.done) {
        this.#checkpoints.delete(oldest.value);
      }
    }

    this.#checkpoints.delete(key);
    this.#checkpoints.set(key, checkpoint);
  }

  public async lookup(
    query: PicoIdentityReaderKeyFreshnessQuery,
    _options: { signal: AbortSignal },
  ): Promise<PicoIdentityReaderKeyFreshnessCheckpointLookupResult> {
    const record = this.#checkpoints.get(bindingKey(query));

    return record === undefined
      ? { status: 'unavailable' }
      : { status: 'checkpoint', sourceRef: 'pico.local.freshness-inbox.v1', record };
  }
}

function bindingKey(binding: {
  homeId: string;
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
}): string {
  return [
    binding.homeId,
    binding.picoIdentityFingerprintHex,
    binding.deviceSigningKeyFingerprintHex,
    binding.deviceKeyAgreementKeyFingerprintHex,
    binding.delegationId,
  ].join('\0');
}
