import { boundPicoProjection } from '@pico/protocol/bounded-projection';
import {
  duePicoTimeBoundEntries,
  maxPicoHomeDueEntries,
  maxPicoTimeBoundEntryTitleChars,
  type PicoHomeDueEntriesView,
  type PicoTimeBoundEntry,
} from '@pico/protocol/time-bound-entry';

/**
 * ADR 0127 M1. The calendar's composition: what generic entries *mean*.
 *
 * Everything mechanical here belongs to the core and stays there. The store
 * holds the rows, `due_at` and `raised_at` are core columns, the scheduler is
 * a core capability, and readership is a core guard. What is left - and what
 * this module is - is the reading: which entries a person is shown, in what
 * order, and what a title's absence is allowed to say.
 *
 * **It holds no guard.** `readTitle` is a port, not a decision: the module
 * asks the core whether a title may be read and takes the answer. A module may
 * ask; it may not decide. Moving the readership check in here would turn one
 * guard with one failing counter-proof into two places that must agree.
 *
 * **It owns no storage.** Entries are memory items under core custody, which is
 * why nothing in this file knows what a table is, and why retention, shredding
 * and the ADR 0119 Q5 ceilings keep working with no calendar-specific handling.
 */
export interface PicoCalendarEntryCandidate extends PicoTimeBoundEntry {
  /**
   * Which domain the entry's words live in. Carried so the module can ask the
   * core about *this* entry; the module never interprets the value.
   */
  privacyDomain: string;
}

export interface PicoCalendarPorts {
  /**
   * Entries the core holds, up to a limit the caller sets.
   *
   * The limit is a parameter rather than a constant in here because the bound
   * belongs to whoever is answering a request - the module does not get to
   * decide how much of someone else's store it reads.
   */
  timeBoundEntries(limit: number): readonly PicoCalendarEntryCandidate[];
  /**
   * ADR 0127 M5. How many are due in total, which is not how many the window
   * above returned.
   *
   * A second question rather than a richer answer to the first, because the
   * cap belongs to whoever is answering a request and the count belongs to the
   * store. The two are separate reads, so under a concurrent write they can
   * skew by one - which turns "and 12 more" into "and 13 more" and is a
   * different order of wrong from the silent undercount it replaces.
   */
  countDueEntries(nowIso: string): number;
  /**
   * The words of one entry, if the asking party may read that domain.
   *
   * Returns `undefined` for every reason - no grant, no key, shredded, gone -
   * and that single silence is the point. ADR 0077 C4: telling the reasons
   * apart would let a caller enumerate the domains it is excluded from.
   */
  readTitle(input: { memoryItemId: string; privacyDomain: string }): string | undefined;
  now(): Date;
}

/**
 * ADR 0118 O1 over ADR 0127 M1. What a device is told about entries that are due.
 *
 * Readership is asked per entry, not per request: ADR 0077 keeps "may use this
 * Home" separate from "may read this domain", so a caller with a grant on one
 * domain and none on another gets exactly one title.
 *
 * An entry is never dropped for an unreadable title. That something is due is
 * the fact this family exists to deliver, and withholding it because the words
 * are private would trade a privacy rule for a broken promise.
 */
export function picoCalendarDueEntriesView(
  ports: PicoCalendarPorts,
): PicoHomeDueEntriesView {
  const nowIso = ports.now().toISOString();
  const candidates = ports.timeBoundEntries(maxPicoHomeDueEntries);
  const byMemoryItemId = new Map(candidates.map(
    (entry) => [entry.memoryItemId, entry.privacyDomain],
  ));
  const due = duePicoTimeBoundEntries({ entries: candidates, nowIso });
  // ADR 0127 M5. Bounded through the core capability, so the count a person
  // is told is how many are due rather than how many fitted.
  const bounded = boundPicoProjection({ items: due, max: maxPicoHomeDueEntries });
  // Never fewer than what is listed. Two reads can skew, and a list longer
  // than its own count is incoherent to send - the parser would refuse it, and
  // a benign race must not turn into a failed read.
  const total = Math.max(ports.countDueEntries(nowIso), bounded.shown.length);

  return {
    total,
    entries: bounded.shown.map((entry) => {
      const privacyDomain = byMemoryItemId.get(entry.memoryItemId);
      const title = privacyDomain === undefined
        ? undefined
        : ports.readTitle({ memoryItemId: entry.memoryItemId, privacyDomain });
      return {
        memoryItemId: entry.memoryItemId,
        kind: entry.kind,
        dueAt: entry.dueAt,
        ...(title === undefined
          ? {}
          : { title: title.slice(0, maxPicoTimeBoundEntryTitleChars) }),
      };
    }),
  };
}

/**
 * The three states a person sees, and the reason there are exactly three.
 *
 * `raised` is terminal and is checked first: an entry that has been raised is
 * not overdue no matter how far its instant has passed, because the promise was
 * kept. Ordering these the other way would show every kept promise as a failure.
 *
 * `overdue` is not an error state. ADR 0118 O1 deliberately still raises an
 * entry whose instant passed while the Home was off, so lateness is information
 * the surface says out loud rather than a condition it hides.
 */
export const picoCalendarEntryStates = ['waiting', 'overdue', 'raised'] as const;
export type PicoCalendarEntryState = typeof picoCalendarEntryStates[number];

export function picoCalendarEntryState(input: {
  entry: PicoTimeBoundEntry;
  nowIso: string;
}): PicoCalendarEntryState {
  if (input.entry.raisedAt !== undefined) {
    return 'raised';
  }
  return Date.parse(input.entry.dueAt) <= Date.parse(input.nowIso) ? 'overdue' : 'waiting';
}

/**
 * The calendar's editorial order: what needs the person now, then what is
 * coming, then what is done.
 *
 * Overdue first because it is the only group where waiting costs something, and
 * oldest-first within it because the longest-broken promise is the one to
 * answer. Raised entries stay in the list rather than disappearing - an entry
 * that vanished the moment it was delivered would leave a person unable to
 * check whether it ever was.
 */
export function picoCalendarAgenda(input: {
  entries: readonly PicoTimeBoundEntry[];
  nowIso: string;
}): readonly PicoTimeBoundEntry[] {
  const rank: Record<PicoCalendarEntryState, number> = { overdue: 0, waiting: 1, raised: 2 };
  return Object.freeze(input.entries
    .slice()
    .sort((left, right) => {
      const byState = rank[picoCalendarEntryState({ entry: left, nowIso: input.nowIso })]
        - rank[picoCalendarEntryState({ entry: right, nowIso: input.nowIso })];
      return byState !== 0
        ? byState
        : Date.parse(left.dueAt) - Date.parse(right.dueAt);
    }));
}
