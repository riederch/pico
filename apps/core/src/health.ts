import type { FastifyInstance } from 'fastify';
import type { PicoHealthResponse } from '@pico/protocol';
import { PicoConcurrencyCap } from './concurrency-cap.js';

/**
 * The signal a supervisor reads, on the terms a supervisor acts on.
 *
 * **The occasion** (2026-09-18, finding B217). `pico_home/config.yaml` points
 * `watchdog:` at this path, so this one route decides whether the Supervisor
 * lets the add-on keep running. It answered with a constant, out of the same
 * in-flight budget as the whole Foundation API. Both halves of that were
 * wrong, and both had already been argued in this repository - by the relay,
 * in `apps/relay/src/health.ts`, a release earlier.
 *
 * **It asks the store rather than the event loop.** A check that answers
 * because the process is up says yes to the one failure a watchdog is for.
 * The probe is one read of a table that stays small; what it cannot see is a
 * page it never touches, and no probe of any cost would see all of those.
 *
 * **It has its own budget, small.** The relay reached that by giving health
 * its own listener on its own port. The Home has one listener, so the
 * separation is a counter instead: ordinary traffic cannot spend the slot the
 * Supervisor's decision depends on, and a watchdog route exempt from *every*
 * bound would be the one unbounded path on a reachable surface. Sharing it was
 * the worse half - the busier a Home got, the likelier a restart, which
 * inverts what a watchdog is for.
 */
export const PICO_HEALTH_PATH = '/health';

/**
 * Wide enough for a supervisor, a dashboard and a person with curl at once,
 * far below anything that could make this route a lever. The relay's own
 * listener carries `maxConnections = 16` for the same reason.
 */
export const defaultPicoHealthMaxInFlight = 8;

export function registerPicoHealthRoute(app: FastifyInstance, options: {
  /** Throws when the store cannot answer; the reason belongs in the log. */
  probe: () => void;
  service: string;
  deviceId: string;
  maxInFlight?: number;
}): void {
  const cap = new PicoConcurrencyCap(options.maxInFlight ?? defaultPicoHealthMaxInFlight);

  app.get(PICO_HEALTH_PATH, async (request, reply) => {
    if (!cap.acquire()) {
      return reply.code(503).send({ error: 'Busy.' });
    }
    reply.raw.once('close', () => {
      cap.release();
    });

    try {
      options.probe();
    } catch (error) {
      // 503 rather than 500: a supervisor reads the status line, and this is
      // the one answer that makes it act.
      request.log.error({ error: String(error) }, 'Health probe failed.');
      const unhealthy: PicoHealthResponse = {
        ok: false,
        service: options.service,
        deviceId: options.deviceId,
      };
      return reply.code(503).send(unhealthy);
    }

    const healthy: PicoHealthResponse = {
      ok: true,
      service: options.service,
      deviceId: options.deviceId,
    };
    return reply.send(healthy);
  });
}
