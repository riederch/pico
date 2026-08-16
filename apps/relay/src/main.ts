import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadPicoRelayConfig } from './config.js';
import { startPicoRelayHealthListener, type PicoRelayHealthListener } from './health.js';
import { startPicoRelayServer, type PicoRelayServer } from './server.js';
import { PicoRelayStore } from './store.js';

/**
 * ADR 0153 PK2. Pico Relay as a thing that runs, rather than a thing a test
 * can start.
 *
 * **This is the whole difference between `apps/relay` before and after.** The
 * server, the store and the bounds were finished and had no entrypoint, which
 * meant the deliverable existed everywhere except where somebody could
 * install it.
 *
 * Deliberately not here: anything that creates an account. A relay with no
 * accounts refuses every registration as `unknown_account`, which is the
 * honest state of a machine nobody has provisioned - and provisioning is an
 * authority question ADR 0153 leaves open rather than a start-up convenience.
 * A first account seeded from the environment would answer that question in
 * this file, quietly, which is the shape of decision this tree does not make.
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;

const log = (line: Record<string, unknown>): void => {
  // One line of JSON per event, on stdout. A relay's log is an operator's
  // only view of it, and structured beats pretty for something a supervisor
  // scrapes. No mailbox, no account and no packet ever appears in it.
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...line })}\n`);
};

let store: PicoRelayStore | undefined;
let server: PicoRelayServer | undefined;
let health: PicoRelayHealthListener | undefined;

async function closeRuntime(): Promise<void> {
  // The door first, then the health signal, then the store: a health check
  // that answers "ok" while the store is closing would be lying for the length
  // of the shutdown.
  try {
    await server?.close();
  } finally {
    server = undefined;
    try {
      await health?.close();
    } finally {
      health = undefined;
      store?.close();
      store = undefined;
    }
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log({ event: 'relay_shutting_down', signal });
    const timeout = setTimeout(() => {
      log({ event: 'relay_shutdown_timed_out', signal, timeoutMs: SHUTDOWN_TIMEOUT_MS });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    void closeRuntime()
      .then(() => {
        clearTimeout(timeout);
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        log({ event: 'relay_shutdown_failed', error: String(error) });
        process.exit(1);
      });
  });
}

try {
  const config = loadPicoRelayConfig();
  // The directory rather than the file: a mounted empty volume is the normal
  // first start, and better-sqlite3 creates the database but not its parent.
  mkdirSync(dirname(config.databasePath), { recursive: true });
  store = new PicoRelayStore(config.databasePath, config.operator);
  server = await startPicoRelayServer({
    store,
    host: config.host,
    port: config.port,
    ...(config.maxConnections === undefined ? {} : { maxConnections: config.maxConnections }),
  });
  health = await startPicoRelayHealthListener({
    store,
    host: config.healthHost,
    port: config.healthPort,
    log,
  });
  log({
    event: 'relay_listening',
    operator: config.operator,
    host: server.host,
    port: server.port,
    healthHost: health.host,
    healthPort: health.port,
    databasePath: config.databasePath,
  });
  if (!store.hasAccounts()) {
    // Said once, at the only moment an operator is looking at this log. A
    // relay with no accounts refuses every registration as `unknown_account`,
    // which at the door is indistinguishable from a wrong credential - so the
    // difference is stated here or nowhere.
    log({
      event: 'relay_accounts_unprovisioned',
      message:
        'This relay holds no accounts, so every registration is refused as '
        + 'unknown_account. Provisioning is an open decision (ADR 0153).',
    });
  }
} catch (error) {
  log({ event: 'relay_startup_failed', error: String(error) });
  try {
    await closeRuntime();
  } catch (closeError) {
    log({ event: 'relay_startup_cleanup_failed', error: String(closeError) });
  }
  process.exit(1);
}
