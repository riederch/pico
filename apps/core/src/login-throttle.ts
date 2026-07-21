/**
 * Failed-login throttle for the operator credential (ADR 0076).
 *
 * The bounded verification queue in {@link OperatorStore} caps *memory*: one
 * Argon2id allocation at a time. It is not an attempt bound, and without one a
 * caller can guess the passphrase at the rate a single verification takes —
 * measured around 11 attempts per second at the interactive limits this
 * appliance uses. Under `ha-ingress` that surface is reachable from every
 * add-on page on the shared Home Assistant origin, which is the same argument
 * ADR 0076 used to require a bootstrap code instead of trusting the first
 * caller.
 *
 * The throttle is deliberately a delay, not a lockout. A lockout would hand an
 * attacker the ability to lock the owner out of their own appliance by failing
 * logins on purpose; a growing delay costs the attacker far more than the
 * owner. The owner's worst case is one capped wait, while a sustained guessing
 * rate collapses by more than two orders of magnitude.
 *
 * Failures are counted in memory only and never appended to the event log:
 * they are exactly the attacker-triggerable class ADR 0076 keeps out of it.
 */

/** Free attempts before any delay applies, so an ordinary typo costs nothing. */
export const DEFAULT_LOGIN_FREE_ATTEMPTS = 3;
export const DEFAULT_LOGIN_BASE_DELAY_MS = 1_000;
export const DEFAULT_LOGIN_MAX_DELAY_MS = 30_000;

export interface LoginThrottleOptions {
  freeAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => number;
}

export interface LoginThrottleDecision {
  allowed: boolean;
  /** Whole seconds a rejected caller should wait, for the `Retry-After` header. */
  retryAfterSeconds: number;
}

export class LoginThrottle {
  private consecutiveFailures = 0;

  private nextAttemptAllowedAtMs = 0;

  private readonly freeAttempts: number;

  private readonly baseDelayMs: number;

  private readonly maxDelayMs: number;

  private readonly now: () => number;

  public constructor(options: LoginThrottleOptions = {}) {
    this.freeAttempts = options.freeAttempts ?? DEFAULT_LOGIN_FREE_ATTEMPTS;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_LOGIN_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_LOGIN_MAX_DELAY_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Checked before the KDF runs, so a throttled attempt costs no memory-hard
   * work either.
   */
  public check(): LoginThrottleDecision {
    const remainingMs = this.nextAttemptAllowedAtMs - this.now();

    if (remainingMs <= 0) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1_000) };
  }

  public recordFailure(): void {
    this.consecutiveFailures += 1;

    if (this.consecutiveFailures <= this.freeAttempts) {
      return;
    }

    const step = this.consecutiveFailures - this.freeAttempts - 1;
    const delayMs = Math.min(this.baseDelayMs * 2 ** step, this.maxDelayMs);

    this.nextAttemptAllowedAtMs = this.now() + delayMs;
  }

  /** A proven credential clears the penalty: the owner is not kept waiting. */
  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.nextAttemptAllowedAtMs = 0;
  }

  public failureCount(): number {
    return this.consecutiveFailures;
  }
}
