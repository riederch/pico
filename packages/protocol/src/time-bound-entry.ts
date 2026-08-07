/**
 * ADR 0118 O1, the fifth floor family: an appointment or reminder recorded with
 * a due instant, and the local scheduling that raises it.
 *
 * It is on the floor for the same reason capture is - its value is destroyed by
 * deferral. An appointment not entered now is forgotten by evening, and one
 * that fails to raise is worse than one never entered, because the person
 * stopped carrying it themselves the moment they wrote it down.
 *
 * **Which clock, and why it is not the one ADR 0120 insists on elsewhere.**
 * ADR 0120 N2 refuses to let a wall clock retire an objection window, because a
 * wall clock is a claim and a claim must not consume a veto period. A reminder
 * is the opposite kind of thing: the person said "nine in the morning", and the
 * wall clock is precisely what they meant. Applying the monotonic floor here
 * would delay every reminder on a Home that had been switched off - inverting
 * the intent rather than protecting it.
 *
 * So this is a wall-clock commitment, deliberately, and the residual is stated
 * rather than argued away: a wall clock wound forward raises reminders early,
 * one wound back delays them. ADR 0120 N5 already makes divergence visible, and
 * no reminder decides authority, so the harm stops at a badly timed prompt.
 */
export const picoTimeBoundEntryKinds = ['appointment', 'reminder'] as const;
export type PicoTimeBoundEntryKind = typeof picoTimeBoundEntryKinds[number];

export const maxPicoTimeBoundEntryTitleChars = 200;

export interface PicoTimeBoundEntry {
  memoryItemId: string;
  kind: PicoTimeBoundEntryKind;
  title: string;
  /** The instant the person meant, on the wall clock. */
  dueAt: string;
  /**
   * When a surface confirmed the person was told.
   *
   * **Not "when the Home noticed".** The Home cannot observe that a
   * notification was shown, so it does not get to say so: only an
   * acknowledgement from whoever delivered it sets this. Absent means the
   * promise is still outstanding, and an outstanding promise keeps being
   * offered - repetition is the loud failure, silence is the quiet one, and
   * ADR 0118 O1 exists because the quiet one is worse.
   */
  raisedAt?: string;
  /**
   * When the Home noticed the instant had passed.
   *
   * Separate from `raisedAt` because they are different facts and only one of
   * them the Home can honestly claim. This one stops the scheduler announcing
   * the same entry on every tick; it never means anybody heard.
   */
  announcedAt?: string;
}

function isCanonicalInstant(value: unknown): value is string {
  return typeof value === 'string'
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

export function parsePicoTimeBoundEntry(value: unknown): PicoTimeBoundEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_time_bound_entry');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const withoutRaised = ['dueAt', 'kind', 'memoryItemId', 'title'];
  const withRaised = [...withoutRaised, 'raisedAt'].sort();
  const matches = (expected: readonly string[]): boolean =>
    keys.length === expected.length && keys.every((key, index) => key === expected[index]);
  if (!matches(withoutRaised) && !matches(withRaised)) {
    throw new Error('invalid_pico_time_bound_entry');
  }
  if (typeof record.memoryItemId !== 'string' || record.memoryItemId === '') {
    throw new Error('invalid_pico_time_bound_entry');
  }
  if (typeof record.kind !== 'string'
    || !(picoTimeBoundEntryKinds as readonly string[]).includes(record.kind)) {
    throw new Error('invalid_pico_time_bound_entry_kind');
  }
  if (typeof record.title !== 'string'
    || record.title.trim() === ''
    || record.title.length > maxPicoTimeBoundEntryTitleChars) {
    throw new Error('invalid_pico_time_bound_entry_title');
  }
  if (!isCanonicalInstant(record.dueAt)) {
    // Canonical, not merely parseable: two spellings of the same instant would
    // compare unequal and sort apart, and this value decides when something
    // reaches the person.
    throw new Error('invalid_pico_time_bound_entry_due');
  }
  if (record.raisedAt !== undefined && !isCanonicalInstant(record.raisedAt)) {
    throw new Error('invalid_pico_time_bound_entry_raised');
  }
  return Object.freeze({
    memoryItemId: record.memoryItemId,
    kind: record.kind as PicoTimeBoundEntryKind,
    title: record.title,
    dueAt: record.dueAt,
    ...(record.raisedAt === undefined ? {} : { raisedAt: record.raisedAt as string }),
  });
}

/**
 * ADR 0118 O1. What a device is told over the Link about entries that are due.
 *
 * The title is present only where the asking device may actually read that
 * privacy domain - membership is not enough, because ADR 0077 keeps "may use
 * this Home" separate from "may read this domain" and the Link's own
 * authorization only answers the first. So readership is asked per entry, and
 * the title rides the same grant that would let the person read the item any
 * other way.
 *
 * **Its absence carries no reason, deliberately.** "You may not read that
 * domain" and "the Home cannot decrypt it right now" are one indistinguishable
 * silence. Telling them apart would make this reply a grant oracle: a device
 * could learn which domains it is excluded from, which is exactly what a
 * non-enumerating denial exists to prevent (ADR 0077 C4).
 *
 * The entry itself is never dropped for an unreadable title. That something is
 * due is the fact this family exists to deliver; hiding it because the words
 * are private would trade a privacy rule for a broken promise.
 */
export interface PicoHomeDueEntry {
  memoryItemId: string;
  kind: PicoTimeBoundEntryKind;
  dueAt: string;
  /** Present only where the asking device may read the entry's domain. */
  title?: string;
}

export interface PicoHomeDueEntriesView {
  entries: readonly PicoHomeDueEntry[];
  /**
   * ADR 0127 M5. How many are due, which is not how many are listed.
   *
   * The list is capped at `maxPicoHomeDueEntries`; before this field existed
   * a device with sixty entries due was told "50 entries are due", and the
   * number a person read was a fact about the cap rather than about their day.
   * On a family that exists to keep promises, that is the wrong direction to
   * be wrong in.
   */
  total: number;
}

export const maxPicoHomeDueEntries = 50;

export function parsePicoHomeDueEntriesView(value: unknown): PicoHomeDueEntriesView {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_home_due_entries');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2
    || keys[0] !== 'entries'
    || keys[1] !== 'total'
    || !Array.isArray(record.entries)) {
    throw new Error('invalid_pico_home_due_entries');
  }
  if (record.entries.length > maxPicoHomeDueEntries) {
    throw new Error('pico_home_due_entries_too_many');
  }
  if (typeof record.total !== 'number'
    || !Number.isInteger(record.total)
    || record.total < record.entries.length) {
    // A total below what is listed is not a smaller claim, it is an
    // incoherent one - and it would make "and N more" negative.
    throw new Error('invalid_pico_home_due_entries_total');
  }
  const entries = (record.entries as unknown[]).map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('invalid_pico_home_due_entries');
    }
    const row = entry as Record<string, unknown>;
    const rowKeys = Object.keys(row).sort();
    const withoutTitle = ['dueAt', 'kind', 'memoryItemId'];
    const withTitle = [...withoutTitle, 'title'].sort();
    const matchesRow = (expected: readonly string[]): boolean =>
      rowKeys.length === expected.length
      && rowKeys.every((key, index) => key === expected[index]);
    if (!matchesRow(withoutTitle) && !matchesRow(withTitle)) {
      throw new Error('invalid_pico_home_due_entries');
    }
    if (row.title !== undefined
      && (typeof row.title !== 'string'
        || row.title.trim() === ''
        || row.title.length > maxPicoTimeBoundEntryTitleChars)) {
      // An empty title is not a title; it would render as a blank line the
      // person has to interpret, which is worse than saying nothing.
      throw new Error('invalid_pico_home_due_entries');
    }
    if (typeof row.memoryItemId !== 'string' || row.memoryItemId === '') {
      throw new Error('invalid_pico_home_due_entries');
    }
    if (typeof row.kind !== 'string'
      || !(picoTimeBoundEntryKinds as readonly string[]).includes(row.kind)) {
      throw new Error('invalid_pico_home_due_entries');
    }
    if (!isCanonicalInstant(row.dueAt)) {
      throw new Error('invalid_pico_home_due_entries');
    }
    return Object.freeze({
      memoryItemId: row.memoryItemId,
      kind: row.kind as PicoTimeBoundEntryKind,
      dueAt: row.dueAt,
      ...(row.title === undefined ? {} : { title: row.title as string }),
    });
  });
  return Object.freeze({
    entries: Object.freeze(entries),
    total: record.total as number,
  });
}

/**
 * ADR 0118 O1. Which entries are due, oldest first.
 *
 * An entry whose instant passed while the Home was off is still due. Skipping
 * it would be the silent failure this family exists to prevent: the person
 * stopped carrying the appointment themselves when they wrote it down, so
 * raising it late is a bad outcome and raising it never is a broken promise.
 * Lateness is visible in the instant itself, which the surface can say.
 */
export function duePicoTimeBoundEntries(input: {
  entries: readonly PicoTimeBoundEntry[];
  nowIso: string;
}): readonly PicoTimeBoundEntry[] {
  if (!isCanonicalInstant(input.nowIso)) {
    throw new Error('invalid_pico_time_bound_entry_now');
  }
  const nowMs = Date.parse(input.nowIso);
  return input.entries
    .filter((entry) => entry.raisedAt === undefined && Date.parse(entry.dueAt) <= nowMs)
    .slice()
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
}

/**
 * The next instant a scheduler has to wake for, or `null` when nothing waits.
 *
 * Returns an already-passed instant unchanged rather than clamping it to now:
 * the caller decides how to treat overdue work, and clamping here would hide
 * how late it already is.
 */
export function nextPicoTimeBoundEntryDueAt(
  entries: readonly PicoTimeBoundEntry[],
): string | null {
  let earliest: string | null = null;
  for (const entry of entries) {
    if (entry.raisedAt !== undefined) {
      continue;
    }
    if (earliest === null || Date.parse(entry.dueAt) < Date.parse(earliest)) {
      earliest = entry.dueAt;
    }
  }
  return earliest;
}
