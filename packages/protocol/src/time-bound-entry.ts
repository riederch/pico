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
  /** Set once the entry has been raised; absent while it still waits. */
  raisedAt?: string;
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
