import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parsePicoLinkPacket } from '@pico/protocol/link-packet';
import {
  MAX_PICO_LINK_RELAY_BODY_BYTES,
  MAX_PICO_LINK_RELAY_COLLECT_PACKETS,
  assertPicoLinkRelayAccount,
  parsePicoLinkRelayAcknowledgeRequest,
  parsePicoLinkRelayMailboxRequest,
  parsePicoLinkRelayRegisterRequest,
  picoLinkRelayAccountHeader,
  picoLinkRelayRoutes,
} from '@pico/protocol/link-relay-surface';
import type { PicoRelayStore } from './store.js';

/**
 * ADR 0149 - the surface, and the small number of things it is allowed to be.
 *
 * Plain `node:http` rather than a framework, because the route table is five
 * exact strings and a framework would mostly add ways to accidentally serve a
 * sixth. Everything below the routes - what an outcome means, who may collect,
 * what acknowledgement does - was decided in ADR 0147 and ADR 0149 and lives
 * in the store; this file is the door.
 *
 * **The bounds are the point of the door.** Header, body, slow-request and
 * connection limits keep a carrier edge finite, in the shape
 * `link-intake-listener.ts` already uses for the Foundation's Link intake.
 * They are abuse guardrails and not authentication: `deliver` has no
 * authentication to offer, by ADR 0149 RS3.
 */
export const PICO_RELAY_REQUEST_TIMEOUT_MS = 10_000;
export const PICO_RELAY_HEADERS_TIMEOUT_MS = 5_000;
export const PICO_RELAY_KEEP_ALIVE_TIMEOUT_MS = 5_000;
export const MAX_PICO_RELAY_HEADERS = 32;
export const MAX_PICO_RELAY_REQUESTS_PER_SOCKET = 100;
export const defaultPicoRelayMaxConnections = 256;

export interface PicoRelayServerOptions {
  store: PicoRelayStore;
  host: string;
  port: number;
  maxConnections?: number;
  now?: () => Date;
}

export interface PicoRelayServer {
  host: string;
  port: number;
  close(): Promise<void>;
}

interface Answer {
  status: number;
  body: Record<string, unknown>;
}

const refused = (refusal: string): Answer => ({ status: 409, body: { refusal } });

export async function startPicoRelayServer(
  options: PicoRelayServerOptions,
): Promise<PicoRelayServer> {
  const now = options.now ?? (() => new Date());

  const server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      // Nothing about the failure travels: a relay that explained itself would
      // be answering questions about somebody else's mailbox.
      send(response, { status: 500, body: { error: 'relay_failed' } });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');

    const route = (request.url ?? '').split('?')[0];
    const known = Object.values(picoLinkRelayRoutes) as readonly string[];
    if (request.method !== 'POST' || !known.includes(route ?? '')) {
      // One answer for an unknown route and a wrong method. A relay that told
      // them apart would be a map of its own surface.
      send(response, { status: 404, body: { error: 'not_found' } });
      return;
    }

    let raw: string;
    try {
      raw = await readBody(request);
    } catch (error) {
      // Told apart from a parse failure on purpose. A caller whose body was
      // capped and a caller whose body was malformed have different things to
      // do about it, and one answer for both would send the first one hunting
      // through its JSON.
      const tooLarge = error instanceof Error && error.message === 'body_too_large';
      send(response, {
        status: tooLarge ? 413 : 400,
        body: { error: tooLarge ? 'body_too_large' : 'invalid_body' },
      });
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      send(response, { status: 400, body: { error: 'invalid_body' } });
      return;
    }

    try {
      send(response, await answer(route!, request, body));
    } catch (error) {
      // Refusal names travel; nothing else does. Every one of them is a fact
      // about the caller's own request.
      send(response, {
        status: 400,
        body: { error: error instanceof Error ? error.message : 'invalid_request' },
      });
    }
  }

  async function answer(route: string, request: IncomingMessage, body: unknown): Promise<Answer> {
    // ADR 0149 RS3. Delivery is the one route with no account, because ADR
    // 0147 RY1 left nothing on a packet to authenticate.
    if (route === picoLinkRelayRoutes.deliver) {
      const packet = parsePicoLinkPacket(body, now().getTime());
      const outcome = options.store.deliver({
        packet,
        nowMs: now().getTime(),
        acceptedAt: now().toISOString(),
      });
      return { status: outcome === 'accepted' ? 202 : 409, body: { outcome } };
    }

    const account = assertPicoLinkRelayAccount(request.headers[picoLinkRelayAccountHeader]);

    if (route === picoLinkRelayRoutes.register) {
      const parsed = parsePicoLinkRelayRegisterRequest(body);
      const result = options.store.register({
        accountId: account,
        mailbox: parsed.mailbox,
        capacity: parsed.capacity,
        registeredAt: now().toISOString(),
      });
      return result.ok ? { status: 201, body: { registered: true } } : refused(result.refusal);
    }

    if (route === picoLinkRelayRoutes.collect) {
      const parsed = parsePicoLinkRelayMailboxRequest(body);
      const result = options.store.collect({
        accountId: account,
        mailbox: parsed.mailbox,
        nowMs: now().getTime(),
      });
      if (!result.ok) {
        return refused(result.refusal);
      }
      // Bounded, and the caller learns it was bounded: a silent truncation
      // would read as an empty mailbox to whoever acknowledged the lot.
      const packets = result.packets.slice(0, MAX_PICO_LINK_RELAY_COLLECT_PACKETS);
      return {
        status: 200,
        body: { packets, more: result.packets.length > packets.length },
      };
    }

    if (route === picoLinkRelayRoutes.acknowledge) {
      const parsed = parsePicoLinkRelayAcknowledgeRequest(body);
      const result = options.store.acknowledge({
        accountId: account,
        mailbox: parsed.mailbox,
        tags: parsed.tags,
      });
      return result.ok ? { status: 200, body: { removed: result.removed } } : refused(result.refusal);
    }

    const parsed = parsePicoLinkRelayMailboxRequest(body);
    const result = options.store.deregister({ accountId: account, mailbox: parsed.mailbox });
    return result.ok ? { status: 200, body: { deregistered: true } } : refused(result.refusal);
  }

  server.maxConnections = options.maxConnections ?? defaultPicoRelayMaxConnections;
  server.requestTimeout = PICO_RELAY_REQUEST_TIMEOUT_MS;
  server.headersTimeout = PICO_RELAY_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = PICO_RELAY_KEEP_ALIVE_TIMEOUT_MS;
  server.maxHeadersCount = MAX_PICO_RELAY_HEADERS;
  server.maxRequestsPerSocket = MAX_PICO_RELAY_REQUESTS_PER_SOCKET;
  // Nothing here upgrades. A relay with a socket protocol would be a relay
  // with a second surface nobody bounded.
  server.on('upgrade', (_request, socket) => {
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    host: options.host,
    port: address.port,
    close: async () => {
      await closeServer(server);
    },
  };
}

/** Bounded before parsing: a body nobody capped is a memory limit nobody set. */
async function readBody(request: IncomingMessage): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_PICO_LINK_RELAY_BODY_BYTES) {
        // Paused rather than destroyed. Tearing the socket down here would
        // leave the caller with a connection error instead of the reason, and
        // a caller that cannot tell "too large" from "the network" will retry
        // the same oversize body forever.
        request.pause();
        reject(new Error('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response: ServerResponse, answer: Answer): void {
  if (response.headersSent) {
    return;
  }
  const body = JSON.stringify(answer.body);
  response.writeHead(answer.status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    // A request whose body was refused still has one arriving. Closing after
    // the answer is what stops the rest of it being read into nothing.
    ...(answer.status === 413 ? { connection: 'close' } : {}),
  });
  response.end(body);
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
}
