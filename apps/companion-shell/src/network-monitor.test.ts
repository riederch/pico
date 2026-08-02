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
