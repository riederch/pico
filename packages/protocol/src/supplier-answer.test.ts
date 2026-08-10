import { describe, expect, it } from 'vitest';

import { lowestPicoConfidence, picoConfidenceLevels } from './confidence.js';
import {
  buildPicoSupplierAnswer,
  parsePicoSupplierAnswer,
  picoSupplierAnswerSchema,
  picoSupplierCacheAgeMs,
  picoSupplierContentAgeMs,
} from './supplier-answer.js';

const asked = '2026-08-10T12:00:00.000Z';
const measured = '2026-08-10T06:00:00.000Z';
const now = '2026-08-10T12:05:00.000Z';

const bridge = () => buildPicoSupplierAnswer({
  askedAt: asked,
  measured: { kind: 'instant', at: measured },
  confidence: 'medium',
  value: 'adria',
});

describe('ADR 0136 BR4 - asked, measured and certain are three facts', () => {
  it('keeps the cache age and the content age apart, by name', () => {
    // Issue #4 states this in its own words. A six-hour-old position shown as
    // a live one is not a stale answer, it is a false one.
    const answer = bridge();
    expect(picoSupplierCacheAgeMs(answer, now)).toBe(5 * 60 * 1000);
    expect(picoSupplierContentAgeMs(answer, now)).toBe(6 * 60 * 60 * 1000 + 5 * 60 * 1000);
  });

  it('answers null for a library rather than zero', () => {
    // A commit is not a time, and `0` would be the confusion this file exists
    // to prevent, dressed as a convenience.
    const library = buildPicoSupplierAnswer({
      askedAt: asked,
      measured: { kind: 'pin', value: 'commit-abc' },
      confidence: 'high',
      value: 'iban',
    });
    expect(picoSupplierContentAgeMs(library, now)).toBeNull();
    expect(picoSupplierCacheAgeMs(library, now)).toBe(5 * 60 * 1000);
  });

  it('refuses a measurement that is neither an instant nor a pin', () => {
    expect(() => buildPicoSupplierAnswer({
      askedAt: asked,
      measured: { kind: 'guess' } as never,
      confidence: 'low',
      value: 1,
    })).toThrow('invalid_pico_supplier_measurement');
  });
});

describe('ADR 0136 BR4 - a value cannot be built without its certainty', () => {
  it('refuses a missing confidence under its own error', () => {
    // Not a value with a default: one nobody measured.
    const { confidence, ...withoutConfidence } = {
      askedAt: asked,
      measured: { kind: 'instant' as const, at: measured },
      confidence: 'low' as const,
      value: 1,
    };
    expect(() => buildPicoSupplierAnswer(withoutConfidence as never))
      .toThrow('invalid_pico_supplier_answer_shape');
    expect(confidence).toBe('low');
  });

  it('refuses a confidence outside the three levels', () => {
    expect(picoConfidenceLevels).toEqual(['low', 'medium', 'high']);
    expect(() => buildPicoSupplierAnswer({
      askedAt: asked,
      measured: { kind: 'instant', at: measured },
      confidence: 'certain' as never,
      value: 1,
    })).toThrow('pico_supplier_answer_requires_confidence');
  });

  it('takes the lowest confidence across sources, refusing an empty list', () => {
    expect(lowestPicoConfidence(['high', 'low', 'medium'])).toBe('low');
    expect(() => lowestPicoConfidence([]))
      .toThrow('pico_confidence_derivation_requires_sources');
  });
});

describe('ADR 0136 BR4 - a supplier cannot claim a person confirmed it', () => {
  it('has no parameter for confirmation, and always answers false', () => {
    // ADR 0117 X1's construction: a boolean that could be true invites a call
    // site to set it.
    expect(bridge().confirmedByPerson).toBe(false);
    expect(() => buildPicoSupplierAnswer({
      askedAt: asked,
      measured: { kind: 'instant', at: measured },
      confidence: 'high',
      value: 1,
      confirmedByPerson: true,
    } as never)).toThrow('invalid_pico_supplier_answer_shape');
  });

  it('refuses a claimed confirmation on the parse path, under its own error', () => {
    expect(() => parsePicoSupplierAnswer({ ...bridge(), confirmedByPerson: true }))
      .toThrow('pico_supplier_answer_cannot_claim_confirmation');
  });

  it('round-trips an honest answer', () => {
    const answer = bridge();
    expect(parsePicoSupplierAnswer(JSON.parse(JSON.stringify(answer)))).toEqual(answer);
    expect(answer.schema).toBe(picoSupplierAnswerSchema);
  });

  it('refuses an undeclared extra field rather than dropping it', () => {
    expect(() => parsePicoSupplierAnswer({ ...bridge(), certainty: 'total' }))
      .toThrow('invalid_pico_supplier_answer_shape');
  });
});
