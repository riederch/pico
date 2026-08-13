import { parsePicoReaderOutput, type PicoReaderOutput } from './planner-reader.js';

/**
 * ADR 0059, made real - what came back, and the four things it may not claim
 * about itself.
 *
 * ADR 0059's core rule is that a result envelope is **not execution proof, not
 * action approval and not a correctness certificate**. Its draft shape then
 * carried a field for each: `actionExecuted`, `toolExecuted`, a `qualityClaims`
 * object with `modelCorrectnessVerified` and `safetyCertified`, a
 * `providerAuditRef` that "is not a signature, attestation or verified audit
 * record", and a `retentionApplied` that "is metadata, not enforcement".
 *
 * **Six fields whose documentation is a list of what they do not mean.** That
 * is the shape this tree keeps removing: a promise stored where an edit can
 * find it. A result that can write `actionExecuted: true` is a result that can
 * claim it acted, and the only thing standing between that claim and belief is
 * whoever remembers to check the boolean.
 *
 * So none of them exists. What replaces them is provenance a caller can
 * actually check: the result names **which job**, **which entry** and **which
 * model digest** produced it, and the caller compares those against what it
 * dispatched. ADR 0142 PE6 pinned that digest for exactly this moment - a
 * provider whose model was swapped behind its tag answers a job the entry no
 * longer describes, and the mismatch is arithmetic rather than trust.
 *
 * The payload is ADR 0117 X2's reader output, unchanged. That is what makes
 * "not action approval" structural: the result carries declared,
 * origin-carrying values, and there is no shape in it for an action.
 */

export const picoModelResultSchema = 'pico.model.result.v1' as const;

export interface PicoModelResult {
  schema: typeof picoModelResultSchema;
  jobId: string;
  /** Which entry ran it, and which weights answered (ADR 0142 PE6). */
  entryId: string;
  modelDigestHex: string;
  startedAt: string;
  completedAt: string;
  /** ADR 0117 X2. Declared values with their origins, never prose. */
  output: PicoReaderOutput;
}

export const picoModelResultSaysNothingAbout = Object.freeze({
  actionExecuted:
    'ADR 0059: a result envelope is not execution proof. A field that could '
    + 'carry `true` is a claim to have acted, kept one edit away from being '
    + 'believed.',
  toolExecuted:
    'ADR 0059 with ADR 0117 X4: the reader held no tools, so there is nothing '
    + 'for this to report. A job that could not use a tool cannot return news '
    + 'about one.',
  qualityClaims:
    'ADR 0050: no model quality, safety or correctness claim is made anywhere '
    + 'in this tree, and a provider certifying its own output is the confused '
    + 'deputy in its shortest form.',
  providerAuditRef:
    'ADR 0059 says this "is not a signature, attestation or verified audit '
    + 'record". Something that looks like evidence and is not is worse than '
    + 'nothing, because it gets read as evidence.',
  retentionApplied:
    'ADR 0048: inference runtimes log, and a provider\'s statement about its '
    + 'own logs is unverifiable from here. ADR 0070\'s shredding does not reach '
    + 'the execution site, and a field claiming otherwise would hide that.',
});

const idPattern = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePicoModelResult(value: unknown): PicoModelResult {
  if (!isRecord(value)) {
    throw new Error('invalid_pico_model_result');
  }
  for (const [field, reason] of Object.entries(picoModelResultSaysNothingAbout)) {
    if (field in value) {
      throw new Error(`pico_model_result_says_nothing_about_${field}: ${reason}`);
    }
  }

  const keys = Object.keys(value).sort();
  const expected = [
    'completedAt', 'entryId', 'jobId', 'modelDigestHex', 'output', 'schema', 'startedAt',
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_pico_model_result');
  }

  if (value.schema !== picoModelResultSchema) {
    throw new Error('invalid_pico_model_result_schema');
  }
  for (const field of ['jobId', 'entryId'] as const) {
    if (typeof value[field] !== 'string' || !idPattern.test(value[field] as string)) {
      throw new Error(`invalid_pico_model_result_${field === 'jobId' ? 'job' : 'entry'}`);
    }
  }
  if (typeof value.modelDigestHex !== 'string' || !digestPattern.test(value.modelDigestHex)) {
    throw new Error('invalid_pico_model_result_digest');
  }

  const startedAtMs = Date.parse(String(value.startedAt));
  const completedAtMs = Date.parse(String(value.completedAt));
  if (Number.isNaN(startedAtMs) || Number.isNaN(completedAtMs) || completedAtMs < startedAtMs) {
    // A result that finished before it started is not a clock problem worth
    // repairing; it is a record nobody produced by running anything.
    throw new Error('invalid_pico_model_result_window');
  }

  return Object.freeze({
    schema: picoModelResultSchema,
    jobId: value.jobId as string,
    entryId: value.entryId as string,
    modelDigestHex: value.modelDigestHex,
    startedAt: value.startedAt as string,
    completedAt: value.completedAt as string,
    output: parsePicoReaderOutput(value.output),
  });
}

/**
 * ADR 0059's provenance rule, as the only form of it that checks anything.
 *
 * The draft carried `jobId` beside `requestedJobId` and `providerId` beside
 * `requestedProviderId`, inside one envelope, and required them to match. That
 * compares a record with itself: whoever wrote one wrote the other. **The
 * comparison has to be against what the caller dispatched**, which the caller
 * holds and the provider never saw.
 *
 * The digest is the sharpest of the three. ADR 0142 measured a host whose port
 * accepts unauthenticated `pull`, so the model behind a tag is mutable by
 * anyone who can reach it; a result carrying a digest the entry does not pin
 * came from weights nobody measured, whatever the job says.
 */
export function picoModelResultMismatch(
  result: PicoModelResult,
  dispatched: { jobId: string; entryId: string; modelDigestHex: string },
): 'answers_another_job' | 'from_another_entry' | 'from_other_weights' | null {
  if (result.jobId !== dispatched.jobId) {
    return 'answers_another_job';
  }
  if (result.entryId !== dispatched.entryId) {
    return 'from_another_entry';
  }
  if (result.modelDigestHex !== dispatched.modelDigestHex) {
    return 'from_other_weights';
  }
  return null;
}
