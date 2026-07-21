import { describe, expect, it } from 'vitest';
import { LoginThrottle } from './login-throttle.js';

describe('login throttle', () => {
  it('lets ordinary typos through and then slows guessing down', () => {
    let nowMs = 1_000;
    const throttle = new LoginThrottle({ now: () => nowMs });

    // Three free attempts: a typo costs the owner nothing.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(throttle.check().allowed).toBe(true);
      throttle.recordFailure();
    }
    expect(throttle.check().allowed).toBe(true);

    // From the fourth failure the delay grows and is reported for Retry-After.
    throttle.recordFailure();
    expect(throttle.check()).toEqual({ allowed: false, retryAfterSeconds: 1 });

    nowMs += 1_000;
    expect(throttle.check().allowed).toBe(true);
    throttle.recordFailure();
    expect(throttle.check()).toEqual({ allowed: false, retryAfterSeconds: 2 });

    nowMs += 2_000;
    throttle.recordFailure();
    expect(throttle.check()).toEqual({ allowed: false, retryAfterSeconds: 4 });
  });

  it('caps the delay so a hostile caller cannot lock the owner out', () => {
    let nowMs = 1_000;
    const throttle = new LoginThrottle({ now: () => nowMs });

    // A lockout would let an attacker deny the owner their own appliance, so
    // the penalty is a bounded wait no matter how long the guessing runs.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      throttle.recordFailure();
      nowMs += 60_000;
    }

    throttle.recordFailure();
    expect(throttle.check()).toEqual({ allowed: false, retryAfterSeconds: 30 });

    nowMs += 30_000;
    expect(throttle.check().allowed).toBe(true);
  });

  it('clears the penalty once the real credential is proven', () => {
    let nowMs = 1_000;
    const throttle = new LoginThrottle({ now: () => nowMs });

    for (let attempt = 0; attempt < 6; attempt += 1) {
      throttle.recordFailure();
    }
    expect(throttle.check().allowed).toBe(false);
    expect(throttle.failureCount()).toBe(6);

    throttle.recordSuccess();

    expect(throttle.check()).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(throttle.failureCount()).toBe(0);
  });
});
