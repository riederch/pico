import { describe, expect, it } from 'vitest';
import {
  picoCompanionCondition,
  picoCompanionConditionKinds as coreKinds,
} from '@pico/companion/conditions';
import { picoCompanionConditionKinds as windowKinds } from './contract.js';

describe('ADR 0131 A7 - one vocabulary for a condition, on every client', () => {
  it('is the same set of names in the window as in the core', () => {
    /**
     * The one copy in `contract.ts` that cannot be an import. A parser needs
     * its vocabulary *before* anything arrives, and that file loads in the
     * renderer, where a bare specifier does not resolve - so the names are
     * restated there and bound here. The label and the remedy are not
     * restated: they cross already rendered (ADR 0113 C2).
     */
    expect([...windowKinds]).toEqual([...coreKinds]);
  });

  it('gives every kind a label and a remedy, so none can arrive mute', () => {
    /**
     * ADR 0131 A7 says the client must name an unreachable Home rather than
     * present it as a quiet one. A kind without words would do exactly that:
     * a row in the list with nothing in it reads as "something", which is the
     * quiet screen wearing a different shape.
     */
    for (const kind of coreKinds) {
      const condition = picoCompanionCondition(kind);
      expect(condition.label.length, `${kind} label`).toBeGreaterThan(0);
      expect(condition.remedy.length, `${kind} remedy`).toBeGreaterThan(20);
      expect(condition.kind).toBe(kind);
    }
  });

  it('says what still works when the Home does not answer', () => {
    // The sentence a phone lives in, pinned because it is the one this gate
    // exists for: not a report that nothing is waiting.
    const unreachable = picoCompanionCondition('home_unreachable');
    expect(unreachable.label).toBe('Home not reached');
    expect(unreachable.remedy).toContain('not a report that nothing is waiting');
    expect(unreachable.remedy).toContain('continue here');
  });
});
