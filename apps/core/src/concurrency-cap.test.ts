import { describe, expect, it } from 'vitest';
import {
  defaultPicoFoundationMaxConnections,
  defaultPicoFoundationMaxInFlight,
  defaultPicoLinkIntakeMaxConnections,
  defaultPicoLinkIntakeMaxInFlight,
  PicoConcurrencyCap,
} from './concurrency-cap.js';

describe('ADR 0119 Q4 concurrency caps', () => {
  it('admits up to the cap and refuses past it', () => {
    const cap = new PicoConcurrencyCap(2);

    expect(cap.acquire()).toBe(true);
    expect(cap.acquire()).toBe(true);
    expect(cap.acquire()).toBe(false);
    expect(cap.inFlightCount()).toBe(2);
    expect(cap.rejectedCount()).toBe(1);

    cap.release();
    expect(cap.acquire()).toBe(true);
    expect(cap.acquire()).toBe(false);
  });

  it('does not mint capacity when a release arrives twice', () => {
    // A response that both errors and closes could fire two releases. Letting
    // the counter go negative would silently raise the cap for the lifetime of
    // the process - the bound would still look present and no longer bind.
    const cap = new PicoConcurrencyCap(1);

    expect(cap.acquire()).toBe(true);
    cap.release();
    cap.release();
    cap.release();
    expect(cap.inFlightCount()).toBe(0);

    expect(cap.acquire()).toBe(true);
    expect(cap.acquire()).toBe(false);
  });

  it('refuses a cap that would not bound anything', () => {
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new PicoConcurrencyCap(invalid)).toThrow(/invalid_pico_concurrency_cap/u);
    }
  });

  it('holds the published intake tighter than the local surface', () => {
    // The intake is the surface a person exposes to a network; the Foundation
    // listener is the one their own device uses. The ordering is the decision,
    // not the numbers.
    expect(defaultPicoLinkIntakeMaxInFlight)
      .toBeLessThan(defaultPicoFoundationMaxInFlight);
    expect(defaultPicoLinkIntakeMaxConnections)
      .toBeLessThan(defaultPicoFoundationMaxConnections);
  });
});
