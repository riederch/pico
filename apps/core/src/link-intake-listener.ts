import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { PicoLinkIntakeBinding } from './config.js';
import {
  defaultPicoLinkIntakeMaxConnections,
  defaultPicoLinkIntakeMaxInFlight,
  PicoConcurrencyCap,
  picoLinkIntakeRequestMark,
} from './concurrency-cap.js';

export const PICO_LINK_INTAKE_PATH = '/api/home/link';
// ADR 0115 U4, decided by the user on 2026-08-01: the unsealed continuity
// chain read is published beside the sealed intake, because a stranded client
// seals to a deleted agreement key and pins a refused audience - the sealed
// channel is structurally unusable for exactly the read that would un-strand
// it. Strictly this exact target, GET only, query strings refused.
export const PICO_LINK_CONTINUITY_READ_PATH = '/api/home/link/continuity';
export const PICO_LINK_INTAKE_REQUEST_TIMEOUT_MS = 10_000;
export const PICO_LINK_INTAKE_HEADERS_TIMEOUT_MS = 5_000;
export const PICO_LINK_INTAKE_KEEP_ALIVE_TIMEOUT_MS = 5_000;
export const MAX_PICO_LINK_INTAKE_HEADERS = 32;
export const MAX_PICO_LINK_INTAKE_REQUESTS_PER_SOCKET = 100;

export interface PicoLinkIntakeListener {
  host: string;
  port: number;
  close(): Promise<void>;
}

/**
 * ADR 0107 D4: a second HTTP listener that can be published without publishing
 * the Foundation API.
 *
 * This adapter owns no route table and no authority. It forwards exactly two
 * named (method, target) pairs into the already-built Fastify application -
 * the sealed Link intake and the unsealed ADR 0115 U4 continuity read - so
 * each request runs the same parser, access class, verifier, replay state and
 * operation handlers as local delivery. Everything else is refused before
 * Fastify routing, which means adding a Foundation route can never widen this
 * listener by accident: publishing a target here stays an explicit decision.
 */
export async function startPicoLinkIntakeListener(
  app: FastifyInstance,
  binding: PicoLinkIntakeBinding,
): Promise<PicoLinkIntakeListener> {
  await app.ready();

  const inFlight = new PicoConcurrencyCap(
    binding.maxInFlight ?? defaultPicoLinkIntakeMaxInFlight,
  );

  // The exact-match comparison is load-bearing: a query string makes the URL
  // a different target, so `?anything` is refused as 404 at this edge.
  const allowedMethodByTarget = new Map<string, 'POST' | 'GET'>([
    [PICO_LINK_INTAKE_PATH, 'POST'],
    [PICO_LINK_CONTINUITY_READ_PATH, 'GET'],
  ]);

  const server = createServer((request, response) => {
    const allowedMethod = request.url === undefined
      ? undefined
      : allowedMethodByTarget.get(request.url);
    if (allowedMethod === undefined) {
      refuse(request, response, 404, 'Not found.');
      return;
    }
    if (request.method !== allowedMethod) {
      response.setHeader('allow', allowedMethod);
      refuse(request, response, 405, 'Method not allowed.');
      return;
    }

    // ADR 0119 Q4. The in-flight cap sits here, above `app.routing`, so a
    // refused request costs no parsing and no route work. It is this
    // listener's own counter: sharing the Foundation one would let a stranger
    // on the published port exhaust the budget the person's own device needs.
    if (!inFlight.acquire()) {
      refuse(request, response, 503, 'Busy.');
      return;
    }
    // `close` rather than `finish`: an aborted connection never finishes, and a
    // counter that only decrements on success leaks to a permanent 503.
    response.once('close', () => {
      inFlight.release();
    });

    // Marked so the Foundation counter does not charge this request a second
    // time against a budget it is not spending.
    (request as IncomingMessage & { [picoLinkIntakeRequestMark]?: true })[
      picoLinkIntakeRequestMark
    ] = true;

    // Even parser/size failures must not be cached by an intermediary.
    response.setHeader('cache-control', 'no-store');
    app.routing(request, response);
  });

  // A connection cap rather than only an in-flight one: sockets that never send
  // a request are bounded by nothing above, and the header timeout only ends
  // them after five seconds each.
  server.maxConnections = binding.maxConnections ?? defaultPicoLinkIntakeMaxConnections;

  // The first private-key work happens only after bounded body parsing and
  // envelope-shape checks. Header, slow-request and connection limits keep the
  // carrier edge finite too; they are abuse guardrails, not authentication.
  server.requestTimeout = PICO_LINK_INTAKE_REQUEST_TIMEOUT_MS;
  server.headersTimeout = PICO_LINK_INTAKE_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = PICO_LINK_INTAKE_KEEP_ALIVE_TIMEOUT_MS;
  server.maxHeadersCount = MAX_PICO_LINK_INTAKE_HEADERS;
  server.maxRequestsPerSocket = MAX_PICO_LINK_INTAKE_REQUESTS_PER_SOCKET;
  server.on('upgrade', (_request, socket) => {
    socket.destroy();
  });

  await listen(server, binding);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Pico Link intake did not bind to a TCP address.');
  }

  return {
    host: binding.host,
    port: (address as AddressInfo).port,
    close: () => closeServer(server),
  };
}

function refuse(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: 404 | 405 | 503,
  error: string,
): void {
  // Do not buffer or route a body for a target this listener does not expose.
  request.resume();
  response.statusCode = statusCode;
  response.setHeader('cache-control', 'no-store');
  response.setHeader('connection', 'close');
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('x-content-type-options', 'nosniff');
  response.end(JSON.stringify({ error }));
}

async function listen(
  server: ReturnType<typeof createServer>,
  binding: PicoLinkIntakeBinding,
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onError = (error: Error): void => {
      rejectPromise(error);
    };
    server.once('error', onError);
    server.listen(binding.port, binding.host, () => {
      server.off('error', onError);
      resolvePromise();
    });
  });
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error === undefined) {
        resolvePromise();
      } else {
        rejectPromise(error);
      }
    });
  });
}
