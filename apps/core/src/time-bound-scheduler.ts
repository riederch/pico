import {
  duePicoTimeBoundEntries,
  nextPicoTimeBoundEntryDueAt,
  type PicoTimeBoundEntry,
} from '@pico/protocol/time-bound-entry';

/**
 * ADR 0118 O1. The local scheduling that notices a time-bound entry came due.
 *
 * Local in the load-bearing sense: it reads the store, compares instants and
 * calls a port. No model decides whether something is due, and no packet
 * leaves the device to find out - which is what puts this family on the floor
 * and what `scripts/check-offline-floor.mjs` verifies about its imports.
 *
 * It sleeps until the next instant rather than polling on a fixed tick. A poll
 * has to choose between waking constantly and raising late, and a reminder
 * that arrives late is the failure this family exists to prevent.
 *
 * **What it does not do is claim delivery.** An earlier version marked
 * `raised_at` and then called a surface, so a surface that could not take it
 * left the entry marked and nobody told - a promise silently dropped, which is
 * exactly the outcome ADR 0118 O1 says is worse than never recording it at
 * all. The Home cannot observe that a notification was shown, so it no longer
 * says it did: this announces, an acknowledgement raises, and an entry nobody
 * acknowledged stays outstanding and keeps being offered. Repetition is the
 * loud failure and silence is the quiet one.
 */
export interface PicoTimeBoundEntryStore {
  /** Due entries the Home has not announced yet. */
  picoUnannouncedTimeBoundEntries(limit?: number): PicoTimeBoundEntry[];
  markPicoTimeBoundEntryAnnounced(input: {
    memoryItemId: string;
    announcedAt: string;
  }): boolean;
}

export interface PicoTimeBoundSchedulerOptions {
  store: PicoTimeBoundEntryStore;
  /**
   * Record that this entry came due. Durable, because the person's device may
   * be asleep, off, or in a tunnel - and the whole point of the floor is that
   * being unreachable is not the same as being forgotten.
   */
  announce: (entry: PicoTimeBoundEntry) => void | Promise<void>;
  now?: () => Date;
  setTimer?: (handler: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

export interface PicoTimeBoundScheduler {
  /** Announces everything due now and re-arms. Safe to call at any time. */
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
    const entries = options.store.picoUnannouncedTimeBoundEntries();
    const due = duePicoTimeBoundEntries({ entries, nowIso: now().toISOString() });

    let announced = 0;
    for (const entry of due) {
      try {
        // Announced first, marked after. The order is the opposite of what it
        // was, and deliberately: a record that failed to be written is one the
        // next tick tries again, while a mark written before the record is an
        // entry the Home believes it handled and never did.
        await options.announce(entry);
      } catch {
        // Left unannounced on purpose. It will be tried again, and being told
        // twice is a cost a person can absorb - being told never is the one
        // this family exists to prevent.
        continue;
      }
      if (options.store.markPicoTimeBoundEntryAnnounced({
        memoryItemId: entry.memoryItemId,
        announcedAt: now().toISOString(),
      })) {
        announced += 1;
      }
    }

    arm(options.store.picoUnannouncedTimeBoundEntries());
    return announced;
  };

  arm(options.store.picoUnannouncedTimeBoundEntries());

  return {
    tick,
    stop: () => {
      stopped = true;
      disarm();
    },
  };
}
