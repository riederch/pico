import { describe, expect, it } from 'vitest';
import { boundPicoProjection, picoProjectionRemainder } from './bounded-projection.js';

describe('ADR 0127 M5 a list that says how much you are not seeing', () => {
  const items = Array.from({ length: 60 }, (_value, index) => index);

  it('reports the true count, never the shown length', () => {
    // The failure this exists to prevent: a device with sixty entries due was
    // told "50 entries are due", and the number a person read was a fact about
    // the cap rather than about their day.
    const bounded = boundPicoProjection({ items, max: 50 });
    expect(bounded.total).toBe(60);
    expect(bounded.shown).toHaveLength(50);
    expect(picoProjectionRemainder(bounded)).toBe(10);
  });

  it('keeps the order it was given, because the caller established it', () => {
    expect(boundPicoProjection({ items: ['c', 'a', 'b'], max: 2 }).shown).toEqual(['c', 'a']);
  });

  it('leaves a short list alone and reports no remainder', () => {
    const bounded = boundPicoProjection({ items: [1, 2], max: 50 });
    expect(bounded.total).toBe(2);
    expect(bounded.shown).toEqual([1, 2]);
    expect(picoProjectionRemainder(bounded)).toBe(0);
  });

  it('freezes what it hands back', () => {
    const bounded = boundPicoProjection({ items, max: 3 });
    expect(Object.isFrozen(bounded)).toBe(true);
    expect(Object.isFrozen(bounded.shown)).toBe(true);
  });

  it('refuses a bound that would show nothing while claiming a total', () => {
    // That reads as an outage rather than as a cap.
    for (const max of [0, -1, 1.5, Number.NaN]) {
      expect(() => boundPicoProjection({ items, max })).toThrow('invalid_pico_projection_bound');
    }
  });
});
