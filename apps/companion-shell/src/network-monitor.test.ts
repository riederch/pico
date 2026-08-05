import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPicoCompanionNetworkRegainMonitor } from './network-monitor.js';

describe('companion network-regain adapter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('checks on false-to-true regain, not on steady online polling', async () => {
    let online = true;
    const regained = vi.fn();
    const monitor = startPicoCompanionNetworkRegainMonitor({
      isOnline: () => online,
      onRegain: regained,
      intervalMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(regained).not.toHaveBeenCalled();
    online = false;
    await vi.advanceTimersByTimeAsync(1_000);
    online = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(regained).toHaveBeenCalledTimes(1);
    monitor.stop();
  });
});

describe('ADR 0118 O4 network state, not just the regain edge', () => {
  it('reports the reading it starts with', async () => {
    // "Offline since boot" would otherwise be the one state never stated, and
    // it is the case the display is most needed for.
    const states: boolean[] = [];
    const monitor = startPicoCompanionNetworkRegainMonitor({
      isOnline: () => false,
      onRegain: () => {},
      onState: (online) => {
        states.push(online);
      },
      intervalMs: 1_000,
    });
    monitor.stop();

    expect(states).toEqual([false]);
  });

  it('reports both directions while regain stays the rising edge', () => {
    vi.useFakeTimers();
    try {
      const states: boolean[] = [];
      let online = true;
      const regains: number[] = [];
      const monitor = startPicoCompanionNetworkRegainMonitor({
        isOnline: () => online,
        onRegain: () => {
          regains.push(1);
        },
        onState: (next) => {
          states.push(next);
        },
        intervalMs: 1_000,
      });

      online = false;
      vi.advanceTimersByTime(1_000);
      online = true;
      vi.advanceTimersByTime(1_000);
      // No transition: nothing new to say.
      vi.advanceTimersByTime(1_000);
      monitor.stop();

      expect(states).toEqual([true, false, true]);
      // The ADR 0112 hook is unchanged: it fires only on the way back.
      expect(regains).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
