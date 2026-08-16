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
