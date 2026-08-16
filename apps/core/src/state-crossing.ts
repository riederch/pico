import type { EventStore } from './event-store.js';
import type { MemoryItem } from './memory-store.js';
import {
  picoStateCrossedEventType,
  picoStateCrossingKinds,
  type PicoStateCrossingKind,
} from '@pico/protocol/state-crossing';

/**
 * ADR 0126 P3 - the door between what a presence holds and what an identity
 * keeps.
 *
 * ADR 0126 splits state in two: durable and device-independent belongs to the
 * identity, local and mostly short-lived belongs to the presence, and *only
 * information that is both relevant and explicitly released crosses from the
 * second into the first*. The crossing is where ADR 0129's five-place test
 * applies - the test was written for a store and belongs to the boundary.
 *
 * **The crossing already happened once before it had a name.** Keeping a
 * recall answer is exactly this: a derived sentence a device is holding
 * becomes a memory item because the person said so (ADR 0116 W5). It wrote the
 * item and no record of the promotion, so the one act ADR 0126 calls
 * "explicit, audited" was explicit and unaudited.
 *
 * **One function writes both, in one transaction**, and that is the whole
 * design. An audit that a caller is trusted to append beside its write is an
 * audit that is missing wherever somebody forgot - "a rule a surface enforces
 * is a rule anything else walks past". Here there is no way to promote without
 * recording it, because promoting *is* recording it.
 *
 * What this does **not** do is relocate the ADR 0129 SR2 buffer. That half of
 * P3 needs a runtime with a sensor to fill it; building a presence-local
 * buffer for the one presence that exists - a desktop with no location - would
 * be code nobody could run against a real device, which is the reason SR5 gave
 * for leaving its own capture port unfilled.
 */

export type PicoStateCrossingRefusal =
  /** The destination is not a domain, so nothing would reach it on a shred. */
  | 'crossing_has_no_domain'
  /** Nothing was released; a crossing with no material is not a crossing. */
  | 'crossing_has_no_material'
  /** ADR 0119 Q5, met at the boundary rather than as a raw store error. */
  | 'crossing_refused_by_ceiling';

export interface PicoStateCrossingInput {
  store: EventStore;
  /**
   * ADR 0126. Which presence released this, when one is known.
   *
   * Optional, and the absence is honest rather than a default: today's one
   * caller is a person pressing a button in a window that has not announced
   * itself as a presence, and writing an invented id would put a device in the
   * record that never said it was there.
   */
  presenceId?: string;
  kind: PicoStateCrossingKind;
  privacyDomain: string;
  owner: string;
  controller: string;
  contentType: string;
  content: string;
  origin: MemoryItem['origin'];
  /** What it was derived from, for the count in the record. Never the ids. */
  sourceCount: number;
  deviceId: string;
  memoryItemId: string;
  /**
   * Typed to the one event this door writes, so a caller cannot pass a
   * different type through it and get an audit record that says something
   * else happened.
   */
  appendEvent: (event: {
    type: typeof picoStateCrossedEventType;
    payload: Record<string, unknown>;
  }) => void;
}

export function crossPicoStateBoundary(
  input: PicoStateCrossingInput,
): { ok: true; item: MemoryItem } | { ok: false; refusal: PicoStateCrossingRefusal } {
  if (typeof input.privacyDomain !== 'string' || input.privacyDomain.trim() === '') {
    /**
     * The first of ADR 0129's five places, asked at the boundary: a shred
     * reaches memory items by domain, so material landing without one would be
     * material a shred could not reach. Refusing here is cheaper than
     * discovering it during a deletion somebody was relying on.
     */
    return { ok: false, refusal: 'crossing_has_no_domain' };
  }
  if (typeof input.content !== 'string' || input.content.trim() === '') {
    return { ok: false, refusal: 'crossing_has_no_material' };
  }
  if (!(picoStateCrossingKinds as readonly string[]).includes(input.kind)) {
    throw new Error('invalid_pico_state_crossing_kind');
  }

  let item: MemoryItem;
  try {
    item = input.store.memory().create({
      memoryItemId: input.memoryItemId,
      privacyDomain: input.privacyDomain,
      owner: input.owner,
      controller: input.controller,
      contentType: input.contentType,
      content: input.content,
      origin: input.origin,
    });
  } catch (error) {
    // ADR 0119 Q5's ceiling arrives here as a store error. Named at the
    // boundary, because "your Home is full" and "that crossing was malformed"
    // are different things for a person to be told.
    if (error instanceof Error && /ceiling/iu.test(error.message)) {
      return { ok: false, refusal: 'crossing_refused_by_ceiling' };
    }
    throw error;
  }

  /**
   * ADR 0129 SR6's shape, one layer up: which crossing, from where, into
   * which domain - and nothing that was crossed. What a person released is
   * the memory item's business, and an audit trail that repeated it would be
   * a second copy of the content in a place with different deletion rules.
   */
  input.appendEvent({
    type: picoStateCrossedEventType,
    payload: {
      kind: input.kind,
      privacyDomain: input.privacyDomain,
      memoryItemId: item.memoryItemId,
      sourceCount: input.sourceCount,
      ...(input.presenceId === undefined ? {} : { presenceId: input.presenceId }),
    },
  });

  return { ok: true, item };
}
