import {
  assertPicoLinkPushAddressedHere,
  type PicoLinkPushSignatureInput,
} from '@pico/protocol';

/**
 * ADR 0150 PU3/PU4 - what a device does when a Home speaks first.
 *
 * **It causes a read and nothing else.** A push says "ask me", so receiving
 * one makes the device look; what it *finds* is what decides whether a person
 * is interrupted, through the ADR 0112 alarm rules that already weigh that.
 * Nothing here reaches a notification, a tray, a window or a sound, and
 * `scripts/check-push-boundary.mjs` proves that absence rather than this
 * comment claiming it.
 *
 * The freshness rules are ADR 0107's, mirrored because the problem is the
 * same one: a signed statement whose replay costs something. What differs is
 * only what it costs. A replayed request could repeat an *operation*; a
 * replayed push can only repeat a **read the device was entitled to make
 * anyway** - so what is being bounded here is a radio and a battery, and a
 * bound sized for authority would be sized for the wrong risk.
 */

/**
 * The longest a Home may make one push valid for.
 *
 * Without it the seen-set below is defeated by construction: a Home - or
 * anything that got hold of a Home's signing key - could mint a push valid for
 * a year, and no bounded memory of what has been seen can cover a year. ADR
 * 0107 hit this first and named it; the number here is smaller because a push
 * has less to say and nothing to wait for.
 */
export const maxPicoLinkPushLifetimeMs = 15 * 60 * 1_000;

/**
 * How many push ids one device remembers inside that window.
 *
 * Small on purpose. A push cannot be forged, so what can be replayed is only
 * what a Home actually sent - and ADR 0150 PU5 puts a floor between those, so
 * a window holds a handful. Replaying one id repeatedly does not grow this
 * set; sixty-four is well past what an honest Home produces and well short of
 * anything worth persisting.
 */
export const maxPicoLinkPushSeenIds = 64;

export type PicoLinkPushVerdict =
  /** Fresh, addressed here, not seen before. Causes a read. */
  | 'accepted'
  /** Outside its own window, or claiming a window longer than one may be. */
  | 'expired'
  /** Seen inside the window. Costs nothing, and is not an error. */
  | 'replayed';

export interface PicoCompanionPushGate {
  /**
   * ADR 0150 PU3. Decides whether this push is worth a read, and remembers it.
   *
   * Pins are checked before freshness because a push from another Home or for
   * another device is not a stale push - it is somebody else's, and answering
   * "expired" would be answering the wrong question.
   */
  admit(input: { push: PicoLinkPushSignatureInput; nowMs: number }): PicoLinkPushVerdict;
  /** What is currently remembered, for a surface that wants to say so. */
  size(): number;
}

export function createPicoCompanionPushGate(input: {
  deviceSigningKeyFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
}): PicoCompanionPushGate {
  // Insertion-ordered, so eviction drops the oldest. Every entry is
  // short-lived by construction: a push outside its window is refused before
  // this map is consulted.
  const seen = new Map<string, number>();

  const gate: PicoCompanionPushGate = {
    admit: ({ push, nowMs }) => {
      // Throws for another device or another Home. Not a verdict, because
      // neither is a thing this device should be counting.
      assertPicoLinkPushAddressedHere({
        push,
        deviceSigningKeyFingerprintHex: input.deviceSigningKeyFingerprintHex,
        hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
      });

      const createdAtMs = Date.parse(push.createdAt);
      const expiresAtMs = Date.parse(push.expiresAt);
      if (expiresAtMs - createdAtMs > maxPicoLinkPushLifetimeMs) {
        return 'expired';
      }
      if (nowMs >= expiresAtMs || nowMs < createdAtMs - maxPicoLinkPushLifetimeMs) {
        // Both ends: a push from the future by more than one window is as
        // unusable as one from the past, and accepting it would let a wrong
        // clock widen what the seen-set has to cover.
        return 'expired';
      }

      for (const [pushId, expiry] of seen) {
        if (expiry <= nowMs) {
          seen.delete(pushId);
        }
      }
      if (seen.has(push.pushId)) {
        return 'replayed';
      }
      if (seen.size >= maxPicoLinkPushSeenIds) {
        seen.delete(seen.keys().next().value!);
      }
      seen.set(push.pushId, expiresAtMs);
      return 'accepted';
    },
    size: () => seen.size,
  };
  return Object.freeze(gate);
}

/**
 * ADR 0150 PU4. Receiving a push, which is a read and nothing else.
 *
 * `read` is the only thing this can do. There is no notification parameter, no
 * presentation port and no surface to reach - the refusal is the absence of
 * anywhere to put one (ADR 0117 X1), and the check named above keeps it that
 * way.
 *
 * A failed read is **not** counted against the push. The push was valid and
 * has been remembered; whether the read got through is the ADR 0112 carrier's
 * business, and it already counts its own failures.
 */
export async function receivePicoCompanionPush(input: {
  gate: PicoCompanionPushGate;
  push: PicoLinkPushSignatureInput;
  nowMs: number;
  read: () => Promise<void>;
}): Promise<PicoLinkPushVerdict> {
  const verdict = input.gate.admit({ push: input.push, nowMs: input.nowMs });
  if (verdict === 'accepted') {
    await input.read();
  }
  return verdict;
}
