import { describe, expect, it } from 'vitest';
import {
  picoCompanionCondition,
  picoCompanionConditionKinds,
  picoCompanionConditionsFor,
} from './conditions.js';

describe('ADR 0118 O4 / ADR 0131 A7 - what is true between notifications', () => {
  it('names an unreachable Home instead of showing a quiet screen', () => {
    /**
     * The gate's own sentence: an unreachable Home must never look like a
     * quiet one. Before 2026-08-21 this rule lived in the Electron shell, so
     * the answer to "what does a phone say here" was "whatever its author
     * writes next".
     */
    const away = picoCompanionConditionsFor({ online: true, homeReachable: false });

    expect(away).toHaveLength(1);
    expect(away[0]?.kind).toBe('home_unreachable');
    expect(away[0]?.remedy).toContain('not a report that nothing is waiting');
  });

  it('stays silent about the Home when the link is what is down', () => {
    // A refusal must not be an inventory (ADR 0077 C4): with no network,
    // "your Home is not answering" is the same fact told a second time.
    const linkDown = picoCompanionConditionsFor({ online: false, homeReachable: false });

    expect(linkDown.map((condition) => condition.kind)).toEqual(['no_network']);
  });

  it('carries several at once, because any may hold while the others do not', () => {
    const several = picoCompanionConditionsFor({
      online: true,
      homeReachable: false,
      modelReachable: false,
      storage: 'reserved',
    });

    expect(several.map((condition) => condition.kind))
      .toEqual(['home_unreachable', 'no_model', 'storage_reserved']);
  });

  it('gives every kind words, so none can arrive mute', () => {
    for (const kind of picoCompanionConditionKinds) {
      const condition = picoCompanionCondition(kind);
      expect(condition.label.length, `${kind} label`).toBeGreaterThan(0);
      expect(condition.remedy.length, `${kind} remedy`).toBeGreaterThan(20);
    }
  });

  it('never says both storage states, because they are a ladder', () => {
    // ADR 0119 Q5. Showing both would leave the person to work out which is
    // true, which is the opposite of what a stated condition is for.
    const exhausted = picoCompanionConditionsFor({ storage: 'exhausted' });

    expect(exhausted.map((condition) => condition.kind)).toEqual(['storage_exhausted']);
  });
});
