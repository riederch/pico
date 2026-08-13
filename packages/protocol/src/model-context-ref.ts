import {
  picoEventOriginClasses,
  type PicoEventOriginClass,
} from './index.js';

/**
 * ADR 0060, made real - **the reference a job carries, not the one a reader
 * returns.**
 *
 * Two things in this tree are called a reference and point in opposite
 * directions. ADR 0117 X2's `PicoOpaqueReference` travels *out* of a reader:
 * a handle the planner may hold and not expand. This one travels *in*: a
 * bounded packet of somebody's memory, prepared under policy, that a provider
 * is given so it never has to read the source. Conflating them would be
 * conflating "what the model may not open" with "what the model was handed".
 *
 * ADR 0060's draft shape carried seven fields that may only ever hold one
 * value: `sourceAccessMode` fixed at `materialized_excerpt`,
 * `providerExpansionAllowed` false, `reusableAcrossJobs` false,
 * `redactionApplied` true, `allowedForProvider` true, and an `expansionScope`
 * that must stay `none`. **None of them exists here.** A field that may only
 * be false is a promise stored where an edit can find it, and this tree has
 * now removed that shape three times - ADR 0117 X1's construction, ADR 0150's
 * push envelope, ADR 0117 X4's job.
 *
 * What replaces the two that mattered most is structure rather than wording:
 *
 * - **`reusableAcrossJobs: false` becomes the reference naming its job.** A
 *   reference that cannot be written without a job is one that cannot be
 *   reused across jobs, and no boolean has to be read for that to hold.
 * - **`sourceAccessMode: 'materialized_excerpt'` becomes there being nowhere
 *   to put a source.** The reference carries the bytes it resolved to and no
 *   address, so a provider reading through to the source is not refused - it
 *   is unsayable, which is ADR 0060's own core rule with the enforcement
 *   moved into the shape.
 *
 * The two claims - that redaction happened and that policy allowed this - are
 * dropped rather than moved. Both describe work done *before* the reference
 * existed, by the party writing the reference, and a claim about one's own
 * completed homework verifies nothing. What the reference says instead is what
 * it *is*: this many bytes, from this origin, for this job, until this moment.
 */

export const picoModelContextRefSchema = 'pico.model.context.ref.v1' as const;

/**
 * ADR 0060. A packet is small because a corpus is read where it lies.
 *
 * The same ceiling ADR 0136 BR2 puts on a supplier frame, for the same
 * reason: a reference is one bounded excerpt for one job, and something that
 * needs more than this is a library, not an excerpt.
 */
export const maxPicoModelContextRefBytes = 128 * 1_024;

/**
 * ADR 0060. A reference is valid for one job window.
 *
 * An hour is generous for a job whose provider answers in seconds, and it is a
 * ceiling rather than a target: it exists so that a reference minted with a
 * year of validity - the trap ADR 0107 hit first - cannot be written at all.
 */
export const maxPicoModelContextRefLifetimeMs = 60 * 60 * 1_000;

export interface PicoModelContextRef {
  schema: typeof picoModelContextRefSchema;
  contextRefId: string;
  /** The one job this packet was prepared for. */
  jobId: string;
  /** ADR 0116 W2. Whose words these are, which decides where they may go. */
  originClass: PicoEventOriginClass;
  /** The privacy domain the excerpt came from, for ADR 0072 accounting. */
  privacyDomain: string;
  /** The materialized bytes. There is no address beside them. */
  excerpt: string;
  /** When the source was read, so a stale packet is visible as stale. */
  materializedAt: string;
  expiresAt: string;
}

/**
 * The fields a reference has no place for, and why each was refused rather
 * than defaulted.
 */
export const picoModelContextRefSaysNothingAbout = Object.freeze({
  sourceAccessMode:
    'ADR 0060: a reference resolves to a static packet, and this one carries '
    + 'the bytes. There is no address to read through to, so the mode that '
    + 'would have been refused cannot be expressed.',
  sourceUri:
    'ADR 0060: naming a source does not grant access to it, and carrying the '
    + 'name is how a provider would come to try. The excerpt travels; the '
    + 'source stays home.',
  providerExpansionAllowed:
    'ADR 0060: expansion is not a setting. A packet is what it is, and a '
    + 'field that may only be false is a promise an edit can find.',
  expansionScope:
    'ADR 0060: same rule. A scope of `none` is the absence of a scope, said '
    + 'in a way that invites a second value.',
  reusableAcrossJobs:
    'ADR 0060: a reference names its job, so reuse across jobs is unsayable '
    + 'rather than forbidden. Nothing has to read a boolean for that to hold.',
  redactionApplied:
    'ADR 0060: a claim about the writer\'s own completed homework, made by the '
    + 'writer. It verifies nothing and reads as though it did.',
  allowedForProvider:
    'ADR 0060: policy decided before this existed. A reference asserting its '
    + 'own permission is a reference arguing for itself.',
});

const idPattern = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const domainPattern = /^[a-z][a-z0-9_.-]{0,63}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ADR 0060. Refuses rather than repairing.
 *
 * `nowMs` is required rather than read from the clock, for ADR 0107's reason:
 * a parser that consults the wall clock is one whose refusals depend on when
 * a test runs.
 */
export function parsePicoModelContextRef(value: unknown, nowMs: number): PicoModelContextRef {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_context_ref');
  }
  for (const [field, reason] of Object.entries(picoModelContextRefSaysNothingAbout)) {
    if (field in value) {
      throw new Error(`pico_model_context_ref_says_nothing_about_${field}: ${reason}`);
    }
  }

  const keys = Object.keys(value).sort();
  const expected = [
    'contextRefId', 'excerpt', 'expiresAt', 'jobId', 'materializedAt',
    'originClass', 'privacyDomain', 'schema',
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_pico_model_context_ref');
  }

  if (value.schema !== picoModelContextRefSchema) {
    throw new Error('invalid_pico_model_context_ref_schema');
  }
  for (const field of ['contextRefId', 'jobId'] as const) {
    if (typeof value[field] !== 'string' || !idPattern.test(value[field] as string)) {
      throw new Error(`invalid_pico_model_context_ref_${field === 'jobId' ? 'job' : 'id'}`);
    }
  }
  if (typeof value.originClass !== 'string'
    || !(picoEventOriginClasses as readonly string[]).includes(value.originClass)) {
    throw new Error('invalid_pico_model_context_ref_origin');
  }
  if (typeof value.privacyDomain !== 'string' || !domainPattern.test(value.privacyDomain)) {
    throw new Error('invalid_pico_model_context_ref_domain');
  }
  if (typeof value.excerpt !== 'string' || value.excerpt === '') {
    throw new Error('invalid_pico_model_context_ref_excerpt');
  }
  if (Buffer.byteLength(value.excerpt, 'utf8') > maxPicoModelContextRefBytes) {
    // ADR 0119 Q5's posture: refuse, never trim. A silently shortened excerpt
    // is a different excerpt, and the job would be answered about it.
    throw new Error('pico_model_context_ref_excerpt_too_large');
  }

  const materializedAtMs = Date.parse(String(value.materializedAt));
  const expiresAtMs = Date.parse(String(value.expiresAt));
  if (Number.isNaN(materializedAtMs) || Number.isNaN(expiresAtMs)) {
    throw new Error('invalid_pico_model_context_ref_window');
  }
  if (expiresAtMs <= materializedAtMs) {
    throw new Error('invalid_pico_model_context_ref_window');
  }
  if (expiresAtMs - materializedAtMs > maxPicoModelContextRefLifetimeMs) {
    // The unscoped case, caught at the ceiling rather than at expiry: a
    // reference minted valid for a year is a durable grant wearing a window.
    throw new Error('pico_model_context_ref_lifetime_too_long');
  }
  if (expiresAtMs <= nowMs) {
    throw new Error('pico_model_context_ref_expired');
  }

  return Object.freeze({
    schema: picoModelContextRefSchema,
    contextRefId: value.contextRefId as string,
    jobId: value.jobId as string,
    originClass: value.originClass as PicoEventOriginClass,
    privacyDomain: value.privacyDomain,
    excerpt: value.excerpt,
    materializedAt: value.materializedAt as string,
    expiresAt: value.expiresAt as string,
  });
}

/**
 * ADR 0060. Whether this packet belongs to this job.
 *
 * Separate from parsing because a well-formed reference for *another* job is
 * not malformed - it is misdelivered, and the two deserve different words.
 */
export function picoModelContextRefBelongsTo(
  reference: PicoModelContextRef,
  jobId: string,
): boolean {
  return reference.jobId === jobId;
}
