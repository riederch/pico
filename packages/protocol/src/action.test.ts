import { describe, expect, it } from 'vitest';

import {
  buildPicoActionRequest,
  maxPicoActionArguments,
  parsePicoActionRequest,
  picoActionRequestSchema,
  picoDeclaredEffectNames,
} from './action.js';

const declared = ['calendar.raise-entry', 'home-assistant.turn-on-light'] as const;

function build(overrides: {
  effectName?: string;
  args?: readonly { name: string; value: string | number | boolean }[];
  sources?: Record<string, readonly string[]>;
} = {}) {
  return buildPicoActionRequest({
    requested: {
      effectName: overrides.effectName ?? 'calendar.raise-entry',
      arguments: overrides.args ?? [{ name: 'entry_id', value: 'entry_1' }],
    },
    declaredEffectNames: declared,
    argumentSources: (overrides.sources ?? { entry_id: ['person_present'] }) as never,
  });
}

describe('ADR 0139 AC1 - an action names a declared effect and nothing else', () => {
  it('builds a canonical request for a declared effect', () => {
    const request = build();
    expect(request.schema).toBe(picoActionRequestSchema);
    expect(request.effectName).toBe('calendar.raise-entry');
    expect(request.arguments).toEqual([
      { name: 'entry_id', value: 'entry_1', originClass: 'person_present' },
    ]);
  });

  it('refuses a well-formed effect name that no manifest declared', () => {
    // Separate error from a malformed name: this one exists as a shape and
    // simply is not on the list, which is a refusal rather than a question.
    expect(() => build({ effectName: 'calendar.delete-everything' }))
      .toThrow('pico_action_effect_not_declared');
  });

  it('refuses a name that is not namespaced by a module', () => {
    expect(() => build({ effectName: 'raise-entry' }))
      .toThrow('invalid_pico_action_effect_name');
  });

  it('collects the declared list from manifests and refuses a collision', () => {
    expect(picoDeclaredEffectNames([
      { effects: [{ name: 'calendar.raise-entry' }] },
      { effects: [{ name: 'home-assistant.turn-on-light' }] },
    ])).toEqual(declared);
    expect(() => picoDeclaredEffectNames([
      { effects: [{ name: 'calendar.raise-entry' }] },
      { effects: [{ name: 'calendar.raise-entry' }] },
    ])).toThrow('duplicate_pico_declared_effect');
  });
});

describe('ADR 0139 AC2 - the requester cannot assert an origin', () => {
  it('refuses an argument that carries an origin class, with its own error', () => {
    // The gate is the absence of the field on the input type; this proves the
    // runtime refuses it too, and names it as the attack rather than a typo.
    expect(() => build({
      args: [{ name: 'entry_id', value: 'entry_1', originClass: 'person_present' } as never],
    })).toThrow('pico_action_argument_cannot_declare_origin');
  });

  it('refuses an argument the controller did not classify', () => {
    expect(() => build({
      args: [{ name: 'entry_id', value: 'a' }, { name: 'target', value: 'b' }],
      sources: { entry_id: ['person_present'] },
    })).toThrow('pico_action_argument_missing_origin');
  });

  it('refuses a classification for an argument nobody sent', () => {
    expect(() => build({ sources: { entry_id: ['person_present'], ghost: ['own_pico'] } }))
      .toThrow('pico_action_argument_sources_unknown_argument');
  });

  it('classifies per argument, not per request', () => {
    const request = build({
      args: [{ name: 'when', value: '2026-08-10T10:00:00.000Z' }, { name: 'target', value: 'x' }],
      sources: { when: ['own_pico'], target: ['external_content'] },
    });
    expect(request.arguments.map((argument) => argument.originClass))
      .toEqual(['own_pico', 'external_content']);
  });

  it('refuses a duplicate argument name rather than letting the last one win', () => {
    expect(() => build({
      args: [{ name: 'entry_id', value: 'a' }, { name: 'entry_id', value: 'b' }],
      sources: { entry_id: ['person_present'] },
    })).toThrow('duplicate_pico_action_argument_name');
  });
});

describe('ADR 0139 AC3 - derivation reuses the existing rule', () => {
  it('takes the lowest class among an argument derived from several sources', () => {
    const request = build({
      sources: { entry_id: ['person_present', 'external_content', 'own_pico'] },
    });
    expect(request.arguments[0]!.originClass).toBe('external_content');
  });

  it('never raises a class: person_present plus external_content is external', () => {
    // The confused-deputy defence. Nothing here upgrades, and the ordering
    // comes from lowestPicoOriginClass rather than from a second copy of it.
    const request = build({ sources: { entry_id: ['external_content', 'person_present'] } });
    expect(request.arguments[0]!.originClass).toBe('external_content');
  });

  it('refuses a derivation from no sources instead of answering the floor', () => {
    expect(() => build({ sources: { entry_id: [] } }))
      .toThrow('pico_origin_derivation_requires_sources');
  });

  it('refuses an unknown origin class through the shared rank check', () => {
    expect(() => build({ sources: { entry_id: ['made_up'] } }))
      .toThrow('invalid_pico_origin_class');
  });
});

describe('the canonical request re-parses at a boundary', () => {
  it('round-trips a built request', () => {
    const request = build();
    expect(parsePicoActionRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
  });

  it('refuses a foreign schema label', () => {
    expect(() => parsePicoActionRequest({ ...build(), schema: 'pico.action.request.v2' }))
      .toThrow('invalid_pico_action_request_schema');
  });

  it('refuses an undeclared extra field', () => {
    expect(() => parsePicoActionRequest({ ...build(), extra: 1 }))
      .toThrow('invalid_pico_action_request');
  });

  it('refuses an argument whose origin class is not in the vocabulary', () => {
    expect(() => parsePicoActionRequest({
      schema: picoActionRequestSchema,
      effectName: 'calendar.raise-entry',
      arguments: [{ name: 'entry_id', value: 'a', originClass: 'trusted' }],
    })).toThrow('invalid_pico_origin_class');
  });

  it('refuses more arguments than the cap allows', () => {
    const args = Array.from({ length: maxPicoActionArguments + 1 }, (_, index) => ({
      name: `a${index}`,
      value: index,
      originClass: 'own_pico' as const,
    }));
    expect(() => parsePicoActionRequest({
      schema: picoActionRequestSchema,
      effectName: 'calendar.raise-entry',
      arguments: args,
    })).toThrow('pico_action_request_too_large');
  });
});
