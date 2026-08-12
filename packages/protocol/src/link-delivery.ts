import {
  parsePicoLinkPacketAddress,
  type PicoLinkPacket,
} from './link-packet.js';

/**
 * ADR 0147 RY4/RY5/RY6 - what a relay answers, and what it has no way to say.
 *
 * All three gates meet here, because they are one vocabulary. RY5 fixes that
 * the only success is **acceptance**; RY4 that a revoked mailbox is refused by
 * name rather than reported as unknown; RY6 that a full mailbox refuses rather
 * than evicting. Each is a member of one closed list, and the list is the
 * decision.
 *
 * **There is no `delivered`, and that absence is RY5.** ADR 0118 O1 already
 * decided this shape for the Home: an earlier scheduler marked an entry raised
 * and called a surface, so a surface that could not take it left the entry
 * marked and nobody told. A relay is in exactly that position - it cannot
 * observe that a person received anything - and a delivery receipt would be
 * both a claim it does not have and a timing correlator telling the sender
 * when the recipient was awake. End-to-end acknowledgement is an ordinary
 * sealed message and the recipient's to send.
 */
export const picoLinkDeliveryOutcomes = [
  /** RY5. The relay has the packet. The only success, and it says nothing about a person. */
  'accepted',
  /** No mailbox by that name, and none ever revoked under it. */
  'mailbox_unknown',
  /** RY4. There was one and the recipient ended it. */
  'mailbox_revoked',
  /** RY6. Full of live packets; the relay refuses rather than dropping one. */
  'mailbox_full',
  /** The sender's own expiry has passed, so there is nothing left to hold. */
  'packet_expired',
] as const;

export type PicoLinkDeliveryOutcome = typeof picoLinkDeliveryOutcomes[number];

/**
 * ADR 0147 RY5. The answers this vocabulary deliberately cannot express, kept
 * as data because an absent member cannot document itself.
 */
export const picoLinkDeliveryHasNoOutcomeFor = Object.freeze({
  delivered: 'a relay cannot observe that a person received anything, and saying so would be a claim it does not have plus a timing correlator (ADR 0118 O1)',
  read: 'further from the carrier than delivery is, and the same objection twice over',
  senderThrottled: 'there is no sender on the envelope to throttle (ADR 0147 RY1)',
} as const);

export interface PicoLinkQueuedPacket {
  tag: string;
  expiresAt: string;
}

export type PicoLinkMailboxStatus = 'open' | 'revoked';

/**
 * ADR 0147 RY4. What a relay holds about one mailbox.
 *
 * A revoked mailbox stays in the register, and that is the point: forgetting
 * it would make a deliberate revocation indistinguishable from a typo, and a
 * peer holding a dead address would keep retrying an answer that reads like
 * its own mistake. Same posture as ADR 0070's tombstones - the record of an
 * ending is worth more than the space it costs.
 *
 * The cost is named rather than solved here: tombstones accumulate, and how
 * long an operator keeps one is retention policy, which belongs with the relay
 * server this ADR does not build.
 */
export interface PicoLinkMailboxRegistration {
  address: string;
  status: PicoLinkMailboxStatus;
  /** How many live packets this mailbox holds before it refuses. */
  capacity: number;
}

export interface PicoLinkDelivery {
  outcome: PicoLinkDeliveryOutcome;
  /** The queue after this attempt. Unchanged for everything but a new packet. */
  queue: readonly PicoLinkQueuedPacket[];
}

function isLive(packet: PicoLinkQueuedPacket, nowMs: number): boolean {
  return Date.parse(packet.expiresAt) > nowMs;
}

/**
 * ADR 0147 RY6. Drops what the sender's own expiry already ended.
 *
 * **This is not eviction, and the difference is the whole gate.** An expired
 * packet is one the sender instructed the relay to stop holding; a full
 * mailbox refusing is the relay declining to take more. What a relay must
 * never do is choose which live packet to lose, because the sender that
 * receives `accepted` and the recipient that never sees the packet would both
 * be right, and nobody would be told (ADR 0119 Q5: a ceiling refuses and never
 * trims).
 */
export function prunePicoLinkQueue(
  queue: readonly PicoLinkQueuedPacket[],
  nowMs: number,
): readonly PicoLinkQueuedPacket[] {
  return Object.freeze(queue.filter((packet) => isLive(packet, nowMs)));
}

/**
 * ADR 0147 RY4/RY5/RY6. The whole decision a relay makes about one packet.
 *
 * A pure function over the register entry, the queue and a clock, so the
 * decision can be tested without a relay and cannot drift when one exists.
 *
 * **The order says the thing that explains the others**, the rule
 * `picoDepotState` already follows. A mailbox that is unknown or revoked
 * answers before anything about the packet, because a sender whose address is
 * dead needs a new address and not a note about expiry. A duplicate answers
 * before fullness, since a retry of something already held costs the mailbox
 * nothing and refusing it would make retrying dangerous.
 */
export function resolvePicoLinkDelivery(input: {
  registration: PicoLinkMailboxRegistration | undefined;
  queue: readonly PicoLinkQueuedPacket[];
  packet: PicoLinkPacket;
  nowMs: number;
}): PicoLinkDelivery {
  const { registration, packet, nowMs } = input;

  if (registration === undefined) {
    return Object.freeze({ outcome: 'mailbox_unknown' as const, queue: Object.freeze([...input.queue]) });
  }
  if (registration.status === 'revoked') {
    return Object.freeze({ outcome: 'mailbox_revoked' as const, queue: Object.freeze([...input.queue]) });
  }
  if (parsePicoLinkPacketAddress(registration.address).mailbox
    !== parsePicoLinkPacketAddress(packet.to).mailbox) {
    // A register entry looked up for one mailbox and answering for another is
    // a caller bug, not a delivery outcome. Refused rather than given a member
    // of the closed list, because it is not something a sender can act on.
    throw new Error('pico_link_registration_mismatch');
  }

  const live = prunePicoLinkQueue(input.queue, nowMs);

  if (Date.parse(packet.expiresAt) <= nowMs) {
    return Object.freeze({ outcome: 'packet_expired' as const, queue: live });
  }
  if (live.some((queued) => queued.tag === packet.tag)) {
    // Idempotent by design. ADR 0147 RY6 makes the tag fresh per packet and
    // reused only to retry that same one, so a repeated tag is a retry - and a
    // sender that could not safely retry would have to choose between losing
    // packets and duplicating them.
    return Object.freeze({ outcome: 'accepted' as const, queue: live });
  }
  if (live.length >= registration.capacity) {
    return Object.freeze({ outcome: 'mailbox_full' as const, queue: live });
  }

  return Object.freeze({
    outcome: 'accepted' as const,
    queue: Object.freeze([...live, Object.freeze({ tag: packet.tag, expiresAt: packet.expiresAt })]),
  });
}

/**
 * ADR 0147 RY4. Whether a sender should stop using this address.
 *
 * `mailbox_revoked` is the one outcome that will not improve by waiting: the
 * remedy is a new address through the credential channel, not a retry. The
 * others are conditions in ADR 0138 CO2's sense - a network, a queue that
 * drains, an expiry the sender itself chose.
 */
export function picoLinkDeliveryNeedsNewAddress(outcome: PicoLinkDeliveryOutcome): boolean {
  return outcome === 'mailbox_revoked';
}
