import { type PicoEventOriginClass } from './index.js';
import { lowestPicoOriginClass } from './model-context.js';

/**
 * ADR 0139 AC1-AC3 - the action request contract.
 *
 * Two things are decided here and neither is about who is asking.
 *
 * **AC1.** An action names an effect a module manifest declared and the
 * runtime wired (ADR 0128 H3). There is no other way to express one - no
 * dynamic name, no command string, no URL - and a name that is not on the
 * declared list is refused rather than attempted, which is ADR 0116 W4's
 * "unknown families gated by default" seen from the request side.
 *
 * **AC2.** Every argument carries a `PicoEventOriginClass`, and the requester
 * has no field in which to assert one. The gate is the absence of that field
 * on `PicoActionRequestArgumentInput`, in the same construction ADR 0117 X1
 * uses for the planner context: a caller holding a claimed origin has nowhere
 * to put it, and the refusal happens at the call site rather than at review
 * time.
 *
 * **AC3.** Where an argument is computed from several sources, its class is
 * `lowestPicoOriginClass` of them - called, not reimplemented. ADR 0116's
 * derivation rule already says a derivation inherits the lowest class among
 * its sources, and a second implementation of that ordering here would be a
 * second place for it to be wrong.
 */
export const picoActionRequestSchema = 'pico.action.request.v1' as const;

/**
 * `<module-identifier>.<verb>`, matching what ADR 0128 H3 lets a manifest
 * declare. This is a shape check only; the authority is the declared list.
 */
export const picoActionEffectNamePattern =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const picoActionArgumentNamePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export const maxPicoActionArguments = 64;
export const maxPicoActionArgumentTextChars = 4_000;

export type PicoActionArgumentValue = string | number | boolean;

/**
 * What a requester may say about one argument. Note what is not here: there is
 * no `originClass`. A requester that could name its own origin would perform
 * the laundering step ADR 0117 X2 exists to break, through the very field
 * meant to prevent it.
 */
export interface PicoActionRequestArgumentInput {
  name: string;
  value: PicoActionArgumentValue;
}

/** What a requester may say at all. */
export interface PicoActionRequestInput {
  effectName: string;
  arguments: readonly PicoActionRequestArgumentInput[];
}

export interface PicoActionArgument {
  name: string;
  value: PicoActionArgumentValue;
  /** Controller-computed. See AC2 above. */
  originClass: PicoEventOriginClass;
}

export interface PicoActionRequest {
  schema: typeof picoActionRequestSchema;
  effectName: string;
  arguments: readonly PicoActionArgument[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  error: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(error);
  }
}

function assertArgumentValue(value: unknown): PicoActionArgumentValue {
  if (typeof value === 'string') {
    if (value.length > maxPicoActionArgumentTextChars) {
      throw new Error('invalid_pico_action_argument_value');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('invalid_pico_action_argument_value');
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error('invalid_pico_action_argument_value');
}

function parseRequestedArgument(value: unknown): PicoActionRequestArgumentInput {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_action_argument');
  }
  if ('originClass' in record) {
    // Its own error, so it is never confused with an ordinary shape failure.
    // A requester asserting provenance is the attack, not a typo.
    throw new Error('pico_action_argument_cannot_declare_origin');
  }
  assertExactKeys(record, ['name', 'value'], 'invalid_pico_action_argument');
  if (typeof record.name !== 'string'
    || !picoActionArgumentNamePattern.test(record.name)) {
    throw new Error('invalid_pico_action_argument_name');
  }
  return Object.freeze({ name: record.name, value: assertArgumentValue(record.value) });
}

export interface PicoActionRequestBuildInput {
  /** What the requester asked for. */
  requested: PicoActionRequestInput;
  /**
   * AC1's authority: the effect names a manifest declared and the runtime
   * wired. Collected from manifests rather than from a list the core keeps,
   * because ADR 0128 refused to hold a closed list of effects.
   */
  declaredEffectNames: readonly string[];
  /**
   * AC2/AC3. Per argument name, the origin classes it was computed from. One
   * source is the ordinary case; several means the value is a derivation and
   * takes the lowest of them.
   */
  argumentSources: Readonly<Record<string, readonly PicoEventOriginClass[]>>;
}

/**
 * ADR 0139 AC1-AC3. Builds the canonical request from a requester's ask plus
 * what only the controller knows.
 *
 * Refuses rather than repairing at every step, for ADR 0117 X2's reason: a
 * request that half-parsed is a request nobody declared, and continuing with
 * the parts that happened to fit is how an undeclared shape becomes an
 * accepted one.
 */
export function buildPicoActionRequest(
  input: PicoActionRequestBuildInput,
): PicoActionRequest {
  const record = isRecord(input) ? input : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_action_request_input');
  }
  assertExactKeys(
    record,
    ['requested', 'declaredEffectNames', 'argumentSources'],
    'invalid_pico_action_request_input',
  );

  const requested = isRecord(record.requested) ? record.requested : undefined;
  if (requested === undefined) {
    throw new Error('invalid_pico_action_request_input');
  }
  assertExactKeys(requested, ['effectName', 'arguments'], 'invalid_pico_action_request_input');

  if (typeof requested.effectName !== 'string'
    || !picoActionEffectNamePattern.test(requested.effectName)) {
    throw new Error('invalid_pico_action_effect_name');
  }
  if (!Array.isArray(record.declaredEffectNames)) {
    throw new Error('invalid_pico_action_request_input');
  }
  if (!record.declaredEffectNames.includes(requested.effectName)) {
    // AC1. Named separately from a malformed name: this one is well-formed and
    // simply does not exist, which is a refusal rather than a question.
    throw new Error('pico_action_effect_not_declared');
  }

  if (!Array.isArray(requested.arguments)) {
    throw new Error('invalid_pico_action_request_input');
  }
  if (requested.arguments.length > maxPicoActionArguments) {
    throw new Error('pico_action_request_too_large');
  }
  const parsed = (requested.arguments as unknown[]).map(parseRequestedArgument);

  const names = new Set<string>();
  for (const argument of parsed) {
    if (names.has(argument.name)) {
      // "Last one wins" is a decision no declared schema made.
      throw new Error('duplicate_pico_action_argument_name');
    }
    names.add(argument.name);
  }

  const sources = isRecord(record.argumentSources) ? record.argumentSources : undefined;
  if (sources === undefined) {
    throw new Error('invalid_pico_action_request_input');
  }
  for (const name of Object.keys(sources)) {
    if (!names.has(name)) {
      // A classification for an argument nobody sent is a controller bug, and
      // answering anyway would hide it.
      throw new Error('pico_action_argument_sources_unknown_argument');
    }
  }

  const args = parsed.map((argument) => {
    const argumentSources = sources[argument.name];
    if (argumentSources === undefined) {
      // AC2. An unclassified argument is not a safe argument, it is an
      // unmeasured one, and ADR 0140 RL3 would deny it anyway.
      throw new Error('pico_action_argument_missing_origin');
    }
    if (!Array.isArray(argumentSources)) {
      throw new Error('invalid_pico_action_argument_sources');
    }
    // AC3. Called, not reimplemented. An empty list throws inside.
    const originClass = lowestPicoOriginClass(argumentSources);
    return Object.freeze({ ...argument, originClass });
  });

  return Object.freeze({
    schema: picoActionRequestSchema,
    effectName: requested.effectName,
    arguments: Object.freeze(args),
  });
}

/**
 * Re-parses a canonical request at a boundary rather than trusting it. A value
 * that only type-checked at some earlier call site has not crossed one.
 */
export function parsePicoActionRequest(value: unknown): PicoActionRequest {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_action_request');
  }
  assertExactKeys(
    record,
    ['schema', 'effectName', 'arguments'],
    'invalid_pico_action_request',
  );
  if (record.schema !== picoActionRequestSchema) {
    throw new Error('invalid_pico_action_request_schema');
  }
  if (typeof record.effectName !== 'string'
    || !picoActionEffectNamePattern.test(record.effectName)) {
    throw new Error('invalid_pico_action_effect_name');
  }
  if (!Array.isArray(record.arguments)) {
    throw new Error('invalid_pico_action_request');
  }
  if (record.arguments.length > maxPicoActionArguments) {
    throw new Error('pico_action_request_too_large');
  }

  const names = new Set<string>();
  const args = (record.arguments as unknown[]).map((entry) => {
    const argument = isRecord(entry) ? entry : undefined;
    if (argument === undefined) {
      throw new Error('invalid_pico_action_argument');
    }
    assertExactKeys(
      argument,
      ['name', 'value', 'originClass'],
      'invalid_pico_action_argument',
    );
    if (typeof argument.name !== 'string'
      || !picoActionArgumentNamePattern.test(argument.name)) {
      throw new Error('invalid_pico_action_argument_name');
    }
    if (names.has(argument.name)) {
      throw new Error('duplicate_pico_action_argument_name');
    }
    names.add(argument.name);
    if (typeof argument.originClass !== 'string') {
      throw new Error('invalid_pico_action_argument_origin');
    }
    // Re-derived through the shared rule so an unknown class cannot survive a
    // round trip: a single source is its own lowest.
    const originClass = lowestPicoOriginClass([argument.originClass as PicoEventOriginClass]);
    return Object.freeze({
      name: argument.name,
      value: assertArgumentValue(argument.value),
      originClass,
    });
  });

  return Object.freeze({
    schema: picoActionRequestSchema,
    effectName: record.effectName,
    arguments: Object.freeze(args),
  });
}

/**
 * ADR 0139 AC1. The declared list, collected from manifests. Duplicate names
 * across modules are impossible by ADR 0128 H3's namespacing, so a collision
 * here means two manifests claim the same identifier and is refused.
 */
export function picoDeclaredEffectNames(
  manifests: readonly { effects: readonly { name: string }[] }[],
): readonly string[] {
  const names: string[] = [];
  for (const manifest of manifests) {
    for (const effect of manifest.effects) {
      if (names.includes(effect.name)) {
        throw new Error('duplicate_pico_declared_effect');
      }
      names.push(effect.name);
    }
  }
  return Object.freeze(names);
}
