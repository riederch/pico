/**
 * ADR 0143 DP8 defines a task as an identifier, an interval and the request it
 * makes. **This asks for the first two only**, and the narrowing is deliberate
 * rather than convenient: the scheduler never reads the third, and a parameter
 * that demands what it does not use is one that turns every later caller into
 * a depot.
 *
 * `PicoDepotTask` satisfies this by having more, which is the direction that
 * costs nothing. Widening *that* type instead - making its `requestsEffect`
 * optional so a relay sweep could borrow it - would have weakened the one
 * field DP8 calls load-bearing, to spare this file an interface.
 */
export interface PicoPeriodicTask {
  identifier: string;
  intervalMs: number;
}

/**
 * ADR 0143 DP8. The periodic scheduling a depot fetch runs on, and a separate
 * one on purpose.
 *
 * ADR 0143 DP8 originally asked for `startPicoTimeBoundScheduler` to be
 * generalised to carry this. It cannot be: that scheduler is a declared entry
 * of ADR 0118's `time_bound_entry` floor family, and widening it would pull
 * `git` into a floor hull. `scripts/check-offline-floor.mjs` holds that line by
 * naming `depot-fetch.ts` rather than the mechanism.
 *
 * The two disciplines were never the same anyway, and every difference below
 * follows from one sentence: **a time-bound entry sleeps until an instant that
 * came from data and being late is the failure; a task runs every so often and
 * being late costs nothing.** That is what licenses each of these:
 *
 * - **Nothing fires at start.** The first run is one interval away. Firing on
 *   start would make every restart a fetch, and a person who restarts more
 *   often than the interval would fetch on each one. Being late costs nothing,
 *   and a person who wants it now has the `asked` path - ADR 0143 DP8's own
 *   distinction between a sweep and a request.
 * - **A long gap produces one run, not a burst.** After three days asleep a
 *   grid-based schedule owes twelve runs at a six-hour interval and would fire
 *   twelve requests, twelve decisions and twelve entries in the ADR 0121
 *   chain, all about one fetch. The next instant is computed from when the
 *   last run *finished*, so a missed window is a missed window.
 * - **A task never overlaps itself.** Re-arming after completion rather than
 *   on a grid means a fetch that outruns its own interval cannot have a second
 *   one start beside it. The period therefore drifts by the run's duration,
 *   which is the thing that costs nothing here.
 * - **A failed request re-arms like any other.** ADR 0143 DP8 makes an
 *   unreachable remote an ADR 0138 CO2 condition rather than an exception, so
 *   there is nothing here to handle: the next run tries again.
 *
 * **It asks and never acts.** `request` is handed a task, not a fetch. What a
 * task does is submit an ADR 0139 request that ADR 0140 decides and ADR 0141
 * records; a scheduler that reached an effect directly would be the second
 * privileged path running while nobody is looking that ADR 0138 CO4 separates
 * from answering a question. Nothing in this file reaches the world, which is
 * why it is not what `offline:check` has to keep out of a floor hull.
 */
export interface PicoPeriodicTaskSchedulerOptions {
  tasks: readonly PicoPeriodicTask[];
  /**
   * What the task asks for. It submits a request and returns; it does not
   * perform an effect, and its rejection is not an error to report - the next
   * run tries again.
   */
  request: (task: PicoPeriodicTask) => void | Promise<void>;
  now?: () => number;
  setTimer?: (handler: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}

export interface PicoPeriodicTaskScheduler {
  /**
   * Runs everything due now and re-arms. Safe to call at any time; a task
   * already running is not started a second time.
   */
  tick(): Promise<number>;
  stop(): void;
}

/**
 * A timer cannot be trusted to wake exactly on time, and `setTimeout` silently
 * fires immediately past about 24.8 days - which a task interval is free to
 * exceed, since ADR 0143 DP8 gives it a floor and no ceiling. Both are handled
 * the way the time-bound scheduler handles them: cap the sleep, re-check
 * against the clock, and never let the timer be what decides anything.
 */
export const maxPicoPeriodicSleepMs = 60 * 60 * 1_000;

export function startPicoPeriodicTaskScheduler(
  options: PicoPeriodicTaskSchedulerOptions,
): PicoPeriodicTaskScheduler {
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer
    ?? ((handler, delayMs) => setTimeout(handler, delayMs));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));

  const identifiers = new Set<string>();
  for (const task of options.tasks) {
    if (identifiers.has(task.identifier)) {
      // Refused rather than deduplicated. Two tasks under one identifier is a
      // caller that believes it configured two things, and silently running
      // one of them is the outcome nobody would have chosen.
      throw new Error(`duplicate_pico_periodic_task:${task.identifier}`);
    }
    identifiers.add(task.identifier);
  }

  // Due at one interval from start, not now. See the note above on why the
  // first run waits.
  const dueAtMs = new Map<string, number>(
    options.tasks.map((task) => [task.identifier, now() + task.intervalMs]),
  );
  const running = new Set<string>();

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const disarm = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  const arm = (): void => {
    disarm();
    if (stopped) {
      return;
    }
    let nextDueAtMs: number | null = null;
    for (const task of options.tasks) {
      if (running.has(task.identifier)) {
        // A task in flight re-arms itself when it finishes. Counting it here
        // would wake the scheduler for something it must not start.
        continue;
      }
      const due = dueAtMs.get(task.identifier);
      if (due !== undefined && (nextDueAtMs === null || due < nextDueAtMs)) {
        nextDueAtMs = due;
      }
    }
    if (nextDueAtMs === null) {
      return;
    }
    const delayMs = Math.min(
      maxPicoPeriodicSleepMs,
      Math.max(0, nextDueAtMs - now()),
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
    const due = options.tasks.filter((task) => {
      if (running.has(task.identifier)) {
        return false;
      }
      const at = dueAtMs.get(task.identifier);
      return at !== undefined && at <= now();
    });

    let asked = 0;
    for (const task of due) {
      running.add(task.identifier);
      try {
        await options.request(task);
        asked += 1;
      } catch {
        // Left for the next run on purpose. ADR 0143 DP8 makes an unreachable
        // remote a condition rather than a failure, and a task whose whole
        // licence is that being late costs nothing has nothing to escalate.
      } finally {
        running.delete(task.identifier);
        // Measured from when this finished, not from when it was due. That is
        // what turns a missed window into a missed window rather than a debt.
        dueAtMs.set(task.identifier, now() + task.intervalMs);
      }
    }

    arm();
    return asked;
  };

  arm();

  return {
    tick,
    stop: () => {
      stopped = true;
      disarm();
    },
  };
}
