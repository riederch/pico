import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPicoHomeAssistantHostAdapter } from './host-adapter-home-assistant.js';
import { applyPicoHostEnvironment } from './host-adapter.js';
import {
  startPicoLinkIntakeListener,
  type PicoLinkIntakeListener,
} from './link-intake-listener.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * ADR 0128 H5. The host fills in what nobody set, before anything is read.
 *
 * The list is closed and ordered, in the idiom the module identifiers and the
 * protective event types already use: adding a host adapter changes how a
 * deployment is configured, so it is a decision spoken in one place rather
 * than a discovery.
 *
 * This runs here rather than in a separate container entrypoint, which is what
 * it used to be. That arrangement meant `pnpm start` and the image booted from
 * different configuration on the same host - the entrypoint applied the
 * options file and the plain start did not. One start path, one answer.
 */
const detectedHost = applyPicoHostEnvironment([
  createPicoHomeAssistantHostAdapter(),
]);

const config = loadConfig();
const app = await buildApp(config);

app.log.info(
  {
    host: detectedHost.hostName ?? 'none',
    foundationAccessMode: config.foundationAccessMode,
    ...(config.foundationAccessModeAlias === undefined
      ? {}
      : { configuredAs: config.foundationAccessModeAlias }),
  },
  'Pico Home Core starting',
);

if (config.foundationAccessModeAlias !== undefined) {
  // Named once, at the only moment a person is looking at the log for this
  // deployment. ADR 0122: the old value keeps working, and saying so is what
  // separates a rename from a break.
  app.log.warn(
    {
      configured: config.foundationAccessModeAlias,
      use: config.foundationAccessMode,
    },
    'PICO_FOUNDATION_ACCESS_MODE uses a former name that still works; the current name is preferred',
  );
}
let linkIntakeListener: PicoLinkIntakeListener | undefined;

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    const shutdownTimeout = setTimeout(() => {
      app.log.error({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    shutdownTimeout.unref();

    void closeRuntime()
      .then(() => {
        clearTimeout(shutdownTimeout);
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(shutdownTimeout);
        app.log.error({ error }, 'shutdown failed');
        process.exit(1);
      });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
  if (config.linkIntake !== undefined) {
    linkIntakeListener = await startPicoLinkIntakeListener(app, config.linkIntake);
    app.log.info(
      {
        host: linkIntakeListener.host,
        port: linkIntakeListener.port,
        requestTarget: 'POST /api/home/link',
      },
      'Pico Link restricted intake listening',
    );
  }
} catch (error) {
  app.log.error(error);
  try {
    await closeRuntime();
  } catch (closeError) {
    app.log.error({ error: closeError }, 'startup cleanup failed');
  }
  process.exit(1);
}

async function closeRuntime(): Promise<void> {
  // Stop accepting new Link work before closing the shared Foundation state.
  try {
    await linkIntakeListener?.close();
  } finally {
    linkIntakeListener = undefined;
    await app.close();
  }
}
