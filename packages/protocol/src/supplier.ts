/**
 * ADR 0136 BR1 and ADR 0137 IN1/IN2 - what a supplier declares about itself.
 *
 * A supplier is a Pico Bridge or a Pico Library: something that provides
 * content Pico did not author. It has no surface, no vocabulary and no
 * storage, which makes it strictly smaller than an ADR 0127 module rather than
 * a variant of one.
 *
 * **BR1: the slot list is closed and enumerated**, listed rather than derived,
 * in the idiom ADR 0127 uses for module identifiers and ADR 0119 Q2 for
 * protective event types. Without a fixed target, "present the data uniformly"
 * means every supplier defines its own uniformity, and four DTO families
 * become forty. A supplier needing a shape the list does not have does not
 * invent one: the shape is lifted as a core capability under ADR 0127 M5.
 *
 * **IN1: the instance list is not closed**, and the asymmetry is deliberate.
 * Adding a module is Pico's decision, spoken once in a listed place. Adding a
 * supplier is a person's decision about their own material, their own house or
 * their own subscription, so no enumeration can exist ahead of it. What a
 * supplier may produce is fixed; how many suppliers exist is not.
 *
 * **IN2: coverage decides whether instances add up, not the kind.** An earlier
 * draft of ADR 0136 reasoned from metering - free reads union, paid calls force
 * a choice - which is true about cost and wrong about meaning. Three Home
 * Assistants are bridges and nobody wants two of the three switched off,
 * because they cover three buildings.
 */

import { isPicoPrivacyDomain } from './privacy-domain.js';
import { assertExactKeys } from './canonical-bytes.js';
export const picoSupplierSlots = ['observation', 'memory_item', 'effect'] as const;

export type PicoSupplierSlot = typeof picoSupplierSlots[number];

/**
 * ADR 0136. Separated by the ADR 0118 offline floor, which is a categorical
 * test rather than a matter of degree: a library answers from local disk and
 * may be part of the floor, a bridge needs the network per query and never can.
 */
export const picoSupplierKinds = ['bridge', 'library'] as const;

export type PicoSupplierKind = typeof picoSupplierKinds[number];

/**
 * ADR 0136 BR6. The asymmetry the floor draws between the two kinds.
 *
 * A library answers from local disk, so an operation over it can belong to an
 * ADR 0118 floor family - `local_recall` already promises "finding and reading
 * what is already on the device", and a working copy is on the device. A bridge
 * needs the network per query and can never be on the floor, whatever it
 * declares and however reliable its provider happens to be.
 *
 * This is a categorical test rather than a matter of degree, which is why it is
 * a function of the kind alone and takes nothing else. A bridge that answered
 * from a cache would still be a bridge: the floor promises the *operation*, and
 * an operation that needs a network on the query after next does not become a
 * floor operation by having succeeded once.
 */
export function picoSupplierMayBeOnOfflineFloor(kind: PicoSupplierKind): boolean {
  return kind === 'library';
}

/**
 * ADR 0137 IN1. A person-chosen token. Working copies move, are re-cloned and
 * change host; a camper van's Home Assistant changes IP at every campsite. An
 * identifier that was a path or a URL would lose its meaning to a `mv` or a
 * DHCP lease, and take the provenance of everything derived from it along.
 */
export const picoSupplierIdentifierPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;

export const picoSupplierCoveragePattern = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/u;


export const maxPicoSupplierCoverage = 64;

export interface PicoSupplierManifest {
  /** ADR 0137 IN1. Stable, person-chosen, never a path and never an address. */
  identifier: string;
  kind: PicoSupplierKind;
  /** ADR 0136 BR1. Which core shapes this fills. */
  slots: readonly PicoSupplierSlot[];
  /** ADR 0137 IN2. What it covers, which decides union against alternative. */
  coverage: readonly string[];
  /** ADR 0136 BR7 / ADR 0137 IN5. Exactly one, and never a Pico. */
  privacyDomain: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function assertIdentifier(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('invalid_pico_supplier_identifier');
  }
  // Named separately from a shape failure, because these are the two things a
  // person would reach for first and the reason to refuse them is not "wrong
  // characters" but "that is not an identity".
  // Address before path, because a URL contains a slash and is more
  // specifically an address than a path - reporting it as a path would name
  // the wrong reason for a correct refusal.
  if (value.includes(':') || /\d+\.\d+\.\d+\.\d+/u.test(value)) {
    throw new Error('pico_supplier_identifier_is_not_an_address');
  }
  if (value.includes('/') || value.includes('\\')) {
    throw new Error('pico_supplier_identifier_is_not_a_path');
  }
  if (!picoSupplierIdentifierPattern.test(value)) {
    throw new Error('invalid_pico_supplier_identifier');
  }
  return value;
}

/** ADR 0136 BR1 and ADR 0137 IN1/IN2. The four things a supplier declares. */
export interface PicoSupplierDeclaration {
  identifier: string;
  kind: PicoSupplierKind;
  slots: readonly PicoSupplierSlot[];
  coverage: readonly string[];
}

/**
 * ADR 0136 BR1 and ADR 0137 IN1/IN2. What a supplier declares about itself,
 * checked once wherever it is declared.
 *
 * A supplier is declared in two places in this protocol: standalone, where it
 * also names the privacy domain it answers in (ADR 0137 IN5), and inside a
 * depot's manifest, where it names an entry point and a protocol version
 * instead (ADR 0143 DP3). What surrounds a declaration differs. The
 * declaration does not, and this is it.
 *
 * **Written once because the depot half had already drifted.** Measured on
 * 2026-09-11: the two walks accepted and refused exactly the same values, so
 * nothing was reachable through one and not the other - but the depot half
 * answered `invalid_pico_supplier_identifier` where this one answers
 * `pico_supplier_identifier_is_not_an_address`, and folded an oversized
 * coverage list into the generic refusal too. The named refusals exist because
 * "wrong characters" tells an author to hunt for a typo; and a depot manifest
 * is written by a **third party**, so the place with the strongest reason to
 * name them was the place that did not.
 */
export function assertPicoSupplierDeclaration(
  record: Record<string, unknown>,
): PicoSupplierDeclaration {
  const identifier = assertIdentifier(record.identifier);

  if (typeof record.kind !== 'string'
    || !(picoSupplierKinds as readonly string[]).includes(record.kind)) {
    throw new Error('invalid_pico_supplier_kind');
  }

  if (!Array.isArray(record.slots) || record.slots.length === 0) {
    // Absent is not empty, and empty is not a supplier. Something that fills
    // no slot supplies nothing.
    throw new Error('invalid_pico_supplier_slots');
  }
  for (const slot of record.slots as unknown[]) {
    if (typeof slot !== 'string' || !(picoSupplierSlots as readonly string[]).includes(slot)) {
      // BR1. A boundary error, not a review comment.
      throw new Error('pico_supplier_slot_not_listed');
    }
  }
  if (new Set(record.slots as string[]).size !== record.slots.length) {
    throw new Error('duplicate_pico_supplier_slot');
  }

  if (!Array.isArray(record.coverage) || record.coverage.length === 0) {
    // IN2/IN3. Undeclared coverage would make an empty answer permanently
    // ambiguous: a subject never asked about looks identical to one not
    // covered.
    throw new Error('invalid_pico_supplier_coverage');
  }
  if (record.coverage.length > maxPicoSupplierCoverage) {
    throw new Error('pico_supplier_coverage_too_large');
  }
  for (const entry of record.coverage as unknown[]) {
    if (typeof entry !== 'string' || !picoSupplierCoveragePattern.test(entry)) {
      throw new Error('invalid_pico_supplier_coverage');
    }
  }
  if (new Set(record.coverage as string[]).size !== record.coverage.length) {
    throw new Error('duplicate_pico_supplier_coverage');
  }

  return Object.freeze({
    identifier,
    kind: record.kind as PicoSupplierKind,
    slots: Object.freeze([...(record.slots as PicoSupplierSlot[])]),
    coverage: Object.freeze([...(record.coverage as string[])]),
  });
}

/**
 * ADR 0136 BR1 and ADR 0137 IN1/IN2. Refuses rather than repairing, for
 * ADR 0117 X2's reason: a manifest that half-parsed is one nobody declared.
 */
export function parsePicoSupplierManifest(value: unknown): PicoSupplierManifest {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_supplier_manifest');
  }
  assertExactKeys(record, ['identifier', 'kind', 'slots', 'coverage', 'privacyDomain'], 'invalid_pico_supplier_manifest');

  const declaration = assertPicoSupplierDeclaration(record);

  if (typeof record.privacyDomain !== 'string'
    || !isPicoPrivacyDomain(record.privacyDomain)) {
    throw new Error('invalid_pico_supplier_domain');
  }

  return Object.freeze({
    ...declaration,
    privacyDomain: record.privacyDomain,
  });
}

/**
 * ADR 0137 IN2. Whether two suppliers substitute for one another or add up.
 *
 * - `unrelated` - they share no slot. ADR 0118 O2's rule: nothing substitutes
 *   across slots, and HDMI is not Ethernet.
 * - `alternatives` - same slot, identical coverage. Two AIS providers over the
 *   same ships; keeping both is paying twice for one answer.
 * - `additive` - same slot, and each covers something the other does not.
 *   Three Home Assistants over three buildings; two knowledge bases over
 *   different material.
 *
 * Partial overlap answers `additive`, deliberately. Two providers where one
 * covers strictly more are not interchangeable, and calling them alternatives
 * would licence dropping the one that knows more.
 */
export type PicoSupplierRelation = 'unrelated' | 'alternatives' | 'additive';

export function picoSupplierRelation(
  a: PicoSupplierManifest,
  b: PicoSupplierManifest,
): PicoSupplierRelation {
  const slotsOfB = new Set(b.slots);
  if (!a.slots.some((slot) => slotsOfB.has(slot))) {
    return 'unrelated';
  }
  const coverageOfA = new Set(a.coverage);
  const coverageOfB = new Set(b.coverage);
  const aHasMore = a.coverage.some((entry) => !coverageOfB.has(entry));
  const bHasMore = b.coverage.some((entry) => !coverageOfA.has(entry));
  return aHasMore || bHasMore ? 'additive' : 'alternatives';
}

/**
 * ADR 0137 IN2. Whether an instance claims to cover a subject at all.
 *
 * The caller asks before it asks the supplier, so `out of scope` can be
 * answered without spending money or disclosure (ADR 0138).
 */
export function picoSupplierCovers(
  manifest: PicoSupplierManifest,
  subject: string,
): boolean {
  return manifest.coverage.includes(subject);
}
