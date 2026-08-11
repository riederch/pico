import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import { selectPicoInstanceByPerson } from '@pico/protocol/instance-selection';
import { decidePicoAction } from './action-path.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openStore() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-rule-decision-'));
  dirs.push(dir);
  return new EventStore(join(dir, 'pico.sqlite'));
}

const consented = [{
  name: 'calendar.raise-entry',
  description: 'Tells you an appointment is due.',
  risk: 'local_write' as const,
}];

function decide(over: Record<string, unknown> = {}) {
  const facts: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const decided = decidePicoAction({
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
    approvalWindow: {
      presenceSessionId: 'session-a',
      endsAtMs: 1_000_000,
      startedAtMs: 500,
      durationMs: 60_000,
    },
    emit: (type: string, payload: Record<string, unknown>) => {
      facts.push({ type, payload });
      return `evt-${facts.length}`;
    },
    ...over,
  } as never);
  return { facts, decided };
}

/**
 * ADR 0140 RL4, the durable half. A rule is a person's decision, recorded the
 * way this codebase records durable decisions and reachable from nothing the
 * action path can request.
 */
describe('ADR 0140 RL4 - a rule is a durable person decision', () => {
  it('records and reads a decision, scoped to its domain', () => {
    const store = openStore();
    store.setPicoRuleDecision({
      effectName: 'calendar.raise-entry',
      privacyDomain: 'private',
      decision: 'deny',
      decidedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(store.picoRuleDecision({ effectName: 'calendar.raise-entry', privacyDomain: 'private' }))
      .toBe('deny');
    // ADR 0140 RL6: a decision in one domain is not a decision in another.
    expect(store.picoRuleDecision({ effectName: 'calendar.raise-entry', privacyDomain: 'finanz' }))
      .toBeUndefined();
    store.close();
  });

  it('survives a restart, because it is in the database and not in memory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-rule-decision-'));
    dirs.push(dir);
    const path = join(dir, 'pico.sqlite');

    const first = new EventStore(path);
    first.setPicoRuleDecision({
      effectName: 'calendar.raise-entry',
      privacyDomain: 'private',
      decision: 'require_approval',
      decidedAt: '2026-08-11T09:00:00.000Z',
    });
    first.close();

    const second = new EventStore(path);
    expect(second.picoRuleDecision({ effectName: 'calendar.raise-entry', privacyDomain: 'private' }))
      .toBe('require_approval');
    second.close();
  });

  it('replaces a decision rather than accumulating them', () => {
    const store = openStore();
    for (const decision of ['allow', 'deny', 'require_approval'] as const) {
      store.setPicoRuleDecision({
        effectName: 'calendar.raise-entry',
        privacyDomain: 'private',
        decision,
        decidedAt: '2026-08-11T09:00:00.000Z',
      });
    }
    expect(store.picoRuleDecisions()).toHaveLength(1);
    expect(store.picoRuleDecisions()[0]?.decision).toBe('require_approval');
    store.close();
  });

  it('reads nothing from host configuration', () => {
    // ADR 0104: a rule set a container rebuild could replace is not a rule
    // set. Setting the environment does not create a rule.
    const store = openStore();
    process.env.PICO_RULES_CALENDAR_RAISE_ENTRY = 'deny';
    try {
      expect(store.picoRuleDecision({
        effectName: 'calendar.raise-entry',
        privacyDomain: 'private',
      })).toBeUndefined();
    } finally {
      delete process.env.PICO_RULES_CALENDAR_RAISE_ENTRY;
    }
    store.close();
  });
});

describe('ADR 0140 RL4 - a recorded rule refines, and never grants', () => {
  it('leaves the risk-derived answer alone when nobody decided', () => {
    // Absent is not deny: the AC4 consent record already carries a decision
    // that this effect may exist.
    expect(decide().decided.decision).toBe('allow');
  });

  it('lets a recorded rule tighten an allow into an approval', () => {
    expect(decide({ recordedRule: 'require_approval' }).decided.decision)
      .toBe('require_approval');
  });

  it('lets a recorded rule deny what the risk class would have allowed', () => {
    expect(decide({ recordedRule: 'deny' }).decided.decision).toBe('deny');
  });

  it('cannot grant what the floor refused', () => {
    // ADR 0140 RL3 refuses for want of an input. A rule that could overrule
    // that would be answering a question nobody could ask.
    // An instance that is not attached is one of RL3's named unknowns. Named
    // through a selection since ADR 0137 IN5: a bare string is refused here
    // now, and so is a derived location.
    const { decided } = decide({
      recordedRule: 'allow',
      instance: selectPicoInstanceByPerson('ferienhaus'),
    });
    expect(decided.decision).toBe('deny');
    expect(decided.reasons).toEqual(['instance_not_attached']);
  });

  it('cannot grant reach that was never permitted', () => {
    // ADR 0138 CO3 is a precondition, not an input a rule can outvote.
    const { decided } = decide({
      recordedRule: 'allow',
      reachesOutside: true,
      reachPermitted: false,
    });
    expect(decided.decision).toBe('deny');
  });
});
