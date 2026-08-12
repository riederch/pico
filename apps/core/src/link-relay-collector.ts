import type { PicoLinkMailboxRecord } from './event-store.js';

/**
 * ADR 0149's collecting side - what a Home does with what is waiting for it.
 *
 * A relayed packet's payload is an ADR 0107 envelope, unchanged. That ADR
 * promised as much in its own words: neither envelope carries authority of its
 * own, the carrier transports and the signatures decide, so the same bytes
 * travel a relay when one exists. Collecting is therefore not a new protocol;
 * it is the same request arriving by a slower road.
 *
 * **What is new is that there are now two independent statements about who
 * sent it, and they can disagree.** The mailbox a packet arrived at *is* the
 * sender's identity seen from the recipient's side (ADR 0147 RY2), because
 * exactly one device was ever told it. The signature chain inside the envelope
 * says the same thing again, and says it with authority.
 *
 * The signature wins - it always wins, that is what ADR 0107 is - but a
 * disagreement is worth refusing rather than resolving. A packet signed by
 * device Y arriving in device X's mailbox means X handed its address to Y, or
 * something misrouted. Neither is a thing to act on, and processing it would
 * quietly accept an address having leaked.
 */
export interface PicoLinkRelayReader {
  /**
   * ADR 0149 RS5. Returns what is waiting and removes nothing. Calling it
   * twice returns the same packets, which is what makes acknowledging the
   * separate act it is.
   */
  collect(input: { mailbox: string }): Promise<readonly { tag: string; payload: string }[]>;
  acknowledge(input: { mailbox: string; tags: readonly string[] }): Promise<void>;
}

export type PicoLinkRelayRefusal =
  /** The payload is not an authenticatable ADR 0107 envelope. */
  | 'unauthenticated'
  /** Authentic, and signed by a device other than the one this mailbox is for. */
  | 'wrong_mailbox';

export interface PicoLinkRelayCollectorOptions {
  reader: PicoLinkRelayReader;
  /**
   * The mailboxes this Home still honours - `honouredPicoLinkMailboxes`, never
   * the whole book. A mailbox whose delegation went inactive is one ADR 0148
   * EX3 says to stop reading, and collecting from it would be the one place
   * that rule could be quietly skipped.
   */
  mailboxes: readonly PicoLinkMailboxRecord[];
  /**
   * Opens the envelope far enough to say which device signed it. Throws when
   * it cannot be authenticated at all.
   */
  senderOf: (payload: string) => Promise<string> | string;
  /** Runs the operation. Its rejection leaves the packet for the next pass. */
  handle: (input: {
    payload: string;
    deviceSigningKeyFingerprintHex: string;
  }) => Promise<void>;
  onRefused?: (input: {
    mailbox: string;
    tag: string;
    refusal: PicoLinkRelayRefusal;
  }) => void;
}

export interface PicoLinkRelayCollection {
  handled: number;
  refused: number;
  /** Left where they were, for a pass that can do something with them. */
  deferred: number;
}

/**
 * ADR 0149 RS5 with ADR 0118 O1. Collects, handles, then acknowledges.
 *
 * **Acknowledgement is last and it is per packet.** Acknowledging a batch
 * before handling it would lose everything after the first failure, and
 * acknowledging the whole batch after would lose nothing but hold everything
 * hostage to one bad packet. One at a time is the shape that costs a duplicate
 * and never a loss - which is the trade ADR 0118 O1 already made.
 *
 * **A refusal is acknowledged; a failure is not.** The two are different in
 * one way that decides it: a packet that cannot be authenticated will never
 * become authenticatable, so leaving it would let a single piece of rubbish
 * fill a mailbox and deny that relationship until somebody reissues the
 * address. A handler that failed may succeed next time, so its packet stays.
 */
export async function collectPicoLinkRelayPackets(
  options: PicoLinkRelayCollectorOptions,
): Promise<PicoLinkRelayCollection> {
  let handled = 0;
  let refused = 0;
  let deferred = 0;

  for (const mailbox of options.mailboxes) {
    const address = mailbox.homeInbound.split('@')[0]!;
    const waiting = await options.reader.collect({ mailbox: address });

    for (const packet of waiting) {
      let sender: string;
      try {
        sender = await options.senderOf(packet.payload);
      } catch {
        refused += 1;
        options.onRefused?.({ mailbox: address, tag: packet.tag, refusal: 'unauthenticated' });
        await options.reader.acknowledge({ mailbox: address, tags: [packet.tag] });
        continue;
      }

      if (sender !== mailbox.deviceSigningKeyFingerprintHex) {
        // Authentic, and in the wrong place. Refused rather than processed on
        // its signature alone: the signature would let this through, and doing
        // so would quietly accept that an address has leaked between two
        // devices. The sender still has its own mailbox and will be answered
        // there.
        refused += 1;
        options.onRefused?.({ mailbox: address, tag: packet.tag, refusal: 'wrong_mailbox' });
        await options.reader.acknowledge({ mailbox: address, tags: [packet.tag] });
        continue;
      }

      try {
        await options.handle({
          payload: packet.payload,
          deviceSigningKeyFingerprintHex: sender,
        });
      } catch {
        // Left where it is. The next pass tries again, and being handled twice
        // is a cost the ADR 0147 RY6 packet tag already lets a recipient
        // absorb.
        deferred += 1;
        continue;
      }
      handled += 1;
      await options.reader.acknowledge({ mailbox: address, tags: [packet.tag] });
    }
  }

  return Object.freeze({ handled, refused, deferred });
}
