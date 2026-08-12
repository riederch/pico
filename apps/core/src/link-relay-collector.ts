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
 *
 * **The split between this file and its caller was decided by trying the other
 * one.** An earlier shape asked the caller for `senderOf` and `handle`
 * separately, so the disagreement check could sit between them. It cannot: the
 * machinery that opens an ADR 0107 envelope authenticates and executes in one
 * call and yields the principal only inside its own callback. So the caller
 * owns *how* a packet is authenticated, and this file keeps the two things
 * that are actually its own - the rule (`assertPicoLinkRelayPacketSender`) and
 * what each outcome means for acknowledgement.
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

/**
 * The disagreement, as a thing that is thrown rather than a boolean somebody
 * remembers to read.
 *
 * It lives here and not with the caller on purpose. A caller that decided for
 * itself what a mismatch means would be a second place the rule is written,
 * and the second place is the one that drifts.
 */
export class PicoLinkRelayWrongMailboxError extends Error {
  public constructor() {
    super('pico_link_relay_wrong_mailbox');
    this.name = 'PicoLinkRelayWrongMailboxError';
  }
}

/** The envelope could not be opened or its signatures did not hold. */
export class PicoLinkRelayUnauthenticatedError extends Error {
  public constructor(reason: string) {
    super(`pico_link_relay_unauthenticated:${reason}`);
    this.name = 'PicoLinkRelayUnauthenticatedError';
  }
}

/**
 * ADR 0149. The rule, in one named place.
 *
 * Called with the principal an ADR 0107 envelope authenticated and the device
 * the mailbox belongs to. The signature has already won by the time this runs
 * - what it decides is whether a packet that is authentic but in the wrong
 * place gets acted on, and the answer is no.
 */
export function assertPicoLinkRelayPacketSender(input: {
  expectedDeviceSigningKeyFingerprintHex: string;
  signerDeviceSigningKeyFingerprintHex: string;
}): void {
  if (input.expectedDeviceSigningKeyFingerprintHex
    !== input.signerDeviceSigningKeyFingerprintHex) {
    throw new PicoLinkRelayWrongMailboxError();
  }
}

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
   * Authenticates the envelope and runs what it asks for.
   *
   * It is handed the device this mailbox belongs to so it can call
   * `assertPicoLinkRelayPacketSender` where the principal exists. Throwing
   * either named error above is a **refusal**; throwing anything else is a
   * failure, and the difference decides whether the packet is acknowledged.
   */
  handle: (input: {
    payload: string;
    expectedDeviceSigningKeyFingerprintHex: string;
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
 *
 * An unrecognised error is a **failure**, deliberately. The two refusals are
 * named types precisely so that everything else - a socket, a full disk, a bug
 * - defers rather than deletes. Guessing the other way would make an outage
 * indistinguishable from rubbish, and one of those is somebody's mail.
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
      let refusal: PicoLinkRelayRefusal | undefined;
      try {
        await options.handle({
          payload: packet.payload,
          expectedDeviceSigningKeyFingerprintHex: mailbox.deviceSigningKeyFingerprintHex,
        });
      } catch (error) {
        if (error instanceof PicoLinkRelayWrongMailboxError) {
          // Authentic, and in the wrong place. Refused rather than processed on
          // its signature alone: the signature would let this through, and
          // doing so would quietly accept that an address has leaked between
          // two devices. The sender still has its own mailbox and will be
          // answered there.
          refusal = 'wrong_mailbox';
        } else if (error instanceof PicoLinkRelayUnauthenticatedError) {
          refusal = 'unauthenticated';
        } else {
          deferred += 1;
          continue;
        }
      }

      if (refusal !== undefined) {
        refused += 1;
        options.onRefused?.({ mailbox: address, tag: packet.tag, refusal });
      } else {
        handled += 1;
      }
      await options.reader.acknowledge({ mailbox: address, tags: [packet.tag] });
    }
  }

  return Object.freeze({ handled, refused, deferred });
}
