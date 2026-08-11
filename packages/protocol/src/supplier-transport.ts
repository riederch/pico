import { picoSupplierSlots, type PicoSupplierSlot } from './supplier.js';

/**
 * ADR 0136 BR2 - the wire a supplier is reached over, and the only one.
 *
 * Supplier code runs **outside the core process**. ADR 0136 ties that to
 * processing rather than to the network: extraction runs out of process
 * wherever Pico did not author both the parser and the bytes, which covers a
 * corpus of PDFs on local disk exactly as it covers an AIS client. The shape is
 * ADR 0097's, already built for the Vault daemon and already proved against
 * real ceremonies - a private local socket, length-prefixed frames, and every
 * request carrying a versioned family label.
 *
 * **The core is the client and a supplier is the server, in initiative as well
 * as in wiring.** There is no family through which a supplier calls in. It
 * answers what it was asked and it starts nothing, which is ADR 0136's "a
 * supplier carries; it never decides" expressed where an implementation cannot
 * quietly widen it: a supplier with no inbound family has no way to notify, to
 * push, to subscribe or to schedule. Anything that looks like a supplier acting
 * on its own is the core having asked, on a schedule the core owns
 * (ADR 0143 DP8).
 *
 * **One family per slot, and the binding is checked rather than remembered.**
 * `picoSupplierRequestFamilyForSlot` is total over `picoSupplierSlots`, so a
 * slot added to ADR 0136 BR1's closed list without a family here fails to
 * compile rather than resolving to `undefined` at the point where a request is
 * being framed.
 *
 * Unlike the Vault daemon's contract, this one is **not** private. ADR 0134
 * names the supplier protocol as the first identity this tree keeps, because a
 * third-party depot is built against it and cannot be revised in place with the
 * rest of the tree. The version constant below is therefore a promise, and
 * ADR 0143 DP7's refusal sits beside it: a version this core does not know is
 * refused, never negotiated.
 */
export const picoSupplierProtocolVersion = 1 as const;

/**
 * ADR 0143 DP7 - an unknown version is refused, never negotiated.
 *
 * A supplier declares the slot-contract version it speaks. A core that does
 * not know that version refuses the supplier and says so; it does not fall
 * back, adapt or accept a subset.
 *
 * Negotiation is the alternative and it fails in a specific way: the code
 * deciding what an old supplier still supports lives in the core, grows one
 * branch per version, and every branch is a path through which a supplier
 * selects the core's behaviour. Refusing keeps the compatibility question in
 * one place - the depot's commit, which a person is already deciding about
 * under DP1.
 *
 * It is also what makes ADR 0134 true after suppliers exist. That ADR lets
 * internal formats be revised in place until the first kept identity, and
 * ADR 0136 named the supplier protocol as the identity that becomes kept.
 * Refusal is how a kept identity behaves; negotiation would make it a range.
 *
 * The list is enumerated rather than expressed as a range, so widening it is
 * an edit somebody makes on purpose. A `>=` would let every future version
 * through on the day it is written.
 */
export const picoSupportedSupplierProtocolVersions: readonly number[] =
  Object.freeze([picoSupplierProtocolVersion]);

export function isPicoSupplierProtocolVersionSupported(value: unknown): boolean {
  return typeof value === 'number'
    && Number.isInteger(value)
    && picoSupportedSupplierProtocolVersions.includes(value);
}

/**
 * ADR 0143 DP7 with ADR 0138 CO2. Refuses under its own error, so a surface
 * can say *this supplier speaks a version this Pico does not know* rather than
 * reporting a malformed manifest - the person's remedy is a different depot
 * commit, not a bug report.
 */
export function assertPicoSupplierProtocolVersion(value: unknown): number {
  if (!isPicoSupplierProtocolVersionSupported(value)) {
    throw new Error('pico_supplier_protocol_version_not_supported');
  }
  return value as number;
}

/**
 * The closed set of families that cross the socket, all of them core-to-
 * supplier. Enumerated rather than derived, in the idiom ADR 0127 uses for
 * module identifiers - a family that can be constructed from a string is one a
 * caller can invent.
 */
export const picoSupplierRequestFamilies = {
  /**
   * Opens the connection. Carries the protocol version the supplier speaks and
   * the slots it claims, which is the input ADR 0143 DP7's refusal reads.
   */
  hello: 'pico.supplier.hello.v1',
  /**
   * ADR 0138 CO2. What state the supplier is in, asked without asking it to do
   * anything - so `not_configured` and `out_of_scope` can be answered before
   * anything is spent.
   */
  condition: 'pico.supplier.condition.v1',
  /** ADR 0136 BR1, `observation` slot. */
  observe: 'pico.supplier.observe.v1',
  /** ADR 0136 BR1, `memory_item` slot. What the core takes in at BR3. */
  offer: 'pico.supplier.offer.v1',
  /** ADR 0136 BR1, `effect` slot. Only ever sent after ADR 0140 decided. */
  cause: 'pico.supplier.cause.v1',
} as const;

export type PicoSupplierRequestFamily =
  typeof picoSupplierRequestFamilies[keyof typeof picoSupplierRequestFamilies];

/** Every response echoes the request id under one family, as ADR 0097 does. */
export const picoSupplierResponseFamily = 'pico.supplier.response.v1' as const;

/**
 * Deliberately smaller than the Vault daemon's reader-access ceiling and equal
 * to its control-family cap. A supplier hands over *one* answer per request;
 * a corpus is read where it lies (ADR 0136, ADR 0133), never streamed through
 * this socket, so a frame that needs more than this is a supplier trying to
 * ingest rather than to answer.
 */
export const MAX_PICO_SUPPLIER_FRAME_BYTES = 128 * 1024;

const slotFamilies: Readonly<Record<PicoSupplierSlot, PicoSupplierRequestFamily>> =
  Object.freeze({
    observation: picoSupplierRequestFamilies.observe,
    memory_item: picoSupplierRequestFamilies.offer,
    effect: picoSupplierRequestFamilies.cause,
  });

/**
 * ADR 0136 BR1/BR2. The one family that carries a given slot.
 *
 * Total over the closed slot list by type rather than by discipline: adding a
 * fourth slot without a family here is a compile error at `slotFamilies`.
 */
export function picoSupplierRequestFamilyForSlot(
  slot: PicoSupplierSlot,
): PicoSupplierRequestFamily {
  return slotFamilies[slot];
}

/**
 * The two families that carry no slot. Separated out because they are the ones
 * a caller may send to a supplier whose slots it does not yet know - and
 * because ADR 0138 CO2 needs a state to be askable without anything being
 * spent.
 */
export const picoSupplierLifecycleFamilies = Object.freeze([
  picoSupplierRequestFamilies.hello,
  picoSupplierRequestFamilies.condition,
]) as readonly PicoSupplierRequestFamily[];

const requestFamilyValues: ReadonlySet<string> = new Set(
  Object.values(picoSupplierRequestFamilies),
);

export function isPicoSupplierRequestFamily(
  value: unknown,
): value is PicoSupplierRequestFamily {
  return typeof value === 'string' && requestFamilyValues.has(value);
}

/**
 * Refuses an unlisted family under its own error, in the shape
 * `parsePicoSupplierManifest` uses for an unlisted slot. A family the core does
 * not know is not a request it should attempt to interpret.
 */
export function assertPicoSupplierRequestFamily(
  value: unknown,
): PicoSupplierRequestFamily {
  if (!isPicoSupplierRequestFamily(value)) {
    throw new Error('pico_supplier_request_family_not_listed');
  }
  return value;
}

/**
 * ADR 0136 BR2. Whether a slot is reachable over this transport at all.
 *
 * Exists so the check that walks the core's import hull has something to assert
 * against: every slot in BR1's list has exactly one family, and a slot with
 * none would mean the core reaches that supplier some other way.
 */
export function picoSupplierSlotsWithoutFamily(): readonly PicoSupplierSlot[] {
  return picoSupplierSlots.filter((slot) => slotFamilies[slot] === undefined);
}
