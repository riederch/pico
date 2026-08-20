import { afterEach, describe, expect, it } from 'vitest';
import {
  picoCompanionCalendarDaysUntil,
  picoCompanionDisplayDate,
  picoCompanionDisplayInstant,
} from './when.js';

const original = process.env.TZ;
afterEach(() => {
  process.env.TZ = original;
});

describe('ADR 0112 with ADR 0131 A5 - how this client says when', () => {
  it('answers in the reader’s own day, which a UTC cut does not', () => {
    const instant = '2027-01-01T23:30:00.000Z';

    process.env.TZ = 'Pacific/Kiritimati';
    expect(picoCompanionDisplayDate(instant)).toBe('2027-01-02');
    process.env.TZ = 'Pacific/Niue';
    expect(picoCompanionDisplayDate(instant)).toBe('2027-01-01');

    /**
     * The defect this replaces, stated as a test rather than as prose: the
     * ten-character cut is the UTC date wearing no label, so it tells both
     * of those readers the same thing and one of them the wrong day. A
     * ceremony is held whenever it is held, so the band that lands wrong is
     * the reader's offset from UTC - two hours of every twenty-four for
     * Vienna, and fourteen for the reader above.
     */
    expect(instant.slice(0, 10)).toBe('2027-01-01');
  });

  it('says the minute for a deadline, and not the second', () => {
    process.env.TZ = 'Europe/Vienna';
    // 23:30Z on the first is 00:30 on the second in Vienna - the day the cut
    // gets wrong, and the hour a person needs to know they are already past.
    expect(picoCompanionDisplayInstant('2027-01-01T23:30:45.123Z'))
      .toBe('2027-01-02 00:30');
  });

  /**
   * That the rule needs no ICU is not tested here: `check-runtime-floor.mjs`
   * refuses `Intl` and `toLocale*` across this whole package, which is a
   * wider guarantee than a test of one file could make, and writing it twice
   * is how the two copies drift.
   */
  it('refuses a string that is not an instant rather than printing one', () => {
    // `new Date('later today')` is a Date, and it renders as "Invalid Date"
    // in the middle of a sentence a person is being asked to act on.
    expect(() => picoCompanionDisplayDate('later today'))
      .toThrow('invalid_pico_companion_instant');
    expect(() => picoCompanionDisplayInstant('')).toThrow('invalid_pico_companion_instant');
  });

});

describe('ADR 0104 - days counted the way a calendar counts them', () => {
  it('counts midnights, not twenty-four hour blocks', () => {
    process.env.TZ = 'Europe/Vienna';
    const endsAt = '2027-01-01T23:30:00.000Z';
    const now = new Date('2027-01-01T22:00:00.000Z');

    /**
     * The defect this replaces, in one assertion. It is 23:00 for this
     * reader and the authority ends at 00:30 tomorrow night - an hour and a
     * half away, which divided by twenty-four is nought. The window said
     * "That is today" under a line that said "until 2027-01-02".
     */
    expect(Math.floor((Date.parse(endsAt) - now.getTime()) / (24 * 60 * 60 * 1_000))).toBe(0);
    expect(picoCompanionCalendarDaysUntil(endsAt, now)).toBe(1);
    expect(picoCompanionDisplayDate(endsAt)).toBe('2027-01-02');
  });

  it('says nought on the day itself and counts backwards after it', () => {
    process.env.TZ = 'Europe/Vienna';
    expect(picoCompanionCalendarDaysUntil(
      '2027-03-01T08:00:00.000Z', new Date('2027-03-01T20:00:00.000Z'),
    )).toBe(0);
    expect(picoCompanionCalendarDaysUntil(
      '2027-02-27T08:00:00.000Z', new Date('2027-03-01T08:00:00.000Z'),
    )).toBe(-2);
  });

  it('survives the day daylight saving makes twenty-three hours long', () => {
    // 2027-03-28 is when Vienna springs forward; that day is 23 hours, and a
    // block count would drift by one across it.
    process.env.TZ = 'Europe/Vienna';
    expect(picoCompanionCalendarDaysUntil(
      '2027-03-29T10:00:00.000Z', new Date('2027-03-27T10:00:00.000Z'),
    )).toBe(2);
  });
});
