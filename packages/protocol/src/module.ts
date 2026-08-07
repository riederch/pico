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
export const picoModuleIdentifiers = ['calendar', 'spatial-recall'] as const;
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
  /**
   * ADR 0128 H3. What this module can cause outside Pico's custody.
   *
   * An empty list is a declaration, not an omission, in the same way an empty
   * `dependencies` is: it says this module changes nothing in the world.
   *
   * **Effect-bearing is derived from this list, never stated beside it.** A
   * boolean and a list are two things that can contradict each other, and the
   * contradiction would be discovered by whoever trusted the wrong one.
   */
  effects: readonly PicoModuleEffect[];
}

/**
 * ADR 0128 H3. One thing a module can cause, named so the core can decide.
 *
 * Turning on a light is not input, it is an effect: something outside Pico's
 * custody changes, and deleting a row afterwards does not undo it. A module
 * declares what it can cause; **the decision to cause it belongs to the core's
 * action path** (ADR 0036, ADR 0117). This is a request for a capability, not
 * a capability.
 *
 * The name is namespaced by the declaring module's own identifier, which is
 * checkable and stops a module from claiming another's effects. What the
 * second half says is the module's decision - Pico holds no closed list of
 * effects, because it would have to be guessed before any module needed one.
 */
export interface PicoModuleEffect {
  /** `<module-identifier>.<verb>`, lowercase, e.g. `calendar.raise-entry`. */
  name: string;
  /** What a person would say happened. Prose, for the surface that asks. */
  description: string;
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
    'effects',
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
  const effects = parsePicoModuleEffects(record.effects, record.identifier);
  return Object.freeze({
    identifier: record.identifier as PicoModuleIdentifier,
    kind: record.kind as PicoModuleKind,
    packageName: record.packageName,
    dependencies: Object.freeze([...record.dependencies] as PicoModuleIdentifier[]),
    publishedSubpaths: Object.freeze([...record.publishedSubpaths]),
    surfaces: Object.freeze([...record.surfaces]),
    effects,
  });
}

function parsePicoModuleEffects(
  value: unknown,
  identifier: string,
): readonly PicoModuleEffect[] {
  if (!Array.isArray(value)) {
    // Absent is not empty. An empty list says "this module changes nothing";
    // a missing field says nobody considered the question, and the two must
    // not read the same to whoever wires this module up.
    throw new Error('invalid_pico_module_effects');
  }
  const namePattern = new RegExp(`^${identifier}\\.[a-z0-9]+(?:-[a-z0-9]+)*$`, 'u');
  const effects = value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('invalid_pico_module_effect');
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length !== 2 || keys[0] !== 'description' || keys[1] !== 'name') {
      throw new Error('invalid_pico_module_effect');
    }
    if (typeof record.name !== 'string' || !namePattern.test(record.name)) {
      // Namespaced by the declaring module, so one module cannot claim
      // another's effects and a reader can tell at a glance who answers for it.
      throw new Error('invalid_pico_module_effect_name');
    }
    if (typeof record.description !== 'string' || record.description.trim() === '') {
      // A person is going to be asked to allow this. An effect nobody can
      // describe is one nobody can consent to.
      throw new Error('invalid_pico_module_effect_description');
    }
    return Object.freeze({ name: record.name, description: record.description });
  });
  if (new Set(effects.map((effect) => effect.name)).size !== effects.length) {
    throw new Error('duplicate_pico_module_effect');
  }
  return Object.freeze(effects);
}

/**
 * ADR 0128 H3. Whether this module can change anything outside Pico's custody.
 *
 * Derived, never stored beside the list. A stored flag could disagree with the
 * effects it claims to summarise, and the disagreement would be found by
 * whoever trusted the wrong one.
 */
export function picoModuleIsEffectBearing(manifest: PicoModuleManifest): boolean {
  return manifest.effects.length > 0;
}

/**
 * ADR 0128 H3. The runtime hands a module exactly the effects it declared.
 *
 * A static check can refuse every *direct* route to the world - and
 * `module:check` does - but it cannot see an effect caused through a port,
 * because a port is just a function. Wiring is where "causing" becomes
 * observable, so this is checked there.
 *
 * Both directions are failures, and they are different ones:
 *
 * - **Supplied but not declared** is a runtime handing a module more power
 *   than it asked for. The manifest is what a person reads to know what a
 *   module can do; power arriving outside it makes that reading false.
 * - **Declared but not supplied** is a module that will fail the first time
 *   it tries - which is at the moment someone is relying on it. Refusing at
 *   wiring turns a later surprise into a start-up error.
 */
export function bindPicoModuleEffects(input: {
  manifest: PicoModuleManifest;
  supplied: Readonly<Record<string, unknown>>;
}): void {
  const declared = new Set(input.manifest.effects.map((effect) => effect.name));
  const supplied = new Set(Object.keys(input.supplied));

  const undeclared = [...supplied].filter((name) => !declared.has(name)).sort();
  if (undeclared.length > 0) {
    throw new Error(`undeclared_pico_module_effect: ${undeclared.join(', ')}`);
  }

  const unsupplied = [...declared].filter((name) => !supplied.has(name)).sort();
  if (unsupplied.length > 0) {
    throw new Error(`unsupplied_pico_module_effect: ${unsupplied.join(', ')}`);
  }
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
