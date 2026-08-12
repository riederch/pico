import {
  openPicoCompanionPendingReply,
  prunePicoCompanionPendingReplies,
  readPicoCompanionPendingReplyBook,
  settlePicoCompanionPendingReply,
  writePicoCompanionPendingReplyBook,
  type PicoCompanionReplySodium,
} from './pending-reply.js';

/**
 * ADR 0149's collecting side, on the device.
 *
 * The same three phases the Home's sweep has - collect, deal with it,
 * acknowledge - and one difference that decides everything else: what a device
 * collects are **answers**, and an answer is only readable with the key that
 * asked the question. There is no principal to authenticate here and nothing
 * to authorise; there is a reply that opens or does not.
 *
 * **A packet nothing opens is permanent, and that is provable rather than
 * assumed.** The pending set only ever shrinks for a given packet: a response
 * can match no key but its own request's, and that key was written before the
 * request left. So a reply that does not open now will not open later, and
 * leaving it would let one stranger's packet fill this device's one mailbox
 * until somebody reissued the address.
 *
 * **The order is open, hand over, settle, acknowledge.** Settling before
 * handing over would lose an answer to a crash in between - the key gone, the
 * packet still at the relay, and nothing able to read it again. In the order
 * above the same crash costs a duplicate, which the ADR 0147 RY6 tag already
 * lets a caller absorb.
 */
export interface PicoCompanionRelayReader {
  collect(input: { mailbox: string }): Promise<readonly { tag: string; payload: string }[]>;
  acknowledge(input: { mailbox: string; tags: readonly string[] }): Promise<void>;
}

export type PicoCompanionRelayRefusal =
  /** No outstanding request's key opens it: a duplicate, or not ours. */
  | 'unmatched'
  /** It opened and the answer did not hold - a signature, a pin, a shape. */
  | 'unverified';

export interface PicoCompanionLinkRelaySweepOptions {
  reader: PicoCompanionRelayReader;
  sodium: PicoCompanionReplySodium;
  /** Where the pending-reply book lives. Read and written every sweep. */
  pendingReplyPath: string;
  /** This device's own inbound mailbox, without the operator half. */
  mailbox: string;
  /**
   * Verifies the opened ADR 0107 response and hands it on.
   *
   * Throwing is a **failure** - the reply stays for the next pass. A response
   * that is authentic but wrong belongs in `verified: false` instead, because
   * that one will never become right and holding it costs the mailbox.
   */
  handle: (input: {
    requestId: string;
    opened: Uint8Array;
  }) => Promise<{ verified: boolean }>;
  now?: () => Date;
  onRefused?: (input: { tag: string; refusal: PicoCompanionRelayRefusal }) => void;
}

export interface PicoCompanionLinkRelaySweep {
  handled: number;
  refused: number;
  deferred: number;
}

export async function sweepPicoCompanionLinkRelay(
  options: PicoCompanionLinkRelaySweepOptions,
): Promise<PicoCompanionLinkRelaySweep> {
  const nowMs = (options.now?.() ?? new Date()).getTime();
  let book = prunePicoCompanionPendingReplies(
    readPicoCompanionPendingReplyBook(options.pendingReplyPath),
    nowMs,
  );

  let handled = 0;
  let refused = 0;
  let deferred = 0;

  for (const packet of await options.reader.collect({ mailbox: options.mailbox })) {
    const opened = openPicoCompanionPendingReply({
      sodium: options.sodium,
      book,
      sealed: Buffer.from(packet.payload, 'base64'),
      nowMs,
    });
    if (opened === undefined) {
      refused += 1;
      options.onRefused?.({ tag: packet.tag, refusal: 'unmatched' });
      await options.reader.acknowledge({ mailbox: options.mailbox, tags: [packet.tag] });
      continue;
    }

    let verified: boolean;
    try {
      ({ verified } = await options.handle(opened));
    } catch {
      // Left where it is, and the key with it. The next pass tries again.
      deferred += 1;
      continue;
    }

    if (!verified) {
      refused += 1;
      options.onRefused?.({ tag: packet.tag, refusal: 'unverified' });
    } else {
      handled += 1;
    }
    // Settled after handing over, acknowledged after settling. A crash in the
    // first gap costs a duplicate; a crash in the second costs nothing,
    // because the returning packet no longer opens and is acknowledged as
    // unmatched.
    book = settlePicoCompanionPendingReply(book, opened.requestId);
    writePicoCompanionPendingReplyBook(options.pendingReplyPath, book);
    await options.reader.acknowledge({ mailbox: options.mailbox, tags: [packet.tag] });
  }

  writePicoCompanionPendingReplyBook(options.pendingReplyPath, book);
  return Object.freeze({ handled, refused, deferred });
}

/**
 * ADR 0149. The device's own cadence, on the shell's existing triggers.
 *
 * `checkNow` is the same shape ADR 0113's alarm carrier exposes, and for the
 * same reason: the shell already knows when a device woke, when a network came
 * back and when a person opened the window, and those are exactly the moments
 * a waiting answer should stop waiting. What this owns is only the interval
 * between them.
 *
 * A failed sweep is counted rather than thrown. An operator that cannot be
 * reached is the world failing, and nothing was acknowledged, so the next pass
 * tries again - the same posture ADR 0138 CO2 takes everywhere else.
 */
export interface PicoCompanionLinkRelayRunner {
  checkNow(): Promise<PicoCompanionLinkRelaySweep>;
  failures(): number;
  stop(): void;
}

export function startPicoCompanionLinkRelaySweep(input: {
  sweep: () => Promise<PicoCompanionLinkRelaySweep>;
  intervalMs: number;
  setTimer?: (handler: () => void, delayMs: number) => NodeJS.Timeout;
  clearTimer?: (timer: NodeJS.Timeout) => void;
}): PicoCompanionLinkRelayRunner {
  const setTimer = input.setTimer ?? ((handler, delayMs) => setTimeout(handler, delayMs));
  const clearTimer = input.clearTimer ?? ((timer) => clearTimeout(timer));

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let running = false;
  let failures = 0;

  const arm = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (stopped) {
      return;
    }
    timer = setTimer(() => {
      void checkNow();
    }, input.intervalMs);
    timer.unref?.();
  };

  const checkNow = async (): Promise<PicoCompanionLinkRelaySweep> => {
    if (stopped || running) {
      // A wake and a timer landing together must not run two sweeps: the
      // second would collect the same packets and hand them over twice for no
      // reason the first had not already covered.
      return { handled: 0, refused: 0, deferred: 0 };
    }
    running = true;
    try {
      return await input.sweep();
    } catch {
      failures += 1;
      return { handled: 0, refused: 0, deferred: 0 };
    } finally {
      running = false;
      arm();
    }
  };

  arm();

  return {
    checkNow,
    failures: () => failures,
    stop: () => {
      stopped = true;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}
