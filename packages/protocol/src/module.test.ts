import { describe, expect, it } from 'vitest';
import {
  bindPicoModuleEffects,
  orderPicoModuleManifests,
  parsePicoModuleManifest,
  picoModuleIdentifiers,
  picoModuleIsEffectBearing,
  picoModuleKinds,
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
    expect([...picoModuleIdentifiers]).toEqual(['calendar']);
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
    ['an effect namespaced to another module', { ...wellFormed, effects: [{ name: 'shopping.buy', description: 'd' }] }, 'invalid_pico_module_effect_name'],
    ['an effect with no namespace at all', { ...wellFormed, effects: [{ name: 'raise', description: 'd' }] }, 'invalid_pico_module_effect_name'],
    ['an effect name in the wrong case', { ...wellFormed, effects: [{ name: 'calendar.RaiseEntry', description: 'd' }] }, 'invalid_pico_module_effect_name'],
    ['an effect nobody described', { ...wellFormed, effects: [{ name: 'calendar.x', description: '  ' }] }, 'invalid_pico_module_effect_description'],
    ['the same effect twice', { ...wellFormed, effects: [{ name: 'calendar.x', description: 'a' }, { name: 'calendar.x', description: 'b' }] }, 'duplicate_pico_module_effect'],
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
  const withEffects = (...effects: Array<{ name: string; description: string }>) =>
    parsePicoModuleManifest({ ...wellFormed, effects });

  it('treats an empty list as a declaration that nothing changes', () => {
    const parsed = parsePicoModuleManifest(wellFormed);
    expect(parsed.effects).toEqual([]);
    expect(picoModuleIsEffectBearing(parsed)).toBe(false);
    expect(Object.isFrozen(parsed.effects)).toBe(true);
  });

  it('accepts effects namespaced to the declaring module', () => {
    const parsed = withEffects(
      { name: 'calendar.raise-entry', description: 'Tells you an appointment is due.' },
    );
    expect(parsed.effects).toEqual([
      { name: 'calendar.raise-entry', description: 'Tells you an appointment is due.' },
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
    effects: names.map((name) => ({ name, description: `does ${name}` })),
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
