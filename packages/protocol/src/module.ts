/**
 * ADR 0127. What a Pico module declares about itself.
 *
 * A module defines its own vocabulary, but that vocabulary ships from here
 * rather than from the module package - and the manifest shape is the first
 * instance of the rule. The core has to read a manifest while deciding what is
 * active (M3), and a check has to read every manifest at once (M2); neither can
 * depend on a module package being present, importable, or switched on.
 *
 * The identifier list below is **closed and listed, not derived**, in the same
 * idiom as `picoProtectiveEventTypes`. Discovery by directory scan would make
 * adding a module a side effect of creating a folder. Adding one is a decision,
 * and a decision belongs in one place a person can read.
 */
export const picoModuleKinds = ['product', 'connector', 'provider'] as const;
export type PicoModuleKind = typeof picoModuleKinds[number];

/**
 * Every module Pico ships. Activation is a separate question (ADR 0127 M3):
 * being listed here says the code exists, not that it is running.
 */
export const picoModuleIdentifiers = ['calendar'] as const;
export type PicoModuleIdentifier = typeof picoModuleIdentifiers[number];

export interface PicoModuleManifest {
  identifier: PicoModuleIdentifier;
  kind: PicoModuleKind;
  /** The workspace package the composition and surface ship in. */
  packageName: string;
  /** Modules this one builds on, by identifier. Declared, never inferred. */
  dependencies: readonly PicoModuleIdentifier[];
  /**
   * What another module may build on, as subpath exports.
   *
   * "Published" and "internal" are exactly what the M2 check can hold on to, so
   * a module with no such split offers it nothing. A bare `.` is refused: a
   * barrel is how this tree twice dragged unrelated code into a measured
   * budget, and the answer chosen in ADR 0127 was subpaths from the first day.
   */
  publishedSubpaths: readonly string[];
  /** Where this module reaches a person. Prose, for the status surface. */
  surfaces: readonly string[];
}

function isDistinctStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === 'string' && entry.trim() !== '')
    && new Set(value as readonly string[]).size === value.length;
}

export function parsePicoModuleManifest(value: unknown): PicoModuleManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_module_manifest');
  }
  const record = value as Record<string, unknown>;
  const expected = [
    'dependencies',
    'identifier',
    'kind',
    'packageName',
    'publishedSubpaths',
    'surfaces',
  ];
  const keys = Object.keys(record).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    // Exact keys, not "at least these". An unrecognised field is a manifest
    // written against a contract that does not exist here, and guessing which
    // half was meant is how a declaration stops being a declaration.
    throw new Error('invalid_pico_module_manifest');
  }
  if (typeof record.identifier !== 'string'
    || !(picoModuleIdentifiers as readonly string[]).includes(record.identifier)) {
    throw new Error('invalid_pico_module_identifier');
  }
  if (typeof record.kind !== 'string'
    || !(picoModuleKinds as readonly string[]).includes(record.kind)) {
    throw new Error('invalid_pico_module_kind');
  }
  if (typeof record.packageName !== 'string' || record.packageName.trim() === '') {
    throw new Error('invalid_pico_module_package_name');
  }
  if (!isDistinctStringArray(record.dependencies)
    || record.dependencies.some((entry) =>
      !(picoModuleIdentifiers as readonly string[]).includes(entry))) {
    throw new Error('invalid_pico_module_dependencies');
  }
  if (record.dependencies.includes(record.identifier)) {
    // The shortest cycle. Caught here rather than in the graph walk, because a
    // self-edge is a typo and deserves the name of one.
    throw new Error('pico_module_depends_on_itself');
  }
  if (!isDistinctStringArray(record.publishedSubpaths)
    || record.publishedSubpaths.length === 0
    || record.publishedSubpaths.some((entry) => !entry.startsWith('./') || entry === './')) {
    throw new Error('invalid_pico_module_published_subpaths');
  }
  if (!isDistinctStringArray(record.surfaces) || record.surfaces.length === 0) {
    throw new Error('invalid_pico_module_surfaces');
  }
  return Object.freeze({
    identifier: record.identifier as PicoModuleIdentifier,
    kind: record.kind as PicoModuleKind,
    packageName: record.packageName,
    dependencies: Object.freeze([...record.dependencies] as PicoModuleIdentifier[]),
    publishedSubpaths: Object.freeze([...record.publishedSubpaths]),
    surfaces: Object.freeze([...record.surfaces]),
  });
}

/**
 * Dependencies before dependents, and a cycle refused by name.
 *
 * ADR 0127 permits modules to depend on each other and prohibits only cycles,
 * because an acyclic graph is what keeps the activation story sound: enabling a
 * module enables its closure, and the configurations worth testing stay finite.
 * A cycle makes both meaningless, so it is refused rather than tolerated.
 *
 * One implementation, two callers: the M2 check walks the shipped manifests,
 * and M3 activation follows the same order.
 */
export function orderPicoModuleManifests(
  manifests: readonly PicoModuleManifest[],
): readonly PicoModuleManifest[] {
  const byIdentifier = new Map(manifests.map((manifest) => [manifest.identifier, manifest]));
  if (byIdentifier.size !== manifests.length) {
    throw new Error('duplicate_pico_module_identifier');
  }

  const ordered: PicoModuleManifest[] = [];
  const settled = new Set<PicoModuleIdentifier>();
  const onPath = new Set<PicoModuleIdentifier>();

  const visit = (identifier: PicoModuleIdentifier): void => {
    if (settled.has(identifier)) {
      return;
    }
    if (onPath.has(identifier)) {
      throw new Error('pico_module_dependency_cycle');
    }
    const manifest = byIdentifier.get(identifier);
    if (manifest === undefined) {
      // Declared against something that is not shipped. Distinct from a cycle
      // because the fix is different: one is a missing module, the other is a
      // boundary drawn in the wrong place.
      throw new Error('unknown_pico_module_dependency');
    }
    onPath.add(identifier);
    for (const dependency of manifest.dependencies) {
      visit(dependency);
    }
    onPath.delete(identifier);
    settled.add(identifier);
    ordered.push(manifest);
  };

  for (const manifest of manifests) {
    visit(manifest.identifier);
  }
  return Object.freeze(ordered);
}
