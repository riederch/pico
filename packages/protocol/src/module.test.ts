import { describe, expect, it } from 'vitest';
import {
  bindPicoModuleEffects,
  orderPicoModuleManifests,
  parsePicoModuleManifest,
  picoModuleConsentIsCurrent,
  picoModuleConsentDrift,
  picoActionRiskClasses,
  picoModuleIdentifiers,
  picoModuleActivationClosure,
  picoModuleDependents,
  picoModuleIsEffectBearing,
  picoModuleKinds,
  resolvePicoModuleActivation,
  toPicoModuleActivationView,
  type PicoModuleManifest,
} from './module.js';

const wellFormed = {
  identifier: 'calendar',
  kind: 'product',
  packageName: '@pico/module-calendar',
  dependencies: [],
  publishedSubpaths: ['./manifest', './calendar'],
  surfaces: ['Foundation API: time-bound entries'],
  effects: [],
};

function omit(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...source };
  delete copy[key];
  return copy;
}

/** Manifests for graph tests, without pretending unshipped identifiers exist. */
function manifest(
  identifier: string,
  dependencies: readonly string[] = [],
): PicoModuleManifest {
  return {
    identifier,
    kind: 'product',
    packageName: `@pico/module-${identifier}`,
    dependencies,
    publishedSubpaths: ['./manifest'],
    surfaces: ['none'],
    effects: [],
  } as unknown as PicoModuleManifest;
}

describe('ADR 0127 M1 module manifest vocabulary', () => {
  it('accepts a well-formed manifest and freezes what it returns', () => {
    const parsed = parsePicoModuleManifest(wellFormed);
    expect(parsed.identifier).toBe('calendar');
    expect(parsed.kind).toBe('product');
    expect(parsed.dependencies).toEqual([]);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.publishedSubpaths)).toBe(true);
  });

  it('holds a closed list of identifiers and kinds', () => {
    // Listed, not derived. If this ever grows by directory scan the enumeration
    // has stopped being a decision spoken in one place.
    expect([...picoModuleIdentifiers]).toEqual(['calendar', 'home-assistant', 'spatial-recall']);
    expect([...picoModuleKinds]).toEqual(['product', 'connector', 'provider']);
  });

  it.each([
    ['an unknown identifier', { ...wellFormed, identifier: 'shopping-list' }, 'invalid_pico_module_identifier'],
    ['an unknown kind', { ...wellFormed, kind: 'plugin' }, 'invalid_pico_module_kind'],
    ['an empty package name', { ...wellFormed, packageName: '  ' }, 'invalid_pico_module_package_name'],
    ['a dependency that is not a module', { ...wellFormed, dependencies: ['nonsense'] }, 'invalid_pico_module_dependencies'],
    ['a duplicated dependency', { ...wellFormed, dependencies: ['calendar', 'calendar'] }, 'invalid_pico_module_dependencies'],
    ['a self-dependency', { ...wellFormed, dependencies: ['calendar'] }, 'pico_module_depends_on_itself'],
    ['no published subpath at all', { ...wellFormed, publishedSubpaths: [] }, 'invalid_pico_module_published_subpaths'],
    ['a bare barrel export', { ...wellFormed, publishedSubpaths: ['.'] }, 'invalid_pico_module_published_subpaths'],
    ['a subpath that is not relative', { ...wellFormed, publishedSubpaths: ['manifest'] }, 'invalid_pico_module_published_subpaths'],
    ['no surface', { ...wellFormed, surfaces: [] }, 'invalid_pico_module_surfaces'],
    ['an unrecognised field', { ...wellFormed, activatedByDefault: true }, 'invalid_pico_module_manifest'],
    ['a missing field', { identifier: 'calendar', kind: 'product' }, 'invalid_pico_module_manifest'],
    ['effects missing entirely', omit(wellFormed, 'effects'), 'invalid_pico_module_manifest'],
    ['effects that is not a list', { ...wellFormed, effects: {} }, 'invalid_pico_module_effects'],
    ['an effect with extra keys', { ...wellFormed, effects: [{ name: 'calendar.x', description: 'd', reversible: true }] }, 'invalid_pico_module_effect'],
    ['an effect namespaced to another module', { ...wellFormed, effects: [{ name: 'shopping.buy', description: 'd', risk: 'local_write' }] }, 'invalid_pico_module_effect_name'],
    ['an effect with no namespace at all', { ...wellFormed, effects: [{ name: 'raise', description: 'd', risk: 'local_write' }] }, 'invalid_pico_module_effect_name'],
    ['an effect name in the wrong case', { ...wellFormed, effects: [{ name: 'calendar.RaiseEntry', description: 'd', risk: 'local_write' }] }, 'invalid_pico_module_effect_name'],
    ['an effect nobody described', { ...wellFormed, effects: [{ name: 'calendar.x', description: '  ', risk: 'local_write' }] }, 'invalid_pico_module_effect_description'],
    ['the same effect twice', { ...wellFormed, effects: [{ name: 'calendar.x', description: 'a', risk: 'local_write' }, { name: 'calendar.x', description: 'b', risk: 'local_write' }] }, 'duplicate_pico_module_effect'],
  ])('refuses %s', (_name, value, reason) => {
    expect(() => parsePicoModuleManifest(value)).toThrow(reason);
  });

  it('refuses a self-dependency by its own name rather than as a cycle', () => {
    // The shortest cycle is a typo, and a message about graph topology would
    // send the reader looking for a second module that does not exist.
    expect(() => parsePicoModuleManifest({ ...wellFormed, dependencies: ['calendar'] }))
      .toThrow('pico_module_depends_on_itself');
  });
});

describe('ADR 0127 M2 dependency ordering', () => {
  it('puts dependencies before dependents', () => {
    const ordered = orderPicoModuleManifests([
      manifest('list', ['calendar']),
      manifest('calendar'),
    ]);
    expect(ordered.map((entry) => entry.identifier)).toEqual(['calendar', 'list']);
  });

  it('orders a diamond so every dependency precedes its dependent', () => {
    const ordered = orderPicoModuleManifests([
      manifest('top', ['left', 'right']),
      manifest('left', ['base']),
      manifest('right', ['base']),
      manifest('base'),
    ]).map((entry) => entry.identifier);
    const at = (identifier: string): number =>
      (ordered as readonly string[]).indexOf(identifier);
    expect(at('base')).toBeLessThan(at('left'));
    expect(at('base')).toBeLessThan(at('right'));
    expect(at('left')).toBeLessThan(at('top'));
    expect(at('right')).toBeLessThan(at('top'));
    // A diamond is not a cycle. Mutual dependence is permitted by ADR 0127;
    // only cycles are refused, and conflating them would forbid the shape the
    // ADR deliberately allows.
    expect(ordered).toHaveLength(4);
  });

  it('refuses a cycle', () => {
    expect(() => orderPicoModuleManifests([
      manifest('calendar', ['list']),
      manifest('list', ['calendar']),
    ])).toThrow('pico_module_dependency_cycle');
  });

  it('refuses a longer cycle that no pairwise check would see', () => {
    expect(() => orderPicoModuleManifests([
      manifest('a', ['b']),
      manifest('b', ['c']),
      manifest('c', ['a']),
    ])).toThrow('pico_module_dependency_cycle');
  });

  it('names a dependency on something not shipped as its own failure', () => {
    expect(() => orderPicoModuleManifests([manifest('calendar', ['list'])]))
      .toThrow('unknown_pico_module_dependency');
  });

  it('refuses two manifests claiming the same identifier', () => {
    expect(() => orderPicoModuleManifests([manifest('calendar'), manifest('calendar')]))
      .toThrow('duplicate_pico_module_identifier');
  });
});

describe('ADR 0128 H3 effects are declared, and effect-bearing is derived', () => {
  const withEffects = (...effects: Array<{ name: string; description: string; risk: string }>) =>
    parsePicoModuleManifest({ ...wellFormed, effects });

  it('treats an empty list as a declaration that nothing changes', () => {
    const parsed = parsePicoModuleManifest(wellFormed);
    expect(parsed.effects).toEqual([]);
    expect(picoModuleIsEffectBearing(parsed)).toBe(false);
    expect(Object.isFrozen(parsed.effects)).toBe(true);
  });

  it('accepts effects namespaced to the declaring module', () => {
    const parsed = withEffects(
      { name: 'calendar.raise-entry', description: 'Tells you an appointment is due.', risk: 'local_write' },
    );
    expect(parsed.effects).toEqual([
      { name: 'calendar.raise-entry', description: 'Tells you an appointment is due.', risk: 'local_write' },
    ]);
    expect(picoModuleIsEffectBearing(parsed)).toBe(true);
  });

  it('separates absent from empty', () => {
    // A missing field says nobody considered the question; an empty list says
    // this module changes nothing. Reading the same would be the whole point
    // of the declaration lost.
    expect(() => parsePicoModuleManifest(omit(wellFormed, 'effects')))
      .toThrow('invalid_pico_module_manifest');
    expect(() => parsePicoModuleManifest({ ...wellFormed, effects: [] })).not.toThrow();
  });
});

describe('ADR 0128 H3 the runtime supplies exactly what was declared', () => {
  const manifestWith = (...names: string[]) => parsePicoModuleManifest({
    ...wellFormed,
    effects: names.map((name) => ({ name, description: `does ${name}`, risk: 'local_write' })),
  });

  it('accepts an exact match, including the empty case', () => {
    expect(() => bindPicoModuleEffects({
      manifest: manifestWith(),
      supplied: {},
    })).not.toThrow();
    expect(() => bindPicoModuleEffects({
      manifest: manifestWith('calendar.raise-entry'),
      supplied: { 'calendar.raise-entry': () => undefined },
    })).not.toThrow();
  });

  it('refuses power the manifest never asked for', () => {
    // The manifest is what a person reads to know what a module can do. Power
    // arriving outside it makes that reading false.
    expect(() => bindPicoModuleEffects({
      manifest: manifestWith(),
      supplied: { 'calendar.raise-entry': () => undefined },
    })).toThrow('undeclared_pico_module_effect: calendar.raise-entry');
  });

  it('refuses a declared effect the runtime forgot, at wiring rather than at use', () => {
    // Otherwise it fails the first time it is needed, which is the moment
    // someone is relying on it.
    expect(() => bindPicoModuleEffects({
      manifest: manifestWith('calendar.raise-entry', 'calendar.cancel-entry'),
      supplied: { 'calendar.raise-entry': () => undefined },
    })).toThrow('unsupplied_pico_module_effect: calendar.cancel-entry');
  });

  it('names every mismatch rather than only the first', () => {
    expect(() => bindPicoModuleEffects({
      manifest: manifestWith(),
      supplied: { 'calendar.b': 1, 'calendar.a': 1 },
    })).toThrow('undeclared_pico_module_effect: calendar.a, calendar.b');
  });

  it('reports extra power before missing power', () => {
    // Both are wrong, but a module holding an effect nobody declared is the
    // one that can act right now.
    expect(() => bindPicoModuleEffects({
      manifest: manifestWith('calendar.declared'),
      supplied: { 'calendar.surprise': 1 },
    })).toThrow('undeclared_pico_module_effect: calendar.surprise');
  });
});

describe('ADR 0127 M3 activation', () => {
  // A graph with a real edge, because the interesting rules only exist once
  // one module needs another.
  const shipped = [
    manifest('calendar'),
    manifest('list', ['calendar']),
  ];

  const resolve = (
    active: readonly string[],
    identifier: string,
    wanted: boolean,
  ) => resolvePicoModuleActivation({
    manifests: shipped,
    active: active as never,
    request: { identifier: identifier as never, active: wanted },
  });

  it('enables the closure, in dependency order', () => {
    // A module whose dependency is off is not a disabled feature, it is a
    // broken one - and the person who turned it on did not ask for that.
    const decision = resolve([], 'list', true);
    expect(decision.outcome).toBe('changed');
    expect(decision.outcome === 'changed' && decision.enabled).toEqual(['calendar', 'list']);
    expect(decision.outcome === 'changed' && decision.active).toEqual(['calendar', 'list']);
  });

  it('enables only what was missing when part of the closure is already on', () => {
    const decision = resolve(['calendar'], 'list', true);
    expect(decision.outcome === 'changed' && decision.enabled).toEqual(['list']);
  });

  it('refuses to disable something an active module depends on, and names it', () => {
    // "Refused" without the names leaves a person guessing which of several
    // things they would have to turn off first.
    const decision = resolve(['calendar', 'list'], 'calendar', false);
    expect(decision.outcome).toBe('refused_dependents');
    expect(decision.outcome === 'refused_dependents' && decision.dependents).toEqual(['list']);
  });

  it('allows disabling once the dependent is itself off', () => {
    // Active, not merely shipped: refusing on behalf of something nobody is
    // running would make a module impossible to turn off for no one's sake.
    expect(resolve(['calendar'], 'calendar', false).outcome).toBe('changed');
  });

  it('never cascades a disable', () => {
    const decision = resolve(['calendar', 'list'], 'list', false);
    expect(decision.outcome === 'changed' && decision.disabled).toEqual(['list']);
    // calendar stays on. A person who switched off one thing should not
    // discover that a second went with it.
    expect(decision.outcome === 'changed' && decision.active).toEqual(['calendar']);
  });

  it('reports no-ops as unchanged rather than as silent success', () => {
    // A log that filled with no-ops would bury the changes that mattered.
    expect(resolve(['calendar'], 'calendar', true).outcome).toBe('unchanged');
    expect(resolve([], 'calendar', false).outcome).toBe('unchanged');
  });

  it('refuses a module nobody ships', () => {
    expect(() => resolve([], 'nonsense', true)).toThrow('unknown_pico_module');
  });

  it('gives a surface the state beside the kind and what a module can cause', () => {
    // A capability missing on purpose must not present as one that is broken.
    const view = toPicoModuleActivationView({ manifests: shipped, active: ['calendar'] as never });
    expect(view.modules.map((entry) => `${entry.identifier}:${entry.active}`))
      .toEqual(['calendar:true', 'list:false']);
    expect(view.modules[0]?.effectBearing).toBe(false);
    expect(view.modules[1]?.dependencies).toEqual(['calendar']);
  });

  it('lists dependents of a module that is not shipped as none, not as an error', () => {
    expect(picoModuleDependents({ manifests: shipped, identifier: 'calendar' as never }))
      .toEqual(['list']);
    expect(picoModuleActivationClosure({ manifests: shipped, identifier: 'calendar' as never }))
      .toEqual(['calendar']);
  });
});

describe('ADR 0139 AC4 - risk is declared by the module and pinned by consent', () => {
  const effect = (over: Partial<{ name: string; description: string; risk: string }> = {}) => ({
    name: 'calendar.raise-entry',
    description: 'Tells you an appointment is due.',
    risk: 'local_write',
    ...over,
  });

  it('carries a risk class from ADR 0010 six', () => {
    expect(picoActionRiskClasses).toEqual([
      'read_only',
      'local_write',
      'external_write',
      'destructive',
      'security_sensitive',
      'privileged_system_action',
    ]);
  });

  it('refuses an effect with no risk class', () => {
    // Absent is not `read_only`. A module that never said what it does has not
    // said the safest thing, it has said nothing.
    const { risk, ...withoutRisk } = effect();
    expect(() => parsePicoModuleManifest({ ...wellFormed, effects: [withoutRisk] }))
      .toThrow('invalid_pico_module_effect');
    expect(risk).toBe('local_write');
  });

  it('refuses a risk class outside the closed six', () => {
    expect(() => parsePicoModuleManifest({
      ...wellFormed,
      effects: [effect({ risk: 'mostly_harmless' })],
    })).toThrow('invalid_pico_module_effect_risk');
  });

  it('sees no drift when the declaration is what was consented to', () => {
    const drift = picoModuleConsentDrift([effect()] as never, [effect()] as never);
    expect(drift).toEqual({ added: [], removed: [], changed: [] });
    expect(picoModuleConsentIsCurrent(drift)).toBe(true);
  });

  it('names a raised risk class rather than inheriting the consent', () => {
    // The escalation this gate exists for: declare local_write today, ship
    // destructive in an update, keep the answer a person already gave.
    const drift = picoModuleConsentDrift(
      [effect()] as never,
      [effect({ risk: 'destructive' })] as never,
    );
    expect(drift.changed).toEqual(['calendar.raise-entry']);
    expect(picoModuleConsentIsCurrent(drift)).toBe(false);
  });

  it('treats a changed description as a changed effect', () => {
    // The description is the sentence a person read when they agreed, so
    // changing it changes what was agreed to.
    const drift = picoModuleConsentDrift(
      [effect()] as never,
      [effect({ description: 'Silently forwards it somewhere.' })] as never,
    );
    expect(drift.changed).toEqual(['calendar.raise-entry']);
  });

  it('separates a new effect from a withdrawn one', () => {
    const drift = picoModuleConsentDrift(
      [effect(), effect({ name: 'calendar.gone' })] as never,
      [effect(), effect({ name: 'calendar.new' })] as never,
    );
    expect(drift).toEqual({ added: ['calendar.new'], removed: ['calendar.gone'], changed: [] });
    expect(picoModuleConsentIsCurrent(drift)).toBe(false);
  });

  it('is current for a module that declares no effects at all', () => {
    expect(picoModuleConsentIsCurrent(picoModuleConsentDrift([], []))).toBe(true);
  });
});
