import { describe, expect, it } from 'vitest';
import { runPicoAction, type PicoActionFactType } from './action-path.js';

const consented = [{
  name: 'calendar.raise-entry',
  description: 'Tells you an appointment is due.',
  risk: 'local_write' as const,
}];

function harness(over: Record<string, unknown> = {}) {
  const facts: Array<{ type: PicoActionFactType; payload: Record<string, unknown> }> = [];
  const ran: string[] = [];
  const outcome = runPicoAction({
    requested: {
      effectName: 'calendar.raise-entry',
      arguments: [{ name: 'memory_item_id', value: 'item_1' }],
    },
    argumentSources: { memory_item_id: ['own_pico'] },
    declaredEffectNames: ['calendar.raise-entry'],
    consentedEffects: consented as never,
    privacyDomain: 'private',
    personPresent: false,
    instance: null,
    reachesOutside: false,
    reachPermitted: false,
    effects: { 'calendar.raise-entry': () => { ran.push('raised'); } },
    emit: (type: PicoActionFactType, payload: Record<string, unknown>) => {
      facts.push({ type, payload });
      return `evt-${facts.length}`;
    },
    ...over,
  } as never);
  return { facts, ran, outcome };
}

describe('ADR 0139 AC6 - the first action, with no model and no bridge', () => {
  it('records the facts in order and runs the effect', () => {
    const { facts, ran, outcome } = harness();
    expect(facts.map((f) => f.type)).toEqual([
      'action.requested',
      'pico_rules.decision_created',
      'action_runner.action_started',
      'action_runner.action_completed',
    ]);
    expect(outcome).toMatchObject({ decision: 'allow', ran: true, succeeded: true });
    expect(ran).toEqual(['raised']);
  });

  it('carries each argument with the origin class the controller computed', () => {
    const { facts } = harness();
    expect(facts[0]?.payload.input).toEqual({
      memory_item_id: { value: 'item_1', originClass: 'own_pico' },
    });
  });

  it('links the decision and the completion to what they are about', () => {
    const { facts } = harness();
    expect(facts[1]?.payload.requestedEventId).toBe('evt-1');
    expect(facts[3]?.payload.startedEventId).toBe('evt-3');
  });

  it('refuses an effect nobody consented to, before any fact is recorded', () => {
    // Not a rules outcome: a person never agreed to this, and the request
    // contract refuses before a decision is asked for.
    const facts: unknown[] = [];
    expect(() => runPicoAction({
      requested: { effectName: 'calendar.raise-entry', arguments: [] },
      argumentSources: {},
      declaredEffectNames: ['calendar.raise-entry'],
      consentedEffects: [],
      privacyDomain: 'private',
      personPresent: false,
      instance: null,
      reachesOutside: false,
      reachPermitted: false,
      effects: {},
      emit: (type, payload) => { facts.push({ type, payload }); return 'x'; },
    })).toThrow('pico_action_effect_not_consented');
    expect(facts).toEqual([]);
  });

  it('refuses an effect no manifest declared (AC1)', () => {
    expect(() => harness({ declaredEffectNames: [] }))
      .toThrow('pico_action_effect_not_declared');
  });

  it('refuses a requester that asserts its own origin (AC2)', () => {
    expect(() => harness({
      requested: {
        effectName: 'calendar.raise-entry',
        arguments: [{ name: 'memory_item_id', value: 'x', originClass: 'person_present' }],
      },
    })).toThrow('pico_action_argument_cannot_declare_origin');
  });

  it('refuses an argument the controller never classified (AC2)', () => {
    expect(() => harness({ argumentSources: {} }))
      .toThrow('pico_action_argument_missing_origin');
  });
});

describe('ADR 0139 AC6 - what does not run, and why', () => {
  it('asks for approval on a higher risk class and does not act', () => {
    // ADR 0141 RN4 does not exist, so the question is recorded and the action
    // does not happen. An unanswered approval is not an allow.
    const { facts, ran, outcome } = harness({
      consentedEffects: [{ ...consented[0], risk: 'external_write' }],
    });
    expect(facts.map((f) => f.type)).toEqual([
      'action.requested',
      'pico_rules.decision_created',
      'approval.requested',
    ]);
    expect(outcome).toMatchObject({ decision: 'require_approval', ran: false });
    expect(ran).toEqual([]);
  });

  it('denies when the effect reaches outside without that permission', () => {
    // ADR 0138 CO3 is a precondition, not an input a rule can outvote.
    const { facts, ran, outcome } = harness({ reachesOutside: true, reachPermitted: false });
    expect(outcome.decision).toBe('deny');
    expect(facts.map((f) => f.type)).toEqual(['action.requested', 'pico_rules.decision_created']);
    expect(ran).toEqual([]);
  });

  it('records a failure with the same weight as a success', () => {
    // An audit that only holds successes is not one.
    const { facts, outcome } = harness({
      effects: { 'calendar.raise-entry': () => { throw new Error('printer on fire'); } },
    });
    expect(outcome).toMatchObject({ ran: true, succeeded: false });
    expect(facts[3]?.payload).toMatchObject({ success: false, summary: 'printer on fire' });
  });

  it('records a failure when the runtime supplied no implementation', () => {
    const { facts, outcome } = harness({ effects: {} });
    expect(outcome.succeeded).toBe(false);
    expect(facts[3]?.payload.summary).toBe('unsupplied_pico_module_effect');
  });
});
