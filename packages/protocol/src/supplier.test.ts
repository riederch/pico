import { describe, expect, it } from 'vitest';

import {
  parsePicoSupplierManifest,
  picoSupplierCovers,
  picoSupplierRelation,
  picoSupplierSlots,
} from './supplier.js';

const wellFormed = {
  identifier: 'rchkb',
  kind: 'library',
  slots: ['memory_item'],
  coverage: ['finanz'],
  privacyDomain: 'finanz',
} as const;

const parse = (over: Record<string, unknown> = {}) =>
  parsePicoSupplierManifest({ ...wellFormed, ...over });

describe('ADR 0136 BR1 - the slot list is closed', () => {
  it('holds three slots and no more', () => {
    // Events are deliberately not one: origin is server-assigned at intake
    // under ADR 0116 W1, and a supplier that could write an event directly
    // could claim its own origin.
    expect(picoSupplierSlots).toEqual(['observation', 'memory_item', 'effect']);
  });

  it('accepts a manifest that fills a listed slot', () => {
    expect(parse().slots).toEqual(['memory_item']);
    expect(parse({ slots: ['observation', 'effect'] }).slots).toEqual(['observation', 'effect']);
  });

  it('refuses a slot the core does not own, as a boundary error', () => {
    expect(() => parse({ slots: ['event'] })).toThrow('pico_supplier_slot_not_listed');
    expect(() => parse({ slots: ['vessel_position'] })).toThrow('pico_supplier_slot_not_listed');
  });

  it('refuses a supplier that fills no slot at all', () => {
    expect(() => parse({ slots: [] })).toThrow('invalid_pico_supplier_slots');
  });

  it('refuses the same slot twice', () => {
    expect(() => parse({ slots: ['memory_item', 'memory_item'] }))
      .toThrow('duplicate_pico_supplier_slot');
  });
});

describe('ADR 0137 IN1 - an instance is named, and never by address', () => {
  it('accepts a person-chosen token', () => {
    expect(parse({ identifier: 'wwgkb' }).identifier).toBe('wwgkb');
    expect(parse({ identifier: 'ha-ferienhaus' }).identifier).toBe('ha-ferienhaus');
  });

  it('refuses a path, because a working copy moves', () => {
    expect(() => parse({ identifier: '../rchkb' }))
      .toThrow('pico_supplier_identifier_is_not_a_path');
    expect(() => parse({ identifier: '/home/rch/rchkb' }))
      .toThrow('pico_supplier_identifier_is_not_a_path');
  });

  it('refuses an address, because a camper van changes IP at every campsite', () => {
    expect(() => parse({ identifier: 'https://ha.local' }))
      .toThrow('pico_supplier_identifier_is_not_an_address');
    expect(() => parse({ identifier: '192.168.1.5' }))
      .toThrow('pico_supplier_identifier_is_not_an_address');
    expect(() => parse({ identifier: 'ha.local:8123' }))
      .toThrow('pico_supplier_identifier_is_not_an_address');
  });

  it('refuses a kind outside bridge and library', () => {
    expect(() => parse({ kind: 'skill' })).toThrow('invalid_pico_supplier_kind');
  });
});

describe('ADR 0137 IN5 - one instance, one Private Space', () => {
  it('requires exactly one domain, as a token', () => {
    expect(parse({ privacyDomain: 'privat' }).privacyDomain).toBe('privat');
    expect(() => parse({ privacyDomain: 'Finanz und Privat' }))
      .toThrow('invalid_pico_supplier_domain');
  });
});

describe('ADR 0137 IN2 - coverage decides whether instances add up', () => {
  const ais = (identifier: string, coverage: readonly string[]) => parse({
    identifier,
    kind: 'bridge',
    slots: ['observation'],
    coverage,
  });

  it('requires declared coverage, so an empty answer is never ambiguous', () => {
    expect(() => parse({ coverage: [] })).toThrow('invalid_pico_supplier_coverage');
  });

  it('calls two providers over the same subject alternatives', () => {
    // Metering makes keeping both a matter of paying twice for one answer.
    expect(picoSupplierRelation(
      ais('vesselfinder', ['ships']),
      ais('other-ais', ['ships']),
    )).toBe('alternatives');
  });

  it('calls three houses additive, though they are bridges', () => {
    // The rule an earlier ADR 0136 draft got wrong: the axis is the subject,
    // not the supplier kind.
    const home = ais('ha-zuhause', ['zuhause']);
    const camper = ais('ha-wohnmobil', ['wohnmobil']);
    expect(picoSupplierRelation(home, camper)).toBe('additive');
  });

  it('calls two knowledge bases over different material additive', () => {
    expect(picoSupplierRelation(
      parse({ identifier: 'rchkb', coverage: ['privat'] }),
      parse({ identifier: 'wwgkb', coverage: ['verein'] }),
    )).toBe('additive');
  });

  it('calls partial overlap additive rather than interchangeable', () => {
    // One knows strictly more; calling them alternatives would licence
    // dropping the one that knows more.
    expect(picoSupplierRelation(
      ais('wide', ['adria', 'ostsee']),
      ais('narrow', ['ostsee']),
    )).toBe('additive');
  });

  it('calls suppliers on different slots unrelated', () => {
    // ADR 0118 O2: nothing substitutes across slots. HDMI is not Ethernet.
    expect(picoSupplierRelation(
      ais('ha-zuhause', ['zuhause']),
      parse({ identifier: 'rchkb', slots: ['memory_item'], coverage: ['zuhause'] }),
    )).toBe('unrelated');
  });

  it('answers whether a subject is covered before anything is spent', () => {
    const kb = parse({ coverage: ['finanz', 'privat'] });
    expect(picoSupplierCovers(kb, 'finanz')).toBe(true);
    expect(picoSupplierCovers(kb, 'feuerwehr')).toBe(false);
  });
});
