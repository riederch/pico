import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PicoRelayStore } from './store.js';

/**
 * ADR 0153 PK2/PK3. The signal an operator's supervisor reads, on a listener
 * the public surface knows nothing about.
 *
 * **It asks the store rather than the event loop.** A health check that
 * answers because the process is running answers yes to the one failure that
 * matters here - a queue whose disk is gone, read-only or corrupt - and a
 * store-and-forward that cannot store is exactly the thing nobody notices
 * until the packets were needed. So a probe query runs on every request. It
 * is one indexed read; the cost of doing it per check is smaller than the
 * cost of the check meaning nothing.
 *
 * **It says whether, never how much.** No mailbox count, no packet count, no
 * account list. Those are facts about the relay's customers, and ADR 0031's
 * prohibition list does not stop applying because the port is on loopback.
 */
export interface PicoRelayHealthListener {
  host: string;
  port: number;
  close(): Promise<void>;
}

export async function startPicoRelayHealthListener(options: {
  store: PicoRelayStore;
  host: string;
  port: number;
  log?: (line: Record<string, unknown>) => void;
}): Promise<PicoRelayHealthListener> {
  const server: Server = createServer((request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');

    const route = (request.url ?? '').split('?')[0];
    if (request.method !== 'GET' || route !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":"not_found"}');
      return;
    }

    let healthy: boolean;
    try {
      options.store.probe();
      healthy = true;
    } catch (error) {
      healthy = false;
      options.log?.({ event: 'relay_health_probe_failed', error: String(error) });
    }

    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: healthy ? 'ok' : 'unavailable' }));
  });

  server.headersTimeout = 5_000;
  server.requestTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxConnections = 16;

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    host: address.address,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}
