import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import {
  startPicoLinkIntakeListener,
  type PicoLinkIntakeListener,
} from './link-intake-listener.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const app = await buildApp(config);
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
