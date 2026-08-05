import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest, type RequestOptions } from 'node:http';
import { connect, type Socket } from 'node:net';
import { Writable } from 'node:stream';
import { picoLinkDirectRequestEnvelopeSchema } from '@pico/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { CoreConfig } from './config.js';
import {
  PICO_LINK_INTAKE_PATH,
  startPicoLinkIntakeListener,
  type PicoLinkIntakeListener,
} from './link-intake-listener.js';

/**
 * Held sockets are torn down here rather than only at the end of each test. A
 * failed assertion skips the rest of its test body, and a socket still parked
 * inside Fastify makes `app.close()` wait for a body that never arrives - so a
 * single real failure would present as a timeout in every later test too.
 */
const heldSockets: Socket[] = [];

afterEach(() => {
  for (const socket of heldSockets.splice(0)) {
    socket.destroy();
  }
});

describe('ADR 0119 Q4 quotas and concurrency caps on the published intake', () => {
  it('refuses past the stranger budget, content-free and with its own status', async () => {
    await withIntake(
      { linkRequestQuota: { stranger: { capacity: 3, refillPerMinute: 1 } } },
      async (baseUrl) => {
        // Three tokens, spent on envelopes that differ in how far they get:
        // shape refusal, seal-open refusal, shape refusal again. The budget is
        // charged before any of that, so the depth a request reaches must not
        // change what it costs - otherwise a caller could pick a cheap-looking
        // shape and buy more attempts than the bound intends.
        const shapes = [
          '{}',
          JSON.stringify({
            schema: picoLinkDirectRequestEnvelopeSchema,
            sealedRequestHex: 'ff'.repeat(512),
          }),
          JSON.stringify({ schema: 'wrong' }),
        ];
        for (const body of shapes) {
          const response = await post(baseUrl, body);
          expect(response.status).toBe(400);
        }

        // Budget spent. The refusal is its own status rather than the generic
        // 400: a well-behaved peer is early, not malformed.
        const refused = await post(baseUrl, '{}');
        expect(refused.status).toBe(429);
        expect(JSON.parse(refused.body)).toEqual({ error: 'quota_exceeded' });

        // Content-free: a well-formed envelope that would have reached the
        // seal-open gets a byte-identical refusal to raw garbage. Anything
        // that varied here would say something about the Home's state, and a
        // quota that answers differently by sender is a membership oracle.
        const wellFormed = await post(baseUrl, JSON.stringify({
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: 'ff'.repeat(512),
        }));
        expect(wellFormed.status).toBe(429);
        expect(JSON.parse(wellFormed.body)).toEqual({ error: 'quota_exceeded' });
        // Byte-identical, not merely equivalent.
        expect(wellFormed.body).toBe(refused.body);
        expect(refused.headers['retry-after']).toBeUndefined();
        expect(wellFormed.headers['retry-after']).toBeUndefined();
      },
    );
  });

  it('bounds concurrent intake requests with its own in-flight cap', async () => {
    // Overlap has to be built, not hoped for. Ordinary requests - even a dozen
    // large ones on separate sockets - are served one after another here, so a
    // test that just fires them measures nothing and passes anyway. These
    // sockets announce a body and then withhold it, which is the slow-request
    // shape the cap exists for and holds every request in flight at once.
    await withIntake(
      {
        // Room enough that the quota is not what refuses here.
        linkRequestQuota: { stranger: { capacity: 1_000, refillPerMinute: 1_000 } },
        linkIntakeMaxInFlight: 2,
      },
      async (_baseUrl, listener) => {
        const body = JSON.stringify({
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: 'ff'.repeat(512),
        });
        const held = Array.from({ length: 6 }, () => holdOpen(listener.port, body));
        await Promise.all(held.map((one) => one.connected));

        // The two that are admitted never answer - that is the whole point of
        // holding them - so waiting on all six statuses would wait forever.
        // `stillInFlight` is the expected outcome for exactly those two, and
        // asserting on it is what makes the count below a statement about the
        // cap rather than about whichever sockets happened to be served.
        const statuses = await Promise.all(held.map((one) => settle(one.status, 500)));

        expect(statuses.filter((status) => status === 503)).toHaveLength(4);
        expect(statuses.filter((status) => status === stillInFlight)).toHaveLength(2);

      },
    );
  });

  it('does not spend the Foundation budget on intake traffic', async () => {
    // The two listeners share one Fastify application, so a single in-flight
    // counter would let a stranger on the published port exhaust the budget the
    // person's own device depends on - publishing the intake would silently
    // degrade the local UI.
    //
    // A Foundation cap of one makes the coupling impossible to miss, but only
    // if intake requests are genuinely still in flight when the local request
    // arrives. Ordinary requests are served one at a time here, so a flood of
    // them would leave the counter at zero and this test would pass whether or
    // not the surfaces are separated. The held sockets are what give it teeth:
    // each one occupies a slot until it is destroyed.
    await withIntake(
      {
        linkRequestQuota: { stranger: { capacity: 1_000, refillPerMinute: 1_000 } },
        linkIntakeMaxInFlight: 32,
        foundationMaxInFlight: 1,
      },
      async (_baseUrl, listener, app) => {
        const body = JSON.stringify({
          schema: picoLinkDirectRequestEnvelopeSchema,
          sealedRequestHex: 'ff'.repeat(512),
        });
        const held = Array.from({ length: 4 }, () => holdOpen(listener.port, body));
        await Promise.all(held.map((one) => one.connected));

        // Precondition, asserted rather than assumed: all four are admitted by
        // the intake cap and parked inside Fastify waiting for bodies that
        // never come. If any had been refused, the local request below would
        // face an empty counter and prove nothing.
        const parked = await Promise.all(held.map((one) => settle(one.status, 500)));
        expect(parked.filter((status) => status === stillInFlight)).toHaveLength(4);

        // Charged to the intake counter, so the Foundation slot is untouched.
        const local = await rawRequest({
          hostname: '127.0.0.1',
          port: foundationPort(app),
          path: '/api/system/version',
          method: 'GET',
        });
        expect(local.status).toBe(200);

      },
      { listenFoundation: true },
    );
  });
});

interface RawResponse {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * `fetch` is wrong for the concurrency tests and quietly so: undici pools an
 * origin onto a single connection by default, so a dozen "concurrent" calls are
 * delivered one after another and never overlap. `agent: false` gives each
 * request its own socket, which is what a flood actually looks like.
 */
function post(baseUrl: string, body: string): Promise<RawResponse> {
  const url = new URL(`${baseUrl}${PICO_LINK_INTAKE_PATH}`);
  return rawRequest({
    hostname: url.hostname,
    port: Number(url.port),
    path: url.pathname,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
  }, body);
}

function rawRequest(
  options: RequestOptions,
  body?: string,
): Promise<RawResponse> {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest({ ...options, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        resolvePromise({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: response.headers,
        });
      });
    });
    request.on('error', rejectPromise);
    if (body !== undefined) {
      request.write(body);
    }
    request.end();
  });
}

/** Sentinel for a request the server is still holding open. */
const stillInFlight = -1;

function settle(status: Promise<number>, ms: number): Promise<number> {
  return Promise.race([
    status,
    new Promise<number>((resolvePromise) => {
      const timer = setTimeout(() => resolvePromise(stillInFlight), ms);
      timer.unref();
    }),
  ]);
}

/**
 * Sends a complete request head with a content-length it does not fulfil, so
 * the request stays in flight until the socket is destroyed. Resolves with the
 * status line as soon as the server answers - which for a refusal is
 * immediately, because the cap is checked before the body is read.
 */
function holdOpen(port: number, body: string): {
  connected: Promise<Socket>;
  status: Promise<number>;
} {
  let resolveStatus: (status: number) => void;
  let rejectStatus: (error: unknown) => void;
  const status = new Promise<number>((resolvePromise, rejectPromise) => {
    resolveStatus = resolvePromise;
    rejectStatus = rejectPromise;
  });

  const connected = new Promise<Socket>((resolvePromise, rejectPromise) => {
    const socket = connect(port, '127.0.0.1', () => {
      heldSockets.push(socket);
      socket.write(
        `POST ${PICO_LINK_INTAKE_PATH} HTTP/1.1\r\n`
        + 'host: 127.0.0.1\r\n'
        + 'content-type: application/json\r\n'
        // One byte more than will ever arrive.
        + `content-length: ${Buffer.byteLength(body) + 1}\r\n`
        + '\r\n'
        + body,
      );
      resolvePromise(socket);
    });
    let received = '';
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('utf8');
      const match = /^HTTP\/1\.1 (\d{3})/u.exec(received);
      if (match !== null) {
        resolveStatus(Number(match[1]));
      }
    });
    socket.on('error', (error) => {
      rejectPromise(error);
      rejectStatus(error);
    });
  });

  return { connected, status };
}

function foundationPort(app: Awaited<ReturnType<typeof buildApp>>): number {
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('foundation listener has no TCP address');
  }
  return address.port;
}

async function withIntake(
  overrides: Partial<CoreConfig> & { linkIntakeMaxInFlight?: number },
  run: (
    baseUrl: string,
    listener: PicoLinkIntakeListener,
    app: Awaited<ReturnType<typeof buildApp>>,
  ) => Promise<void>,
  options: { listenFoundation?: boolean } = {},
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'pico-link-quota-'));
  const logDestination = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const { linkIntakeMaxInFlight, ...configOverrides } = overrides;
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: join(directory, 'pico.sqlite'),
    deviceId: 'link-quota-test',
    logDestination,
    ...configOverrides,
  });
  if (options.listenFoundation === true) {
    await app.listen({ host: '127.0.0.1', port: 0 });
  }
  const listener = await startPicoLinkIntakeListener(app, {
    host: '127.0.0.1',
    port: 0,
    maxInFlight: linkIntakeMaxInFlight,
  });

  try {
    await run(`http://127.0.0.1:${listener.port}`, listener, app);
  } finally {
    // Before the close, not after: a socket parked inside Fastify keeps
    // `app.close()` waiting for a body that never arrives, so leaving this to
    // `afterEach` would turn one failed assertion into a suite of timeouts.
    for (const socket of heldSockets.splice(0)) {
      socket.destroy();
    }
    await listener.close();
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
