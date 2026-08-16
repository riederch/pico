import { parsePicoModelJob, type PicoModelJob } from '@pico/protocol/model-job';
import type { PicoModelProviderObservation } from '@pico/protocol/model-provider-state';
import type Database from 'better-sqlite3';

/**
 * ADR 0049's job queue, and the one judgement it makes.
 *
 * **It does not decide what Pico wants read.** That is a product question
 * nobody has answered, and a queue that answered it would be answering it
 * quietly. What it decides is narrower and unavoidable: **which refusals are
 * worth trying again.**
 *
 * A provider that could not be reached might be reachable in six minutes. A
 * job whose words that entry may not carry will be refused identically
 * forever, because nothing about the passage of time changes whose words they
 * are. Retrying the second is a Home spending a person's battery on an answer
 * it already has - the same distinction ADR 0150 PU5 drew between `too_soon`
 * and `already_pushed_for_this_event`, and for the same reason.
 *
 * So a stable refusal settles the row. It is not a failure to be retried; it
 * is the answer, and a queue that kept it pending would be a queue that never
 * empties and a surface that never stops saying "working on it".
 */

/**
 * Refusals that will not change by waiting.
 *
 * Listed rather than derived from a negation, so adding a refusal later is a
 * decision somebody makes on purpose. Getting this list wrong in the generous
 * direction costs a retry; getting it wrong in the other direction costs a job
 * that never runs again, so the bias is deliberate: **only refusals that are
 * about the job itself are final.** Everything about the world is transient,
 * including things that look permanent.
 */
export const picoModelJobFinalRefusals = [
  /** The job's role may not run on this entry's class. No credential fixes it. */
  'role_outside_trust_boundary',
  /** This entry may not carry these words. A wider entry is a different entry. */
  'entry_may_not_carry_these_words',
  /** The answer was not the declared shape, which is about this job's contract. */
  'answer_was_not_the_declared_shape',
] as const;

export function picoModelJobRefusalIsFinal(refusal: string): boolean {
  return (picoModelJobFinalRefusals as readonly string[]).includes(refusal);
}

/**
 * ADR 0116 W1. Which kind of work a queued job is.
 *
 * Stated on the row rather than inferred from what it lacks: "no library
 * derivation" meant "recall" for exactly as long as there were two kinds, and
 * a third would have joined the second without anybody deciding it.
 */
export const picoModelJobKinds = ['library_read', 'recall'] as const;
export type PicoModelJobKind = typeof picoModelJobKinds[number];

export interface PicoModelJobQueueRow {
  jobId: string;
  picoIdentityFingerprintHex: string;
  entryId: string;
  job: PicoModelJob;
  enqueuedAt: string;
  attempts: number;
}

interface Row {
  jobId: string;
  picoIdentityFingerprintHex: string;
  entryId: string;
  jobJson: string;
  enqueuedAt: string;
  attempts: number;
}

export class PicoModelJobQueue {
  public constructor(private readonly db: Database.Database) {}

  /**
   * `nowMs` is passed rather than read, for the reason every parser here takes
   * one: a job's references have a window, and whether they are still open is
   * a question about the caller's clock rather than this module's.
   */
  public enqueue(input: {
    job: PicoModelJob;
    picoIdentityFingerprintHex: string;
    entryId: string;
    at: string;
    /**
     * ADR 0136 BR6. Where these bytes came from, recorded now rather than
     * reconstructed later: by the time somebody keeps the answer, the working
     * copy has moved on and the commit this was read at is gone from it.
     *
     * Absent for a recall (ADR 0116 W1): a question over the person's own
     * memories was derived from no supplier, and a fabricated pin would be the
     * lie BR6's completeness rule exists to prevent.
     */
    derivedFrom?: { supplierIdentifier: string; commit: string; pinCoversContent: boolean };
    kind?: PicoModelJobKind;
    /**
     * ADR 0116 W5 with W2. What a recall read, so its answer can be kept as
     * something derived from it rather than as an item about nothing.
     */
    recallContext?: { privacyDomain: string; memoryItemIds: readonly string[] };
  }): void {
    const kind = input.kind ?? 'library_read';
    if (kind === 'library_read' && input.derivedFrom === undefined) {
      // A library read without its derivation is the partial provenance ADR
      // 0136 BR6 refuses, arriving one step earlier than the keep that would
      // have caught it.
      throw new Error('pico_model_job_library_read_without_derivation');
    }
    this.db.prepare(`
      INSERT INTO pico_model_job_queue (
        job_id, pico_identity_fingerprint_hex, entry_id, job_json, enqueued_at,
        derived_from_supplier, derived_pin_value, derived_pin_covers_content, kind,
        recall_context_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO NOTHING
    `).run(
      input.job.jobId,
      input.picoIdentityFingerprintHex,
      input.entryId,
      JSON.stringify(input.job),
      input.at,
      input.derivedFrom?.supplierIdentifier ?? null,
      input.derivedFrom?.commit ?? null,
      input.derivedFrom === undefined ? null : (input.derivedFrom.pinCoversContent ? 1 : 0),
      kind,
      input.recallContext === undefined ? null : JSON.stringify(input.recallContext),
    );
  }

  /**
   * The oldest job still waiting, parsed on the way out.
   *
   * **Expiry is not checked here and that is deliberate.** A job whose
   * references have run out fails to parse, and a row that cannot be parsed is
   * settled rather than skipped - a queue that silently stepped over it would
   * hold a job forever that nothing will ever run.
   */
  public next(nowMs: number, at: string, within?: {
    /**
     * ADR 0142 PE3. Restricts the pick to one entry, so a sweep filling that
     * entry's lanes cannot be stopped by the oldest waiting job belonging to a
     * different provider.
     */
    entryId: string;
    /** Jobs this sweep already holds. They are pending and must not be picked twice. */
    excluding: readonly string[];
  }): PicoModelJobQueueRow | undefined {
    const placeholders = (within?.excluding ?? []).map(() => '?').join(', ');
    const row = this.db.prepare(`
      SELECT job_id AS jobId,
             pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
             entry_id AS entryId, job_json AS jobJson,
             enqueued_at AS enqueuedAt, attempts
      FROM pico_model_job_queue
      WHERE settled_at IS NULL
        ${within === undefined ? '' : 'AND entry_id = ?'}
        ${placeholders === '' ? '' : `AND job_id NOT IN (${placeholders})`}
      ORDER BY enqueued_at, job_id
      LIMIT 1
    `).get(...(within === undefined ? [] : [within.entryId, ...within.excluding])) as Row | undefined;
    if (row === undefined) {
      return undefined;
    }
    try {
      return Object.freeze({
        jobId: row.jobId,
        picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
        entryId: row.entryId,
        job: parsePicoModelJob(JSON.parse(row.jobJson), nowMs),
        enqueuedAt: row.enqueuedAt,
        attempts: row.attempts,
      });
    } catch (error) {
      this.settle({
        jobId: row.jobId,
        outcome: error instanceof Error ? error.message : 'unparseable',
        at,
      });
      return undefined;
    }
  }

  public recordAttempt(jobId: string, at: string): void {
    this.db.prepare(`
      UPDATE pico_model_job_queue
      SET attempts = attempts + 1, last_attempt_at = ?
      WHERE job_id = ?
    `).run(at, jobId);
  }

  public settle(input: { jobId: string; outcome: string; result?: unknown; at: string }): void {
    this.db.prepare(`
      UPDATE pico_model_job_queue
      SET settled_at = ?, outcome = ?, result_json = ?
      WHERE job_id = ?
    `).run(
      input.at,
      input.outcome,
      input.result === undefined ? null : JSON.stringify(input.result),
      input.jobId,
    );
  }

  public pendingCount(): number {
    return (this.db
      .prepare('SELECT COUNT(*) AS pending FROM pico_model_job_queue WHERE settled_at IS NULL')
      .get() as { pending: number }).pending;
  }

  /**
   * ADR 0116 W5. Everything the explicit keep needs, and nothing it does not.
   *
   * The provenance is read back out of the job's own reference rather than
   * carried alongside: the commit an excerpt was taken at is a property of
   * that excerpt, and a second copy would be a second thing to keep in step.
   */
  public keptView(jobId: string): {
    picoIdentityFingerprintHex: string;
    outcome: string | null;
    privacyDomain: string;
    supplierIdentifier: string;
    commit: string;
    pinCoversContent: boolean;
    values?: unknown;
  } | undefined {
    const row = this.db.prepare(`
      SELECT pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
             job_json AS jobJson, outcome, result_json AS resultJson,
             derived_from_supplier AS supplierIdentifier,
             derived_pin_value AS commit_,
             derived_pin_covers_content AS pinCoversContent
      FROM pico_model_job_queue WHERE job_id = ?
    `).get(jobId) as {
      picoIdentityFingerprintHex: string;
      jobJson: string;
      outcome: string | null;
      resultJson: string | null;
      supplierIdentifier: string | null;
      commit_: string | null;
      pinCoversContent: number | null;
    } | undefined;
    if (row === undefined) {
      return undefined;
    }
    const job = JSON.parse(row.jobJson) as {
      references?: Array<{ privacyDomain?: string }>;
    };
    const reference = job.references?.[0];
    const output = row.resultJson === null
      ? undefined
      : (JSON.parse(row.resultJson) as { values?: unknown }).values;
    if (row.supplierIdentifier === null
      || row.commit_ === null
      || row.pinCoversContent === null
      || reference?.privacyDomain === undefined) {
      // A row queued before provenance was recorded. ADR 0136 BR6 refuses a
      // partial derivation, so this is not a keep with gaps - it is not a keep.
      return undefined;
    }
    return {
      picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
      outcome: row.outcome,
      privacyDomain: reference.privacyDomain,
      supplierIdentifier: row.supplierIdentifier,
      commit: row.commit_,
      pinCoversContent: row.pinCoversContent === 1,
      ...(output === undefined ? {} : { values: output }),
    };
  }

  /**
   * ADR 0116 W5. What is waiting for a person to decide about, and nothing
   * else.
   *
   * Only answered jobs, only this person's, and **never the values** - a list
   * that carried them would be the derived output arriving somewhere it was
   * not kept, which is the auto-persist W5 forbids wearing a different hat.
   * The person sees that something is waiting and what it was read from; the
   * values arrive when they keep it.
   */
  public answeredFor(picoIdentityFingerprintHex: string): ReadonlyArray<{
    jobId: string;
    supplierIdentifier: string;
    commit: string;
    settledAt: string;
  }> {
    const rows = this.db.prepare(`
      SELECT job_id AS jobId, derived_from_supplier AS supplierIdentifier,
             derived_pin_value AS commit_, settled_at AS settledAt
      FROM pico_model_job_queue
      WHERE pico_identity_fingerprint_hex = ?
        AND kind = 'library_read'
        AND outcome = 'answered'
        AND result_json IS NOT NULL
      ORDER BY settled_at, job_id
    `).all(picoIdentityFingerprintHex) as Array<{
      jobId: string;
      supplierIdentifier: string | null;
      commit_: string | null;
      settledAt: string | null;
    }>;
    return Object.freeze(rows.flatMap((row) => (
      row.supplierIdentifier === null || row.commit_ === null || row.settledAt === null
        ? []
        : [Object.freeze({
          jobId: row.jobId,
          supplierIdentifier: row.supplierIdentifier,
          commit: row.commit_,
          settledAt: row.settledAt,
        })]
    )));
  }

  /**
   * ADR 0116 W1. The questions this person asked, and what came back.
   *
   * **The answers travel, and that is not a hole in W5.** W5 forbids derived
   * output persisting itself; a library read holds its values back from the
   * list because that list is a background inventory of material the person
   * never asked to see. A recall is the opposite act: somebody asked a
   * question a moment ago, and putting the answer in front of them is the
   * delivery rather than a persistence. Keeping it as a memory item is still
   * a separate decision they have not made yet.
   */
  public recallsFor(picoIdentityFingerprintHex: string): ReadonlyArray<{
    jobId: string;
    question: string;
    askedAt: string;
    settledAt?: string;
    outcome?: string;
    values?: unknown;
  }> {
    // Unsettled ones are in the list on purpose. A question that vanished
    // until an answer existed would leave a person who just asked looking at
    // nothing, unable to tell a slow provider from a lost question.
    const rows = this.db.prepare(`
      SELECT job_id AS jobId, job_json AS jobJson, enqueued_at AS askedAt,
             settled_at AS settledAt, outcome, result_json AS resultJson
      FROM pico_model_job_queue
      WHERE pico_identity_fingerprint_hex = ?
        AND kind = 'recall'
      ORDER BY enqueued_at DESC, job_id DESC
    `).all(picoIdentityFingerprintHex) as Array<{
      jobId: string;
      jobJson: string;
      askedAt: string;
      settledAt: string | null;
      outcome: string | null;
      resultJson: string | null;
    }>;
    return Object.freeze(rows.map((row) => {
      const job = JSON.parse(row.jobJson) as {
        units?: Array<{ originClass?: string; text?: string }>;
      };
      // The question is the one unit above the instruction threshold, and it
      // is read back from the job rather than stored twice: two records of one
      // sentence are two records to keep in step.
      const asked = job.units?.find((unit) => unit.originClass === 'person_present');
      const output = row.resultJson === null
        ? undefined
        : (JSON.parse(row.resultJson) as { values?: unknown }).values;
      return Object.freeze({
        jobId: row.jobId,
        question: typeof asked?.text === 'string' ? asked.text : '',
        askedAt: row.askedAt,
        // ADR 0117 X1's construction: waiting is an absent settlement rather
        // than a status word that has to be told apart from a real one.
        ...(row.settledAt === null ? {} : { settledAt: row.settledAt }),
        ...(row.outcome === null ? {} : { outcome: row.outcome }),
        ...(output === undefined ? {} : { values: output }),
      });
    }));
  }

  /**
   * ADR 0116 W5. What one recall answered, for the person who asked it.
   *
   * The values *and* what they were formed from, because keeping an answer is
   * a derivation: ADR 0116 W2 takes the lowest origin among the sources, which
   * is a question only the sources can answer.
   */
  public recallKeptView(jobId: string): {
    picoIdentityFingerprintHex: string;
    outcome: string | null;
    privacyDomain: string;
    memoryItemIds: readonly string[];
    values?: unknown;
  } | undefined {
    const row = this.db.prepare(`
      SELECT pico_identity_fingerprint_hex AS picoIdentityFingerprintHex,
             outcome, result_json AS resultJson, recall_context_json AS contextJson
      FROM pico_model_job_queue WHERE job_id = ? AND kind = 'recall'
    `).get(jobId) as {
      picoIdentityFingerprintHex: string;
      outcome: string | null;
      resultJson: string | null;
      contextJson: string | null;
    } | undefined;
    if (row === undefined || row.contextJson === null) {
      return undefined;
    }
    const context = JSON.parse(row.contextJson) as {
      privacyDomain: string;
      memoryItemIds: string[];
    };
    const output = row.resultJson === null
      ? undefined
      : (JSON.parse(row.resultJson) as { values?: unknown }).values;
    return Object.freeze({
      picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
      outcome: row.outcome,
      privacyDomain: context.privacyDomain,
      memoryItemIds: Object.freeze(context.memoryItemIds),
      ...(output === undefined ? {} : { values: output }),
    });
  }

  /**
   * ADR 0152 SE5 with ADR 0118 O2/O4. What this entry last did.
   *
   * Derived from the rows that are already here rather than from a column
   * somebody keeps up to date: a second record of the same fact is a second
   * record to keep in step, and it goes stale exactly when the thing it
   * describes changes.
   *
   * In flight means handed over and not settled - `attempts` rather than
   * enqueued, because a job waiting its turn says nothing about the machine.
   */
  public observationFor(entryId: string): PicoModelProviderObservation {
    const inFlight = this.db.prepare(`
      SELECT 1 AS present FROM pico_model_job_queue
      WHERE entry_id = ? AND settled_at IS NULL AND attempts > 0 LIMIT 1
    `).get(entryId) as { present: number } | undefined;
    const last = this.db.prepare(`
      SELECT outcome, settled_at AS settledAt FROM pico_model_job_queue
      WHERE entry_id = ? AND settled_at IS NOT NULL
      ORDER BY settled_at DESC, job_id DESC LIMIT 1
    `).get(entryId) as { outcome: string | null; settledAt: string } | undefined;
    return Object.freeze({
      jobInFlight: inFlight !== undefined,
      ...(last?.outcome == null ? {} : { lastOutcome: last.outcome }),
      ...(last === undefined ? {} : { lastSettledAt: last.settledAt }),
    });
  }

  public outcomeOf(jobId: string): { outcome: string | null; settledAt: string | null } {
    const row = this.db
      .prepare('SELECT outcome, settled_at AS settledAt FROM pico_model_job_queue WHERE job_id = ?')
      .get(jobId) as { outcome: string | null; settledAt: string | null } | undefined;
    return row ?? { outcome: null, settledAt: null };
  }
}
