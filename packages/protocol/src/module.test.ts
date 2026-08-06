import { describe, expect, it } from 'vitest';
import {
  orderPicoModuleManifests,
  parsePicoModuleManifest,
  picoModuleIdentifiers,
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
};

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
