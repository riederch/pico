import {
  duePicoTimeBoundEntries,
  nextPicoTimeBoundEntryDueAt,
  type PicoTimeBoundEntry,
} from '@pico/protocol';

/**
 * ADR 0118 O1. The local scheduling that raises a time-bound entry.
 *
 * Local in the load-bearing sense: it reads the store, compares instants and
 * calls a port. No model decides whether something is due, and no packet leaves
 * the device to find out - which is what puts this family on the floor and what
 * `scripts/check-offline-floor.mjs` verifies about its imports.
 *
 * It sleeps until the next instant rather than polling on a fixed tick. A poll
 * has to choose between waking constantly and raising late, and a reminder that
 * arrives late is the failure this family exists to prevent.
 */
export interface PicoTimeBoundEntryStore {
  picoTimeBoundEntries(limit?: number): PicoTimeBoundEntry[];
  markPicoTimeBoundEntryRaised(input: {
    memoryItemId: string;
    raisedAt: string;
  }): boolean;
}

export interface PicoTimeBoundSchedulerOptions {
  store: PicoTimeBoundEntryStore;
  raise: (entry: PicoTimeBoundEntry) => void | Promise<void>;
  now?: () => Date;
  setTimer?: (handler: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

export interface PicoTimeBoundScheduler {
  /** Raises everything due now and re-arms. Safe to call at any time. */
  tick(): Promise<number>;
  stop(): void;
}

/**
 * A timer cannot be trusted to wake exactly on time, and a very distant instant
 * exceeds what one timer can express. Both are handled by capping the sleep and
 * re-checking: a long wait becomes several short ones, and the comparison that
 * decides anything is always against the clock rather than against the timer.
 */
export const maxPicoTimeBoundSleepMs = 60 * 60 * 1_000;

export function startPicoTimeBoundScheduler(
  options: PicoTimeBoundSchedulerOptions,
): PicoTimeBoundScheduler {
  const now = options.now ?? (() => new Date());
  const setTimer = options.setTimer
    ?? ((handler, delayMs) => setTimeout(handler, delayMs));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const disarm = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const arm = (entries: readonly PicoTimeBoundEntry[]): void => {
    disarm();
    if (stopped) {
      return;
    }
    const nextDueAt = nextPicoTimeBoundEntryDueAt(entries);
    if (nextDueAt === null) {
      return;
    }
    const delayMs = Math.min(
      maxPicoTimeBoundSleepMs,
      Math.max(0, Date.parse(nextDueAt) - now().getTime()),
    );
    timer = setTimer(() => {
      void tick();
    }, delayMs);
    timer.unref?.();
  };

  const tick = async (): Promise<number> => {
    if (stopped) {
      return 0;
    }
    const entries = options.store.picoTimeBoundEntries();
    const due = duePicoTimeBoundEntries({ entries, nowIso: now().toISOString() });

    let raised = 0;
    for (const entry of due) {
      // Marked first. An entry raised twice is noise the person learns to
      // ignore; one marked without being raised is a promise silently dropped -
      // so the ordering is chosen to fail towards the louder mistake, and the
      // claim is only made by a row that actually changed.
      if (!options.store.markPicoTimeBoundEntryRaised({
        memoryItemId: entry.memoryItemId,
        raisedAt: now().toISOString(),
      })) {
        continue;
      }
      try {
        await options.raise(entry);
        raised += 1;
      } catch {
        // A surface that could not take it does not stop the rest, and does
        // not un-mark this one: re-raising on every tick forever is worse for
        // the person than one prompt they never saw.
      }
    }

    arm(options.store.picoTimeBoundEntries());
    return raised;
  };

  arm(options.store.picoTimeBoundEntries());

  return {
    tick,
    stop: () => {
      stopped = true;
      disarm();
    },
  };
}
