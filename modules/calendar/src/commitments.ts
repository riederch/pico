import type { PicoModuleCommitment } from '@pico/protocol/module';
import type { PicoTimeBoundEntry } from '@pico/protocol/time-bound-entry';

/**
 * ADR 0127 M4. What the calendar has promised and not yet done.
 *
 * An entry that still waits is a promise the person stopped carrying
 * themselves the moment they wrote it down - which is the whole argument ADR
 * 0118 O1 made for putting this family on the floor. Switching the calendar
 * off means it will not be kept, and that is worth saying out loud.
 *
 * **Overdue entries count.** They are not stale, they are the promises already
 * broken by the longest, and dropping them from the statement would hide
 * exactly the ones a person would most want to hear about.
 *
 * **A raised entry is not a commitment.** It happened. Listing it would tell
 * someone they are losing something they already have.
 *
 * Nothing here reads content. The commitment names its kind, its instant and
 * an opaque handle, because ADR 0075 A7 keeps administration separate from
 * readership: whoever may switch this module off is not thereby entitled to
 * read what it holds.
 */
export function picoCalendarStandingCommitments(
  entries: readonly PicoTimeBoundEntry[],
): readonly PicoModuleCommitment[] {
  return Object.freeze(entries
    .filter((entry) => entry.raisedAt === undefined)
    .map((entry) => Object.freeze({
      module: 'calendar' as const,
      // The kind, not the words. A surface turns this into a sentence.
      kind: 'calendar.time_bound_entry',
      dueAt: entry.dueAt,
      reference: entry.memoryItemId,
    })));
}
