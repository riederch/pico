import { describe, expect, it } from 'vitest';
import {
  picoLinkDeliveryHasNoOutcomeFor,
  picoLinkDeliveryNeedsNewAddress,
  picoLinkDeliveryOutcomes,
  prunePicoLinkQueue,
  resolvePicoLinkDelivery,
  type PicoLinkMailboxRegistration,
  type PicoLinkQueuedPacket,
} from './link-delivery.js';
import { parsePicoLinkPacket, picoLinkPacketSchema } from './link-packet.js';

/**
 * ADR 0147 RY4/RY5/RY6. What a relay answers, and the two answers it has no
 * way to give: that something was delivered, and that a live packet was
 * dropped to make room.
 */
const mailbox = 'a'.repeat(32);
const to = `${mailbox}@relay.example.invalid`;
const nowMs = Date.parse('2026-08-12T11:00:00.000Z');
const expiresAt = '2026-08-12T12:00:00.000Z';

function packet(over: Record<string, unknown> = {}) {
  return parsePicoLinkPacket({
    schema: picoLinkPacketSchema,
    to,
    tag: 'b'.repeat(32),
    expiresAt,
    payload: 'AAAA',
    ...over,
  });
}

const open: PicoLinkMailboxRegistration = { address: to, status: 'open', capacity: 2 };
const queued = (tag: string, at = expiresAt): PicoLinkQueuedPacket => ({ tag, expiresAt: at });

describe('ADR 0147 RY5 - acceptance is the only success', () => {
  it('holds five outcomes and none of them is delivery', () => {
    expect([...picoLinkDeliveryOutcomes]).toEqual([
      'accepted', 'mailbox_unknown', 'mailbox_revoked', 'mailbox_full', 'packet_expired',
    ]);
    expect(picoLinkDeliveryOutcomes).not.toContain('delivered');
  });

  it('keeps the reasons the missing answers are missing', () => {
    // ADR 0118 O1 decided this for the Home already: a component does not
    // claim an outcome it cannot observe. A relay is in exactly that position.
    expect(Object.keys(picoLinkDeliveryHasNoOutcomeFor).sort())
      .toEqual(['delivered', 'read', 'senderThrottled']);
  });

  it('answers accepted and says nothing about a person', () => {
    const delivery = resolvePicoLinkDelivery({
      registration: open, queue: [], packet: packet(), nowMs,
    });
    expect(delivery.outcome).toBe('accepted');
    expect(delivery.queue).toEqual([{ tag: 'b'.repeat(32), expiresAt }]);
  });
});

describe('ADR 0147 RY4 - a revoked mailbox is refused by name', () => {
  it('separates revoked from unknown', () => {
    // Forgetting a revocation would make a deliberate ending look like a typo,
    // and a peer holding a dead address would keep retrying an answer that
    // reads like its own mistake.
    expect(resolvePicoLinkDelivery({
      registration: undefined, queue: [], packet: packet(), nowMs,
    }).outcome).toBe('mailbox_unknown');

    expect(resolvePicoLinkDelivery({
      registration: { ...open, status: 'revoked' }, queue: [], packet: packet(), nowMs,
    }).outcome).toBe('mailbox_revoked');
  });

  it('names the one outcome that will not improve by waiting', () => {
    expect(picoLinkDeliveryNeedsNewAddress('mailbox_revoked')).toBe(true);
    for (const outcome of ['accepted', 'mailbox_unknown', 'mailbox_full', 'packet_expired'] as const) {
      expect(picoLinkDeliveryNeedsNewAddress(outcome)).toBe(false);
    }
  });

  it('answers about the mailbox before anything about the packet', () => {
    // A sender whose address is dead needs a new address, not a note about
    // expiry - the rule `picoDepotState` follows: say the thing that explains
    // the others.
    const expired = packet({ expiresAt: '2026-08-12T10:00:00.000Z' });
    expect(resolvePicoLinkDelivery({
      registration: { ...open, status: 'revoked' }, queue: [], packet: expired, nowMs,
    }).outcome).toBe('mailbox_revoked');
  });

  it('takes no rotation interval anywhere', () => {
    // RY4 is an absence: there is no expiry, no rotation interval and no
    // "valid until" on a registration. Revocation is an act.
    expect(Object.keys(open).sort()).toEqual(['address', 'capacity', 'status']);
  });
});

describe('ADR 0147 RY6 - a full mailbox refuses rather than evicting', () => {
  it('refuses once the live packets fill it, and loses none of them', () => {
    const queue = [queued('1'.repeat(32)), queued('2'.repeat(32))];
    const delivery = resolvePicoLinkDelivery({
      registration: open, queue, packet: packet({ tag: '3'.repeat(32) }), nowMs,
    });
    expect(delivery.outcome).toBe('mailbox_full');
    // The whole gate: a relay that chose which live packet to lose would leave
    // the sender told `accepted` and the recipient never shown it, with both
    // right and nobody told.
    expect(delivery.queue.map((p) => p.tag)).toEqual(['1'.repeat(32), '2'.repeat(32)]);
  });

  it('drops what the sender itself ended, which is not eviction', () => {
    // An expired packet is one the sender instructed the relay to stop
    // holding. Making room by that is following an instruction; making room by
    // dropping a live packet would be a decision.
    const queue = [queued('1'.repeat(32), '2026-08-12T10:00:00.000Z'), queued('2'.repeat(32))];
    const delivery = resolvePicoLinkDelivery({
      registration: open, queue, packet: packet({ tag: '3'.repeat(32) }), nowMs,
    });
    expect(delivery.outcome).toBe('accepted');
    expect(delivery.queue.map((p) => p.tag)).toEqual(['2'.repeat(32), '3'.repeat(32)]);
  });

  it('prunes only what the clock says is over', () => {
    const queue = [queued('1'.repeat(32), '2026-08-12T10:00:00.000Z'), queued('2'.repeat(32))];
    expect(prunePicoLinkQueue(queue, nowMs).map((p) => p.tag)).toEqual(['2'.repeat(32)]);
    expect(prunePicoLinkQueue(queue, Date.parse('2026-08-12T09:00:00.000Z'))).toHaveLength(2);
  });

  it('accepts a retry of a packet it already holds, without duplicating it', () => {
    // The tag is fresh per packet and reused only to retry that one, so a
    // repeated tag is a retry. A sender that could not safely retry would have
    // to choose between losing packets and duplicating them.
    const queue = [queued('b'.repeat(32))];
    const delivery = resolvePicoLinkDelivery({
      registration: open, queue, packet: packet(), nowMs,
    });
    expect(delivery.outcome).toBe('accepted');
    expect(delivery.queue).toHaveLength(1);
  });

  it('accepts a retry even when the mailbox is full', () => {
    // Answered before fullness on purpose: a retry of something already held
    // costs the mailbox nothing, and refusing it would make retrying
    // dangerous.
    const queue = [queued('b'.repeat(32)), queued('2'.repeat(32))];
    const delivery = resolvePicoLinkDelivery({
      registration: open, queue, packet: packet(), nowMs,
    });
    expect(delivery.outcome).toBe('accepted');
    expect(delivery.queue).toHaveLength(2);
  });

  it('refuses a packet whose own expiry has passed', () => {
    expect(resolvePicoLinkDelivery({
      registration: open,
      queue: [],
      packet: packet({ expiresAt: '2026-08-12T10:00:00.000Z' }),
      nowMs,
    }).outcome).toBe('packet_expired');
  });

  it('refuses a registration looked up for a different mailbox', () => {
    // A caller bug, not a delivery outcome: it is not something a sender can
    // act on, so it is not given a member of the closed list.
    expect(() => resolvePicoLinkDelivery({
      registration: { ...open, address: `${'c'.repeat(32)}@relay.example.invalid` },
      queue: [],
      packet: packet(),
      nowMs,
    })).toThrow('pico_link_registration_mismatch');
  });
});
