import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadPicoRelayConfig } from './config.js';
import { startPicoRelayHealthListener, type PicoRelayHealthListener } from './health.js';
import { PicoRelayClaimCode } from './operator-claim.js';
import { startPicoRelayOperatorListener, type PicoRelayOperatorListener } from './operator.js';
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
 * **Three listeners, and that is the design rather than the layout.** The
 * mailbox port keeps exactly five routes that answer an unknown route the way
 * they answer a wrong method (ADR 0153 PK3); health and administration each
 * get their own port, bound to loopback, so exposing either is a separate
 * deliberate act (ADR 0154 RO1/RO7).
 *
 * Provisioning is no longer absent and is still not seeded from here: ADR 0154
 * has the relay mint a one-time claim code while nobody has claimed it, and
 * the Pico Client trades that for the operator credential. An account created
 * from an environment variable would have put a credential in a compose file
 * and answered an authority question in a start-up path.
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
let operator: PicoRelayOperatorListener | undefined;

async function closeRuntime(): Promise<void> {
  // The door first, then the health signal, then the store: a health check
  // that answers "ok" while the store is closing would be lying for the length
  // of the shutdown.
  try {
    await server?.close();
  } finally {
    server = undefined;
    try {
      await operator?.close();
    } finally {
      operator = undefined;
      try {
        await health?.close();
      } finally {
        health = undefined;
        store?.close();
        store = undefined;
      }
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
    log,
    ...(config.maxConnections === undefined ? {} : { maxConnections: config.maxConnections }),
  });
  health = await startPicoRelayHealthListener({
    store,
    host: config.healthHost,
    port: config.healthPort,
    log,
  });

  /**
   * ADR 0154 RO8. The escape from a lost operator credential, without a shell
   * inside the product path: a file beside the database and a restart.
   *
   * The same shape the Home uses for a forgotten operator passphrase, and the
   * same honest posture - anybody with file access to the host can do this,
   * because operator administration protects a network surface and not the
   * host. The accounts stay; losing the administration credential is not a
   * reason to cut off every customer.
   */
  const resetMarker = join(dirname(config.databasePath), 'operator-reset');
  if (existsSync(resetMarker)) {
    store.forgetOperator();
    rmSync(resetMarker, { force: true });
    log({ event: 'relay_operator_reset', marker: resetMarker });
  }

  const claimCode = new PicoRelayClaimCode();
  operator = await startPicoRelayOperatorListener({
    store,
    claimCode,
    host: config.operatorHost,
    port: config.operatorPort,
    log,
  });
  log({
    event: 'relay_listening',
    operator: config.operator,
    host: server.host,
    port: server.port,
    healthHost: health.host,
    healthPort: health.port,
    operatorHost: operator.host,
    operatorPort: operator.port,
    databasePath: config.databasePath,
  });

  if (!store.isClaimed()) {
    /**
     * ADR 0154 RO2. The protected display channel a container has.
     *
     * Whoever can read this log can already stop the process, which is the
     * same argument the Home makes for its operator bootstrap code. Single
     * use, in memory only, and re-minted on restart - so a leaked log line is
     * a window one restart wide rather than a standing key.
     */
    log({
      event: 'relay_unclaimed',
      claimCode: claimCode.mint(),
      message:
        'Nobody has claimed this relay. Enter this code in the Pico Client to '
        + `administer it. It is single-use and replaced when this process restarts.`,
    });
  } else if (!store.hasAccounts()) {
    // Claimed and empty. Said once, because at the door an unprovisioned relay
    // and a wrong credential are the same `unknown_account`.
    log({
      event: 'relay_accounts_unprovisioned',
      message:
        'This relay holds no active accounts, so every registration is refused '
        + 'as unknown_account. Create one from the Pico Client.',
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
