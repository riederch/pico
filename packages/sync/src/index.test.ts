import { describe, expect, it } from 'vitest';
import { LamportClock, mergeVersionVector, updateVersionVector } from './index.js';

describe('LamportClock', () => {
  it('starts at zero by default', () => {
    const clock = new LamportClock();
    expect(clock.current()).toBe(0);
  });

  it('increments on local tick', () => {
    const clock = new LamportClock();
    expect(clock.tick()).toBe(1);
    expect(clock.tick()).toBe(2);
  });

  it('moves beyond received remote values', () => {
    const clock = new LamportClock(3);
    expect(clock.receive(10)).toBe(11);
    expect(clock.current()).toBe(11);
  });

  it('keeps monotonic order when receiving smaller values', () => {
    const clock = new LamportClock(10);
    expect(clock.receive(4)).toBe(11);
  });

  it('rejects invalid initial values', () => {
    expect(() => new LamportClock(-1)).toThrow();
    expect(() => new LamportClock(1.5)).toThrow();
    expect(() => new LamportClock(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('rejects invalid remote values', () => {
    const clock = new LamportClock();
    expect(() => clock.receive(-1)).toThrow();
    expect(() => clock.receive(1.5)).toThrow();
    expect(() => clock.receive(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('rejects advancing beyond safe integer range', () => {
    expect(() => new LamportClock(Number.MAX_SAFE_INTEGER).tick()).toThrow(
      'LamportClock cannot advance beyond Number.MAX_SAFE_INTEGER.',
    );

    const clock = new LamportClock(Number.MAX_SAFE_INTEGER - 1);
    expect(() => clock.receive(Number.MAX_SAFE_INTEGER)).toThrow(
      'LamportClock cannot advance beyond Number.MAX_SAFE_INTEGER.',
    );
  });
});

describe('VersionVector helpers', () => {
  it('merges vectors by taking the highest value per device', () => {
    expect(mergeVersionVector({ phone: 2, desktop: 5 }, { phone: 4, tablet: 1 })).toEqual({
      phone: 4,
      desktop: 5,
      tablet: 1,
    });
  });

  it('updates a device entry without decreasing it', () => {
    expect(updateVersionVector({ phone: 8 }, 'phone', 3)).toEqual({ phone: 8 });
    expect(updateVersionVector({ phone: 8 }, 'phone', 9)).toEqual({ phone: 9 });
  });

  it('rejects invalid device or lamport input', () => {
    expect(() => updateVersionVector({}, '', 1)).toThrow();
    expect(() => updateVersionVector({}, '   ', 1)).toThrow();
    expect(() => updateVersionVector({}, 'phone', -1)).toThrow();
    expect(() => updateVersionVector({}, 'phone', Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });

  it('rejects invalid existing vector entries', () => {
    expect(() => mergeVersionVector({ '': 1 }, {})).toThrow();
    expect(() => mergeVersionVector({}, { phone: -1 })).toThrow();
    expect(() => mergeVersionVector({}, { phone: 1.5 })).toThrow();
    expect(() => updateVersionVector({ phone: Number.MAX_SAFE_INTEGER + 1 }, 'phone', 1)).toThrow();
  });
});
