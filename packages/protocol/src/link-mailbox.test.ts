import { describe, expect, it } from 'vitest';
import {
  buildPicoLinkMailboxBook,
  issuePicoLinkInboundMailbox,
  parsePicoLinkRelationshipMailbox,
  picoLinkInboundAddressFor,
  picoLinkInboundMailboxesAt,
  picoLinkInboundOperators,
  picoLinkOutboundAddressFor,
  recordPicoLinkOutboundMailbox,
  revokePicoLinkRelationshipMailbox,
} from './link-mailbox.js';

/**
 * ADR 0147 RY2/RY3. A Pico holds a book of addresses, never an address.
 *
 * The two sharing refusals are the security of the whole design and are
 * tested hardest: a shared inbound mailbox turns the envelope's missing
 * sender field from a removed fact into an unknown one, and a shared outbound
 * mailbox is a redirection attack somebody hands us on purpose.
 */
const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);
const carol = 'c'.repeat(64);

const at = (mailbox: string, operator = 'relay.example.invalid') => `${mailbox}@${operator}`;
const m1 = at('1'.repeat(32));
const m2 = at('2'.repeat(32));
const m3 = at('3'.repeat(32));
const m4 = at('4'.repeat(32));

describe('ADR 0147 RY2 - a mailbox belongs to a relationship', () => {
  it('has no way to ask for the address of a Pico', () => {
    // Every lookup takes a peer, because a delivery address without a peer is
    // a question about a thing this design does not have.
    const book = buildPicoLinkMailboxBook([
      { peerFingerprintHex: alice, inbound: m1 },
    ]);
    expect(picoLinkInboundAddressFor(book, alice)).toBe(m1);
    expect(() => picoLinkInboundAddressFor(book, bob)).toThrow('pico_link_peer_not_in_book');
  });

  it('holds the two directions apart, issued by opposite sides', () => {
    const book = buildPicoLinkMailboxBook([
      { peerFingerprintHex: alice, inbound: m1, outbound: m2 },
    ]);
    expect(picoLinkInboundAddressFor(book, alice)).toBe(m1);
    expect(picoLinkOutboundAddressFor(book, alice)).toBe(m2);
  });

  it('says undefined rather than throwing before a peer has issued one', () => {
    // A relationship that exists before the address exchange finished is an
    // ordinary state, and a throw would make it look like a fault.
    const book = buildPicoLinkMailboxBook([{ peerFingerprintHex: alice, inbound: m1 }]);
    expect(picoLinkOutboundAddressFor(book, alice)).toBeUndefined();
  });

  describe('the two refusals that make a mailbox mean something', () => {
    it('refuses two peers behind one inbound mailbox', () => {
      // If they shared it, the mailbox would stop identifying the sender and
      // the envelope's absent sender field would become a missing fact rather
      // than a removed one.
      expect(() => buildPicoLinkMailboxBook([
        { peerFingerprintHex: alice, inbound: m1 },
        { peerFingerprintHex: bob, inbound: m1 },
      ])).toThrow('pico_link_inbound_shared_between_peers');
    });

    it('refuses two peers behind one outbound mailbox', () => {
      // Not an accident - an attack. A peer that hands us the address another
      // peer gave us would silently redirect everything we write to the first
      // into the second's mailbox. We cannot stop a peer naming any address,
      // but we can refuse to hold two peers behind one.
      const book = buildPicoLinkMailboxBook([
        { peerFingerprintHex: alice, inbound: m1, outbound: m3 },
        { peerFingerprintHex: bob, inbound: m2 },
      ]);
      expect(() => recordPicoLinkOutboundMailbox(book, {
        peerFingerprintHex: bob,
        outbound: m3,
      })).toThrow('pico_link_outbound_shared_between_peers');
    });
  });

  it('refuses an entry that points at itself', () => {
    // We would write to the mailbox we told this peer to write to, so our own
    // traffic would come back as theirs.
    expect(() => parsePicoLinkRelationshipMailbox({
      peerFingerprintHex: alice,
      inbound: m1,
      outbound: m1,
    })).toThrow('pico_link_mailbox_points_at_itself');
  });

  it('refuses the same peer twice', () => {
    expect(() => buildPicoLinkMailboxBook([
      { peerFingerprintHex: alice, inbound: m1 },
      { peerFingerprintHex: alice, inbound: m2 },
    ])).toThrow('pico_link_peer_listed_twice');
  });

  it('refuses a peer that is not an identity fingerprint', () => {
    for (const bad of ['alice', 'a'.repeat(63), 'A'.repeat(64), '', 42, null]) {
      expect(() => parsePicoLinkRelationshipMailbox({ peerFingerprintHex: bad, inbound: m1 }))
        .toThrow('invalid_pico_link_peer');
    }
  });

  it('refuses an unknown key, naming it', () => {
    expect(() => parsePicoLinkRelationshipMailbox({
      peerFingerprintHex: alice,
      inbound: m1,
      operator: 'relay.example.invalid',
    })).toThrow('pico_link_relationship_mailbox_carries_no:operator');
  });

  it('refuses an address that is not one, through the address parser', () => {
    // Two different failures on purpose: no operator at all is a malformed
    // address, and a guessable mailbox is a malformed mailbox.
    expect(() => parsePicoLinkRelationshipMailbox({ peerFingerprintHex: alice, inbound: 'alice' }))
      .toThrow('invalid_pico_link_address');
    expect(() => parsePicoLinkRelationshipMailbox({
      peerFingerprintHex: alice,
      inbound: at('alice'),
    })).toThrow('invalid_pico_link_mailbox');
  });
});

describe('ADR 0147 RY4 shape - rotation is issued, never scheduled', () => {
  it('replaces an inbound mailbox and keeps the peer and their address', () => {
    const book = recordPicoLinkOutboundMailbox(
      buildPicoLinkMailboxBook([{ peerFingerprintHex: alice, inbound: m1 }]),
      { peerFingerprintHex: alice, outbound: m3 },
    );
    const rotated = issuePicoLinkInboundMailbox(book, {
      peerFingerprintHex: alice,
      inbound: m2,
    });
    expect(picoLinkInboundAddressFor(rotated, alice)).toBe(m2);
    expect(picoLinkOutboundAddressFor(rotated, alice)).toBe(m3);
    expect(rotated).toHaveLength(1);
  });

  it('issues to a peer that had no entry', () => {
    const book = issuePicoLinkInboundMailbox(buildPicoLinkMailboxBook([]), {
      peerFingerprintHex: alice,
      inbound: m1,
    });
    expect(picoLinkInboundAddressFor(book, alice)).toBe(m1);
  });

  it('will not issue a mailbox another peer already holds', () => {
    const book = buildPicoLinkMailboxBook([{ peerFingerprintHex: alice, inbound: m1 }]);
    expect(() => issuePicoLinkInboundMailbox(book, { peerFingerprintHex: bob, inbound: m1 }))
      .toThrow('pico_link_inbound_shared_between_peers');
  });

  it('removes the whole entry on revocation, not half of it', () => {
    // An entry with the inbound gone and the outbound left is a relationship
    // this Pico can still write to and can no longer be answered on, which
    // reads as working and is not.
    const book = buildPicoLinkMailboxBook([
      { peerFingerprintHex: alice, inbound: m1, outbound: m3 },
      { peerFingerprintHex: bob, inbound: m2 },
    ]);
    const after = revokePicoLinkRelationshipMailbox(book, alice);
    expect(after).toHaveLength(1);
    expect(() => picoLinkOutboundAddressFor(after, alice)).toThrow('pico_link_peer_not_in_book');
    expect(picoLinkInboundAddressFor(after, bob)).toBe(m2);
  });

  it('frees the mailbox it revoked for reissue', () => {
    const book = buildPicoLinkMailboxBook([{ peerFingerprintHex: alice, inbound: m1 }]);
    const reissued = issuePicoLinkInboundMailbox(
      revokePicoLinkRelationshipMailbox(book, alice),
      { peerFingerprintHex: bob, inbound: m1 },
    );
    expect(picoLinkInboundAddressFor(reissued, bob)).toBe(m1);
  });
});

describe('ADR 0147 RY3 - the operator is read out of the address', () => {
  const first = 'first.relay.invalid';
  const second = 'second.relay.invalid';
  const book = buildPicoLinkMailboxBook([
    { peerFingerprintHex: alice, inbound: at('1'.repeat(32), first) },
    { peerFingerprintHex: bob, inbound: at('2'.repeat(32), second) },
    { peerFingerprintHex: carol, inbound: at('3'.repeat(32), first) },
  ]);

  it('lets one book name several operators, which is the whole point', () => {
    // Nothing in the protocol changes between one operator and five: a person
    // issues Bob a mailbox at one and Carol a mailbox at another, and neither
    // operator sees the whole (ADR 0031: no central provider, by construction).
    expect(picoLinkInboundOperators(book)).toEqual([first, second]);
  });

  it('has no operator field to disagree with an address', () => {
    // An operator held beside an address could contradict it, and the
    // contradiction would send a packet to a relay that never heard of the
    // mailbox.
    expect(() => parsePicoLinkRelationshipMailbox({
      peerFingerprintHex: alice,
      inbound: m4,
      operator: second,
    })).toThrow('pico_link_relationship_mailbox_carries_no:operator');
  });

  it('says how much one operator can group, so the residual is measurable', () => {
    // RY7's named weakness: emptying all mailboxes over one connection lets
    // that operator group them as one device. A mitigation nobody can measure
    // is not one.
    expect(picoLinkInboundMailboxesAt(book, first).map((address) => address.mailbox))
      .toEqual(['1'.repeat(32), '3'.repeat(32)]);
    expect(picoLinkInboundMailboxesAt(book, second)).toHaveLength(1);
    expect(picoLinkInboundMailboxesAt(book, 'third.relay.invalid')).toHaveLength(0);
  });
});
