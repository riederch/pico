export interface PicoCompanionNetworkRegainMonitor {
  stop(): void;
}

/**
 * Polls Electron's `net.isOnline()` fact.
 *
 * `onRegain` fires only on false -> true, because that is the ADR 0112
 * network-regain hook and re-checking on every tick would be a second
 * scheduler wearing a different name.
 *
 * `onState` is the other question, and it needed a separate answer. ADR 0118
 * O4 has to *display* `no_network`, which is a state rather than an edge - a
 * companion that started offline would otherwise say nothing until the network
 * came back, which is precisely the moment the person no longer needs telling.
 * So it reports the reading at start and again on every transition, in both
 * directions.
 */
export function startPicoCompanionNetworkRegainMonitor(input: {
  isOnline: () => boolean;
  onRegain: () => void | Promise<void>;
  onState?: (online: boolean) => void | Promise<void>;
  intervalMs?: number;
}): PicoCompanionNetworkRegainMonitor {
  const intervalMs = input.intervalMs ?? 5_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 60_000) {
    throw new Error('invalid_network_monitor_interval');
  }
  let previous = input.isOnline();
  // The starting reading is an observation like any other. Withholding it
  // would make "offline since boot" the one case that goes unstated.
  void input.onState?.(previous);
  const timer = setInterval(() => {
    const current = input.isOnline();
    if (!previous && current) {
      void input.onRegain();
    }
    if (current !== previous) {
      void input.onState?.(current);
    }
    previous = current;
  }, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
