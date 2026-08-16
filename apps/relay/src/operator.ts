import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  parsePicoRelayAccountCreateRequest,
  parsePicoRelayAccountRevokeRequest,
  parsePicoRelayClaimRequest,
  picoRelayOperatorCredentialPattern,
  picoRelayOperatorHeader,
  picoRelayOperatorRoutes,
} from '@pico/protocol/link-relay-operator';
import { mintPicoRelayCredential, picoRelayCredentialDigest, type PicoRelayClaimCode } from './operator-claim.js';
import {
  PicoRelayRateLimit,
  picoRelayOperatorRequestsPerMinute,
  picoRelayUnauthenticatedRequestsPerMinute,
} from './rate-limit.js';
import type { PicoRelayStore } from './store.js';

/**
 * ADR 0154 - the door an operator administers this relay through, and the
 * reason it is a different door.
 *
 * ADR 0153 PK3 keeps the mailbox port at exactly five routes that answer an
 * unknown route the way they answer a wrong method, so that surface carries no
 * map of itself. Administration on that port would be the one request that
 * answered differently, and it would answer with the most informative thing a
 * scanner could ask for. So: a second listener, on its own port, bound to
 * loopback unless somebody says otherwise.
 *
 * **Nothing here learns a Pico.** Two bearer credentials and some integers.
 * ADR 0149 RS2 is a property of the whole process rather than of one file, and
 * administration is precisely where breaking it would have been convenient - a
 * signed operator statement is the reflex, and verifying one would put
 * signature checking in the relay.
 */
export interface PicoRelayOperatorListener {
  host: string;
  port: number;
  close(): Promise<void>;
}

/** Small: every body here is a couple of integers or one code. */
const MAX_OPERATOR_BODY_BYTES = 4 * 1024;

export async function startPicoRelayOperatorListener(options: {
  store: PicoRelayStore;
  claimCode: PicoRelayClaimCode;
  host: string;
  port: number;
  now?: () => Date;
  log?: (line: Record<string, unknown>) => void;
}): Promise<PicoRelayOperatorListener> {
  const now = options.now ?? (() => new Date());

  /**
   * ADR 0154 RO9. Two buckets, charged before anything else happens.
   *
   * A caller is identified and then charged to their own budget, so an
   * attacker hammering the door cannot spend the operator's. Neither bucket
   * exists to make a 128-bit credential harder to guess - the entropy already
   * ends that argument. They exist so a port somebody deliberately exposed
   * cannot be turned into a load generator.
   */
  const unauthenticated = new PicoRelayRateLimit({
    capacity: picoRelayUnauthenticatedRequestsPerMinute,
    perMinute: picoRelayUnauthenticatedRequestsPerMinute,
    now: () => now().getTime(),
  });
  const authenticated = new PicoRelayRateLimit({
    capacity: picoRelayOperatorRequestsPerMinute,
    perMinute: picoRelayOperatorRequestsPerMinute,
    now: () => now().getTime(),
  });

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      send(response, 500, { error: 'operator_request_failed' });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');

    /**
     * ADR 0154 RO9. Who this is, then which budget, then everything else.
     *
     * **The order is the design, and the obvious one is wrong.** Charging the
     * unauthenticated bucket first and refunding it once a credential turned
     * out to be valid reads well and does the opposite of what it promises: a
     * stranger who empties that bucket then refuses the operator's next
     * request before it can prove anything. A test found it, which is the
     * only reason it is not in this file.
     *
     * So the credential is checked first. That is a digest and one indexed
     * query, which is the floor of work an unauthenticated caller can force
     * here - bounded by the connection ceiling and the timeouts rather than by
     * the bucket, and cheap enough to be the price of telling callers apart.
     * The body is read after, so a caller past their budget never gets to send
     * one.
     */
    const presented = request.headers[picoRelayOperatorHeader];
    const isOperator = typeof presented === 'string'
      && picoRelayOperatorCredentialPattern.test(presented)
      && options.store.isOperator(presented);

    // Charged before the route is looked at, so a rate-limited unknown route
    // and a rate-limited real one answer identically - the same property the
    // 404 below carries, kept through the bound rather than around it.
    const budget = (isOperator ? authenticated : unauthenticated).take();
    if (!budget.allowed) {
      response.setHeader('retry-after', String(budget.retryAfterSeconds));
      send(response, 429, { refusal: 'too_many_requests' });
      return;
    }

    const route = (request.url ?? '').split('?')[0] ?? '';
    const known = Object.values(picoRelayOperatorRoutes) as readonly string[];
    if (request.method !== 'POST' || !known.includes(route)) {
      // Same shape as the mailbox port's answer, for the same reason: an
      // unknown route and a wrong method are one answer, so the surface does
      // not enumerate itself for whoever knocks.
      send(response, 404, { error: 'not_found' });
      return;
    }

    let body: unknown;
    try {
      body = await readBody(request);
    } catch (error) {
      send(response, 400, { error: String((error as Error).message) });
      return;
    }

    if (route === picoRelayOperatorRoutes.claim) {
      handleClaim(response, body);
      return;
    }

    // Everything below needs the credential the claim handed out. A relay
    // nobody has claimed and a wrong credential answer the same here; the
    // claim route tells those two apart, because that is where the difference
    // is something a caller can act on.
    if (!isOperator) {
      send(response, 401, { error: 'invalid_pico_relay_operator_credential' });
      return;
    }

    switch (route) {
      case picoRelayOperatorRoutes.describe:
        send(response, 200, {
          operator: options.store.operatorName,
          claimed: true,
          accounts: options.store.accountSummaries().length,
        });
        return;
      case picoRelayOperatorRoutes.accountList:
        send(response, 200, { accounts: options.store.accountSummaries() });
        return;
      case picoRelayOperatorRoutes.accountCreate: {
        let parsed;
        try {
          parsed = parsePicoRelayAccountCreateRequest(body);
        } catch (error) {
          send(response, 400, { error: String((error as Error).message) });
          return;
        }
        // ADR 0154 RO3. The relay generates it; nobody presents one. A caller
        // choosing its own would be choosing a password, and the credential is
        // the account name.
        const credentialForAccount = mintPicoRelayCredential();
        const account = options.store.createAccount({
          credential: credentialForAccount,
          mailboxQuota: parsed.mailboxQuota,
          maxCapacity: parsed.maxCapacity,
          at: now().toISOString(),
        });
        options.log?.({ event: 'relay_account_created', accountRef: account.accountRef });
        // The one and only time this value exists outside the caller's hands.
        // Nothing stores it, so no route can return it again.
        send(response, 200, { account, credential: credentialForAccount });
        return;
      }
      case picoRelayOperatorRoutes.accountRevoke: {
        let parsed;
        try {
          parsed = parsePicoRelayAccountRevokeRequest(body);
        } catch (error) {
          send(response, 400, { error: String((error as Error).message) });
          return;
        }
        const revoked = options.store.revokeAccount({
          accountRef: parsed.accountRef,
          at: now().toISOString(),
        });
        if (!revoked.ok) {
          send(response, 409, { refusal: revoked.refusal });
          return;
        }
        options.log?.({ event: 'relay_account_revoked', accountRef: parsed.accountRef });
        send(response, 200, { accountRef: parsed.accountRef, status: 'revoked' });
        return;
      }
      default:
        send(response, 404, { error: 'not_found' });
    }
  }

  function handleClaim(response: ServerResponse, body: unknown): void {
    if (options.store.isClaimed()) {
      // ADR 0154. Told apart from a wrong code deliberately: this is a state
      // an operator can see in the log, and a typo is not. Folding them
      // together would send somebody hunting for a code that is sitting spent.
      send(response, 409, { refusal: 'already_claimed' });
      return;
    }
    let parsed;
    try {
      parsed = parsePicoRelayClaimRequest(body);
    } catch (error) {
      send(response, 400, { error: String((error as Error).message) });
      return;
    }
    if (!options.claimCode.consume(parsed.claimCode)) {
      send(response, 409, { refusal: 'invalid_claim_code' });
      return;
    }
    const credential = mintPicoRelayCredential();
    options.store.claim({
      credentialDigest: picoRelayCredentialDigest(credential),
      at: now().toISOString(),
    });
    options.log?.({ event: 'relay_claimed' });
    send(response, 200, { credential, operator: options.store.operatorName });
  }

  async function readBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += (chunk as Buffer).length;
      if (size > MAX_OPERATOR_BODY_BYTES) {
        request.pause();
        throw new Error('pico_relay_operator_body_too_large');
      }
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (text.trim() === '') {
      return {};
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('invalid_pico_relay_operator_json');
    }
  }

  function send(response: ServerResponse, status: number, body: unknown): void {
    const encoded = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(encoded),
    });
    response.end(encoded);
  }

  server.headersTimeout = 5_000;
  server.requestTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxConnections = 32;

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
