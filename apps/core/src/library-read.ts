import {
  picoModelContextRefSchema,
  parsePicoModelContextRef,
  maxPicoModelContextRefLifetimeMs,
  type PicoModelContextRef,
} from '@pico/protocol/model-context-ref';
import {
  parsePicoModelJob,
  picoModelJobSchema,
  type PicoModelJob,
} from '@pico/protocol/model-job';
import type { PicoEventOriginClass } from '@pico/protocol';

/**
 * ADR 0136 BR3 meeting ADR 0117 X4 - the first occasion in this tree that
 * wants a model.
 *
 * `bridges/README.md` has said for a while that reading a library "is lawful
 * only through ADR 0117 X4's quarantined read job, which needs a model
 * delegation runtime that does not exist, so there is no `offer` handler and
 * no content crosses a slot". It exists now, and this is the sentence coming
 * true: a supplier's excerpt becomes a bounded packet, the packet becomes a
 * job, and the job is the only lawful way that material reaches a model.
 *
 * **Nothing here decides whether it may run.** The allowance is computed from
 * the origin the excerpt arrives with, and on an unauthenticated provider the
 * dispatch refuses. That refusal is the design working rather than a gap: a
 * library is somebody's stored material, and a host that cannot say who it is
 * has no business reading it.
 *
 * **The excerpt never touches the planner.** It enters as a reference, whose
 * origin is below the instruction threshold by construction, and a planner job
 * holding one is refused at the job boundary. The only thing that comes back
 * is declared values.
 */

export interface PicoLibraryExcerpt {
  /** Where in the working copy, for the reference's own identity. */
  path: string;
  text: string;
  /** ADR 0133. The revision this excerpt was taken at. */
  commit: string;
}

/**
 * ADR 0116 W2. What a library's material is, as an origin.
 *
 * `own_pico` rather than `external_content`: a tracked corpus is the person's
 * own material, arriving through a supplier the person attached. It is still
 * below the instruction threshold - the whole point of the quarantined read is
 * that Pico did not author it, and a note somebody wrote to themselves three
 * years ago is not an instruction they are giving now.
 */
export const picoLibraryExcerptOriginClass: PicoEventOriginClass = 'own_pico';

/**
 * ADR 0060. One excerpt, one job, one window.
 *
 * The reference is minted for the job it is about to be part of, so there is
 * no moment at which a packet exists without a job to belong to - which is
 * what makes reuse across jobs unsayable rather than forbidden.
 */
export function picoLibraryContextRef(input: {
  jobId: string;
  contextRefId: string;
  privacyDomain: string;
  excerpt: PicoLibraryExcerpt;
  nowMs: number;
  lifetimeMs?: number;
}): PicoModelContextRef {
  const lifetimeMs = Math.min(
    input.lifetimeMs ?? 5 * 60 * 1_000,
    maxPicoModelContextRefLifetimeMs,
  );
  return parsePicoModelContextRef({
    schema: picoModelContextRefSchema,
    contextRefId: input.contextRefId,
    jobId: input.jobId,
    originClass: picoLibraryExcerptOriginClass,
    privacyDomain: input.privacyDomain,
    excerpt: input.excerpt.text,
    materializedAt: new Date(input.nowMs).toISOString(),
    expiresAt: new Date(input.nowMs + lifetimeMs).toISOString(),
  }, input.nowMs);
}

/**
 * ADR 0117 X4. The read a library occasion asks for.
 *
 * The expectations are the caller's, because what is worth extracting from a
 * document is a product question and this file is not the place it gets
 * answered. What this file insists on is that there *are* expectations: a
 * reader with no declared shape answers in prose, which is the channel the
 * planner-reader split closed.
 */
export function picoLibraryReadJob(input: {
  jobId: string;
  contextRefId: string;
  privacyDomain: string;
  excerpt: PicoLibraryExcerpt;
  expects: ReadonlyArray<{ name: string; type: string }>;
  question: string;
  nowMs: number;
}): PicoModelJob {
  const reference = picoLibraryContextRef(input);
  return parsePicoModelJob({
    schema: picoModelJobSchema,
    jobId: input.jobId,
    role: 'reader',
    // The question is Pico's own and enters as a unit; the material enters as
    // a reference. Two layers, and only the first is anybody's instruction.
    units: [{ originClass: 'person_present', text: input.question }],
    references: [reference],
    expects: [...input.expects],
    // Computed by the parser from what it carries; stated here so a mismatch
    // is a refusal rather than a silent widening.
    carries: 'live_turn_and_retrieved_memory',
  }, input.nowMs);
}
