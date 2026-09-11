import { hexOfBytesPattern } from './canonical-bytes.js';
import {
  parsePicoLinkPacketAddress,
  type PicoLinkPacketAddress,
} from './link-packet.js';

/**
 * ADR 0147 RY2/RY3 - what a Pico holds instead of an address.
 *
 * **A Pico does not have an address.** It holds a book of them, one per party
 * it has a credential with, and that is the whole reason ADR 0147's envelope
 * needs no sender field: the mailbox a packet arrived at *is* the sender's
 * identity, seen from the recipient's side, because exactly one peer was ever
 * told it.
 *
 * So there is no `picoLinkAddressOf(pico)` here and there cannot be one. Every
 * lookup below takes a peer, because a delivery address without a peer is a
 * question about a thing this design does not have.
 *
 * A relationship has **two** addresses and they are issued by opposite sides.
 * `inbound` is the one we issued to this peer, so they can reach us; it is
 * ours to revoke. `outbound` is the one they issued to us, so we can reach
 * them; it is theirs, and absent until they hand it over - a real state rather
 * than an error, since a relationship can exist before the exchange finishes.
 *
 * **What this does not build is the handover.** Which ceremony issues an
 * address and how it travels belongs with the credential work in ADR 0031 and
 * ADR 0045. This builds the shape a handover has to produce, and the
 * invariants that make the shape worth anything.
 */

/** An identity key fingerprint: BLAKE2b-256, the tree's 32-byte form. */
export const picoLinkPeerFingerprintPattern = hexOfBytesPattern(32);

export interface PicoLinkRelationshipMailbox {
  /** Who this relationship is with. Never a name, never an account. */
  peerFingerprintHex: string;
  /** Issued by us to this peer. They send here; we may revoke it. */
  inbound: string;
  /** Issued by this peer to us. We send here. Absent until they issue one. */
  outbound?: string;
}

export type PicoLinkMailboxBook = readonly PicoLinkRelationshipMailbox[];

/**
 * Befund B145. Das Muster war geteilt, die Wache darueber stand zweimal - hier
 * und im Austausch daneben. Exportiert, damit auch der Umgang mit der Regel
 * einmal steht und nicht nur die Regel.
 */
export function assertPicoLinkPeerFingerprint(value: unknown): string {
  if (typeof value !== 'string' || !picoLinkPeerFingerprintPattern.test(value)) {
    throw new Error('invalid_pico_link_peer');
  }
  return value;
}

export function parsePicoLinkRelationshipMailbox(
  value: unknown,
): PicoLinkRelationshipMailbox {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_link_relationship_mailbox');
  }
  const record = value as Record<string, unknown>;
  const known = ['peerFingerprintHex', 'inbound', 'outbound'];
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    // Named, and `operator` is the one worth naming: an operator configured
    // beside an address rather than read out of it is how several operators
    // stop being a deployment fact and become a setting somebody forgets to
    // change (ADR 0147 RY3). The address already says where it lives.
    throw new Error(`pico_link_relationship_mailbox_carries_no:${unexpected}`);
  }

  const peerFingerprintHex = assertPicoLinkPeerFingerprint(record.peerFingerprintHex);
  if (typeof record.inbound !== 'string') {
    throw new Error('invalid_pico_link_address');
  }
  parsePicoLinkPacketAddress(record.inbound);
  if (record.outbound !== undefined) {
    if (typeof record.outbound !== 'string') {
      throw new Error('invalid_pico_link_address');
    }
    parsePicoLinkPacketAddress(record.outbound);
    if (record.outbound === record.inbound) {
      // We would be writing to the mailbox we told this peer to write to, so
      // our own traffic would come back as theirs. Refused rather than
      // tolerated: a loop that looks like a conversation is worse than one
      // that fails.
      throw new Error('pico_link_mailbox_points_at_itself');
    }
  }

  return Object.freeze({
    peerFingerprintHex,
    inbound: record.inbound,
    ...(record.outbound === undefined ? {} : { outbound: record.outbound }),
  });
}

/**
 * ADR 0147 RY2. The book, with the invariants that make a mailbox mean
 * something.
 *
 * Two of the three refusals below are the security of this whole design:
 *
 * - **No two peers share an inbound mailbox.** If they did, the mailbox would
 *   stop identifying the sender, and the missing sender field on the envelope
 *   would become a missing fact rather than a removed one.
 * - **No two peers share an outbound mailbox.** This one is an attack, not an
 *   accident: a peer that hands us the address another peer gave us would
 *   silently redirect everything we write to the first into the second's
 *   mailbox. We cannot stop a peer from naming any address it likes, but we
 *   can refuse to hold two peers behind one, and the moment to notice is when
 *   it is written down rather than after the first message.
 */
export function buildPicoLinkMailboxBook(entries: readonly unknown[]): PicoLinkMailboxBook {
  const parsed = entries.map(parsePicoLinkRelationshipMailbox);

  const peers = new Set<string>();
  const inbound = new Set<string>();
  const outbound = new Set<string>();

  for (const entry of parsed) {
    if (peers.has(entry.peerFingerprintHex)) {
      throw new Error('pico_link_peer_listed_twice');
    }
    peers.add(entry.peerFingerprintHex);

    if (inbound.has(entry.inbound)) {
      throw new Error('pico_link_inbound_shared_between_peers');
    }
    inbound.add(entry.inbound);

    if (entry.outbound !== undefined) {
      if (outbound.has(entry.outbound)) {
        throw new Error('pico_link_outbound_shared_between_peers');
      }
      outbound.add(entry.outbound);
    }
  }

  return Object.freeze(parsed);
}

function entryFor(
  book: PicoLinkMailboxBook,
  peerFingerprintHex: string,
): PicoLinkRelationshipMailbox {
  const peer = assertPicoLinkPeerFingerprint(peerFingerprintHex);
  const entry = book.find((candidate) => candidate.peerFingerprintHex === peer);
  if (entry === undefined) {
    throw new Error('pico_link_peer_not_in_book');
  }
  return entry;
}

/** ADR 0147 RY2. Where this peer sends to reach us. Takes a peer, always. */
export function picoLinkInboundAddressFor(
  book: PicoLinkMailboxBook,
  peerFingerprintHex: string,
): string {
  return entryFor(book, peerFingerprintHex).inbound;
}

/**
 * ADR 0147 RY2. Where we send to reach this peer, or `undefined` while they
 * have not issued one.
 *
 * Undefined rather than a throw: a relationship that exists before the address
 * exchange finished is an ordinary state, and a caller has something sensible
 * to do about it - wait, or ask. A throw would make an expected state look
 * like a fault.
 */
export function picoLinkOutboundAddressFor(
  book: PicoLinkMailboxBook,
  peerFingerprintHex: string,
): string | undefined {
  return entryFor(book, peerFingerprintHex).outbound;
}

/**
 * ADR 0147 RY2/RY4. Issues this peer a new inbound mailbox, replacing any it
 * had.
 *
 * Replacement is how rotation happens: a burned or flooded mailbox is revoked
 * by issuing another, which is a decision somebody makes rather than a timer
 * firing (ADR 0143's posture, applied to an address). Nothing here schedules
 * it, and nothing takes an interval.
 */
export function issuePicoLinkInboundMailbox(
  book: PicoLinkMailboxBook,
  input: { peerFingerprintHex: string; inbound: string },
): PicoLinkMailboxBook {
  const peer = assertPicoLinkPeerFingerprint(input.peerFingerprintHex);
  const existing = book.find((candidate) => candidate.peerFingerprintHex === peer);
  const next = {
    peerFingerprintHex: peer,
    inbound: input.inbound,
    ...(existing?.outbound === undefined ? {} : { outbound: existing.outbound }),
  };
  return buildPicoLinkMailboxBook([
    ...book.filter((candidate) => candidate.peerFingerprintHex !== peer),
    next,
  ]);
}

/** ADR 0147 RY2. Records the address this peer issued to us. */
export function recordPicoLinkOutboundMailbox(
  book: PicoLinkMailboxBook,
  input: { peerFingerprintHex: string; outbound: string },
): PicoLinkMailboxBook {
  const entry = entryFor(book, input.peerFingerprintHex);
  return buildPicoLinkMailboxBook([
    ...book.filter((candidate) => candidate.peerFingerprintHex !== entry.peerFingerprintHex),
    { ...entry, outbound: input.outbound },
  ]);
}

/**
 * ADR 0147 RY2. Ends a relationship's addressing.
 *
 * Removes the whole entry rather than clearing a field. A relationship whose
 * inbound mailbox is gone but whose outbound remains would be one this Pico
 * can still write to and can no longer be answered on, which reads as working
 * and is not.
 */
export function revokePicoLinkRelationshipMailbox(
  book: PicoLinkMailboxBook,
  peerFingerprintHex: string,
): PicoLinkMailboxBook {
  const entry = entryFor(book, peerFingerprintHex);
  return Object.freeze(
    book.filter((candidate) => candidate.peerFingerprintHex !== entry.peerFingerprintHex),
  );
}

/**
 * ADR 0147 RY3. The operators this book actually uses, read out of the
 * addresses rather than from anywhere else.
 *
 * There is no configured operator in this module, and that absence is the
 * gate: an operator held beside an address could disagree with it, and the
 * disagreement would send a packet to a relay that has never heard of the
 * mailbox. Several operators are therefore a fact about what a person was
 * given, not a feature somebody enables.
 */
export function picoLinkInboundOperators(book: PicoLinkMailboxBook): readonly string[] {
  const operators = new Set(
    book.map((entry) => parsePicoLinkPacketAddress(entry.inbound).operator),
  );
  return Object.freeze([...operators].sort());
}

/**
 * ADR 0147 RY3 with RY7's named residual. Which mailboxes one operator holds
 * for us - which is exactly what that operator can group into one device when
 * we collect from it.
 *
 * Exposed because a mitigation that cannot be measured is not one: staggering
 * collection or spreading peers across operators is a decision somebody makes
 * against this number.
 */
export function picoLinkInboundMailboxesAt(
  book: PicoLinkMailboxBook,
  operator: string,
): readonly PicoLinkPacketAddress[] {
  return Object.freeze(
    book
      .map((entry) => parsePicoLinkPacketAddress(entry.inbound))
      .filter((address) => address.operator === operator),
  );
}
