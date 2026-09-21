import { describe, expect, it } from 'vitest';
import { picoStoragePressureStates } from '@pico/protocol';
import {
  picoCompanionCondition,
  picoCompanionConditionKinds as coreKinds,
  picoCompanionConditionsFor,
  picoCompanionExclusiveConditions as coreExclusive,
} from '@pico/companion/conditions';
import {
  parsePicoCompanionPresentation,
  picoCompanionConditionKinds as windowKinds,
  picoCompanionExclusiveConditions as windowExclusive,
  picoCompanionIdlePresentation,
} from './contract.js';

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

  it('restates the exclusive pairs and no more, bound to the core like the names', () => {
    /**
     * The second copy that cannot be an import. Same arrangement as the names
     * above: restated in `contract.ts` because a parser needs its vocabulary
     * before anything arrives, and bound here so the two cannot drift.
     */
    expect(windowExclusive.map((pair) => [...pair]))
      .toEqual(coreExclusive.map((pair) => [...pair]));
    for (const [first, second] of windowExclusive) {
      expect(coreKinds, `${first} is a kind`).toContain(first);
      expect(coreKinds, `${second} is a kind`).toContain(second);
      expect(first, 'a pair of one is not a pair').not.toBe(second);
    }
  });

  it('refuses every exclusive pair at the window boundary, not just the storage one', () => {
    /**
     * Finding B240. `picoCompanionConditionsFor` never builds one of these,
     * but the producer is not the boundary: a second client assembles its own
     * conditions and arrives here. Until this held, `no_network` and
     * `home_unreachable` came through together and a person read the link
     * failure twice, in different words.
     */
    const base = picoCompanionIdlePresentation(new Date('2026-09-21T12:00:00Z'));
    for (const [first, second] of windowExclusive) {
      expect(() => parsePicoCompanionPresentation({
        ...base,
        conditions: [picoCompanionCondition(first), picoCompanionCondition(second)],
      }), `${first} + ${second}`).toThrow('conflicting_companion_presentation_condition');
      // Reihenfolge darf daran nichts aendern.
      expect(() => parsePicoCompanionPresentation({
        ...base,
        conditions: [picoCompanionCondition(second), picoCompanionCondition(first)],
      }), `${second} + ${first}`).toThrow('conflicting_companion_presentation_condition');
    }
  });

  it('never builds an exclusive pair, for any input the producer accepts', () => {
    /**
     * Der Eingaberaum ist klein genug, um ihn ganz zu gehen: drei Tristates
     * und vier Speicherlagen. Damit ist "der Erzeuger haelt sich daran" keine
     * Behauptung mehr, sondern nachgezaehlt.
     */
    const tristate = [true, false, undefined] as const;
    // Aus der Quelle, nicht abgeschrieben: eine dritte Lage im Protokoll soll
    // diesen Lauf erweitern und nicht still an ihm vorbeigehen.
    const storages = [...picoStoragePressureStates, undefined] as const;
    let walked = 0;
    for (const online of tristate) {
      for (const homeReachable of tristate) {
        for (const modelReachable of tristate) {
          for (const storage of storages) {
            const built = picoCompanionConditionsFor({
              online, homeReachable, modelReachable, storage,
            });
            walked += 1;
            const kinds = new Set(built.map((condition) => condition.kind));
            for (const [first, second] of windowExclusive) {
              expect(
                kinds.has(first) && kinds.has(second),
                `${first} + ${second} for ${JSON.stringify({ online, homeReachable, modelReachable, storage })}`,
              ).toBe(false);
            }
            // Was der Erzeuger baut, muss der Vertrag auch annehmen.
            expect(() => parsePicoCompanionPresentation({
              ...picoCompanionIdlePresentation(new Date('2026-09-21T12:00:00Z')),
              conditions: built,
            })).not.toThrow();
          }
        }
      }
    }
    expect(walked).toBe(tristate.length ** 3 * storages.length);
    expect(storages.length).toBe(picoStoragePressureStates.length + 1);
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
