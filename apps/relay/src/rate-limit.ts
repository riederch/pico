/**
 * ADR 0154 RO9. A bound on the administration door, and an honest account of
 * what it is for.
 *
 * **It is not what protects the credentials.** The claim code is 256 bits and
 * the operator credential is 128, both from the system generator, so grinding
 * them was never the threat - a bucket that made brute force "harder" would be
 * decoration over a number that already ends the argument. What this bounds is
 * the work an unauthenticated caller can make the relay do: a digest and a
 * query per request, small each and unbounded in aggregate, on a port an
 * operator may have deliberately exposed.
 *
 * **Two buckets, and that is the whole design.** One global bucket would let
 * anybody who can reach the port lock the operator out of their own relay by
 * hammering it - trading a resource bound for a denial of service against the
 * one person who needs the door. So the caller is identified first and charged
 * to their own budget: a stranger exhausts theirs and the operator's is
 * untouched. Which bucket a request belongs to is decided in `operator.ts`,
 * before its body is read.
 *
 * **Global rather than per-caller, deliberately.** A relay behind a reverse
 * proxy sees one address for everybody, and the header that would say
 * otherwise is one nobody signed. Counting per source would either be counting
 * one source or trusting a forgeable string; ADR 0149's posture on the mailbox
 * port is the same, where the connection ceiling is a property of the listener
 * and not of who dialled it.
 *
 * No timers: the refill is computed when a token is asked for. A bucket with
 * an interval behind it is a handle to leak on shutdown, for arithmetic that
 * fits on one line.
 */

export interface PicoRelayRateLimitOptions {
  /** Tokens the bucket holds when full, which is also the burst. */
  capacity: number;
  /** Tokens added per minute. */
  perMinute: number;
  now?: () => number;
}

export interface PicoRelayRateLimitDecision {
  allowed: boolean;
  /** Whole seconds until one token exists, for `Retry-After`. */
  retryAfterSeconds: number;
}

export class PicoRelayRateLimit {
  private tokens: number;

  private lastRefillMs: number;

  private readonly capacity: number;

  private readonly perMs: number;

  private readonly now: () => number;

  public constructor(options: PicoRelayRateLimitOptions) {
    if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
      throw new Error('invalid_pico_relay_rate_limit_capacity');
    }
    if (!Number.isFinite(options.perMinute) || options.perMinute <= 0) {
      throw new Error('invalid_pico_relay_rate_limit_rate');
    }
    this.capacity = options.capacity;
    this.perMs = options.perMinute / 60_000;
    this.now = options.now ?? (() => Date.now());
    this.tokens = options.capacity;
    this.lastRefillMs = this.now();
  }

  /** Takes one token, or says how long until there is one. */
  public take(): PicoRelayRateLimitDecision {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: false,
      // Rounded up, and never zero: a `Retry-After: 0` invites the immediate
      // retry this exists to stop.
      retryAfterSeconds: Math.max(1, Math.ceil((1 - this.tokens) / this.perMs / 1_000)),
    };
  }

  private refill(): void {
    const now = this.now();
    const elapsed = now - this.lastRefillMs;
    if (elapsed <= 0) {
      // A clock that went backwards refills nothing rather than draining or
      // filling the bucket. ADR 0120's posture: a bad clock costs a wait, not
      // an open door.
      this.lastRefillMs = now;
      return;
    }
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.perMs);
    this.lastRefillMs = now;
  }
}

/**
 * What an unauthenticated caller may spend.
 *
 * Ten a minute: a person typing a claim code off a screen needs two or three,
 * and everything else on this port needs a credential. Anybody at this budget
 * is not typing.
 */
export const picoRelayUnauthenticatedRequestsPerMinute = 10;

/**
 * What the operator may spend.
 *
 * Larger, because the client refreshes a list per relay and a person clicks
 * faster than they type - and small enough that a stolen credential cannot
 * turn the administration port into a load generator.
 */
export const picoRelayOperatorRequestsPerMinute = 60;

/**
 * ADR 0149 RS7. Buckets kept per key, with a ceiling and no eviction.
 *
 * **Nothing is evicted, on purpose.** A least-recently-used map would let an
 * attacker push a bucket out and get a fresh, full one back - the reset is the
 * attack, and it is available to anybody who can make requests. Instead the
 * registry fills and then answers `undefined`, and the caller falls back to
 * the shared bucket it was already charged. Overflow makes the accounting
 * coarser and never more permissive.
 *
 * The ceiling is generous because the keys are the relay's own data - active
 * accounts and registered mailboxes, both bounded by what the operator issued.
 * It is not a guess about traffic; it is a guard against a map that grows with
 * somebody else's imagination.
 */
export class PicoRelayRateLimitRegistry {
  private readonly buckets = new Map<string, PicoRelayRateLimit>();

  private reportedFull = false;

  public constructor(
    private readonly options: PicoRelayRateLimitOptions & {
      ceiling: number;
      onFull?: (ceiling: number) => void;
    },
  ) {}

  /** The bucket for this key, or nothing once the registry is full. */
  public forKey(key: string): PicoRelayRateLimit | undefined {
    const existing = this.buckets.get(key);
    if (existing !== undefined) {
      return existing;
    }
    if (this.buckets.size >= this.options.ceiling) {
      if (!this.reportedFull) {
        // Said out loud once. A cap that quietly stopped applying would read
        // as "everything is bounded" while it was not - the silent-truncation
        // failure ADR 0119 Q5 refuses, in a different store.
        this.reportedFull = true;
        this.options.onFull?.(this.options.ceiling);
      }
      return undefined;
    }
    const created = new PicoRelayRateLimit(this.options);
    this.buckets.set(key, created);
    return created;
  }

  public size(): number {
    return this.buckets.size;
  }
}

/**
 * ADR 0149 RS7. What everything without a valid account credential shares.
 *
 * Deliveries, probes and wrong credentials in one bucket, because before a
 * body is parsed they are the same request - and ADR 0147 RY1 removed the
 * sender field, so even after parsing there is nothing to tell two senders
 * apart by. Generous, because this is the bound on legitimate inbound mail for
 * every Home this relay serves.
 */
export const picoRelayUnattributedRequestsPerMinute = 600;

/**
 * Per registered target mailbox, and tighter than the shared budget by design.
 *
 * The point of the two levels: somebody spamming one relationship hits this
 * long before they reach the shared ceiling, so one recipient's flood does not
 * refuse everybody else's mail.
 */
export const picoRelayMailboxDeliveriesPerMinute = 60;

/**
 * Per active account.
 *
 * A customer's runaway loop exhausts its own budget and no one else's - the
 * same reasoning as the operator port's two buckets, one surface over. The
 * relay's total ceiling is therefore accounts times this, which is bounded by
 * what the operator chose to issue.
 */
export const picoRelayAccountRequestsPerMinute = 120;

/** How many per-key buckets each registry will hold before it stops tracking. */
export const picoRelayRateLimitRegistryCeiling = 4_096;
