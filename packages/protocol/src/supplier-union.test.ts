import { describe, expect, it } from 'vitest';

import { unionPicoSupplierAnswers } from './supplier-union.js';

const house = (identifier: string, value: boolean) => ({
  identifier,
  condition: 'ok' as const,
  pin: null,
  values: [{ subject: 'motion', value }],
});

describe('ADR 0137 IN4 - a union names who was silent', () => {
  it('unions three houses that all answered', () => {
    const union = unionPicoSupplierAnswers([
      house('ha-zuhause', false),
      house('ha-wohnmobil', false),
      house('ha-ferienhaus', false),
    ]);
    expect(union.incomplete).toBe(false);
    expect(union.silent).toEqual([]);
    expect(union.agreed[0]?.value).toBe(false);
    expect(union.agreed[0]?.from.map((f) => f.identifier))
      .toEqual(['ha-zuhause', 'ha-wohnmobil', 'ha-ferienhaus']);
  });

  it('names the camper that did not answer, rather than reporting on two of three', () => {
    // "No motion anywhere" over two of three houses is a true sentence about
    // the wrong subject, and it reads as safety.
    const union = unionPicoSupplierAnswers([
      house('ha-zuhause', false),
      { identifier: 'ha-wohnmobil', condition: 'unreachable', pin: null, values: [] },
      house('ha-ferienhaus', false),
    ]);
    expect(union.incomplete).toBe(true);
    expect(union.silent).toEqual([{ identifier: 'ha-wohnmobil', condition: 'unreachable' }]);
  });

  it('counts out_of_scope and not_configured as silence too', () => {
    const union = unionPicoSupplierAnswers([
      { identifier: 'a', condition: 'out_of_scope', pin: null, values: [] },
      { identifier: 'b', condition: 'not_configured', pin: null, values: [] },
    ]);
    expect(union.incomplete).toBe(true);
    expect(union.silent.map((s) => s.condition)).toEqual(['out_of_scope', 'not_configured']);
  });

  it('keeps a stale or partial answer as an answer', () => {
    // Named rather than folded into a failure: they carry content.
    const union = unionPicoSupplierAnswers([
      { ...house('a', true), condition: 'stale_but_present' },
      { ...house('b', true), condition: 'partial' },
    ]);
    expect(union.incomplete).toBe(false);
    expect(union.agreed).toHaveLength(1);
  });
});

describe('ADR 0137 IN4 - disagreement is reported, never resolved', () => {
  it('returns both answers with identifiers and pins, and no winner', () => {
    const union = unionPicoSupplierAnswers([
      { identifier: 'rchkb', condition: 'ok', pin: 'commit-a', values: [{ subject: 'iban', value: 'DE1' }] },
      { identifier: 'wwgkb', condition: 'ok', pin: 'commit-b', values: [{ subject: 'iban', value: 'DE2' }] },
    ]);
    expect(union.agreed).toEqual([]);
    expect(union.disagreed).toEqual([{
      subject: 'iban',
      answers: [
        { identifier: 'rchkb', pin: 'commit-a', value: 'DE1' },
        { identifier: 'wwgkb', pin: 'commit-b', value: 'DE2' },
      ],
    }]);
  });

  it('has no precedence to configure, by construction', () => {
    // Not "no default order" - no order at all. A silent winner would be a
    // decision taken by a supplier.
    const forward = unionPicoSupplierAnswers([
      { identifier: 'a', condition: 'ok', pin: null, values: [{ subject: 's', value: 1 }] },
      { identifier: 'b', condition: 'ok', pin: null, values: [{ subject: 's', value: 2 }] },
    ]);
    expect(forward.disagreed[0]?.answers).toHaveLength(2);
    expect(forward.agreed).toEqual([]);
  });

  it('separates agreement on one subject from disagreement on another', () => {
    const union = unionPicoSupplierAnswers([
      { identifier: 'a', condition: 'ok', pin: null, values: [{ subject: 'x', value: 1 }, { subject: 'y', value: 7 }] },
      { identifier: 'b', condition: 'ok', pin: null, values: [{ subject: 'x', value: 1 }, { subject: 'y', value: 8 }] },
    ]);
    expect(union.agreed.map((a) => a.subject)).toEqual(['x']);
    expect(union.disagreed.map((d) => d.subject)).toEqual(['y']);
  });

  it('refuses two answers from one instance instead of unioning them', () => {
    // A caller bug, and unioning it would invent a disagreement the instance
    // never had.
    expect(() => unionPicoSupplierAnswers([
      { identifier: 'a', condition: 'ok', pin: null, values: [{ subject: 's', value: 1 }] },
      { identifier: 'a', condition: 'ok', pin: null, values: [{ subject: 's', value: 2 }] },
    ])).toThrow('duplicate_pico_supplier_answer');
  });

  it('refuses a condition outside the vocabulary', () => {
    expect(() => unionPicoSupplierAnswers([
      { identifier: 'a', condition: 'error' as never, pin: null, values: [] },
    ])).toThrow('invalid_pico_supplier_condition');
  });
});
