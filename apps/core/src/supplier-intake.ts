import type { PicoEventOriginClass } from '@pico/protocol';
import { picoSupplierSlots, type PicoSupplierSlot } from '@pico/protocol/supplier';

/**
 * ADR 0136 BR3 - what a supplier hands over, and what the core makes of it.
 *
 * Everything crossing a slot inward carries `external_content`, and the
 * supplier has **no way to express a class at all**. That is the construction
 * this tree uses wherever a component must not be able to describe its own
 * standing - `picoReaderCapabilities` in ADR 0117 X1, `confirmedByPerson` in
 * ADR 0136 BR4, the argument origin in ADR 0139 AC2 - and it is the fourth
 * place it appears because it is the only guard that does not depend on the
 * guarded thing behaving.
 *
 * ADR 0128 H4 settled the same rule for the Home Assistant connector, and the
 * wording there is worth repeating: the core assigns the class **without
 * asking**. A supplier that could say `person_present` about a line from a
 * stranger's mail would perform the laundering step ADR 0117 X2 exists to
 * break, through the field designed to prevent it.
 *
 * The other half of BR3 is a comparison rather than an assertion - an item
 * that arrived through a slot and an ordinary memory item must give identical
 * results through crypto-shred, retention sweep and backup/restore. That lives
 * in `supplier-custody.test.ts`, in the shape ADR 0127 M1's proof already has,
 * because "no supplier-specific handling" is not something a comment can
 * claim.
 */
export interface PicoSupplierOffering {
  /** Which core shape this fills (ADR 0136 BR1). */
  slot: PicoSupplierSlot;
  /** The instance it came from (ADR 0137 IN1). */
  supplierIdentifier: string;
  contentType: string;
  content: string;
}

export interface PicoSupplierIntake extends PicoSupplierOffering {
  /**
   * Assigned here and nowhere else. There is no parameter for it above, so a
   * supplier holding a claimed class has nowhere to put it.
   */
  originClass: PicoEventOriginClass;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ADR 0136 BR3. Takes what a supplier offered and says where it came from.
 *
 * Refuses an offering that carries an origin class of its own, under its own
 * error, because a supplier asserting provenance is the attack rather than a
 * typo - the same distinction ADR 0139 AC2 draws for an action argument.
 */
export function intakePicoSupplierContent(offering: unknown): PicoSupplierIntake {
  const record = isRecord(offering) ? offering : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_supplier_offering');
  }
  if ('originClass' in record) {
    throw new Error('pico_supplier_cannot_declare_origin');
  }
  const keys = Object.keys(record).sort();
  const expected = ['content', 'contentType', 'slot', 'supplierIdentifier'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_pico_supplier_offering');
  }
  if (typeof record.slot !== 'string'
    || !(picoSupplierSlots as readonly string[]).includes(record.slot)) {
    throw new Error('pico_supplier_slot_not_listed');
  }
  if (typeof record.supplierIdentifier !== 'string' || record.supplierIdentifier === '') {
    throw new Error('invalid_pico_supplier_offering');
  }
  if (typeof record.contentType !== 'string' || record.contentType === '') {
    throw new Error('invalid_pico_supplier_offering');
  }
  if (typeof record.content !== 'string') {
    throw new Error('invalid_pico_supplier_offering');
  }

  return Object.freeze({
    slot: record.slot as PicoSupplierSlot,
    supplierIdentifier: record.supplierIdentifier,
    contentType: record.contentType,
    content: record.content,
    // ADR 0128 H4: the core assigns, without asking.
    originClass: 'external_content' as const,
  });
}
