import { assertExactKeys } from './canonical-bytes.js';
import { assertPicoInstant } from './instant.js';
import type { PicoEventOriginClass } from './origin-class.js';
import {
  assemblePicoModelContext,
  mayPicoOriginInstruct,
  picoModelContextSchema,
  type PicoModelContext,
} from './model-context.js';

/**
 * ADR 0117 X1/X2 - the planner-reader split.
 *
 * ADR 0116 W3 sorts labeled content into an instruction layer and a delimited
 * data layer, and bets that the model respects the delimiter. That bet is
 * reasonable and it is still a bet. This ADR removes the need for it on the
 * side where it matters: the *planner* - the model whose output can move a
 * tool - never receives untrusted bytes at all. There is nothing for it to
 * obey, whatever it would have done with a delimiter.
 *
 * The claim strengthens from "injected content is contained" to "injected
 * content never reaches the acting model", and stays exactly as honest about
 * what survives: data poisoning. A well-formed lie flows through this split as
 * a correctly labeled false value, and nothing here pretends otherwise.
 */
export const picoModelRoles = [
  /** Can cause an action. Sees no untrusted content, ever. */
  'planner',
  /** Sees untrusted content. Holds no tools and no keys. */
  'reader',
] as const;

export type PicoModelRole = typeof picoModelRoles[number];

/**
 * ADR 0117 X1. The reader's capabilities, as a shape whose fields can only be
 * `false`. A boolean that could be `true` would invite a call site to set it;
 * a type that cannot express the permission cannot leak it by configuration.
 */
export interface PicoReaderCapabilities {
  toolAccess: false;
  keyAccess: false;
}

export const picoReaderCapabilities: Readonly<PicoReaderCapabilities> = Object.freeze({
  toolAccess: false,
  keyAccess: false,
});

/**
 * ADR 0117 X1. Single-context assembly - W3's one-context-with-delimiters
 * shape - stays lawful only where no executor exists. Once something can act
 * on the model's output, the delimiter is load-bearing again, which is the
 * dependency this ADR exists to remove.
 */
export function mayPicoUseSingleContextAssembly(input: { hasExecutor: boolean }): boolean {
  return !input.hasExecutor;
}

/**
 * ADR 0117 X2. The declared shapes a reader may emit.
 *
 * `token` is the narrow channel: a canonical identifier-like value that cannot
 * carry prose. `text` is the wide one, and it is declared rather than hidden -
 * a summary has to be able to come back. What X2 buys is not that strings
 * became safe; it is that a string arrives as a *declared, origin-carrying
 * value* which the planner takes as data, never as instruction. The residual
 * width of that channel is stated here rather than argued away.
 */
export const picoReaderValueTypes = ['token', 'text', 'number', 'boolean', 'instant', 'reference'] as const;
export type PicoReaderValueType = typeof picoReaderValueTypes[number];

export const picoReaderTokenPattern = /^[A-Za-z0-9._:-]{1,64}$/u;
export const maxPicoReaderTextChars = 8_000;
export const maxPicoReaderValues = 256;

export interface PicoReaderValue {
  name: string;
  type: PicoReaderValueType;
  value: string | number | boolean;
  /**
   * ADR 0116 W2's derivation rule applied at the boundary: a reader value is
   * derived from what the reader read, so it can never be `person_present`.
   * Admitting one would let a read of a stranger's mail re-enter as the
   * person's own instruction - the laundering step the whole split exists to
   * break.
   */
  originClass: PicoEventOriginClass;
}

/**
 * ADR 0117 X2, with ADR 0060. A reference is materialized and expiring, and it
 * is never expandable *here*: the planner receives the handle, not the bytes.
 * Expansion is a separate, authorized act under ADR 0060's rules.
 */
export interface PicoOpaqueReference {
  referenceId: string;
  expiresAt: string;
  originClass: PicoEventOriginClass;
}

export interface PicoReaderOutput {
  schema: typeof picoReaderOutputSchema;
  values: readonly PicoReaderValue[];
  references: readonly PicoOpaqueReference[];
}

export const picoReaderOutputSchema = 'pico.reader.output.v1' as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function parseValue(value: unknown): PicoReaderValue {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_reader_value');
  }
  assertExactKeys(record, ['name', 'type', 'value', 'originClass'], 'invalid_pico_reader_value');
  if (typeof record.name !== 'string' || !picoReaderTokenPattern.test(record.name)) {
    throw new Error('invalid_pico_reader_value_name');
  }
  if (typeof record.type !== 'string'
    || !(picoReaderValueTypes as readonly string[]).includes(record.type)) {
    throw new Error('invalid_pico_reader_value_type');
  }
  const type = record.type as PicoReaderValueType;
  if (typeof record.originClass !== 'string') {
    throw new Error('invalid_pico_reader_value_origin');
  }
  const originClass = record.originClass as PicoEventOriginClass;
  if (mayPicoOriginInstruct(originClass)) {
    // The laundering refusal, stated as its own error so it is never confused
    // with an ordinary shape failure.
    throw new Error('pico_reader_value_cannot_be_person_present');
  }

  switch (type) {
    case 'token': {
      if (typeof record.value !== 'string' || !picoReaderTokenPattern.test(record.value)) {
        throw new Error('invalid_pico_reader_value');
      }
      break;
    }
    case 'text': {
      if (typeof record.value !== 'string' || record.value.length > maxPicoReaderTextChars) {
        throw new Error('invalid_pico_reader_value');
      }
      break;
    }
    case 'number': {
      if (typeof record.value !== 'number' || !Number.isFinite(record.value)) {
        throw new Error('invalid_pico_reader_value');
      }
      break;
    }
    case 'boolean': {
      if (typeof record.value !== 'boolean') {
        throw new Error('invalid_pico_reader_value');
      }
      break;
    }
    case 'instant': {
      // Befund B52: hier stand die schwache Haelfte - `toISOString`-Rundlauf
      // ohne die feste Breite. `+275760-09-13T00:00:00.000Z` kam durch, und
      // ein solcher Wert sortiert als Zeichenkette vor jedem gewoehnlichen
      // Jahr. Was hier hereinkommt, hat ein Modell geantwortet.
      assertPicoInstant(record.value, 'invalid_pico_reader_value');
      break;
    }
    case 'reference': {
      if (typeof record.value !== 'string' || !picoReaderTokenPattern.test(record.value)) {
        throw new Error('invalid_pico_reader_value');
      }
      break;
    }
    default: {
      throw new Error('invalid_pico_reader_value_type');
    }
  }

  return Object.freeze({
    name: record.name,
    type,
    value: record.value as string | number | boolean,
    originClass,
  });
}


function parseReference(value: unknown): PicoOpaqueReference {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_opaque_reference');
  }
  assertExactKeys(
    record,
    ['referenceId', 'expiresAt', 'originClass'],
    'invalid_pico_opaque_reference',
  );
  if (typeof record.referenceId !== 'string'
    || !picoReaderTokenPattern.test(record.referenceId)) {
    throw new Error('invalid_pico_opaque_reference');
  }
  // Befund B52. Dieselbe schwache Haelfte an einem Ablauf - und ein Ablauf,
  // der vor allem sortiert, ist keine Frist.
  // ADR 0060: a reference that never expires is a standing grant, and this
  // one is handed to a model.
  assertPicoInstant(record.expiresAt, 'invalid_pico_opaque_reference_expiry');
  if (typeof record.originClass !== 'string') {
    throw new Error('invalid_pico_opaque_reference');
  }
  const originClass = record.originClass as PicoEventOriginClass;
  if (mayPicoOriginInstruct(originClass)) {
    throw new Error('pico_reader_value_cannot_be_person_present');
  }
  return Object.freeze({ referenceId: record.referenceId, expiresAt: record.expiresAt, originClass });
}

/**
 * ADR 0117 X2. Refuses on parse failure rather than dropping the offending
 * field: a reader output that half-parsed is a reader output nobody declared,
 * and continuing with the parts that happened to fit is how an unexpected
 * shape becomes an accepted one.
 */
export function parsePicoReaderOutput(value: unknown): PicoReaderOutput {
  const record = isRecord(value) ? value : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_reader_output');
  }
  assertExactKeys(record, ['schema', 'values', 'references'], 'invalid_pico_reader_output');
  if (record.schema !== picoReaderOutputSchema) {
    throw new Error('invalid_pico_reader_output_schema');
  }
  if (!Array.isArray(record.values) || !Array.isArray(record.references)) {
    throw new Error('invalid_pico_reader_output');
  }
  if (record.values.length + record.references.length > maxPicoReaderValues) {
    throw new Error('pico_reader_output_too_large');
  }

  const values = (record.values as unknown[]).map(parseValue);
  const names = new Set<string>();
  for (const parsed of values) {
    if (names.has(parsed.name)) {
      // A duplicate name is a shape the consumer cannot read unambiguously,
      // and "last one wins" is a decision no declared schema made.
      throw new Error('duplicate_pico_reader_value_name');
    }
    names.add(parsed.name);
  }
  const references = (record.references as unknown[]).map(parseReference);

  return Object.freeze({
    schema: picoReaderOutputSchema,
    values: Object.freeze(values),
    references: Object.freeze(references),
  });
}

export interface PicoPlannerContextInput {
  /** Pico's own policy and system material. Instruction layer by definition. */
  policy: readonly string[];
  /** What the present person said. The only authored instruction source. */
  personPresent: readonly string[];
  /** Declared, origin-carrying reader output. Data, never instruction. */
  values: readonly PicoReaderValue[];
  references: readonly PicoOpaqueReference[];
}

/**
 * ADR 0117 X1. Assembles the acting model's context from the only four things
 * admitted: policy, the present person, typed values and opaque references.
 *
 * There is no parameter for untrusted content. That absence is the gate - not
 * a filter that could be misconfigured, and not a delimiter that has to hold.
 * A caller holding a stranger's mail has nowhere to put it, and the type
 * system says so at the call site rather than at review time.
 *
 * The values still land as data blocks under W3's discipline, because a
 * `text` value is a string and X2 narrows that channel without closing it.
 * What has changed is that the string arrives declared and labeled, and the
 * planner has no path on which raw content could arrive undeclared.
 */
export function assemblePicoPlannerContext(
  input: PicoPlannerContextInput,
): PicoModelContext {
  const record = isRecord(input) ? input : undefined;
  if (record === undefined) {
    throw new Error('invalid_pico_planner_context_input');
  }
  assertExactKeys(
    record,
    ['policy', 'personPresent', 'values', 'references'],
    'invalid_pico_planner_context_input',
  );
  if (!Array.isArray(record.policy)
    || !Array.isArray(record.personPresent)
    || !Array.isArray(record.values)
    || !Array.isArray(record.references)) {
    throw new Error('invalid_pico_planner_context_input');
  }

  // Re-parsed rather than trusted. This is a boundary, and a value that only
  // type-checked at some earlier call site has not crossed it.
  const values = (record.values as unknown[]).map(parseValue);
  const references = (record.references as unknown[]).map(parseReference);

  return assemblePicoModelContext({
    policy: record.policy as readonly string[],
    units: [
      ...(record.personPresent as readonly string[]).map((text) => ({
        originClass: 'person_present' as const,
        text,
      })),
      ...values.map((value) => ({
        originClass: value.originClass,
        text: `${value.name}=${String(value.value)}`,
        sourceLabel: `value.${value.type}`,
      })),
      ...references.map((reference) => ({
        originClass: reference.originClass,
        text: reference.referenceId,
        sourceLabel: 'reference',
      })),
    ],
  });
}

export { picoModelContextSchema };
