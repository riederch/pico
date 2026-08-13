import {
  buildPicoLinkPushSignatureInput,
  picoLinkPushEnvelopeSchema,
  type PicoLinkPushSignatureInput,
} from '@pico/protocol';
import {
  parsePicoLinkPacket,
  picoLinkExpiryBucketFor,
  picoLinkPacketSchema,
  type PicoLinkPacket,
} from '@pico/protocol/link-packet';
import type { PicoLinkDeliveryOutcome } from '@pico/protocol/link-delivery';
import { maxPicoLinkPushLifetimeMs } from './link-push-lifetime.js';
import type { PicoLinkPushCandidate } from './link-push-occasion.js';

/**
 * ADR 0150. Turning a candidate into a packet, and the one ordering decision
 * left in it.
 *
 * **Deliver first, record after.** Recording first and failing to deliver
 * leaves a Home believing it pushed when nothing left - and the person is not
 * woken about a recovery, which is the failure ADR 0112 exists to prevent.
 * Delivering first and failing to record costs one extra push on the next
 * sweep, bounded by PU5's floor. One of those is a battery and the other is
 * somebody's device being taken over while they slept.
 *
 * Only an `accepted` delivery is recorded. Everything else did not land, so
 * treating it as sent would be the same loss in a quieter form.
 */
export interface PicoLinkPushSendPorts {
  /** Seals plaintext to a recipient's key-agreement public key. */
  seal: (plaintext: Uint8Array, recipientPublicKeyHex: string) => Uint8Array;
  /** Signs canonical bytes with this Home's host signing key. */
  sign: (bytes: Uint8Array) => string;
  deliver: (packet: PicoLinkPacket) => Promise<PicoLinkDeliveryOutcome>;
  /** Called only after an accepted delivery. */
  recordSent: (input: { candidate: PicoLinkPushCandidate; at: string }) => void;
}

export interface PicoLinkPushSendInput extends PicoLinkPushSendPorts {
  candidate: PicoLinkPushCandidate;
  /** From the reader-key record, so a push can only reach an active member. */
  deviceKeyAgreementPublicKeyHex: string;
  hostSigningKeyFingerprintHex: string;
  suite: string;
  /** Fresh per push (ADR 0150 PU3). */
  pushId: string;
  /** Fresh per packet (ADR 0147 RY6). */
  packetTag: string;
  nowMs: number;
}

export async function sendPicoLinkPush(
  input: PicoLinkPushSendInput,
): Promise<PicoLinkDeliveryOutcome> {
  const createdAtMs = input.nowMs;
  const pushExpiresAtMs = createdAtMs + maxPicoLinkPushLifetimeMs;

  const push: PicoLinkPushSignatureInput = {
    suite: input.suite,
    pushId: input.pushId,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    deviceSigningKeyFingerprintHex:
      input.candidate.mailbox.deviceSigningKeyFingerprintHex,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(pushExpiresAtMs).toISOString(),
  };

  const sealedPush = input.seal(
    new TextEncoder().encode(JSON.stringify({
      schema: picoLinkPushEnvelopeSchema,
      push,
      hostSignatureHex: input.sign(buildPicoLinkPushSignatureInput(push)),
    })),
    input.deviceKeyAgreementPublicKeyHex,
  );

  const packet = parsePicoLinkPacket({
    schema: picoLinkPacketSchema,
    to: input.candidate.mailbox.deviceInbound,
    tag: input.packetTag,
    // **Rounded up past the push's own expiry, never short of it.** The two
    // bound different things - the packet says how long the relay holds it,
    // the push says how long the device honours it - and a packet that died
    // first would drop a push nobody ever saw. A packet that outlives its
    // push costs one collected packet the device answers `expired` to.
    expiresAt: picoLinkExpiryBucketFor(pushExpiresAtMs),
    payload: Buffer.from(sealedPush).toString('base64'),
  }, createdAtMs);

  const outcome = await input.deliver(packet);
  if (outcome === 'accepted') {
    input.recordSent({
      candidate: input.candidate,
      at: new Date(createdAtMs).toISOString(),
    });
  }
  return outcome;
}
