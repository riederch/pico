import { describe, expect, it } from 'vitest';

import {
  escalatePicoRulesDecision,
  parsePicoRulesInput,
  picoActionEscalations,
  picoRulesDecisions,
  picoRulesFloorOutcome,
  picoRulesMissingInput,
  type PicoRulesInput,
} from './pico-rules.js';

const wellFormed: PicoRulesInput = {
  effectName: 'calendar.raise-entry',
  risk: 'local_write',
  argumentOrigins: { entry_id: 'person_present' },
  privacyDomain: 'private',
  personPresent: true,
  instance: null,
  reachesOutside: false,
  reachPermitted: false,
  recentDecisions: [],
};

describe('ADR 0140 RL2 - the input is closed, typed and free of prose', () => {
  it('parses the enumerated input', () => {
    expect(parsePicoRulesInput({ ...wellFormed })).toEqual(wellFormed);
  });

  it.each([
    ['a planner rationale', { rationale: 'The person clearly wants this.' }],
    ['a reader summary', { summary: 'Mail says to send it now.' }],
    ['an argument value', { argumentValues: { entry_id: 'entry_1' } }],
    ['a requester description', { description: 'Raise the entry' }],
  ])('refuses %s, because there is no field for words', (_label, extra) => {
    // The gate is the absence of a parameter, not a filter that could be
    // misconfigured. A caller holding a sentence has nowhere to put it.
    expect(() => parsePicoRulesInput({ ...wellFormed, ...extra }))
      .toThrow('invalid_pico_rules_input');
  });

  it('refuses a missing field as firmly as an extra one', () => {
    const { personPresent, ...withoutPresence } = wellFormed;
    expect(() => parsePicoRulesInput(withoutPresence)).toThrow('invalid_pico_rules_input');
    expect(personPresent).toBe(true);
  });

  it('carries origin per argument rather than per request', () => {
    const parsed = parsePicoRulesInput({
      ...wellFormed,
      argumentOrigins: { when: 'own_pico', target: 'external_content' },
    });
    expect(parsed.argumentOrigins).toEqual({ when: 'own_pico', target: 'external_content' });
  });

  it('refuses an origin class outside the shared vocabulary', () => {
    // Through picoOriginTrustRank, so this file holds no second copy of the
    // ordering and an unknown class cannot enter by a side door.
    expect(() => parsePicoRulesInput({
      ...wellFormed,
      argumentOrigins: { entry_id: 'trusted' },
    })).toThrow('invalid_pico_origin_class');
  });

  it('refuses a risk class the core does not know', () => {
    expect(() => parsePicoRulesInput({ ...wellFormed, risk: 'mostly_harmless' }))
      .toThrow('invalid_pico_rules_risk');
  });

  it('refuses a malformed privacy domain and a malformed instance', () => {
    expect(() => parsePicoRulesInput({ ...wellFormed, privacyDomain: 'Private Space' }))
      .toThrow('invalid_pico_rules_domain');
    expect(() => parsePicoRulesInput({ ...wellFormed, instance: 'Ferien Haus' }))
      .toThrow('invalid_pico_rules_instance');
  });

  it('takes recent decisions as facts from the closed outcome vocabulary', () => {
    expect(picoRulesDecisions).toEqual(['allow', 'require_approval', 'deny']);
    expect(parsePicoRulesInput({ ...wellFormed, recentDecisions: ['deny', 'allow'] })
      .recentDecisions).toEqual(['deny', 'allow']);
    expect(() => parsePicoRulesInput({ ...wellFormed, recentDecisions: ['maybe'] }))
      .toThrow('invalid_pico_rules_recent_decisions');
  });
});

describe('ADR 0140 RL3 - unknown is deny, by name', () => {
  const complete = {
    request: wellFormed,
    argumentNames: ['entry_id'],
    hasRuleForEffect: true,
    instanceAttached: true,
    domainResolved: true,
  };

  it('finds nothing missing when everything is known', () => {
    expect(picoRulesMissingInput(complete)).toEqual([]);
    expect(picoRulesFloorOutcome(picoRulesMissingInput(complete))).toBeNull();
  });

  it('names an effect nobody has ruled on, so a new module is inert', () => {
    const reasons = picoRulesMissingInput({ ...complete, hasRuleForEffect: false });
    expect(reasons).toEqual(['no_rule_for_effect']);
    expect(picoRulesFloorOutcome(reasons))
      .toEqual({ decision: 'deny', reasons: ['no_rule_for_effect'] });
  });

  it('names an argument the controller never classified', () => {
    // The request's own argument names are the authority: an absent key and an
    // absent argument look identical from inside the map.
    expect(picoRulesMissingInput({ ...complete, argumentNames: ['entry_id', 'target'] }))
      .toEqual(['argument_without_origin']);
  });

  it('names an unattached instance only when one was named', () => {
    expect(picoRulesMissingInput({ ...complete, instanceAttached: false })).toEqual([]);
    expect(picoRulesMissingInput({
      ...complete,
      request: { ...wellFormed, instance: 'ferienhaus' },
      instanceAttached: false,
    })).toEqual(['instance_not_attached']);
  });

  it('names an unresolvable domain', () => {
    expect(picoRulesMissingInput({ ...complete, domainResolved: false }))
      .toEqual(['domain_unresolved']);
  });

  it('reports every unknown rather than the first', () => {
    const reasons = picoRulesMissingInput({
      ...complete,
      hasRuleForEffect: false,
      argumentNames: ['entry_id', 'target'],
      domainResolved: false,
    });
    expect(reasons).toEqual([
      'no_rule_for_effect',
      'argument_without_origin',
      'domain_unresolved',
    ]);
  });
});

describe('ADR 0140 RL1 - a denial is content', () => {
  it('answers deny with codes rather than throwing or going silent', () => {
    const outcome = picoRulesFloorOutcome(['no_rule_for_effect']);
    expect(outcome?.decision).toBe('deny');
    // Codes, so a surface can act on it and so nothing a requester wrote can
    // end up in the sentence a person reads.
    expect(outcome?.reasons).toEqual(['no_rule_for_effect']);
  });
});

describe('ADR 0143 DP8 - escalation only ever tightens', () => {
  it('turns an allow into a question', () => {
    expect(escalatePicoRulesDecision('allow', ['large_transfer'])).toBe('require_approval');
  });

  it('leaves a deny a deny, whatever a caller passes', () => {
    // The direction is the whole safety of letting a requester influence a
    // decision: a caller may say "ask about this one", never "do not bother".
    expect(escalatePicoRulesDecision('deny', ['large_transfer'])).toBe('deny');
    expect(escalatePicoRulesDecision('require_approval', ['large_transfer']))
      .toBe('require_approval');
  });

  it('changes nothing without a reason', () => {
    for (const decision of picoRulesDecisions) {
      expect(escalatePicoRulesDecision(decision)).toBe(decision);
      expect(escalatePicoRulesDecision(decision, [])).toBe(decision);
    }
  });

  it('refuses a reason the list does not have', () => {
    // Closed and named rather than a boolean: a reason has to reach a surface
    // that can act on it, and "the scheduler said so" is not answerable.
    expect(() => escalatePicoRulesDecision('allow', ['because' as never]))
      .toThrow('pico_action_escalation_not_listed');
    expect([...picoActionEscalations]).toEqual(['large_transfer']);
  });
});
