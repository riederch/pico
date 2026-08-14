import { picoLibraryReadJob } from './library-read.js';
import type { PicoModelJobQueue } from './model-job-queue.js';

/**
 * ADR 0143 DP1 with ADR 0136 BR3 - what happens when a person attaches a
 * library, and the two things this is careful not to do.
 *
 * Attaching is the occasion. It is a person saying "this material is mine and
 * Pico may have it", which is the closest thing to an instruction a library
 * ever gives, and it happens once rather than continuously - so it is the
 * cheapest honest place to put the first enqueue.
 *
 * **The core lists and the supplier reads.** Pico fetched the working copy
 * with `git`, so the paths are its own knowledge; the bytes are not. Every
 * excerpt crosses the ADR 0136 BR2 slot, which is what keeps "the core
 * processes no supplier material" true when the material is sitting on the
 * core's own disk. A shortcut here - reading the file directly because it is
 * right there - would be the boundary becoming a comment.
 *
 * **An attachment does not become unbounded work.** A corpus can hold a
 * hundred thousand files, one lane answers about twenty a minute, and a person
 * who attached a repository did not ask for their accelerator to be busy until
 * Thursday. So the plan is capped and says what it left out, in ADR 0119 Q5's
 * posture: a bound that silently dropped the rest would report the same
 * success as one that read everything.
 */

/**
 * How many files one attachment may queue.
 *
 * Two hundred, and the figure comes from what it costs: at the measured 26
 * tok/s with a two-hundred-token answer, that is roughly half an hour of a
 * single lane. Long enough to be useful on a real corpus, short enough that a
 * person can watch it finish, and small enough that attaching a second library
 * before the first is done is inconvenient rather than ruinous.
 */
export const maxPicoDepotLibraryReadsPerAttachment = 200;

export interface PicoDepotLibraryReadPlan {
  /** The paths this attachment will queue, in the order it will queue them. */
  paths: readonly string[];
  /** How many were left out, so a surface can say so rather than imply none. */
  omitted: number;
}

/**
 * ADR 0119 Q5. Which files this attachment reads, and how many it does not.
 *
 * Sorted rather than taken in directory order, so the same corpus attached
 * twice queues the same work - a plan that depended on the filesystem's mood
 * would make "did this already run?" unanswerable.
 */
export function picoDepotLibraryReadPlan(input: {
  paths: readonly string[];
  maxReads?: number;
}): PicoDepotLibraryReadPlan {
  const max = input.maxReads ?? maxPicoDepotLibraryReadsPerAttachment;
  const sorted = [...input.paths].sort();
  return Object.freeze({
    paths: Object.freeze(sorted.slice(0, max)),
    omitted: Math.max(0, sorted.length - max),
  });
}

export interface PicoDepotLibraryIntakePorts {
  /**
   * ADR 0136 BR2. Asks the supplier for one bounded excerpt. Returns null when
   * the supplier had nothing for that path - covered and absent, which is not
   * an error and not a job.
   */
  readExcerpt: (path: string) => Promise<{ text: string; commit: string } | null>;
  queue: PicoModelJobQueue;
  jobId: (path: string) => string;
  nowMs: () => number;
  at: () => string;
}

export interface PicoDepotLibraryIntakeInput {
  supplierIdentifier: string;
  privacyDomain: string;
  picoIdentityFingerprintHex: string;
  entryId: string;
  plan: PicoDepotLibraryReadPlan;
  /**
   * ADR 0117 X2. What a read of this library is expected to answer with.
   *
   * Passed in rather than fixed here: what is worth extracting from somebody's
   * corpus is a product question, and this module's business is that there
   * *is* an answer shape at all.
   */
  expects: ReadonlyArray<{ name: string; type: string }>;
  question: string;
}

export interface PicoDepotLibraryIntakeReport {
  queued: number;
  /** Paths the supplier had nothing for. Counted, because absent is a fact. */
  absent: number;
  /** Paths whose excerpt the supplier refused - too large, out of scope. */
  refused: number;
  omitted: number;
}

/**
 * ADR 0143 DP1. Turns an attachment into queued reads, one per file.
 *
 * **Nothing is dispatched here.** The queue drains on its own timer at the
 * rate the provider has, and an attachment that dispatched would be an
 * attachment holding the accelerator while a person waited for a dialog to
 * close.
 *
 * Every outcome is counted rather than logged and forgotten: a person who
 * attached two hundred files and got one hundred and eighty jobs is owed the
 * other twenty as a number, not as silence.
 */
export async function enqueuePicoDepotLibraryReads(
  ports: PicoDepotLibraryIntakePorts,
  input: PicoDepotLibraryIntakeInput,
): Promise<PicoDepotLibraryIntakeReport> {
  let queued = 0;
  let absent = 0;
  let refused = 0;

  for (const path of input.plan.paths) {
    let excerpt: { text: string; commit: string } | null;
    try {
      excerpt = await ports.readExcerpt(path);
    } catch {
      // A supplier that refused this one file has not failed the attachment.
      // ADR 0137 IN2's neighbour: one refusal is about one subject.
      refused += 1;
      continue;
    }
    if (excerpt === null) {
      absent += 1;
      continue;
    }

    const jobId = ports.jobId(path);
    const nowMs = ports.nowMs();
    try {
      ports.queue.enqueue({
        job: picoLibraryReadJob({
          jobId,
          contextRefId: `ref_${jobId}`,
          privacyDomain: input.privacyDomain,
          excerpt: { path, text: excerpt.text, commit: excerpt.commit },
          expects: input.expects,
          question: input.question,
          nowMs,
        }),
        picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
        entryId: input.entryId,
        at: ports.at(),
      });
      queued += 1;
    } catch {
      // A job that will not build is not a job to queue. It fails here, where
      // the file that caused it is still known, rather than as an unparseable
      // row somebody finds later.
      refused += 1;
    }
  }

  return Object.freeze({ queued, absent, refused, omitted: input.plan.omitted });
}

/**
 * ADR 0152, and the one thing a fetch may not decide for a person.
 *
 * A queued job names the entry it will run on, so something has to choose -
 * and choosing between providers on somebody's behalf is exactly what ADR
 * 0152's surface exists to ask about. So this chooses only when there is
 * nothing to choose:
 *
 * - **no decided entry** means no jobs, which is ADR 0138's posture rather
 *   than a failure: reaching outside is off until somebody says so;
 * - **exactly one** is not a choice, and is used;
 * - **more than one** is a choice, and it is refused by name. A fetch that
 *   picked the first would be a background task deciding whose machine reads
 *   this person's corpus, silently, at a moment they were not looking.
 */
export type PicoDepotIntakeEntryChoice =
  | { entryId: string }
  | { refusal: 'no_decided_entry' | 'more_than_one_decided_entry' };

export function pickPicoDepotIntakeEntry(
  decidedEntryIds: readonly string[],
): PicoDepotIntakeEntryChoice {
  if (decidedEntryIds.length === 0) {
    return Object.freeze({ refusal: 'no_decided_entry' as const });
  }
  if (decidedEntryIds.length > 1) {
    return Object.freeze({ refusal: 'more_than_one_decided_entry' as const });
  }
  return Object.freeze({ entryId: decidedEntryIds[0]! });
}
