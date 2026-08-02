export interface PicoCompanionNetworkRegainMonitor {
  stop(): void;
}

/** Polls Electron's `net.isOnline()` fact and fires only on false -> true. */
export function startPicoCompanionNetworkRegainMonitor(input: {
  isOnline: () => boolean;
  onRegain: () => void | Promise<void>;
  intervalMs?: number;
}): PicoCompanionNetworkRegainMonitor {
  const intervalMs = input.intervalMs ?? 5_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 60_000) {
    throw new Error('invalid_network_monitor_interval');
  }
  let previous = input.isOnline();
  const timer = setInterval(() => {
    const current = input.isOnline();
    if (!previous && current) {
      void input.onRegain();
    }
    previous = current;
  }, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
