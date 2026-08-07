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

/**
 * ADR 0127 M3. A module and everything it needs, in activation order.
 *
 * Enabling a module enables its closure, because a module whose dependency is
 * off is not a disabled feature - it is a broken one, and the person who
 * turned it on did not ask for that.
 */
export function picoModuleActivationClosure(input: {
  manifests: readonly PicoModuleManifest[];
  identifier: PicoModuleIdentifier;
}): readonly PicoModuleIdentifier[] {
  const ordered = orderPicoModuleManifests(input.manifests);
  const byIdentifier = new Map(ordered.map((manifest) => [manifest.identifier, manifest]));
  if (!byIdentifier.has(input.identifier)) {
    throw new Error('unknown_pico_module');
  }

  const needed = new Set<PicoModuleIdentifier>();
  const collect = (identifier: PicoModuleIdentifier): void => {
    if (needed.has(identifier)) {
      return;
    }
    needed.add(identifier);
    for (const dependency of byIdentifier.get(identifier)?.dependencies ?? []) {
      collect(dependency);
    }
  };
  collect(input.identifier);

  return Object.freeze(ordered
    .filter((manifest) => needed.has(manifest.identifier))
    .map((manifest) => manifest.identifier));
}

/**
 * ADR 0127 M3. Which *active* modules declare a dependency on this one.
 *
 * Active, not merely shipped: a dependent that is switched off is not going to
 * break, and refusing on its behalf would make a module impossible to turn off
 * for the sake of something nobody is running.
 *
 * The refusal names them, because "refused" without the names leaves a person
 * guessing which of several things they would have to turn off first.
 */
export function picoModuleDependents(input: {
  manifests: readonly PicoModuleManifest[];
  identifier: PicoModuleIdentifier;
  among?: readonly PicoModuleIdentifier[];
}): readonly PicoModuleIdentifier[] {
  const considered = input.among === undefined
    ? undefined
    : new Set(input.among);
  return Object.freeze(input.manifests
    .filter((manifest) => manifest.dependencies.includes(input.identifier))
    .filter((manifest) => considered === undefined || considered.has(manifest.identifier))
    .map((manifest) => manifest.identifier)
    .sort());
}

export interface PicoModuleActivationRequest {
  identifier: PicoModuleIdentifier;
  active: boolean;
}

export type PicoModuleActivationDecision =
  | {
    outcome: 'changed';
    active: readonly PicoModuleIdentifier[];
    /** Everything this turned on, including the module asked for. */
    enabled: readonly PicoModuleIdentifier[];
    /** Everything this turned off. Never more than the one asked for. */
    disabled: readonly PicoModuleIdentifier[];
  }
  | { outcome: 'unchanged'; active: readonly PicoModuleIdentifier[] }
  | { outcome: 'refused_dependents'; dependents: readonly PicoModuleIdentifier[] };

/**
 * ADR 0127 M3. What a request to switch a module on or off actually does.
 *
 * Two asymmetries, and both are deliberate:
 *
 * - **Enabling cascades; disabling never does.** Turning something on pulls in
 *   what it needs, which is what the person asked for by implication. Turning
 *   something off is refused when another active module depends on it, rather
 *   than quietly taking that one with it: a person who switched off one thing
 *   should not discover that a second went too.
 * - **Unchanged is its own outcome**, not a silent success. Re-enabling what is
 *   already on should append no record and raise no event; a log that filled
 *   with no-ops would bury the changes that mattered.
 *
 * Pure, so the rule is one expression rather than whatever the first
 * implementation happened to do - and so a caller can show a person what a
 * change would do before it is made.
 */
export function resolvePicoModuleActivation(input: {
  manifests: readonly PicoModuleManifest[];
  active: readonly PicoModuleIdentifier[];
  request: PicoModuleActivationRequest;
}): PicoModuleActivationDecision {
  const ordered = orderPicoModuleManifests(input.manifests);
  if (!ordered.some((manifest) => manifest.identifier === input.request.identifier)) {
    throw new Error('unknown_pico_module');
  }
  const inOrder = (identifiers: Iterable<PicoModuleIdentifier>): readonly PicoModuleIdentifier[] => {
    const wanted = new Set(identifiers);
    return Object.freeze(ordered
      .map((manifest) => manifest.identifier)
      .filter((identifier) => wanted.has(identifier)));
  };

  const active = new Set(input.active);

  if (input.request.active) {
    const closure = picoModuleActivationClosure({
      manifests: ordered,
      identifier: input.request.identifier,
    });
    const enabled = closure.filter((identifier) => !active.has(identifier));
    if (enabled.length === 0) {
      return { outcome: 'unchanged', active: inOrder(active) };
    }
    for (const identifier of enabled) {
      active.add(identifier);
    }
    return {
      outcome: 'changed',
      active: inOrder(active),
      enabled: Object.freeze(enabled),
      disabled: Object.freeze([]),
    };
  }

  if (!active.has(input.request.identifier)) {
    return { outcome: 'unchanged', active: inOrder(active) };
  }

  const dependents = picoModuleDependents({
    manifests: ordered,
    identifier: input.request.identifier,
    among: [...active],
  });
  if (dependents.length > 0) {
    return { outcome: 'refused_dependents', dependents };
  }

  active.delete(input.request.identifier);
  return {
    outcome: 'changed',
    active: inOrder(active),
    enabled: Object.freeze([]),
    disabled: Object.freeze([input.request.identifier]),
  };
}

/**
 * ADR 0127 M3. What a surface is told about activation.
 *
 * A capability that is missing **on purpose** must not present as one that is
 * broken, so the state is readable beside everything else in the system status
 * rather than being inferable from a feature's silence.
 */
export interface PicoModuleActivationEntry {
  identifier: PicoModuleIdentifier;
  kind: PicoModuleKind;
  active: boolean;
  /** ADR 0128 H3, carried here so a person can see what an active module can do. */
  effectBearing: boolean;
  dependencies: readonly PicoModuleIdentifier[];
}

export interface PicoModuleActivationView {
  modules: readonly PicoModuleActivationEntry[];
}

export function toPicoModuleActivationView(input: {
  manifests: readonly PicoModuleManifest[];
  active: readonly PicoModuleIdentifier[];
}): PicoModuleActivationView {
  const active = new Set(input.active);
  return Object.freeze({
    modules: Object.freeze(orderPicoModuleManifests(input.manifests).map((manifest) => Object.freeze({
      identifier: manifest.identifier,
      kind: manifest.kind,
      active: active.has(manifest.identifier),
      effectBearing: picoModuleIsEffectBearing(manifest),
      dependencies: manifest.dependencies,
    }))),
  });
}

/**
 * ADR 0127 M4. Something a module promised that has not happened yet.
 *
 * **Content-free by construction, and that is not a limitation.** ADR 0075 A7
 * keeps administration separate from readership: whoever may switch a module
 * off is not thereby entitled to read what it holds. So a commitment names
 * itself - its kind, when it was going to happen, and an opaque handle - and
 * says nothing about the words. That something is outstanding is the fact this
 * gate delivers; disclosing it because an administrator asked would trade a
 * privacy rule for a louder message.
 *
 * It is the same split the ADR 0118 O1 Link read already makes, and for the
 * same reason: the entry is always delivered, the title only where readership
 * allows.
 *
 * The wording belongs to the surface. Handing a person a sentence built in the
 * core would either bake in a language or bake in a phrasing that cannot say
 * "and two more" - and the surface is the only place that knows how much room
 * it has.
 */
export interface PicoModuleCommitment {
  module: PicoModuleIdentifier;
  /** `<module-identifier>.<noun>`, so a surface can word it. */
  kind: string;
  /** When it was going to happen, on the wall clock the person meant. */
  dueAt: string;
  /** An opaque handle, so a person can go and find it. Never content. */
  reference: string;
}

/**
 * Exactly the fields a commitment may carry.
 *
 * Exported so a test can assert the shape rather than trusting a reviewer to
 * notice a title being added - which is precisely the mistake this type exists
 * to make impossible.
 */
export const picoModuleCommitmentFields = [
  'dueAt',
  'kind',
  'module',
  'reference',
] as const;

/**
 * ADR 0127 M4. Oldest first, and bounded.
 *
 * Oldest first because the longest-standing promise is the one a person is
 * most likely to have forgotten they made. Bounded because a module holding
 * ten thousand outstanding entries must still produce a message a surface can
 * show - and "and 9,987 more" is information, while a truncated list that does
 * not say it was truncated is a lie.
 */
export const maxPicoModuleCommitmentsShown = 20;

export interface PicoModuleDeactivationStatement {
  module: PicoModuleIdentifier;
  /** How many commitments will not be kept. The full count, never the shown one. */
  total: number;
  /** The oldest few, for a surface to name. */
  shown: readonly PicoModuleCommitment[];
}

export function toPicoModuleDeactivationStatement(input: {
  module: PicoModuleIdentifier;
  commitments: readonly PicoModuleCommitment[];
}): PicoModuleDeactivationStatement {
  const ordered = [...input.commitments]
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
  return Object.freeze({
    module: input.module,
    // The full count, so a surface can say how many it is not showing. A
    // truncated list that reports its own truncated length is worse than no
    // list at all.
    total: ordered.length,
    shown: Object.freeze(ordered.slice(0, maxPicoModuleCommitmentsShown)),
  });
}
