import { picoOfflineFloorFamilies } from '@pico/protocol/offline-floor';
import { describe, expect, it } from 'vitest';
import {
  parsePicoCompanionPresentation,
  picoCompanionConditionKinds,
  picoCompanionConditionsFor,
  picoCompanionFloorAssurance,
  picoCompanionFloorFamilies,
  picoCompanionIdlePresentation,
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
  it('names the three facts the person has to tell apart', () => {
    // ADR 0009 offered one state, "offline or degraded", for facts with
    // different decisions behind them.
    expect([...picoCompanionConditionKinds])
      .toEqual(['no_network', 'no_model', 'storage_reserved', 'storage_exhausted']);
  });

  it('carries several at once, independently', () => {
    const parsed = parsePicoCompanionPresentation(presentation([
      { kind: 'no_network', remedy: 'Sends will queue until a route returns.' },
      { kind: 'no_model', remedy: 'Summaries wait; nothing else does.' },
      { kind: 'storage_reserved', remedy: 'Export, migrate or shred to make room.' },
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
      { kind: 'no_network', remedy: 'a' },
      { kind: 'no_network', remedy: 'b' },
    ]))).toThrow(/duplicate_companion_presentation_condition/u);
  });

  it('refuses both storage states at once', () => {
    // ADR 0119 Q5's states are a ladder, not a set; showing both would leave
    // the person to work out which one is true.
    expect(() => parsePicoCompanionPresentation(presentation([
      { kind: 'storage_reserved', remedy: 'a' },
      { kind: 'storage_exhausted', remedy: 'b' },
    ]))).toThrow(/conflicting_companion_presentation_condition/u);
  });

  it('refuses an unknown kind, a missing remedy and a stray field', () => {
    for (const conditions of [
      [{ kind: 'no_disk', remedy: 'a' }],
      [{ kind: 'no_network' }],
      [{ kind: 'no_network', remedy: 'a', extra: 'b' }],
      [{ kind: 'no_network', remedy: '' }],
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
    const combinations: string[][] = [
      [],
      ['no_network'],
      ['no_model'],
      ['no_network', 'no_model'],
      ['no_network', 'no_model', 'storage_reserved'],
      ['no_network', 'no_model', 'storage_exhausted'],
    ];

    for (const kinds of combinations) {
      const parsed = parsePicoCompanionPresentation(presentation(
        kinds.map((kind) => ({ kind, remedy: 'stated' })),
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
