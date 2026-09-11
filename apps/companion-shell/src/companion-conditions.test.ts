import { picoOfflineFloorFamilies } from '@pico/protocol/offline-floor';
import { isAsciiToken } from '@pico/protocol/canonical-bytes';
import { describe, expect, it } from 'vitest';
import {
  picoCompanionCondition,
  picoCompanionConditionsFor,
  type PicoCompanionCondition,
} from '@pico/companion/conditions';
import {
  parsePicoCompanionPresentation,
  picoCompanionConditionKinds,
  picoCompanionFloorAssurance,
  picoCompanionFloorFamilies,
  picoCompanionIdlePresentation,
  picoCompanionIsCanonicalToken,
} from './contract.js';

function presentation(conditions?: unknown): Record<string, unknown> {
  return {
    kind: 'idle',
    severity: 'active',
    symbol: '●',
    decision: 'none',
    title: 'Pico is watching your Home',
    body: 'No pending device recovery was found on the last authenticated check.',
    observedAt: new Date().toISOString(),
    ...(conditions === undefined ? {} : { conditions }),
  };
}

describe('ADR 0118 O4 / ADR 0119 Q5 stated conditions', () => {
  it('names the four facts the person has to tell apart', () => {
    // ADR 0009 offered one state, "offline or degraded", for facts with
    // different decisions behind them.
    //
    // `home_unreachable` joined them on 2026-08-19 (ADR 0131 A7). It is not
    // `no_network` wearing another name: the link can be perfectly fine while
    // the Home is not there, which is what leaving the house looks like - and
    // until it existed, a Home nobody could reach presented exactly like a
    // Home with nothing to say.
    expect([...picoCompanionConditionKinds]).toEqual([
      'no_network',
      'home_unreachable',
      'no_model',
      'storage_reserved',
      'storage_exhausted',
    ]);
  });

  it('carries several at once, independently', () => {
    const parsed = parsePicoCompanionPresentation(presentation([
      picoCompanionCondition('no_network'),
      picoCompanionCondition('no_model'),
      picoCompanionCondition('storage_reserved'),
    ]));

    expect(parsed.conditions.map((condition) => condition.kind))
      .toEqual(['no_network', 'no_model', 'storage_reserved']);
  });

  it('defaults to an empty list rather than absent', () => {
    // A consumer should never have to tell "none" from "not stated".
    expect(parsePicoCompanionPresentation(presentation()).conditions).toEqual([]);
    expect(picoCompanionIdlePresentation().conditions).toEqual([]);
  });

  it('refuses two rows saying the same thing', () => {
    expect(() => parsePicoCompanionPresentation(presentation([
      picoCompanionCondition('no_network'),
      picoCompanionCondition('no_network'),
    ]))).toThrow(/duplicate_companion_presentation_condition/u);
  });

  it('refuses both storage states at once', () => {
    // ADR 0119 Q5's states are a ladder, not a set; showing both would leave
    // the person to work out which one is true.
    expect(() => parsePicoCompanionPresentation(presentation([
      picoCompanionCondition('storage_reserved'),
      picoCompanionCondition('storage_exhausted'),
    ]))).toThrow(/conflicting_companion_presentation_condition/u);
  });

  it('refuses an unknown kind, a missing remedy and a stray field', () => {
    for (const conditions of [
      [{ kind: 'no_disk', label: 'a', remedy: 'a' }],
      [{ kind: 'no_network' }],
      [{ ...picoCompanionCondition('no_network'), extra: 'b' }],
      [{ kind: 'no_network', label: 'No network', remedy: '' }],
      'no_network',
    ]) {
      expect(
        () => parsePicoCompanionPresentation(presentation(conditions)),
        JSON.stringify(conditions),
      ).toThrow(/companion_presentation/u);
    }
  });
});

describe('ADR 0118 O4 the floor is never rendered as blocked', () => {
  it('states what still works, for every combination of conditions', () => {
    // The load-bearing half. An avatar that reports itself broken while
    // capture works teaches the person that Pico is unreliable offline.
    const combinations: PicoCompanionCondition['kind'][][] = [
      [],
      ['no_network'],
      ['no_model'],
      ['no_network', 'no_model'],
      ['no_network', 'no_model', 'storage_reserved'],
      ['no_network', 'no_model', 'storage_exhausted'],
    ];

    for (const kinds of combinations) {
      const parsed = parsePicoCompanionPresentation(presentation(
        kinds.map((kind) => picoCompanionCondition(kind)),
      ));
      expect(parsed.conditions).toHaveLength(kinds.length);
      // No combination turns the state itself into a blocked one.
      expect(parsed.severity).toBe('active');
    }

    const assurance = picoCompanionFloorAssurance();
    for (const family of picoCompanionFloorFamilies) {
      expect(assurance).toContain(family.replace(/_/gu, ' '));
    }
  });

  it('keeps the local token rule bound to the protocol', () => {
    /**
     * Dieselbe Bindung wie bei der Bodenfamilienliste darunter, fuer dieselbe
     * Ursache: der Renderer laedt einfache ES-Module ohne Bundler, also kann
     * der Vertrag `@pico/protocol/canonical-bytes` nicht importieren und
     * erklaert die Regel selbst (Befund B141). Der Test ist, was diese Kopie
     * davon abhaelt, eine zweite Wahrheit zu werden.
     *
     * Nicht-ASCII steht ausdruecklich in der Liste: die oertliche Fassung
     * zaehlt Zeichen, die im Protokoll zaehlt Bytes, und beide Zahlen sind nur
     * dieselbe, solange die Zeichenmenge ASCII bleibt.
     */
    for (const value of [
      'home_abc', 'a+b', 'a/b', 'a:b', 'a.b', 'a-b', 'a_b',
      '', 'a b', 'ä', 'ä'.repeat(600), 'x'.repeat(1024), 'x'.repeat(1025),
      undefined, null, 42, true, {}, ['a'],
    ]) {
      expect(picoCompanionIsCanonicalToken(value)).toBe(isAsciiToken(value));
    }
  });

  it('keeps the local floor list bound to the protocol', () => {
    // The renderer loads plain ES modules with no bundler, so the contract
    // cannot import the protocol and declares the list itself. This is what
    // stops that copy from quietly becoming a second source of truth.
    expect([...picoCompanionFloorFamilies]).toEqual([...picoOfflineFloorFamilies]);
  });
});

describe('mapping observed facts to stated conditions', () => {
  it('says nothing about a fact nobody observed', () => {
    // "Nobody looked" is not "offline". Claiming the latter would teach the
    // person to distrust the indicator.
    expect(picoCompanionConditionsFor({})).toEqual([]);
    expect(picoCompanionConditionsFor({ online: true, modelReachable: true, storage: 'normal' }))
      .toEqual([]);
  });

  it('states each observed absence with what to do about it', () => {
    const conditions = picoCompanionConditionsFor({
      online: false,
      modelReachable: false,
      storage: 'reserved',
    });

    expect(conditions.map((condition) => condition.kind))
      .toEqual(['no_network', 'no_model', 'storage_reserved']);
    // A remedy is an action, not a restatement of the problem.
    for (const condition of conditions) {
      expect(condition.remedy.length).toBeGreaterThan(20);
    }
    // And the result is a shape the contract accepts.
    expect(parsePicoCompanionPresentation(presentation(conditions)).conditions)
      .toHaveLength(3);
  });

  it('never states both storage conditions', () => {
    expect(picoCompanionConditionsFor({ storage: 'exhausted' }).map((c) => c.kind))
      .toEqual(['storage_exhausted']);
  });
});
