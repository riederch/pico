import { PicoLinkRelayClient } from '@pico/link-relay-client';
import { parsePicoLinkPacketAddress } from '@pico/protocol/link-packet';
import type { PicoLinkRelayReader } from './link-relay-collector.js';

/**
 * ADR 0149 - the transport the collector was written without.
 *
 * `collectPicoLinkRelayPackets` takes a port on purpose, so its decisions -
 * the mailbox-versus-signature disagreement, what is acknowledged and what is
 * left - are provable without a network. This is the other half: the port,
 * over the relay's own surface.
 *
 * There is nothing to decide here and that is the point. Everything this
 * touches was settled in ADR 0147 and ADR 0149; if this file grew a judgement
 * it would be a judgement in the wrong place.
 */
export interface PicoLinkRelayTransportOptions {
  /** Where the operator answers. A deployment property, not an address. */
  baseUrl: string;
  /** ADR 0149 RS2. 128 bits, and the credential is the identifier. */
  accountId: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface PicoLinkRelayTransport extends PicoLinkRelayReader {
  /**
   * ADR 0148's named precondition, closed. An address handed over before it
   * exists at the operator is one the peer will write into nothing.
   */
  register(input: { mailbox: string; capacity: number }): Promise<void>;
  /** ADR 0147 RY4. Ends a mailbox at the operator that holds it. */
  deregister(mailbox: string): Promise<void>;
}

export function createPicoLinkRelayTransport(
  options: PicoLinkRelayTransportOptions,
): PicoLinkRelayTransport {
  const client = new PicoLinkRelayClient(options);

  const transport: PicoLinkRelayTransport = {
    register: async ({ mailbox, capacity }) => {
      const answer = await client.register({ mailbox, capacity });
      if (!answer.ok) {
        // Named and thrown rather than reported. A caller that treated a
        // refused registration as a warning would go on to hand the address
        // over, and the peer would write into a mailbox nobody holds.
        throw new Error(`pico_link_relay_registration_refused:${answer.refusal}`);
      }
    },
    deregister: async (mailbox) => {
      const answer = await client.deregister(mailbox);
      if (!answer.ok && answer.refusal !== 'mailbox_not_yours') {
        throw new Error(`pico_link_relay_deregistration_refused:${answer.refusal}`);
      }
      // `mailbox_not_yours` is swallowed on purpose, and only here: ending
      // something that is already not ours is the outcome asked for, and a
      // detach that could fail on a second attempt is one nobody can finish.
    },
    collect: async ({ mailbox }) => {
      const answer = await client.collect(mailbox);
      if (!answer.ok) {
        throw new Error(`pico_link_relay_collect_refused:${answer.refusal}`);
      }
      return answer.value.packets.map((packet) => ({
        tag: packet.tag,
        payload: packet.payload,
      }));
    },
    acknowledge: async ({ mailbox, tags }) => {
      if (tags.length === 0) {
        return;
      }
      const answer = await client.acknowledge({ mailbox, tags });
      if (!answer.ok) {
        throw new Error(`pico_link_relay_acknowledge_refused:${answer.refusal}`);
      }
    },
  };
  return Object.freeze(transport);
}

/**
 * The mailbox half of an address, which is what the relay surface names.
 *
 * Split through the protocol's parser rather than on `@` here, because a
 * second splitter is a second thing to get wrong - and the thing it would get
 * wrong is which side of a two-`@` address wins (ADR 0147 RY3).
 */
export function picoLinkRelayMailboxOf(address: string): string {
  return parsePicoLinkPacketAddress(address).mailbox;
}
