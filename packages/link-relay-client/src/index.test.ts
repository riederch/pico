import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PicoRelayStore, startPicoRelayServer, type PicoRelayServer } from '@pico/relay';
import {
  picoLinkExpiryBucketFor,
  picoLinkPacketSchema,
  parsePicoLinkPacket,
} from '@pico/protocol/link-packet';
import { afterEach, describe, expect, it } from 'vitest';
import { PicoLinkRelayClient } from './index.js';

/**
 * ADR 0149, the client - tested against the **real** server rather than a
 * stub, because a stub would only prove that my idea of the surface agrees
 * with itself.
 *
 * The relay is a devDependency here and nowhere else. Shipping it would make
 * a Home carry a stranger's queue, which is the thing `check-relay-boundary`
 * exists to keep true from the other side.
 */
const tempDirs: string[] = [];
const servers: PicoRelayServer[] = [];
const stores: PicoRelayStore[] = [];

const operator = 'relay.example.invalid';
const account = 'a'.repeat(32);
const otherAccount = 'b'.repeat(32);
const mailbox = '1'.repeat(32);
const tag = '2'.repeat(32);
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

async function startRelay(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-client-'));
  tempDirs.push(dir);
  const store = new PicoRelayStore(join(dir, 'relay.sqlite'), operator);
  stores.push(store);
  store.upsertAccount({ accountId: account, mailboxQuota: 2 });
  store.upsertAccount({ accountId: otherAccount, mailboxQuota: 2 });
  const server = await startPicoRelayServer({ store, host: '127.0.0.1', port: 0 });
  servers.push(server);
  return `http://${server.host}:${server.port}`;
}

const packet = (over: Record<string, unknown> = {}) => parsePicoLinkPacket({
  schema: picoLinkPacketSchema,
  to: `${mailbox}@${operator}`,
  tag,
  expiresAt,
  payload: 'AAAA',
  ...over,
});

async function client(baseUrl: string, accountId = account): Promise<PicoLinkRelayClient> {
  return new PicoLinkRelayClient({ baseUrl, accountId });
}

describe('ADR 0149 - the relay client, against the real relay', () => {
  it('registers, delivers, collects, acknowledges', async () => {
    const base = await startRelay();
    const relay = await client(base);

    expect(await relay.register({ mailbox, capacity: 4 })).toEqual({ ok: true, value: true });
    expect(await relay.deliver(packet())).toBe('accepted');

    const collected = await relay.collect(mailbox);
    expect(collected.ok && collected.value.packets)
      .toEqual([{ tag, expiresAt, payload: 'AAAA' }]);
    expect(collected.ok && collected.value.more).toBe(false);

    // ADR 0149 RS5: the read removed nothing, so the same packets come back.
    const again = await relay.collect(mailbox);
    expect(again.ok && again.value.packets).toEqual(collected.ok && collected.value.packets);

    expect(await relay.acknowledge({ mailbox, tags: [tag] })).toEqual({ ok: true, value: 1 });
    const empty = await relay.collect(mailbox);
    expect(empty.ok && empty.value.packets).toEqual([]);
  });

  it('sends no account when delivering', async () => {
    // ADR 0149 RS3. Attaching one would tell the operator which of its
    // customers is talking to which mailbox - the graph the envelope was
    // shaped to avoid.
    const base = await startRelay();
    const seen: Array<Record<string, string>> = [];
    const relay = new PicoLinkRelayClient({
      baseUrl: base,
      accountId: account,
      fetch: async (input, init) => {
        seen.push(Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)));
        return await globalThis.fetch(input as string, init);
      },
    });
    await relay.register({ mailbox, capacity: 4 });
    await relay.deliver(packet());

    expect(Object.keys(seen[0]!)).toContain('x-pico-relay-account');
    expect(Object.keys(seen[1]!)).not.toContain('x-pico-relay-account');
  });

  it('returns a refusal as an answer rather than throwing', async () => {
    // Every refusal is something the caller did and can do differently. Only a
    // broken relay throws.
    const base = await startRelay();
    const relay = await client(base);
    const mine = await relay.register({ mailbox, capacity: 4 });
    expect(mine.ok).toBe(true);

    const stranger = await client(base, otherAccount);
    expect(await stranger.collect(mailbox)).toEqual({ ok: false, refusal: 'mailbox_not_yours' });
    expect(await stranger.deregister(mailbox)).toEqual({ ok: false, refusal: 'mailbox_not_yours' });
  });

  it('passes an ADR 0147 outcome through and refuses one outside the list', async () => {
    const base = await startRelay();
    const relay = await client(base);
    expect(await relay.deliver(packet())).toBe('mailbox_unknown');

    const inventing = new PicoLinkRelayClient({
      baseUrl: base,
      accountId: account,
      fetch: async () => new Response(JSON.stringify({ outcome: 'delivered' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      }),
    });
    // A relay answering outside the closed list has answered something this
    // caller cannot act on, and `delivered` is exactly the answer ADR 0147 RY5
    // says nobody can give.
    await expect(inventing.deliver(packet())).rejects.toThrow('unknown_pico_link_delivery_outcome');
  });

  it('refuses a guessable account credential before it reaches the wire', async () => {
    const base = await startRelay();
    for (const bad of ['customer-7', 'a'.repeat(31), 'A'.repeat(32)]) {
      expect(() => new PicoLinkRelayClient({ baseUrl: base, accountId: bad }))
        .toThrow('invalid_pico_link_relay_account');
    }
  });

  it('refuses a base URL that is not one', async () => {
    for (const bad of ['relay.example.invalid', 'ftp://relay', '', 'http://a b']) {
      expect(() => new PicoLinkRelayClient({ baseUrl: bad, accountId: account }))
        .toThrow('invalid_pico_link_relay_base_url');
    }
  });

  it('splits an over-long acknowledgement here rather than at the operator', async () => {
    // The caller is the one that can split it; the operator would only say no.
    const base = await startRelay();
    const relay = await client(base);
    await expect(relay.acknowledge({
      mailbox,
      tags: Array.from({ length: 65 }, (_value, index) => index.toString(16).padStart(32, '0')),
    })).rejects.toThrow('invalid_pico_link_relay_tags');
  });

  it('says whether an address belongs to the relay it talks to', async () => {
    // Sending a mailbox to the wrong operator would register somebody else's
    // name at a relay that has never heard of it.
    const base = await startRelay();
    const relay = await client(base);
    expect(relay.holds(`${mailbox}@127.0.0.1`)).toBe(true);
    expect(relay.holds(`${mailbox}@other.relay.invalid`)).toBe(false);
  });

  it('gives up on an operator that never answers', async () => {
    const base = await startRelay();
    const relay = new PicoLinkRelayClient({
      baseUrl: base,
      accountId: account,
      timeoutMs: 25,
      fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });
    await expect(relay.collect(mailbox)).rejects.toThrow();
  });
});
