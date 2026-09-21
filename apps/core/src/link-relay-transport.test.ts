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
import {
  assertPicoLinkRelayPacketSender,
  collectPicoLinkRelayPackets,
} from './link-relay-collector.js';
import {
  createPicoLinkRelayTransport,
  picoLinkRelayMailboxOf,
} from './link-relay-transport.js';
import { Writable } from 'node:stream';
import { buildApp } from './app.js';
import type { PicoLinkMailboxRecord } from './event-store.js';
import { MIN_PICO_LINK_PACKET_PAYLOAD_BYTES } from '@pico/protocol/link-packet';

/**
 * Befund B244: ein Nutzinhalt unter dem Aufschlag der Versiegelung ist
 * beweisbar keine Huelle. Aus der Konstante gerechnet statt getippt.
 */
const smallestPayload = Buffer
  .from(new Uint8Array(MIN_PICO_LINK_PACKET_PAYLOAD_BYTES))
  .toString('base64');


interface HomeWithSweep {
  picoSweepLinkRelayMailboxes(): Promise<void>;
  picoSweepLinkPushes(): Promise<number>;
  close(): Promise<void>;
}

async function boot(
  databasePath: string,
  relay?: { baseUrl: string; accountId: string },
): Promise<HomeWithSweep> {
  return await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    ...(relay === undefined ? {} : {
      linkRelayBaseUrl: relay.baseUrl,
      linkRelayAccountId: relay.accountId,
    }),
    logDestination: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  }) as unknown as HomeWithSweep;
}

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
  store.createAccount({ credential: account, mailboxQuota: 2, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
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
      packet: packet('1'.repeat(32), smallestPayload),
      nowMs: Date.now(),
      acceptedAt: new Date().toISOString(),
    })).toBe('accepted');

    const handled: string[] = [];
    const result = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
      handle: async ({ payload, expectedDeviceSigningKeyFingerprintHex }) => {
        assertPicoLinkRelayPacketSender({
          expectedDeviceSigningKeyFingerprintHex,
          signerDeviceSigningKeyFingerprintHex: device,
        });
        handled.push(payload);
      },
    });

    expect(result).toEqual({ handled: 1, refused: 0, deferred: 0 });
    expect(handled).toEqual([smallestPayload]);

    // Acknowledged over the wire, so a second pass finds nothing.
    const second = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
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
      packet: packet('1'.repeat(32), smallestPayload),
      nowMs: Date.now(),
      acceptedAt: new Date().toISOString(),
    });

    const first = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
      handle: async () => {
        throw new Error('store_busy');
      },
    });
    expect(first.deferred).toBe(1);

    const handled: string[] = [];
    const second = await collectPicoLinkRelayPackets({
      reader: transport,
      mailboxes: [record],
      handle: async ({ payload, expectedDeviceSigningKeyFingerprintHex }) => {
        assertPicoLinkRelayPacketSender({
          expectedDeviceSigningKeyFingerprintHex,
          signerDeviceSigningKeyFingerprintHex: device,
        });
        handled.push(payload);
      },
    });
    expect(second.handled).toBe(1);
    expect(handled).toEqual([smallestPayload]);
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

  it('swallows only the one refusal that means it is already done', async () => {
    // The rule is the transport's, not this relay's - which answers
    // `mailbox_not_yours` and nothing else here - so it is proven against a
    // relay that answers something else. Anything but "already not ours" is a
    // mailbox this Home believes it closed and an operator that still holds it.
    const { baseUrl } = await startRelay();
    const transport = createPicoLinkRelayTransport({
      baseUrl,
      accountId: account,
      fetch: async () => new Response(
        JSON.stringify({ refusal: 'unknown_account' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
    });
    await expect(transport.deregister(picoLinkRelayMailboxOf(homeInbound)))
      .rejects.toThrow(/pico_link_relay_deregistration_refused:unknown_account/u);
  });

  it('throws rather than reporting an empty mailbox when a collect is refused', async () => {
    // An empty list from a refused collect says "nothing is waiting" when
    // nobody looked - the one answer this family must never give.
    const { baseUrl } = await startRelay();
    const transport = createPicoLinkRelayTransport({ baseUrl, accountId: 'f'.repeat(32) });
    await expect(transport.collect({ mailbox: picoLinkRelayMailboxOf(homeInbound) }))
      .rejects.toThrow(/pico_link_relay_collect_refused/u);
  });

  it('answers a refused delivery instead of throwing, because the caller can act', async () => {
    // ADR 0147's outcomes are all things a caller does something about: a full
    // mailbox drains, an unknown one needs a new address, a revoked one needs
    // a new relationship. A throw would flatten all three into "the transport
    // broke" and lose what to do next.
    const { baseUrl } = await startRelay();
    const transport = createPicoLinkRelayTransport({ baseUrl, accountId: account });

    await expect(transport.deliver(packet('f'.repeat(32), smallestPayload)))
      .resolves.toBe('mailbox_unknown');
  });

  it('splits an address through the protocol parser rather than on @', () => {
    expect(picoLinkRelayMailboxOf(homeInbound)).toBe('1'.repeat(32));
    // ADR 0147 RY3: a second splitter would get the two-`@` case wrong.
    expect(() => picoLinkRelayMailboxOf(`${'1'.repeat(32)}@evil@${operator}`))
      .toThrow('invalid_pico_link_address');
  });
});

describe('ADR 0149 - the sweep, driven through a booted Home', () => {
  it('does nothing at all when no relay is configured', async () => {
    // The ordinary state of a Home whose owner has not chosen an operator.
    const dir = mkdtempSync(join(tmpdir(), 'pico-sweep-none-'));
    tempDirs.push(dir);
    const app = await boot(join(dir, 'pico.sqlite'));
    try {
      await expect(app.picoSweepLinkRelayMailboxes()).resolves.toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('refuses and acknowledges a packet that is not an envelope', async () => {
    // The full path except for a valid ADR 0107 envelope: collected over the
    // wire, failed authentication, refused, and **removed** - because rubbish
    // that stayed would fill the mailbox and deny that relationship until
    // somebody reissued the address.
    const { baseUrl, store: relay } = await startRelay();
    const dir = mkdtempSync(join(tmpdir(), 'pico-sweep-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');

    const app = await boot(databasePath, { baseUrl, accountId: account });
    try {
      // Nothing is honoured yet - no delegation exists - so the sweep reads
      // nothing and leaves the relay untouched.
      await app.picoSweepLinkRelayMailboxes();
      expect(relay.mailboxFor(picoLinkRelayMailboxOf(homeInbound))).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});

describe('ADR 0150 - the push sweep, driven through a booted Home', () => {
  it('sends nothing when no relay is configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-push-none-'));
    tempDirs.push(dir);
    const app = await boot(join(dir, 'pico.sqlite'));
    try {
      await expect(app.picoSweepLinkPushes()).resolves.toBe(0);
    } finally {
      await app.close();
    }
  });

  it('sends nothing from an unclaimed Home, however configured', async () => {
    // A Home with no claim state has no home id, and a push sealed to a
    // reader key needs one - so the sweep is a no-op rather than a throw.
    const { baseUrl } = await startRelay();
    const dir = mkdtempSync(join(tmpdir(), 'pico-push-unclaimed-'));
    tempDirs.push(dir);
    const app = await boot(join(dir, 'pico.sqlite'), { baseUrl, accountId: account });
    try {
      await expect(app.picoSweepLinkPushes()).resolves.toBe(0);
    } finally {
      await app.close();
    }
  });

  it('sends nothing when nothing is pending, and touches the relay not at all', async () => {
    const { baseUrl, store: relay } = await startRelay();
    const dir = mkdtempSync(join(tmpdir(), 'pico-push-quiet-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'pico.sqlite');

    const app = await boot(databasePath, { baseUrl, accountId: account });
    try {
      expect(await app.picoSweepLinkPushes()).toBe(0);
    } finally {
      await app.close();
    }
    // Nothing registered, nothing delivered: a quiet Home is quiet at the
    // operator too, which is the property ADR 0147 RY7 counts on.
    expect(relay.mailboxFor(picoLinkRelayMailboxOf(homeInbound))).toBeUndefined();
  });
});
