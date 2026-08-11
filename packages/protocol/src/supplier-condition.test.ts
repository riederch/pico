import { describe, expect, it } from 'vitest';

import {
  assertPicoSupplierCondition,
  picoSupplierConditionCarriesContent,
  picoSupplierConditionNeedsPerson,
  picoSupplierConditionResolvesItself,
  picoSupplierConditionSpentNothing,
  picoSupplierConditions,
  evaluatePicoSupplierLimit,
  picoSupplierLimitCondition,
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

describe('ADR 0138 CO5 - a limit is announced, not discovered', () => {
  it('says nothing while there is room', () => {
    expect(evaluatePicoSupplierLimit({ used: 10, ceiling: 100 })).toBe('normal');
  });

  it('speaks while a person can still act on it', () => {
    // The ADR 0119 Q5 posture: told while there is still room, never as a
    // surprise afterwards.
    expect(evaluatePicoSupplierLimit({ used: 90, ceiling: 100 })).toBe('approaching');
    expect(evaluatePicoSupplierLimit({ used: 95, ceiling: 100 })).toBe('approaching');
  });

  it('reports reached at the ceiling and beyond', () => {
    expect(evaluatePicoSupplierLimit({ used: 100, ceiling: 100 })).toBe('reached');
    expect(evaluatePicoSupplierLimit({ used: 101, ceiling: 100 })).toBe('reached');
  });

  it('treats an unreadable usage as reached rather than as room', () => {
    // The one case that cannot be measured must not be the one case that is
    // unprotected.
    expect(evaluatePicoSupplierLimit({ used: Number.NaN, ceiling: 100 })).toBe('reached');
    expect(evaluatePicoSupplierLimit({ used: -1, ceiling: 100 })).toBe('reached');
  });

  it('refuses a nonsense ceiling or headroom rather than guessing one', () => {
    expect(() => evaluatePicoSupplierLimit({ used: 1, ceiling: 0 }))
      .toThrow('invalid_pico_supplier_limit_ceiling');
    expect(() => evaluatePicoSupplierLimit({ used: 1, ceiling: 100, headroom: 1 }))
      .toThrow('invalid_pico_supplier_limit_headroom');
  });

  it('names which limit was reached, because they are answered differently', () => {
    // rate_limited resolves itself and needs nobody; budget_exhausted resolves
    // itself never and needs a person.
    expect(picoSupplierLimitCondition({ kind: 'rate', state: 'reached' })).toBe('rate_limited');
    expect(picoSupplierLimitCondition({ kind: 'budget', state: 'reached' }))
      .toBe('budget_exhausted');
  });

  it('reports no condition while the limit still has room', () => {
    for (const state of ['normal', 'approaching'] as const) {
      expect(picoSupplierLimitCondition({ kind: 'budget', state })).toBeNull();
    }
  });
});
