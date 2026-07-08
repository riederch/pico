import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadConfig();
const app = await buildApp(config);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    const shutdownTimeout = setTimeout(() => {
      app.log.error({ signal, timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    shutdownTimeout.unref();

    void app.close()
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
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
