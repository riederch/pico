import {
  parsePicoModelJob,
  picoModelJobAllowanceFor,
  picoModelJobSchema,
  type PicoModelJob,
} from '@pico/protocol/model-job';
import type { PicoEventOriginClass } from '@pico/protocol';
import type { MemoryItem } from './memory-store.js';

/**
 * ADR 0116 W1-W3 - the first thing in this tree that asks a model a question
 * on a person's behalf.
 *
 * Everything before this was Pico reading its own material on an occasion:
 * a library gets attached, files get read, answers wait to be kept. Nobody
 * could *ask* anything. The whole model strand existed under a requesting side
 * that did not.
 *
 * **The person's words and their memories are different things, and the
 * difference is the design.** The question enters as a `person_present` unit,
 * which is the only origin above ADR 0116's instruction threshold; every
 * memory item enters carrying the origin it was recorded with. That is not
 * bookkeeping:
 *
 * - **it decides where the words may go.** `picoModelJobAllowanceFor` reads
 *   the lowest origin present, so a question over the person's own notes - or
 *   over an answer Pico derived from them - needs only the live turn, while
 *   one that pulls in a housemate's note or a supplier's document needs a
 *   provider that proved who it is (ADR 0151 PV1). Nothing here chooses that;
 *   it falls out of what was actually included.
 * - **it decides what may instruct.** ADR 0117 X2's assembly puts
 *   `person_present` text in the instruction block and everything else in
 *   quoted data, so a note that says "ignore your instructions" is data about
 *   a note rather than a second voice.
 *
 * **What this cannot do is find things.** There is no index and no similarity
 * search, so "relevant" means "recent in the domain you named". A person who
 * asks about last March gets last March only if it is still near the top. That
 * is a real limit and it is stated rather than dressed up: the alternative was
 * to invent a retrieval story ahead of the first one anybody has asked for.
 */

/** ADR 0119 Q5. A question longer than this is refused, never trimmed. */
export const maxPicoRecallQuestionChars = 4_000;

/**
 * How many of a domain's newest items are even considered.
 *
 * A bound on the *reading*, before any budget arithmetic: a domain can hold a
 * hundred thousand items and deciding which ones fit must not become a scan of
 * all of them.
 */
export const maxPicoRecallCandidates = 200;

/**
 * Characters per token, for deciding how much fits.
 *
 * **An estimate, and deliberately the pessimistic one.** There is no tokenizer
 * here and adding one would tie this Home to a vocabulary a provider may not
 * share; four characters is the common rough figure for prose and undershoots
 * on code and on languages that do not use spaces. Being wrong in that
 * direction costs a shorter context; being wrong in the other costs a refused
 * job, which is the failure a person actually sees.
 */
export const picoRecallCharsPerToken = 4;

/**
 * Room left for what the assembly adds and the answer takes.
 *
 * The policy block, the question and the answer all live inside the same
 * window as the material. Filling the window with memories would leave the
 * provider nothing to answer in.
 */
export const picoRecallReservedTokens = 512;

export interface PicoRecallItem {
  memoryItemId: string;
  content: string;
  /** ADR 0116 W2. What this item is, as recorded - never as this file wishes. */
  origin: PicoEventOriginClass;
}

export interface PicoRecallPlan {
  included: readonly PicoRecallItem[];
  /**
   * How many of the considered items did not fit.
   *
   * ADR 0119 Q5's posture: a bound that silently dropped the rest would report
   * the same success as one that read everything, and a person asking about
   * their own memory deserves to know the answer was formed from part of it.
   */
  omitted: number;
}

/**
 * ADR 0116 W3 with ADR 0142 PE2. What fits, newest first.
 *
 * Newest first because a question asked now is most often about now, and
 * because the alternative - oldest first - would fill the window with the
 * least likely material and stop exactly where the answer probably is.
 *
 * The budget is the *entry's*, not the protocol's abuse ceiling: PE2 measured
 * what this deployment actually serves, and assembling against anything else
 * would make the measurement decorative.
 */
export function picoRecallPlan(input: {
  question: string;
  candidates: readonly PicoRecallItem[];
  contextTokens: number;
}): PicoRecallPlan {
  const budgetChars = Math.max(
    0,
    (input.contextTokens - picoRecallReservedTokens) * picoRecallCharsPerToken
      - input.question.length,
  );

  const included: PicoRecallItem[] = [];
  let used = 0;
  for (const item of input.candidates) {
    if (used + item.content.length > budgetChars) {
      // Stopped rather than cut: half a note is a sentence nobody wrote, and a
      // reader cannot tell it from one somebody did.
      continue;
    }
    used += item.content.length;
    included.push(item);
  }

  return Object.freeze({
    included: Object.freeze(included),
    omitted: input.candidates.length - included.length,
  });
}

/**
 * ADR 0116 W2 with ADR 0117 X2. The question, the material, and what an answer
 * has to look like.
 *
 * An item whose content could not be produced - shredded, or encrypted with no
 * key here - is not in `candidates` at all, because there is nothing to send.
 * That absence is the caller's to notice; this builder has no way to represent
 * a memory it cannot read, which is the shape that stops one being invented.
 */
export const picoRecallExpectations = Object.freeze([
  Object.freeze({ name: 'answer', type: 'text' }),
  /**
   * ADR 0117 X2. Whether the material actually contained an answer.
   *
   * Declared as its own value rather than left to prose, so "I could not find
   * that" arrives as a fact a surface can act on instead of a sentence a
   * person has to interpret - and so a confident-sounding answer over nothing
   * is at least contradicted by a field.
   */
  Object.freeze({ name: 'found_in_memory', type: 'boolean' }),
]);

export function picoRecallJob(input: {
  jobId: string;
  question: string;
  items: readonly PicoRecallItem[];
  nowMs: number;
}): PicoModelJob {
  if (input.question.trim() === '' || input.question.length > maxPicoRecallQuestionChars) {
    throw new Error('invalid_pico_recall_question');
  }
  const units = [
    { originClass: 'person_present' as const, text: input.question },
    ...input.items.map((item) => ({
      // The origin the item was recorded with, carried unchanged. A recall
      // that relabelled its material would be laundering it through the field
      // ADR 0116 W2 exists to keep honest.
      originClass: item.origin,
      text: item.content,
    })),
  ];
  return parsePicoModelJob({
    schema: picoModelJobSchema,
    jobId: input.jobId,
    // ADR 0117 X1. A reader, because this reads material and returns declared
    // values. Nothing it answers becomes an action, and a planner reading a
    // housemate's note is the thing that split exists to prevent.
    role: 'reader',
    units,
    references: [],
    expects: [...picoRecallExpectations],
    /**
     * ADR 0151 PV3. Computed from the units this job actually carries, and
     * stated so the parser re-derives it and refuses a mismatch.
     *
     * Unlike a library read - which is always somebody's stored material and
     * can say so as a constant - a recall is whatever was included: the same
     * question over the same domain needs the live turn today and a proven
     * provider tomorrow, because a housemate synced a note into it.
     */
    carries: picoModelJobAllowanceFor(units),
  }, input.nowMs);
}

/** What a memory item offers a recall, or nothing when it offers nothing. */
export function picoRecallItemOf(item: MemoryItem): PicoRecallItem | undefined {
  if (typeof item.content !== 'string' || item.content.trim() === '') {
    // Shredded, undecryptable, or empty. One silence for all three: a recall
    // that named which would be a shred oracle, and none of them has words to
    // send anyway.
    return undefined;
  }
  return Object.freeze({
    memoryItemId: item.memoryItemId,
    content: item.content,
    /**
     * ADR 0116 W2. An item with no recorded origin is `unattributed`, which is
     * the class that says exactly that.
     *
     * This used to read `own_pico`, on the reasoning that the conservative
     * label costs the wider allowance rather than a wrong one. Since 2026-08-16
     * `own_pico` no longer costs the wider allowance (ADR 0151 PV1), so that
     * reasoning would now buy the opposite of what it was for: material nobody
     * labelled would travel to a provider that never proved who it is, on the
     * strength of a guess this file made.
     *
     * `unattributed` is both the truthful reading and the conservative one -
     * it may not instruct, and it needs a proven provider - which is what a
     * missing label should cost.
     */
    origin: item.origin ?? 'unattributed',
  });
}
