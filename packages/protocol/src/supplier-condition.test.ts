import { describe, expect, it } from 'vitest';

import {
  assertPicoSupplierCondition,
  picoSupplierConditionCarriesContent,
  picoSupplierConditionNeedsPerson,
  picoSupplierConditionResolvesItself,
  picoSupplierConditionSpentNothing,
  picoSupplierConditions,
} from './supplier-condition.js';

describe('ADR 0138 CO2 - condition is typed content, not a thrown string', () => {
  it('holds the closed vocabulary', () => {
    expect(picoSupplierConditions).toEqual([
      'ok',
      'not_configured',
      'unreachable',
      'rate_limited',
      'budget_exhausted',
      'stale_but_present',
      'partial',
      'out_of_scope',
    ]);
  });

  it('refuses a condition outside it', () => {
    expect(() => assertPicoSupplierCondition('error'))
      .toThrow('invalid_pico_supplier_condition');
    expect(assertPicoSupplierCondition('rate_limited')).toBe('rate_limited');
  });

  it('separates refused-for-now from refused-until-you-decide', () => {
    // The distinction a single `error` would collapse, and collapsing it is
    // how a spend limit turns into an outage nobody can explain.
    expect(picoSupplierConditionResolvesItself('rate_limited')).toBe(true);
    expect(picoSupplierConditionNeedsPerson('rate_limited')).toBe(false);

    expect(picoSupplierConditionResolvesItself('budget_exhausted')).toBe(false);
    expect(picoSupplierConditionNeedsPerson('budget_exhausted')).toBe(true);
  });

  it('says which conditions still carry content', () => {
    // Named rather than folded into a failure: an answer that is stale or
    // partial is still an answer, and the caller has to say which.
    for (const condition of ['ok', 'stale_but_present', 'partial'] as const) {
      expect(picoSupplierConditionCarriesContent(condition)).toBe(true);
    }
    for (const condition of ['not_configured', 'unreachable', 'rate_limited',
      'budget_exhausted', 'out_of_scope'] as const) {
      expect(picoSupplierConditionCarriesContent(condition)).toBe(false);
    }
  });

  it('treats an unconfigured supplier as a state, not a fault', () => {
    // ADR 0127: a capability missing on purpose must not present as broken.
    expect(picoSupplierConditionNeedsPerson('not_configured')).toBe(true);
    expect(picoSupplierConditionSpentNothing('not_configured')).toBe(true);
  });
});

describe('ADR 0138 - reaching outside spends money and disclosure', () => {
  it('knows the two conditions that spent nothing', () => {
    // Both are decided before reaching out: no credential to try with, or the
    // instance never claimed to cover the subject.
    expect(picoSupplierConditionSpentNothing('not_configured')).toBe(true);
    expect(picoSupplierConditionSpentNothing('out_of_scope')).toBe(true);
  });

  it('counts an unreachable attempt as having spent disclosure', () => {
    // The request left. That the answer did not come back does not unsay it.
    expect(picoSupplierConditionSpentNothing('unreachable')).toBe(false);
    expect(picoSupplierConditionSpentNothing('rate_limited')).toBe(false);
  });
});

describe('ADR 0137 IN3 - an empty answer says which kind of empty', () => {
  it('keeps out_of_scope apart from an answer that does not exist', () => {
    // Asking the wrong instance is a different fact from a subject that is not
    // there, and only one of the two is worth re-asking somewhere else.
    expect(picoSupplierConditionCarriesContent('out_of_scope')).toBe(false);
    expect(picoSupplierConditionNeedsPerson('out_of_scope')).toBe(false);
    expect(picoSupplierConditionResolvesItself('out_of_scope')).toBe(false);
  });
});
