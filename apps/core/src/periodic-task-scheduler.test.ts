import { describe, expect, it } from 'vitest';
import { parsePicoDepotTask } from '@pico/protocol/depot';
import {
  maxPicoPeriodicSleepMs,
  startPicoPeriodicTaskScheduler,
} from './periodic-task-scheduler.js';

/**
 * ADR 0143 DP8. Every claim the scheduler's own comment makes, made to fail.
 *
 * The interesting ones are the differences from the time-bound family, because
 * that is the whole reason this is a second scheduler rather than a widened
 * one: nothing at start, one run after a long gap rather than the backlog, and
 * no task running beside itself.
 */

function task(identifier: string, intervalMs: number) {
  return parsePicoDepotTask({
    identifier,
    intervalMs,
    requestsEffect: 'depot.fetch',
  });
}

/** A clock the test moves, so no assertion waits on a real timer. */
function fakeClock(startMs = 1_000_000) {
  let ms = startMs;
  return {
    now: () => ms,
    advance: (byMs: number) => {
      ms += byMs;
    },
  };
}

const inertTimers = {
  setTimer: () => ({ unref: () => {} }) as never,
  clearTimer: () => {},
};

describe('ADR 0143 DP8 periodic task scheduler', () => {
  it('asks for nothing at start, because a restart is not a reason to fetch', async () => {
    // The time-bound family runs what is already due at start; this one must
    // not, or a person restarting more often than the interval fetches on
    // every launch.
    const clock = fakeClock();
    const asked: string[] = [];
    const scheduler = startPicoPeriodicTaskScheduler({
      tasks: [task('depot-fetch', 60_000)],
      request: (t) => {
        asked.push(t.identifier);
      },
      now: clock.now,
      ...inertTimers,
    });

    expect(await scheduler.tick()).toBe(0);
    expect(asked).toEqual([]);

    clock.advance(60_000);
    expect(await scheduler.tick()).toBe(1);
    expect(asked).toEqual(['depot-fetch']);
    scheduler.stop();
  });

  it('produces one run after a long gap, not the backlog it missed', async () => {
    // Three days asleep at a six-hour interval owes twelve runs. Firing them
    // would put twelve requests, decisions and ADR 0121 chain entries in the
    // record for one fetch.
    const clock = fakeClock();
    let asked = 0;
    const scheduler = startPicoPeriodicTaskScheduler({
      tasks: [task('depot-fetch', 6 * 60 * 60 * 1_000)],
      request: () => {
        asked += 1;
      },
      now: clock.now,
      ...inertTimers,
    });

    clock.advance(3 * 24 * 60 * 60 * 1_000);
    expect(await scheduler.tick()).toBe(1);
    expect(asked).toBe(1);

    // And the next one is a full interval away from when that finished, not
    // from the instant it was nominally due.
    expect(await scheduler.tick()).toBe(0);
    clock.advance(6 * 60 * 60 * 1_000 - 1);
    expect(await scheduler.tick()).toBe(0);
    clock.advance(1);
    expect(await scheduler.tick()).toBe(1);
    scheduler.stop();
  });

  it('never runs a task beside itself', async () => {
    // A fetch that outruns its own interval must not have a second one start.
    const clock = fakeClock();
    let inFlight = 0;
    let maxInFlight = 0;
    const held: { release: (() => void) | null } = { release: null };
    const scheduler = startPicoPeriodicTaskScheduler({
      tasks: [task('depot-fetch', 60_000)],
      request: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => {
          held.release = resolve;
        });
        inFlight -= 1;
      },
      now: clock.now,
      ...inertTimers,
    });

    clock.advance(60_000);
    const first = scheduler.tick();
    // Long enough that a grid-based schedule would call it due again.
    clock.advance(600_000);
    expect(await scheduler.tick()).toBe(0);
    expect(maxInFlight).toBe(1);

    held.release?.();
    expect(await first).toBe(1);
    scheduler.stop();
  });

  it('re-arms after a request that threw, because being late costs nothing', async () => {
    // ADR 0143 DP8 makes an unreachable remote a condition, not a failure.
    const clock = fakeClock();
    const attempts: number[] = [];
    let failNext = true;
    const scheduler = startPicoPeriodicTaskScheduler({
      tasks: [task('depot-fetch', 60_000)],
      request: () => {
        attempts.push(clock.now());
        if (failNext) {
          failNext = false;
          throw new Error('remote_unreachable');
        }
      },
      now: clock.now,
      ...inertTimers,
    });

    clock.advance(60_000);
    // A throw is not counted as an ask, and does not stop the schedule.
    expect(await scheduler.tick()).toBe(0);
    expect(attempts).toHaveLength(1);

    clock.advance(60_000);
    expect(await scheduler.tick()).toBe(1);
    expect(attempts).toHaveLength(2);
    scheduler.stop();
  });

  it('runs each task on its own interval', async () => {
    const clock = fakeClock();
    const asked: string[] = [];
    const scheduler = startPicoPeriodicTaskScheduler({
      tasks: [task('fast', 60_000), task('slow', 300_000)],
      request: (t) => {
        asked.push(t.identifier);
      },
      now: clock.now,
      ...inertTimers,
    });

    clock.advance(60_000);
    expect(await scheduler.tick()).toBe(1);
    expect(asked).toEqual(['fast']);

    clock.advance(240_000);
    expect(await scheduler.tick()).toBe(2);
    expect(asked).toEqual(['fast', 'fast', 'slow']);
    scheduler.stop();
  });

  it('refuses two tasks under one identifier instead of silently running one', () => {
    expect(() => startPicoPeriodicTaskScheduler({
      tasks: [task('depot-fetch', 60_000), task('depot-fetch', 120_000)],
      request: () => {},
      ...inertTimers,
    })).toThrow('duplicate_pico_periodic_task:depot-fetch');
  });

  it('asks for nothing once stopped', async () => {
    const clock = fakeClock();
    let asked = 0;
    const scheduler = startPicoPeriodicTaskScheduler({
      tasks: [task('depot-fetch', 60_000)],
      request: () => {
        asked += 1;
      },
      now: clock.now,
      ...inertTimers,
    });

    scheduler.stop();
    clock.advance(600_000);
    expect(await scheduler.tick()).toBe(0);
    expect(asked).toBe(0);
  });

  it('caps the sleep so an interval past the timer range cannot fire at once', async () => {
    // ADR 0143 DP8 gives an interval a floor and no ceiling. `setTimeout`
    // fires immediately past about 24.8 days, so a 30-day task would run on
    // every wake if the delay were handed over unclamped.
    const clock = fakeClock();
    const delays: number[] = [];
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1_000;
    const scheduler = startPicoPeriodicTaskScheduler({
      tasks: [task('depot-fetch', thirtyDaysMs)],
      request: () => {},
      now: clock.now,
      setTimer: (_handler, delayMs) => {
        delays.push(delayMs);
        return { unref: () => {} } as never;
      },
      clearTimer: () => {},
    });

    expect(delays).toEqual([maxPicoPeriodicSleepMs]);
    expect(maxPicoPeriodicSleepMs).toBeLessThan(2 ** 31 - 1);

    // Waking early re-arms rather than running: the clock decides, not the
    // timer.
    clock.advance(maxPicoPeriodicSleepMs);
    expect(await scheduler.tick()).toBe(0);
    scheduler.stop();
  });
});
