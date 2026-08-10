import { describe, expect, it } from 'vitest';
import {
  resolvePicoActionApproval,
  runPicoAction,
  type PicoActionFactType,
  type PicoEffectCapabilities,
} from './action-path.js';

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
    // ADR 0141 RN4: the question stands in a bounded window and nothing runs
    // until someone answers in the session it was asked into.
    const { facts, ran, outcome } = harness({
      consentedEffects: [{ ...consented[0], risk: 'external_write' }],
      approvalWindow: {
        presenceSessionId: 'session-a',
        endsAtMs: 1_000_000,
        startedAtMs: 500,
        durationMs: 60_000,
      },
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

describe('ADR 0141 RN4 - approval is presence-bound and expires', () => {
  const highRisk = [{ ...consented[0], risk: 'external_write' as const }];
  const window_ = {
    presenceSessionId: 'session-a',
    endsAtMs: 1_000_000,
    startedAtMs: 500,
    durationMs: 60_000,
  };

  function ask() {
    const facts: Array<{ type: PicoActionFactType; payload: Record<string, unknown> }> = [];
    const outcome = runPicoAction({
      requested: {
        effectName: 'calendar.raise-entry',
        arguments: [{ name: 'memory_item_id', value: 'item_1' }],
      },
      argumentSources: { memory_item_id: ['own_pico'] },
      declaredEffectNames: ['calendar.raise-entry'],
      consentedEffects: highRisk as never,
      privacyDomain: 'private',
      personPresent: true,
      instance: null,
      reachesOutside: false,
      reachPermitted: false,
      effects: {},
      approvalWindow: window_,
      emit: (type: PicoActionFactType, payload: Record<string, unknown>) => {
        facts.push({ type, payload });
        return `evt-${facts.length}`;
      },
    });
    return { facts, outcome };
  }

  it('records the question with the session and the window it stands in', () => {
    const { facts, outcome } = ask();
    expect(outcome.decision).toBe('require_approval');
    expect(outcome.pending).toMatchObject({ presenceSessionId: 'session-a', endsAtMs: 1_000_000 });
    expect(facts[2]?.payload.expiresAt).toBe(new Date(1_000_000).toISOString());
  });

  it('refuses to ask without a window rather than defaulting to one', () => {
    // A window nobody chose is a standing grant with a number attached.
    expect(() => runPicoAction({
      requested: { effectName: 'calendar.raise-entry', arguments: [] },
      argumentSources: {},
      declaredEffectNames: ['calendar.raise-entry'],
      consentedEffects: highRisk as never,
      privacyDomain: 'private',
      personPresent: true,
      instance: null,
      reachesOutside: false,
      reachPermitted: false,
      effects: {},
      emit: () => 'x',
    })).toThrow('pico_action_requires_approval_window');
  });

  function resolve(over: Record<string, unknown> = {}) {
    const { outcome } = ask();
    const facts: Array<{ type: PicoActionFactType; payload: Record<string, unknown> }> = [];
    const ran: string[] = [];
    const result = resolvePicoActionApproval({
      pending: outcome.pending!,
      effectName: 'calendar.raise-entry',
      presenceSessionId: 'session-a',
      approved: true,
      nowMs: 900_000,
      monotonicNowMs: 1_000,
      request: { schema: 'pico.action.request.v1', effectName: 'calendar.raise-entry', arguments: [] },
      risk: 'external_write',
      effects: { 'calendar.raise-entry': () => { ran.push('raised'); } },
      emit: (type: PicoActionFactType, payload: Record<string, unknown>) => {
        facts.push({ type, payload });
        return `res-${facts.length}`;
      },
      ...over,
    } as never);
    return { facts, ran, result };
  }

  it('runs through the same start and finish facts an immediate allow does', () => {
    const { facts, ran, result } = resolve();
    expect(result).toMatchObject({ outcome: 'approved', ran: true, succeeded: true });
    expect(facts.map((f) => f.type)).toEqual([
      'approval.resolved',
      'action_runner.action_started',
      'action_runner.action_completed',
    ]);
    expect(ran).toEqual(['raised']);
  });

  it('records a refusal and does not act', () => {
    const { facts, ran, result } = resolve({ approved: false });
    expect(result).toMatchObject({ outcome: 'refused', ran: false });
    expect(facts.map((f) => f.type)).toEqual(['approval.resolved']);
    expect(ran).toEqual([]);
  });

  it('records an expired question as unanswered, not as a refusal', () => {
    // A person who was asleep did not say no.
    const { facts, ran, result } = resolve({ nowMs: 1_000_001 });
    expect(result).toMatchObject({ outcome: 'unanswered', ran: false });
    expect(facts[0]?.payload.outcome).toBe('unanswered');
    expect(ran).toEqual([]);
  });

  it('refuses an answer from another session', () => {
    expect(() => resolve({ presenceSessionId: 'session-b' }))
      .toThrow('pico_approval_wrong_presence_session');
  });
});

describe('ADR 0141 RN2 - read-only never becomes a write', () => {
  it('hands a writing capability to an effect whose pinned class permits it', () => {
    const wrote: string[] = [];
    const { outcome } = harness({
      effects: {
        'calendar.raise-entry': (_request: unknown, capabilities: PicoEffectCapabilities) => {
          capabilities.write(() => { wrote.push('event'); });
        },
      },
    });
    expect(outcome).toMatchObject({ ran: true, succeeded: true });
    expect(wrote).toEqual(['event']);
  });

  it('records a runner failure when a read_only effect attempts a write', () => {
    // Not a detection: the capability is simply not there, in the
    // construction ADR 0117 X1 uses for picoReaderCapabilities.
    const { facts, outcome } = harness({
      consentedEffects: [{ ...consented[0], risk: 'read_only' }],
      effects: {
        'calendar.raise-entry': (_request: unknown, capabilities: PicoEffectCapabilities) => {
          capabilities.write(() => { throw new Error('should never run'); });
        },
      },
    });
    expect(outcome).toMatchObject({ decision: 'allow', ran: true, succeeded: false });
    expect(facts[3]?.payload).toMatchObject({
      success: false,
      summary: 'pico_effect_read_only_attempted_write',
    });
  });

  it('never turns the escalation into an approval prompt', () => {
    // Asking would put it in front of a person as a normal-looking question
    // at exactly the moment a declaration has been shown false.
    const { facts } = harness({
      consentedEffects: [{ ...consented[0], risk: 'read_only' }],
      effects: {
        'calendar.raise-entry': (_request: unknown, capabilities: PicoEffectCapabilities) => {
          capabilities.write(() => {});
        },
      },
    });
    expect(facts.map((f) => f.type)).not.toContain('approval.requested');
    expect(facts.map((f) => f.type)).toEqual([
      'action.requested',
      'pico_rules.decision_created',
      'action_runner.action_started',
      'action_runner.action_completed',
    ]);
  });

  it('lets a read_only effect that reads nothing but reads finish cleanly', () => {
    const { outcome } = harness({
      consentedEffects: [{ ...consented[0], risk: 'read_only' }],
      effects: { 'calendar.raise-entry': () => { /* reads only */ } },
    });
    expect(outcome).toMatchObject({ ran: true, succeeded: true });
  });
});
