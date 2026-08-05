import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultPicoRelatedQuota,
  defaultPicoStrangerQuota,
  PicoRequestQuota,
} from './request-quota.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('ADR 0119 Q4 relationship-keyed request quotas', () => {
  it('gives the unauthenticated tier one shared bucket and refuses past it', () => {
    let monotonicMs = 0;
    const quota = new PicoRequestQuota({
      stranger: { capacity: 3, refillPerMinute: 60 },
      monotonicNow: () => monotonicMs,
    });

    expect(quota.admitStranger()).toBe(true);
    expect(quota.admitStranger()).toBe(true);
    expect(quota.admitStranger()).toBe(true);
    expect(quota.admitStranger()).toBe(false);

    // One token per second at 60/min. Half a second buys nothing; a full one
    // buys exactly one request, not a refilled bucket.
    monotonicMs += 500;
    expect(quota.admitStranger()).toBe(false);
    monotonicMs += 500;
    expect(quota.admitStranger()).toBe(true);
    expect(quota.admitStranger()).toBe(false);
  });

  it('does not refill when the wall clock is wound forward (ADR 0120 N1)', () => {
    // The whole reason the bucket reads a monotonic clock. If refill followed
    // `Date.now`, anyone able to nudge the system time would refill the budget
    // at will and the quota would be a formality.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-05T10:00:00.000Z'));

    const quota = new PicoRequestQuota({
      stranger: { capacity: 2, refillPerMinute: 60 },
      // Monotonic time deliberately frozen while the wall clock moves.
      monotonicNow: () => 0,
    });

    expect(quota.admitStranger()).toBe(true);
    expect(quota.admitStranger()).toBe(true);
    expect(quota.admitStranger()).toBe(false);

    vi.setSystemTime(new Date('2027-08-05T10:00:00.000Z'));
    expect(quota.admitStranger()).toBe(false);
  });

  it('keeps relationships independent, so one runaway peer contains itself', () => {
    let monotonicMs = 0;
    const quota = new PicoRequestQuota({
      related: { capacity: 2, refillPerMinute: 60 },
      monotonicNow: () => monotonicMs,
    });

    expect(quota.admitRelationship('aa')).toBe(true);
    expect(quota.admitRelationship('aa')).toBe(true);
    expect(quota.admitRelationship('aa')).toBe(false);

    // The other relationship is untouched by the first one's behavior. This is
    // what keying on relationship buys that a single global bucket cannot.
    expect(quota.admitRelationship('bb')).toBe(true);
    expect(quota.admitRelationship('bb')).toBe(true);
    expect(quota.admitRelationship('bb')).toBe(false);
  });

  it('holds the unauthenticated tier tighter than a relationship', () => {
    // The tiers are only meaningful if the stranger one is the smaller. A
    // deployment may retune both; the default ordering is the decision.
    expect(defaultPicoStrangerQuota.capacity)
      .toBeLessThan(defaultPicoRelatedQuota.capacity);
    expect(defaultPicoStrangerQuota.refillPerMinute)
      .toBeLessThan(defaultPicoRelatedQuota.refillPerMinute);
  });

  it('evicts the fullest relationship, never the one being throttled', () => {
    let monotonicMs = 0;
    const quota = new PicoRequestQuota({
      related: { capacity: 2, refillPerMinute: 60 },
      maxRelationships: 2,
      monotonicNow: () => monotonicMs,
    });

    // `drained` spends everything and stays drained; `fresh` spends one.
    expect(quota.admitRelationship('drained')).toBe(true);
    expect(quota.admitRelationship('drained')).toBe(true);
    expect(quota.admitRelationship('drained')).toBe(false);
    expect(quota.admitRelationship('fresh')).toBe(true);

    // A third key forces an eviction. Eviction hands back a full budget, so
    // evicting `drained` would reset exactly the caller currently held down.
    expect(quota.admitRelationship('third')).toBe(true);
    expect(quota.relationshipCount()).toBe(2);
    expect(quota.admitRelationship('drained')).toBe(false);
  });

  it('ranks eviction on refilled tokens, not on a stale drained count', () => {
    // Counter-proof for the ordering bug this catches: a bucket drained long
    // ago keeps its drained count until something touches it. Ranking on that
    // stale number would rate a long-idle caller as the most throttled one and
    // protect it, while evicting - and so resetting - a caller that genuinely
    // is being held down right now.
    // Insertion order is load-bearing here, and getting it wrong makes the test
    // pass for the wrong reason. A bucket being throttled sits at zero tokens,
    // which is also the lowest stale count, so it normally loses the "fullest"
    // race anyway. The bug only surfaces on a tie at zero, where the scan keeps
    // whichever key it saw first - so `held-down` is created first on purpose.
    let monotonicMs = 0;
    const quota = new PicoRequestQuota({
      related: { capacity: 2, refillPerMinute: 60 },
      maxRelationships: 2,
      monotonicNow: () => monotonicMs,
    });

    expect(quota.admitRelationship('held-down')).toBe(true);
    expect(quota.admitRelationship('long-idle')).toBe(true);
    expect(quota.admitRelationship('long-idle')).toBe(true);
    expect(quota.admitRelationship('long-idle')).toBe(false);

    // An hour passes. `long-idle` has in fact refilled to full, but nothing has
    // touched it, so its stored count is still zero.
    monotonicMs += 60 * 60 * 1_000;

    // `held-down` drains right now and is the one genuinely being throttled.
    // Its stored count is zero too - and it is the older key.
    expect(quota.admitRelationship('held-down')).toBe(true);
    expect(quota.admitRelationship('held-down')).toBe(true);
    expect(quota.admitRelationship('held-down')).toBe(false);

    expect(quota.admitRelationship('third')).toBe(true);
    expect(quota.relationshipCount()).toBe(2);
    // `held-down` must still be refused: `long-idle` was the right victim.
    expect(quota.admitRelationship('held-down')).toBe(false);
  });

  it('refills nothing when a supplied clock goes backwards', () => {
    let monotonicMs = 10_000;
    const quota = new PicoRequestQuota({
      stranger: { capacity: 1, refillPerMinute: 60 },
      monotonicNow: () => monotonicMs,
    });

    expect(quota.admitStranger()).toBe(true);
    expect(quota.admitStranger()).toBe(false);

    // Going backwards must not drain further or credit anything; the bucket
    // simply does not move until time passes again.
    monotonicMs = 0;
    expect(quota.admitStranger()).toBe(false);
    monotonicMs = 10_000;
    expect(quota.admitStranger()).toBe(false);
    monotonicMs = 11_000;
    expect(quota.admitStranger()).toBe(true);
  });

  it('refuses a budget that would disable the bound', () => {
    for (const budget of [
      { capacity: 0, refillPerMinute: 60 },
      { capacity: -1, refillPerMinute: 60 },
      { capacity: 10, refillPerMinute: 0 },
      { capacity: Number.NaN, refillPerMinute: 60 },
      { capacity: 10, refillPerMinute: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => new PicoRequestQuota({ stranger: budget }))
        .toThrow(/invalid_pico_request_quota/u);
    }
    expect(() => new PicoRequestQuota({ maxRelationships: 0 }))
      .toThrow(/invalid_pico_request_quota/u);
  });
});
