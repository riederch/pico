/**
 * Relationship-keyed request quotas for the Link intake surface (ADR 0119 Q4).
 *
 * The existing intake bounds all answer "how large is this one thing" - ten
 * seconds a request, five for headers, a hundred per socket, 256 KiB of
 * envelope. None of them answers "how many". This does.
 *
 * Two properties decide the shape.
 *
 * **Quotas key on relationship, never on network position.** A relay is
 * transport and an IP address is a relay artifact carrying no authority (ADR
 * 0028, ADR 0031), so keying on one would let a relay's behavior decide a
 * peer's budget. The key here is the sender's Pico identity fingerprint, and
 * it is only usable once a signature has proven it.
 *
 * **Refill runs on the monotonic clock (ADR 0120 N1).** A budget that refills
 * on the wall clock is refilled by moving the wall clock, which would make the
 * quota a formality for anyone who can nudge the system time. `performance.now`
 * is not adjustable that way.
 *
 * Counters live in memory only, exactly where {@link LoginThrottle} keeps its
 * own and for the same reason: ADR 0119 Q3 forbids an unauthorized request from
 * causing any durable write, and a rate-limit ledger on disk would be one. The
 * cost is named - a restart forgives every budget - and accepted, because the
 * alternative reopens log flooding as the denial-of-service path the quota
 * exists to close.
 */

/**
 * The tightest tier, and the only one an unauthenticated caller can reach.
 *
 * It is a single shared bucket rather than one per caller, because before the
 * seal is opened there is nothing to key on: the envelope hides the sender by
 * design, and the only other candidate key is the network property this ADR
 * refuses to trust. That is the same reasoning ADR 0119 already applies to
 * `LoginThrottle` staying global, and it carries the same residual, named in
 * the ADR: a sustained flood degrades stranger intake for everyone.
 */
export const defaultPicoStrangerQuota: PicoRequestQuotaBudget = {
  capacity: 60,
  refillPerMinute: 60,
};

/**
 * Per relationship, and larger because a relationship is what there is to
 * spend. Sized from what real ceremonies cost - a claim, a rotation submit, a
 * lifecycle read are a handful of requests each - rather than guessed, so an
 * ordinary peer never meets it and a runaway one is contained alone.
 */
export const defaultPicoRelatedQuota: PicoRequestQuotaBudget = {
  capacity: 300,
  refillPerMinute: 300,
};

/**
 * A bound on the quota bookkeeping itself, so the defence cannot become the
 * exhaustion. Only proven relationships get an entry, so the natural size is
 * the Home's membership; this is the backstop, not the expected shape.
 */
export const defaultMaxPicoQuotaRelationships = 512;

export interface PicoRequestQuotaBudget {
  /** Burst: how many requests may arrive at once from a standing start. */
  capacity: number;
  /** Sustained rate, as tokens returned per minute. */
  refillPerMinute: number;
}

export interface PicoRequestQuotaOptions {
  stranger?: PicoRequestQuotaBudget;
  related?: PicoRequestQuotaBudget;
  maxRelationships?: number;
  /** ADR 0120 N1. Defaults to the process monotonic clock. */
  monotonicNow?: () => number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

function assertBudget(budget: PicoRequestQuotaBudget, name: string): void {
  if (!Number.isFinite(budget.capacity) || budget.capacity <= 0
    || !Number.isFinite(budget.refillPerMinute) || budget.refillPerMinute <= 0) {
    throw new Error(`invalid_pico_request_quota:${name}`);
  }
}

export class PicoRequestQuota {
  private readonly strangerBudget: PicoRequestQuotaBudget;

  private readonly relatedBudget: PicoRequestQuotaBudget;

  private readonly maxRelationships: number;

  private readonly monotonicNow: () => number;

  private readonly stranger: Bucket;

  private readonly relationships = new Map<string, Bucket>();

  public constructor(options: PicoRequestQuotaOptions = {}) {
    this.strangerBudget = options.stranger ?? defaultPicoStrangerQuota;
    this.relatedBudget = options.related ?? defaultPicoRelatedQuota;
    assertBudget(this.strangerBudget, 'stranger');
    assertBudget(this.relatedBudget, 'related');
    this.maxRelationships = options.maxRelationships ?? defaultMaxPicoQuotaRelationships;
    if (!Number.isInteger(this.maxRelationships) || this.maxRelationships <= 0) {
      throw new Error('invalid_pico_request_quota:maxRelationships');
    }
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
    this.stranger = { tokens: this.strangerBudget.capacity, lastRefillMs: this.monotonicNow() };
  }

  /**
   * Charged at intake, before the seal is opened, for every request alike.
   *
   * This is what a flood spends, and it is deliberately the first thing that
   * happens: the seal-open is the first place the Home spends a private key,
   * so a bound that sat behind it would not bound the expensive step at all.
   */
  public admitStranger(): boolean {
    return this.take(this.stranger, this.strangerBudget);
  }

  /**
   * Charged once a signature has proven the relationship, in addition to the
   * stranger charge already spent above.
   *
   * The two bounds answer different questions. The stranger bucket bounds the
   * cryptographic work an unknown caller can demand; this one bounds authorized
   * volume, so a single misbehaving peer is contained without touching anyone
   * else's budget.
   */
  public admitRelationship(picoIdentityFingerprintHex: string): boolean {
    const existing = this.relationships.get(picoIdentityFingerprintHex);
    if (existing !== undefined) {
      return this.take(existing, this.relatedBudget);
    }
    if (this.relationships.size >= this.maxRelationships) {
      this.evictLeastThrottled();
    }
    const bucket: Bucket = {
      tokens: this.relatedBudget.capacity,
      lastRefillMs: this.monotonicNow(),
    };
    this.relationships.set(picoIdentityFingerprintHex, bucket);
    return this.take(bucket, this.relatedBudget);
  }

  public relationshipCount(): number {
    return this.relationships.size;
  }

  private take(bucket: Bucket, budget: PicoRequestQuotaBudget): boolean {
    this.refill(bucket, budget);
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }

  private refill(bucket: Bucket, budget: PicoRequestQuotaBudget): void {
    const nowMs = this.monotonicNow();
    const elapsedMs = nowMs - bucket.lastRefillMs;
    // A monotonic clock does not go backwards, but a supplied one might; a
    // negative interval refills nothing rather than draining the bucket.
    if (elapsedMs <= 0) {
      return;
    }
    const refilled = (elapsedMs / 60_000) * budget.refillPerMinute;
    bucket.tokens = Math.min(budget.capacity, bucket.tokens + refilled);
    bucket.lastRefillMs = nowMs;
  }

  /**
   * Eviction hands the evicted key a full budget again, so the choice of victim
   * is a security decision rather than a cache one: dropping a drained bucket
   * would reset exactly the caller currently being throttled. The fullest
   * bucket is the one with the least to reset.
   *
   * Every candidate is refilled before it is compared. A bucket drained an hour
   * ago still holds its drained count until something touches it, and ranking on
   * that stale number would rate a long-idle caller as the most throttled one -
   * protecting a bucket that has in fact already refilled, at the expense of one
   * that genuinely is being held down right now.
   */
  private evictLeastThrottled(): void {
    let victim: string | undefined;
    let mostTokens = -1;
    for (const [key, bucket] of this.relationships) {
      this.refill(bucket, this.relatedBudget);
      if (bucket.tokens > mostTokens) {
        mostTokens = bucket.tokens;
        victim = key;
      }
    }
    if (victim !== undefined) {
      this.relationships.delete(victim);
    }
  }
}
