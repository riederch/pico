import { describe, expect, it } from 'vitest';
import { picoSupplierSlots } from './supplier.js';
import {
  MAX_PICO_SUPPLIER_FRAME_BYTES,
  assertPicoSupplierRequestFamily,
  isPicoSupplierRequestFamily,
  picoSupplierLifecycleFamilies,
  picoSupplierProtocolVersion,
  picoSupplierRequestFamilies,
  picoSupplierRequestFamilyForSlot,
  picoSupplierResponseFamily,
  picoSupplierSlotsWithoutFamily,
} from './supplier-transport.js';

describe('pico supplier transport (ADR 0136 BR2)', () => {
  it('gives every slot in the closed list exactly one family', () => {
    expect(picoSupplierSlotsWithoutFamily()).toEqual([]);

    const families = picoSupplierSlots.map((slot) => picoSupplierRequestFamilyForSlot(slot));
    expect(new Set(families).size).toBe(picoSupplierSlots.length);
    expect(families).toEqual([
      picoSupplierRequestFamilies.observe,
      picoSupplierRequestFamilies.offer,
      picoSupplierRequestFamilies.cause,
    ]);
  });

  it('has no family a supplier could use to call in', () => {
    // ADR 0136: a supplier carries, it never decides. The transport says so by
    // having nothing pointing inward - no notify, no push, no subscribe. A
    // supplier that appears to act on its own is the core having asked
    // (ADR 0143 DP8).
    const inbound = Object.entries(picoSupplierRequestFamilies)
      .filter(([name]) => /notify|push|subscribe|event|publish|announce/u.test(name));
    expect(inbound).toEqual([]);
    expect(Object.keys(picoSupplierRequestFamilies).sort()).toEqual([
      'cause',
      'condition',
      'hello',
      'observe',
      'offer',
    ]);
  });

  it('refuses an unlisted family rather than interpreting it', () => {
    expect(isPicoSupplierRequestFamily(picoSupplierRequestFamilies.observe)).toBe(true);
    expect(isPicoSupplierRequestFamily('pico.supplier.observe.v2')).toBe(false);
    expect(isPicoSupplierRequestFamily(picoSupplierResponseFamily)).toBe(false);
    expect(isPicoSupplierRequestFamily(undefined)).toBe(false);

    expect(() => assertPicoSupplierRequestFamily('pico.supplier.notify.v1'))
      .toThrow('pico_supplier_request_family_not_listed');
    expect(assertPicoSupplierRequestFamily(picoSupplierRequestFamilies.cause))
      .toBe(picoSupplierRequestFamilies.cause);
  });

  it('keeps the two slotless families separate from the three that carry a slot', () => {
    const slotFamilies = new Set(
      picoSupplierSlots.map((slot) => picoSupplierRequestFamilyForSlot(slot)),
    );
    for (const family of picoSupplierLifecycleFamilies) {
      // ADR 0138 CO2 needs a state that is askable before anything is spent, so
      // condition must not be one of the families that does work.
      expect(slotFamilies.has(family)).toBe(false);
    }
    expect([...picoSupplierLifecycleFamilies, ...slotFamilies].length)
      .toBe(Object.keys(picoSupplierRequestFamilies).length);
  });

  it('names one version and one response family', () => {
    expect(picoSupplierProtocolVersion).toBe(1);
    expect(picoSupplierResponseFamily).toBe('pico.supplier.response.v1');
    for (const family of Object.values(picoSupplierRequestFamilies)) {
      expect(family.startsWith('pico.supplier.')).toBe(true);
      expect(family.endsWith('.v1')).toBe(true);
    }
  });

  it('caps a frame at one answer rather than at a corpus', () => {
    // ADR 0133/0136: a library is read where it lies. A ceiling large enough to
    // stream a corpus through this socket would make ingesting the cheaper path.
    expect(MAX_PICO_SUPPLIER_FRAME_BYTES).toBe(128 * 1024);
  });
});
