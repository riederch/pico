import {
  parsePicoLinkPacketAddress,
  type PicoLinkPacket,
} from '@pico/protocol/link-packet';
import {
  picoLinkDeliveryOutcomes,
  type PicoLinkDeliveryOutcome,
} from '@pico/protocol/link-delivery';
import {
  MAX_PICO_LINK_RELAY_ACKNOWLEDGE_TAGS,
  assertPicoLinkRelayAccount,
  picoLinkRelayAccountHeader,
  picoLinkRelayRoutes,
} from '@pico/protocol/link-relay-surface';

/**
 * ADR 0149 - talking to a relay, from a Pico that must not ship one.
 *
 * **Its own package rather than a corner of `apps/relay`**, and the reason is
 * the ADR's first sentence: the machine is somebody else's. A Home that
 * imported the relay's server module to get its client would be shipping a
 * stranger's server, and `check-relay-boundary.mjs` would be guarding a
 * boundary the other side had already walked through. Both the Home and the
 * companion are callers; neither should carry a queue.
 *
 * It reaches the network and holds no secret of anyone's. The account
 * credential arrives per call rather than being kept here, because a client
 * that stored one would be a second place to look for it.
 */
export interface PicoLinkRelayClientOptions {
  /**
   * Where the operator answers. Given rather than derived from an address,
   * because ADR 0147 RY3's operator is a hostname and how it is reached -
   * scheme, port, path prefix - is a deployment property. Passing an address
   * would smuggle those into a value people hand each other.
   */
  baseUrl: string;
  /** ADR 0149 RS2. 128 bits, and the credential is the identifier. */
  accountId: string;
  fetch?: typeof globalThis.fetch;
  /** Bounded so a hung operator cannot hold a sweep open. */
  timeoutMs?: number;
}

export const defaultPicoLinkRelayTimeoutMs = 15_000;

export interface PicoLinkRelayCollectedPacket {
  tag: string;
  expiresAt: string;
  payload: string;
}

export interface PicoLinkRelayCollection {
  packets: readonly PicoLinkRelayCollectedPacket[];
  /** True when the operator held more than one answer could carry. */
  more: boolean;
}

export type PicoLinkRelayAnswer<TValue> =
  | { ok: true; value: TValue }
  /** The operator refused, by the name it used. Never an exception. */
  | { ok: false; refusal: string };

export class PicoLinkRelayClient {
  private readonly baseUrl: string;

  private readonly accountId: string;

  private readonly call: typeof globalThis.fetch;

  private readonly timeoutMs: number;

  public constructor(options: PicoLinkRelayClientOptions) {
    if (typeof options.baseUrl !== 'string' || !/^https?:\/\/[^\s]+$/u.test(options.baseUrl)) {
      throw new Error('invalid_pico_link_relay_base_url');
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/u, '');
    this.accountId = assertPicoLinkRelayAccount(options.accountId);
    this.call = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? defaultPicoLinkRelayTimeoutMs;
  }

  /** ADR 0149 RS2. Takes a mailbox this caller's account will hold. */
  public async register(input: {
    mailbox: string;
    capacity: number;
  }): Promise<PicoLinkRelayAnswer<true>> {
    const answer = await this.post(picoLinkRelayRoutes.register, input, true);
    return answer.accepted
      ? { ok: true, value: true }
      : { ok: false, refusal: PicoLinkRelayClient.refusalOf(answer.body) };
  }

  /**
   * ADR 0149 RS3. Puts a packet in somebody's mailbox, with no credential.
   *
   * The account is deliberately **not** sent: there is nothing on a packet to
   * authenticate (ADR 0147 RY1 removed the sender), and attaching one anyway
   * would tell the operator which of its customers is talking to which
   * mailbox - the graph the envelope was shaped to avoid.
   */
  public async deliver(packet: PicoLinkPacket): Promise<PicoLinkDeliveryOutcome> {
    const answer = await this.post(picoLinkRelayRoutes.deliver, packet, false);
    const outcome = answer.body.outcome;
    if (typeof outcome !== 'string'
      || !(picoLinkDeliveryOutcomes as readonly string[]).includes(outcome)) {
      // A relay that answered something outside the closed list has answered
      // something this caller cannot act on, and guessing would be inventing a
      // state ADR 0147 RY5 does not have.
      throw new Error('unknown_pico_link_delivery_outcome');
    }
    return outcome as PicoLinkDeliveryOutcome;
  }

  /** ADR 0149 RS5. Reads what is waiting and removes nothing. */
  public async collect(mailbox: string): Promise<PicoLinkRelayAnswer<PicoLinkRelayCollection>> {
    const answer = await this.post(picoLinkRelayRoutes.collect, { mailbox }, true);
    if (!answer.accepted) {
      return { ok: false, refusal: PicoLinkRelayClient.refusalOf(answer.body) };
    }
    const packets = answer.body.packets;
    if (!Array.isArray(packets)) {
      throw new Error('invalid_pico_link_relay_collection');
    }
    return {
      ok: true,
      value: Object.freeze({
        packets: Object.freeze(packets as PicoLinkRelayCollectedPacket[]),
        more: answer.body.more === true,
      }),
    };
  }

  /** ADR 0149 RS5. The act that removes, once the caller holds them durably. */
  public async acknowledge(input: {
    mailbox: string;
    tags: readonly string[];
  }): Promise<PicoLinkRelayAnswer<number>> {
    if (input.tags.length > MAX_PICO_LINK_RELAY_ACKNOWLEDGE_TAGS) {
      // Refused here rather than sent and refused there, because the caller is
      // the one that can split it and the operator would only say no.
      throw new Error('invalid_pico_link_relay_tags');
    }
    const answer = await this.post(picoLinkRelayRoutes.acknowledge, input, true);
    return answer.accepted
      ? { ok: true, value: Number(answer.body.removed ?? 0) }
      : { ok: false, refusal: PicoLinkRelayClient.refusalOf(answer.body) };
  }

  /** ADR 0147 RY4. Ends a mailbox, leaving the tombstone that answers for it. */
  public async deregister(mailbox: string): Promise<PicoLinkRelayAnswer<true>> {
    const answer = await this.post(picoLinkRelayRoutes.deregister, { mailbox }, true);
    return answer.accepted
      ? { ok: true, value: true }
      : { ok: false, refusal: PicoLinkRelayClient.refusalOf(answer.body) };
  }

  /**
   * The operator half of an address, so a caller holding several relays can
   * tell whether this client is the one that address belongs to.
   *
   * Checked rather than assumed: sending a mailbox to the wrong operator would
   * register somebody else's name at a relay that has never heard of it.
   */
  public holds(address: string): boolean {
    const operator = parsePicoLinkPacketAddress(address).operator;
    return this.baseUrl.includes(operator);
  }

  /**
   * The transport, and deliberately not the interpretation.
   *
   * It answers whether the operator accepted and what it said, because the
   * two routes read that differently: everything account-bearing refuses with
   * a name, while `deliver` answers an ADR 0147 outcome whether it accepted or
   * not - `mailbox_full` is a refusal to hold and still the answer the caller
   * asked for. A `post` that insisted on one shape would have to invent the
   * other.
   */
  private async post(
    route: string,
    body: unknown,
    withAccount: boolean,
  ): Promise<{ accepted: boolean; body: Record<string, unknown> }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.call(`${this.baseUrl}${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(withAccount ? { [picoLinkRelayAccountHeader]: this.accountId } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = await response.json() as Record<string, unknown>;
    } catch {
      throw new Error('invalid_pico_link_relay_answer');
    }

    return { accepted: response.ok, body: parsed };
  }

  /**
   * A refusal is an **answer**, not an exception: every one of them is
   * something the caller did and can do differently. Only a relay that said
   * something outside its own vocabulary throws.
   */
  private static refusalOf(body: Record<string, unknown>): string {
    const refusal = body.refusal ?? body.error;
    if (typeof refusal !== 'string') {
      throw new Error('invalid_pico_link_relay_answer');
    }
    return refusal;
  }
}

/**
 * ADR 0154. The other relationship with the same machine: whoever holds the
 * operator credential rather than an account.
 *
 * Re-exported through this package's one entry point, and kept in its own
 * module - a single class doing both would make it easy to hand an
 * administration credential to code that only ever needed to collect packets.
 */
export {
  PicoRelayOperatorClient,
  defaultPicoRelayOperatorTimeoutMs,
  type PicoRelayIssuedAccount,
  type PicoRelayOperatorAnswer,
  type PicoRelayOperatorClientOptions,
} from './operator.js';
