import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { picoLinkExpiryBucketFor, picoLinkPacketSchema } from '@pico/protocol/link-packet';
import {
  MAX_PICO_LINK_RELAY_BODY_BYTES,
  picoLinkRelayAccountHeader,
  picoLinkRelayRoutes,
} from '@pico/protocol/link-relay-surface';
import { afterEach, describe, expect, it } from 'vitest';
import { PicoRelayStore } from './store.js';
import { startPicoRelayServer, type PicoRelayServer } from './server.js';

/**
 * ADR 0149, the surface. Five exact routes, all POST, the mailbox always in
 * the body.
 *
 * The route shape is not a REST preference: ADR 0148 EX4 says a mailbox must
 * not become part of a URL, because a URL lands in proxy logs, browser history
 * and referer headers. `GET /mailbox/:mailbox` would put a capability in all
 * three.
 */
const tempDirs: string[] = [];
const servers: PicoRelayServer[] = [];
const stores: PicoRelayStore[] = [];

const operator = 'relay.example.invalid';
const account = 'a'.repeat(32);
const otherAccount = 'b'.repeat(32);
const mailbox = '1'.repeat(32);
const tag = '2'.repeat(32);
/**
 * An hour out, snapped up to the quarter-hour grid ADR 0147 RY6 requires.
 * Computed from the real clock because the server reads one: a fixture instant
 * would drift out of the seven-day lifetime ceiling and fail for a reason that
 * has nothing to do with what is under test.
 */
const expiresAt = picoLinkExpiryBucketFor(Date.now() + 60 * 60 * 1_000);

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.close();
  }
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function startRelay(): Promise<{ base: string; store: PicoRelayStore }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-server-'));
  tempDirs.push(dir);
  const store = new PicoRelayStore(join(dir, 'relay.sqlite'), operator);
  stores.push(store);
  store.upsertAccount({ accountId: account, mailboxQuota: 4 });
  store.upsertAccount({ accountId: otherAccount, mailboxQuota: 4 });

  const server = await startPicoRelayServer({ store, host: '127.0.0.1', port: 0 });
  servers.push(server);
  return { base: `http://${server.host}:${server.port}`, store };
}

async function post(base: string, route: string, body: unknown, accountId?: string) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accountId === undefined ? {} : { [picoLinkRelayAccountHeader]: accountId }),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

const packet = (over: Record<string, unknown> = {}) => ({
  schema: picoLinkPacketSchema,
  to: `${mailbox}@${operator}`,
  tag,
  expiresAt,
  payload: 'AAAA',
  ...over,
});

describe('ADR 0149 - the relay surface', () => {
  it('carries a packet from registration to acknowledgement', async () => {
    const { base } = await startRelay();

    expect(await post(base, picoLinkRelayRoutes.register, { mailbox, capacity: 4 }, account))
      .toEqual({ status: 201, body: { registered: true } });

    // ADR 0149 RS3: no account header, and none is asked for.
    expect(await post(base, picoLinkRelayRoutes.deliver, packet()))
      .toEqual({ status: 202, body: { outcome: 'accepted' } });

    const collected = await post(base, picoLinkRelayRoutes.collect, { mailbox }, account);
    expect(collected.status).toBe(200);
    expect(collected.body.packets).toEqual([{ tag, expiresAt, payload: 'AAAA' }]);
    expect(collected.body.more).toBe(false);

    // ADR 0149 RS5: collecting removed nothing.
    const again = await post(base, picoLinkRelayRoutes.collect, { mailbox }, account);
    expect(again.body.packets).toEqual(collected.body.packets);

    expect(await post(base, picoLinkRelayRoutes.acknowledge, { mailbox, tags: [tag] }, account))
      .toEqual({ status: 200, body: { removed: 1 } });
    const empty = await post(base, picoLinkRelayRoutes.collect, { mailbox }, account);
    expect(empty.body.packets).toEqual([]);
  });

  it('never puts a mailbox in a path', () => {
    // ADR 0148 EX4 as a property of the route table itself.
    for (const route of Object.values(picoLinkRelayRoutes)) {
      expect(route).not.toContain(':');
      expect(route.split('/').filter(Boolean)).toEqual(['relay', route.split('/').pop()]);
    }
  });

  it('answers an unknown route and a wrong method the same way', async () => {
    // Telling them apart would be a map of the relay's own surface.
    const { base } = await startRelay();
    expect((await post(base, '/relay/whatever', {})).status).toBe(404);
    const wrongMethod = await fetch(`${base}${picoLinkRelayRoutes.collect}`, { method: 'GET' });
    expect(wrongMethod.status).toBe(404);
    expect(await wrongMethod.json()).toEqual({ error: 'not_found' });
  });

  it('refuses a guessable account credential', async () => {
    // The credential *is* the identifier, which is only safe because the shape
    // forces the entropy: an operator issuing `customer-7` would be issuing a
    // password of `customer-7`.
    const { base } = await startRelay();
    for (const bad of ['customer-7', 'a'.repeat(31), 'A'.repeat(32), undefined]) {
      const answer = await post(base, picoLinkRelayRoutes.collect, { mailbox }, bad);
      expect(answer).toEqual({ status: 400, body: { error: 'invalid_pico_link_relay_account' } });
    }
  });

  it('answers another account as though the mailbox were not there', async () => {
    const { base } = await startRelay();
    await post(base, picoLinkRelayRoutes.register, { mailbox, capacity: 4 }, account);
    expect(await post(base, picoLinkRelayRoutes.collect, { mailbox }, otherAccount))
      .toEqual({ status: 409, body: { refusal: 'mailbox_not_yours' } });
  });

  it('passes the ADR 0147 outcome through rather than inventing a status', async () => {
    const { base } = await startRelay();
    expect(await post(base, picoLinkRelayRoutes.deliver, packet()))
      .toEqual({ status: 409, body: { outcome: 'mailbox_unknown' } });

    await post(base, picoLinkRelayRoutes.register, { mailbox, capacity: 1 }, account);
    await post(base, picoLinkRelayRoutes.deliver, packet());
    expect(await post(base, picoLinkRelayRoutes.deliver, packet({ tag: '3'.repeat(32) })))
      .toEqual({ status: 409, body: { outcome: 'mailbox_full' } });

    await post(base, picoLinkRelayRoutes.deregister, { mailbox }, account);
    expect(await post(base, picoLinkRelayRoutes.deliver, packet()))
      .toEqual({ status: 409, body: { outcome: 'mailbox_revoked' } });
  });

  it('refuses a body past the ceiling, and says that is why', async () => {
    // A body nobody capped is a memory limit nobody set - and the body here is
    // **valid JSON**, so a cap that had been removed would let it through to
    // the parser and fail for a different reason. An oversize body and a
    // malformed one are told apart, or the first caller goes hunting through
    // its JSON for a problem that is not there.
    const { base } = await startRelay();
    const oversize = JSON.stringify({ ...packet(), payload: 'A'.repeat(MAX_PICO_LINK_RELAY_BODY_BYTES) });
    const response = await fetch(`${base}${picoLinkRelayRoutes.deliver}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversize,
    }).catch(() => undefined);

    expect(response).toBeDefined();
    expect(response!.status).toBe(413);
    expect(await response!.json()).toEqual({ error: 'body_too_large' });
  });

  it('refuses an unknown field rather than ignoring it', async () => {
    const { base } = await startRelay();
    expect(await post(base, picoLinkRelayRoutes.register, {
      mailbox, capacity: 4, quota: 99,
    }, account)).toEqual({
      status: 400,
      body: { error: 'pico_link_relay_request_carries_no:quota' },
    });
  });

  it('sets no-store and nosniff on every answer', async () => {
    // Even a refusal must not be cached by an intermediary.
    const { base } = await startRelay();
    const response = await fetch(`${base}${picoLinkRelayRoutes.deliver}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(packet()),
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('destroys an upgrade rather than growing a second surface', async () => {
    const { base } = await startRelay();
    const response = await fetch(`${base}${picoLinkRelayRoutes.collect}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        connection: 'Upgrade',
        upgrade: 'websocket',
      },
      body: JSON.stringify({ mailbox }),
    }).catch(() => undefined);
    expect(response === undefined || response.status !== 101).toBe(true);
  });
});
