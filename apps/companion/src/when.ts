/**
 * How this client says *when* to a person.
 *
 * **Nothing decided this until 2026-08-20**, and three answers had grown.
 * The ADR 0112 recovery alarm - the one a person has forty-eight hours to
 * act on - printed the instant raw: "becomes that identity's only device at
 * 2027-01-01T23:30:00.000Z". The window cut the same kind of string to ten
 * characters, which is the *UTC* calendar date wearing no label. And ADR
 * 0131 A5 puts a second client next to them, where Java's default formatter
 * would answer a third way.
 *
 * The cut is the one worth naming, because it looks right. For an instant
 * at 23:30Z, a person in Vienna is already on the next day and the window
 * says the previous one; for a person on Kiritimati the same row is a day
 * and a half out. Roughly one enrolment in twelve lands in that band for a
 * reader two hours east of UTC - the time of day a ceremony happens to be
 * held is nobody's decision, so it is uniform.
 *
 * **Local, and without ICU.** `getFullYear`, `getMonth`, `getDate`,
 * `getHours` and `getMinutes` are ECMA-262 core and read the host's own
 * timezone; `Intl` and `toLocaleDateString` are not available at all in the
 * runtime Android uses (ADR 0131 A1, and `check-runtime-floor.mjs` refuses
 * them in this package). So the rule a phone inherits is the rule the
 * desktop runs, rather than the nearest thing the phone can build.
 *
 * The shape stays numeric and ISO-ordered for the same reason a fingerprint
 * stays hex: month names would be a language decision this module has no
 * business making, and `2027-01-02` reads the same to everybody who has seen
 * the row above it.
 */

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function parse(instant: string): Date {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) {
    // The caller had a signed record or an ISO string from the Home. If it is
    // neither, saying so beats printing "Invalid Date" into a sentence a
    // person is being asked to act on.
    throw new Error('invalid_pico_companion_instant');
  }
  return at;
}

/** The calendar date the reader is on when that instant arrives. */
export function picoCompanionDisplayDate(instant: string): string {
  const at = parse(instant);
  return `${at.getFullYear()}-${twoDigits(at.getMonth() + 1)}-${twoDigits(at.getDate())}`;
}

/**
 * Date and minute, for a moment a person has to be somewhere before.
 *
 * Seconds are dropped: a deadline read to the second invites the belief that
 * the last minute is usable, and none of these deadlines is that sharp.
 */
export function picoCompanionDisplayInstant(instant: string): string {
  const at = parse(instant);
  return `${picoCompanionDisplayDate(instant)} `
    + `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
}
