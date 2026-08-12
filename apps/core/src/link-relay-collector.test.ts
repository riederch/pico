import { describe, expect, it } from 'vitest';
import {
  PicoLinkRelayUnauthenticatedError,
  assertPicoLinkRelayPacketSender,
  collectPicoLinkRelayPackets,
  type PicoLinkRelayReader,
} from './link-relay-collector.js';
import type { PicoLinkMailboxRecord } from './event-store.js';

/**
 * ADR 0149's collecting side.
 *
 * The test that carries the most is the disagreement one: a packet signed by
 * one device arriving in another's mailbox is authentic and still refused,
 * because processing it on its signature alone would quietly accept that an
 * address had leaked between two devices.
 *
 * The reader below mirrors the semantics `apps/relay`'s own suite proves -
 * collect returns and removes nothing, acknowledge removes - rather than
 * importing the relay, which would put a dependency the wrong way round for
 * one fixture.
 */
const operator = 'relay.example.invalid';
const deviceOne = 'd'.repeat(64);
const deviceTwo = 'e'.repeat(64);

function mailboxRecord(over: Partial<PicoLinkMailboxRecord> = {}): PicoLinkMailboxRecord {
  return {
    deviceSigningKeyFingerprintHex: deviceOne,
    picoIdentityFingerprintHex: 'a'.repeat(64),
    deviceKeyAgreementKeyFingerprintHex: 'b'.repeat(64),
    delegationId: 'delegation-1',
    homeInbound: `${'1'.repeat(32)}@${operator}`,
    deviceInbound: `${'2'.repeat(32)}@${operator}`,
    exchangedAt: '2026-08-12T12:00:00.000Z',
    ...over,
  };
}

function reader(initial: Record<string, Array<{ tag: string; payload: string }>>) {
  const held = new Map(Object.entries(initial).map(([box, packets]) => [box, [...packets]]));
  const calls = { collect: 0, acknowledge: 0 };
  const api: PicoLinkRelayReader & { held: typeof held; calls: typeof calls } = {
    held,
    calls,
    collect: async ({ mailbox }) => {
      calls.collect += 1;
      // Removes nothing, which is what makes acknowledging a separate act.
      return Object.freeze([...(held.get(mailbox) ?? [])]);
    },
    acknowledge: async ({ mailbox, tags }) => {
      calls.acknowledge += 1;
      held.set(mailbox, (held.get(mailbox) ?? []).filter((packet) => !tags.includes(packet.tag)));
    },
  };
  return api;
}

const box = (record: PicoLinkMailboxRecord) => record.homeInbound.split('@')[0]!;

describe('ADR 0149 - collecting what is waiting', () => {
  it('handles a packet and acknowledges it afterwards', async () => {
    const record = mailboxRecord();
    const store = reader({ [box(record)]: [{ tag: 't1', payload: 'envelope-1' }] });
    const handled: string[] = [];

    const result = await collectPicoLinkRelayPackets({
      reader: store,
      mailboxes: [record],
      handle: async ({ payload, expectedDeviceSigningKeyFingerprintHex }) => {
        assertPicoLinkRelayPacketSender({
          expectedDeviceSigningKeyFingerprintHex,
          signerDeviceSigningKeyFingerprintHex: deviceOne,
        });
        // Still holding it at handling time: acknowledgement comes after.
        expect(store.held.get(box(record))).toHaveLength(1);
        handled.push(payload);
      },
    });

    expect(result).toEqual({ handled: 1, refused: 0, deferred: 0 });
    expect(handled).toEqual(['envelope-1']);
    expect(store.held.get(box(record))).toHaveLength(0);
  });

  it('refuses an authentic packet that arrived in another device mailbox', async () => {
    // **The gate.** The signature would let this through - it always would,
    // that is what ADR 0107 is - and processing it would quietly accept that
    // device one's address had leaked to device two.
    const record = mailboxRecord();
    const store = reader({ [box(record)]: [{ tag: 't1', payload: 'envelope-1' }] });
    const refusals: string[] = [];
    const handled: string[] = [];

    const result = await collectPicoLinkRelayPackets({
      reader: store,
      mailboxes: [record],
      handle: async ({ payload, expectedDeviceSigningKeyFingerprintHex }) => {
        // Authenticated as device two - the signature holds and the mailbox
        // belongs to device one.
        assertPicoLinkRelayPacketSender({
          expectedDeviceSigningKeyFingerprintHex,
          signerDeviceSigningKeyFingerprintHex: deviceTwo,
        });
        handled.push(payload);
      },
      onRefused: ({ refusal }) => refusals.push(refusal),
    });

    expect(result).toEqual({ handled: 0, refused: 1, deferred: 0 });
    expect(handled).toEqual([]);
    expect(refusals).toEqual(['wrong_mailbox']);
    // Acknowledged, so one misrouted packet cannot hold the mailbox.
    expect(store.held.get(box(record))).toHaveLength(0);
  });

  it('acknowledges rubbish, because it will never become authenticatable', async () => {
    // Leaving it would let a single piece of rubbish fill a mailbox and deny
    // that relationship until somebody reissues the address.
    const record = mailboxRecord();
    const store = reader({ [box(record)]: [{ tag: 't1', payload: 'not-an-envelope' }] });
    const refusals: string[] = [];

    const result = await collectPicoLinkRelayPackets({
      reader: store,
      mailboxes: [record],
      handle: async () => {
        throw new PicoLinkRelayUnauthenticatedError('sealed_request_unreadable');
      },
      onRefused: ({ refusal }) => refusals.push(refusal),
    });

    expect(result).toEqual({ handled: 0, refused: 1, deferred: 0 });
    expect(refusals).toEqual(['unauthenticated']);
    expect(store.held.get(box(record))).toHaveLength(0);
  });

  it('leaves a packet whose handling failed, because next time may work', async () => {
    // The difference that decides it: rubbish is permanent, a failed handler
    // is not.
    const record = mailboxRecord();
    const store = reader({ [box(record)]: [{ tag: 't1', payload: 'envelope-1' }] });

    const result = await collectPicoLinkRelayPackets({
      reader: store,
      mailboxes: [record],
      handle: async () => {
        throw new Error('store_busy');
      },
    });

    expect(result).toEqual({ handled: 0, refused: 0, deferred: 1 });
    expect(store.held.get(box(record))).toHaveLength(1);
  });

  it('does not let one bad packet hold up the rest', async () => {
    // One at a time, acknowledged individually: acknowledging a batch before
    // handling loses everything after the first failure, and acknowledging it
    // after holds everything hostage to one bad packet.
    const record = mailboxRecord();
    const store = reader({
      [box(record)]: [
        { tag: 't1', payload: 'bad' },
        { tag: 't2', payload: 'good' },
        { tag: 't3', payload: 'defer' },
        { tag: 't4', payload: 'good-again' },
      ],
    });
    const handled: string[] = [];

    const result = await collectPicoLinkRelayPackets({
      reader: store,
      mailboxes: [record],
      handle: async ({ payload, expectedDeviceSigningKeyFingerprintHex }) => {
        if (payload === 'bad') {
          throw new PicoLinkRelayUnauthenticatedError('malformed_request');
        }
        assertPicoLinkRelayPacketSender({
          expectedDeviceSigningKeyFingerprintHex,
          signerDeviceSigningKeyFingerprintHex: deviceOne,
        });
        if (payload === 'defer') {
          throw new Error('store_busy');
        }
        handled.push(payload);
      },
    });

    expect(result).toEqual({ handled: 2, refused: 1, deferred: 1 });
    expect(handled).toEqual(['good', 'good-again']);
    expect(store.held.get(box(record))?.map((packet) => packet.tag)).toEqual(['t3']);
  });

  it('reads every mailbox it was given and no others', async () => {
    const first = mailboxRecord();
    const second = mailboxRecord({
      deviceSigningKeyFingerprintHex: deviceTwo,
      homeInbound: `${'3'.repeat(32)}@${operator}`,
      deviceInbound: `${'4'.repeat(32)}@${operator}`,
    });
    const untouched = `${'9'.repeat(32)}`;
    const store = reader({
      [box(first)]: [{ tag: 't1', payload: 'one' }],
      [box(second)]: [{ tag: 't2', payload: 'two' }],
      [untouched]: [{ tag: 't3', payload: 'not ours' }],
    });

    const result = await collectPicoLinkRelayPackets({
      reader: store,
      mailboxes: [first, second],
      handle: async ({ payload, expectedDeviceSigningKeyFingerprintHex }) => {
        assertPicoLinkRelayPacketSender({
          expectedDeviceSigningKeyFingerprintHex,
          signerDeviceSigningKeyFingerprintHex: payload === 'one' ? deviceOne : deviceTwo,
        });
      },
    });

    expect(result.handled).toBe(2);
    expect(store.held.get(untouched)).toHaveLength(1);
  });

  it('reads nothing when the honoured list is empty', async () => {
    // ADR 0148 EX3: a mailbox whose delegation went inactive is one to stop
    // reading, and this is the place that rule could have been skipped.
    const store = reader({ [box(mailboxRecord())]: [{ tag: 't1', payload: 'one' }] });
    const result = await collectPicoLinkRelayPackets({
      reader: store,
      mailboxes: [],
      handle: async () => {},
    });
    expect(result).toEqual({ handled: 0, refused: 0, deferred: 0 });
    expect(store.calls.collect).toBe(0);
  });
});
