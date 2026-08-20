/**
 * How Pico says *when* to a person. One rule, for the whole product.
 *
 * **Nothing decided this until 2026-08-20**, and by the time it was counted
 * there were five answers. The ADR 0112 recovery alarm - the one a person has
 * forty-eight hours to act on - printed the instant raw: "becomes that
 * identity's only device at 2027-01-01T23:30:00.000Z". The companion window
 * cut the same kind of string to ten characters. The Vault daemon, which
 * renders the sentence a person actually approves (ADR 0106), printed its
 * `validUntil` raw in four statements and a fifth in the daemon itself. The
 * Electron presentation adapter printed four more. And ADR 0131 A5 puts a
 * second client beside them, where Java's default formatter would answer a
 * sixth way.
 *
 * The cut is the one worth naming, because it looks right. Ten characters of
 * an ISO instant is the *UTC* calendar date wearing no label. For an instant
 * at 23:30Z a person in Vienna is already on the next day and the row says the
 * previous one; for a person on Kiritimati the same row is a day and a half
 * out. Roughly one enrolment in twelve lands in that band for a reader two
 * hours east of UTC - the time of day a ceremony happens to be held is
 * nobody's decision, so it is uniform.
 *
 * **The raw form is the one worth naming second**, because it looks harmless.
 * `until 2027-08-01T10:00:00.000Z` in a sentence somebody is being asked to
 * approve is a timezone, a precision and a punctuation style that no reader
 * asked for, sitting in the one string they are supposed to check.
 *
 * **Local, and without ICU.** `getFullYear`, `getMonth`, `getDate`,
 * `getHours` and `getMinutes` are ECMA-262 core and read the host's own
 * timezone; `Intl` and `toLocaleDateString` are absent from the runtime
 * Android embeds (ADR 0131 A1), and `check-runtime-floor.mjs` refuses them in
 * this package. So the rule a phone inherits is the rule the desktop runs,
 * rather than the nearest thing the phone can build.
 *
 * The shape stays numeric and ISO-ordered for the same reason a fingerprint
 * stays hex: month names would be a language decision this module has no
 * business making, and `2027-01-02` reads the same to everybody who has seen
 * the row above it.
 *
 * **Why here rather than in the companion**, where it was first written: the
 * Vault daemon's sentence and the companion's window are read by one person in
 * one dialogue, and `@pico/companion` depends on `@pico/vault-daemon`, so the
 * companion cannot be the home of a rule the Vault needs. The same move, for
 * the same reason, as `fingerprint-display.ts` next door.
 *
 * The Home's own web UI is deliberately not a caller: it runs in a browser
 * that has ICU, and `Intl.DateTimeFormat(undefined, …)` answers in the
 * reader's own locale as well as their own zone. That is a better answer where
 * it is available, and it is a different reader on a different device.
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
    throw new Error('invalid_pico_instant');
  }
  return at;
}

/** The calendar date the reader is on when that instant arrives. */
export function picoDisplayDate(instant: string): string {
  const at = parse(instant);
  return `${at.getFullYear()}-${twoDigits(at.getMonth() + 1)}-${twoDigits(at.getDate())}`;
}

/**
 * Date and minute, for a moment a person has to be somewhere before.
 *
 * Seconds are dropped: a deadline read to the second invites the belief that
 * the last minute is usable, and none of these deadlines is that sharp.
 */
export function picoDisplayInstant(instant: string): string {
  const at = parse(instant);
  return `${picoDisplayDate(instant)} `
    + `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
}

/**
 * Whole days from one instant to another, counted the way a calendar counts.
 *
 * **Not the same as dividing by twenty-four hours**, which is what the window
 * did until 2026-08-20 - and the difference showed up in two adjacent
 * sentences. At 23:00 in Vienna, an authority ending at 00:30 the next night
 * is 1.5 hours away, so the block count said nought and the row said "That is
 * today" directly beneath "It can act as you until 2027-01-02". A person who
 * believes the second sentence renews a day late.
 *
 * So both ends are taken to their local midnight first, and what is counted is
 * the number of midnights between them. `new Date(y, m, d)` builds in the
 * host's own zone with no ICU, and the rounding absorbs the twenty-three and
 * twenty-five hour days that daylight saving makes.
 *
 * It lives beside the two renderings rather than in whichever surface counts,
 * because it exists to put a number next to a date those two produced - and a
 * count that disagreed with the date beneath it is the defect it was written
 * for.
 */
export function picoCalendarDaysUntil(
  instant: string,
  now: Date = new Date(),
): number {
  const midnight = (at: Date): number =>
    new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  return Math.round((midnight(parse(instant)) - midnight(now)) / (24 * 60 * 60 * 1_000));
}
