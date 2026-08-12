import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PicoRelayStore, startPicoRelayServer, type PicoRelayServer } from '@pico/relay';
import {
  defaultPicoLinkMailboxCapacity,
  picoLinkExpiryBucketFor,
  picoLinkPacketSchema,
  parsePicoLinkPacket,
} from '@pico/protocol/link-packet';
import { afterEach, describe, expect, it } from 'vitest';
import { collectPicoLinkRelayPackets } from './link-relay-collector.js';
import {
  createPicoLinkRelayTransport,
  picoLinkRelayMailboxOf,
} from './link-relay-transport.js';
import type { PicoLinkMailboxRecord } from './event-store.js';

/**
 * ADR 0149 - the collector against a real relay rather than a fake reader.
 *
 * `link-relay-collector.test.ts` proves the decisions with a reader written
 * for the test, which is right: those decisions must hold without a network.
 * This proves the other half - that the port and the surface actually meet -
 * and it is the only test that would notice if they stopped.
 */
const tempDirs: string[] = [];
const servers: PicoRelayServer[] = [];
const stores: PicoRelayStore[] = [];

const operator = 'relay.example.invalid';
const account = 'a'.repeat(32);
const device = 'd'.repeat(64);
const homeInbound = `${'1'.repeat(32)}@${operator}`;
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

async function startRelay(): Promise<{ baseUrl: string; store: PicoRelayStore }> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-transport-'));
  tempDirs.push(dir);
  const store = new PicoRelayStore(join(dir, 'relay.sqlite'), operator);
  stores.push(store);
  store.upsertAccount({ accountId: account, mailboxQuota: 2 });
  const server = await startPicoRelayServer({ store, host: '127.0.0.1', port: 0 });
  servers.push(server);
  return { baseUrl: `http://${server.host}:${server.port}`, store };
}

const record: PicoLinkMailboxRecord = {
  deviceSigningKeyFingerprintHex: device,
  picoIdentityFingerprintHex: 'b'.repeat(64),
  deviceKeyAgreementKeyFingerprintHex: 'c'.repeat(64),
  delegationId: 'delegation-1',
  homeInbound,
  deviceInbound: `${'2'.repeat(32)}@${operator}`,
  exchangedAt: '2026-08-12T12:00:00.000Z',
};

const packet = (tag: string, payload: string) => parsePicoLinkPacket({
  schema: picoLinkPacketSchema,
  to: homeInbound,
  tag,
  expiresAt,
  payload,
});

describe('ADR 0149 - the collector over the real surface', () => {
  it('registers, receives, collects, handles and acknowledges', async () => {
    const { baseUrl, store } = await startRelay();
    const transport = createPicoLinkRelayTransport({ baseUrl, accountId: account });

    await transport.register({
      mailbox: picoLinkRelayMailboxOf(homeInbound),
      capacity: defaultPicoLinkMailboxCapacity,
    });
    // Delivered as a stranger would - no account, ADR 0149 RS3.
    expect(store.deliver({
      packet: packet('1'.repeat(32), 'AAAA'),
      nowMs: Date.now(),
      acceptedAt: new Date().toISOString(),
    })).toBe('accepted');

    const handled: string[] = [];
    const result = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
      senderOf: () => device,
      handle: async ({ payload }) => {
        handled.push(payload);
      },
    });

    expect(result).toEqual({ handled: 1, refused: 0, deferred: 0 });
    expect(handled).toEqual(['AAAA']);

    // Acknowledged over the wire, so a second pass finds nothing.
    const second = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
      senderOf: () => device,
      handle: async () => {},
    });
    expect(second).toEqual({ handled: 0, refused: 0, deferred: 0 });
  });

  it('leaves a deferred packet on the relay, not just in memory', async () => {
    // The distinction only means something if it survives the wire: a
    // collector that "left" a packet locally and acknowledged it remotely
    // would lose it exactly once, silently.
    const { baseUrl, store } = await startRelay();
    const transport = createPicoLinkRelayTransport({ baseUrl, accountId: account });
    await transport.register({
      mailbox: picoLinkRelayMailboxOf(homeInbound),
      capacity: defaultPicoLinkMailboxCapacity,
    });
    store.deliver({
      packet: packet('1'.repeat(32), 'AAAA'),
      nowMs: Date.now(),
      acceptedAt: new Date().toISOString(),
    });

    const first = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
      senderOf: () => device,
      handle: async () => {
        throw new Error('store_busy');
      },
    });
    expect(first.deferred).toBe(1);

    const handled: string[] = [];
    const second = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
      senderOf: () => device,
      handle: async ({ payload }) => {
        handled.push(payload);
      },
    });
    expect(second.handled).toBe(1);
    expect(handled).toEqual(['AAAA']);
  });

  it('throws a named refusal rather than reporting a registration failure', async () => {
    // A caller that treated this as a warning would hand the address over and
    // the peer would write into a mailbox nobody holds.
    const { baseUrl } = await startRelay();
    const transport = createPicoLinkRelayTransport({ baseUrl, accountId: 'f'.repeat(32) });
    await expect(transport.register({
      mailbox: picoLinkRelayMailboxOf(homeInbound),
      capacity: defaultPicoLinkMailboxCapacity,
    })).rejects.toThrow('pico_link_relay_registration_refused:unknown_account');
  });

  it('treats deregistering something already gone as done', async () => {
    // A detach that could fail on a second attempt is one nobody can finish.
    const { baseUrl } = await startRelay();
    const transport = createPicoLinkRelayTransport({ baseUrl, accountId: account });
    await expect(transport.deregister(picoLinkRelayMailboxOf(homeInbound))).resolves.toBeUndefined();
  });

  it('sends no acknowledgement when there is nothing to acknowledge', async () => {
    const { baseUrl } = await startRelay();
    let posted = 0;
    const transport = createPicoLinkRelayTransport({
      baseUrl,
      accountId: account,
      fetch: async (input, init) => {
        posted += 1;
        return await globalThis.fetch(input as string, init);
      },
    });
    await transport.acknowledge({ mailbox: picoLinkRelayMailboxOf(homeInbound), tags: [] });
    expect(posted).toBe(0);
  });

  it('splits an address through the protocol parser rather than on @', () => {
    expect(picoLinkRelayMailboxOf(homeInbound)).toBe('1'.repeat(32));
    // ADR 0147 RY3: a second splitter would get the two-`@` case wrong.
    expect(() => picoLinkRelayMailboxOf(`${'1'.repeat(32)}@evil@${operator}`))
      .toThrow('invalid_pico_link_address');
  });
});
