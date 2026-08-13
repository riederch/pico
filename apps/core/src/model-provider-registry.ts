import {
  parsePicoModelProviderEntry,
  type PicoModelProviderEntry,
} from '@pico/protocol/model-provider';
import type Database from 'better-sqlite3';

/**
 * ADR 0152 SE3/SE4 and ADR 0142 PE1 - where measured deployments are kept, and
 * the one rule that keeps a surface from undoing the ADRs it sits under.
 *
 * **An override may narrow. It may never widen.** A person who sets a smaller
 * context than was measured has stated a preference, and it is honoured. A
 * person who sets a larger one has made a claim about a deployment that was
 * measured saying otherwise - which is exactly the advertised-number problem
 * ADR 0142 PE2 exists to prevent, arriving through the expert panel instead of
 * the entry form.
 *
 * **The rule lives here rather than in a surface**, and that is the whole
 * design decision. A settings screen that enforced it would be one screen
 * enforcing it; the next surface - a companion window, an Android client, a
 * script somebody writes - would have to remember. Enforced where the value is
 * written, every surface inherits it without knowing it exists.
 *
 * Widening **refuses and does not trim**, in ADR 0119 Q5's posture. A silently
 * clamped value would let a person believe the larger number took effect,
 * which is worse than the refusal because they would plan around it.
 */

export interface PicoModelProviderNarrowing {
  contextTokens?: number;
  concurrentJobs?: number;
}

export interface PicoModelProviderRegistryRecord {
  entry: PicoModelProviderEntry;
  /** What the person narrowed, if anything. Never wider than the measurement. */
  narrowing: PicoModelProviderNarrowing;
  addedAt: string;
  updatedAt: string;
}

interface Row {
  entryJson: string;
  narrowedContextTokens: number | null;
  narrowedConcurrentJobs: number | null;
  addedAt: string;
  updatedAt: string;
}

export type PicoModelProviderNarrowingRefusal =
  | 'context_wider_than_measured'
  | 'concurrency_wider_than_measured'
  | 'narrowing_below_one';

export class PicoModelProviderNarrowingError extends Error {
  public constructor(
    public readonly refusal: PicoModelProviderNarrowingRefusal,
    public readonly measured: number,
  ) {
    super(`${refusal}:${measured}`);
    this.name = 'PicoModelProviderNarrowingError';
  }
}

/**
 * ADR 0152 SE4, as a function so the rule is one place and testable without a
 * database.
 */
export function assertPicoModelProviderNarrowing(
  entry: PicoModelProviderEntry,
  narrowing: PicoModelProviderNarrowing,
): void {
  const { capacity } = entry.measurement;
  if (narrowing.contextTokens !== undefined) {
    if (narrowing.contextTokens < 1) {
      throw new PicoModelProviderNarrowingError('narrowing_below_one', 1);
    }
    if (narrowing.contextTokens > capacity.contextTokens) {
      throw new PicoModelProviderNarrowingError(
        'context_wider_than_measured',
        capacity.contextTokens,
      );
    }
  }
  if (narrowing.concurrentJobs !== undefined) {
    if (narrowing.concurrentJobs < 1) {
      throw new PicoModelProviderNarrowingError('narrowing_below_one', 1);
    }
    if (narrowing.concurrentJobs > capacity.concurrentJobs) {
      throw new PicoModelProviderNarrowingError(
        'concurrency_wider_than_measured',
        capacity.concurrentJobs,
      );
    }
  }
}

/**
 * ADR 0152 SE3. The entry a caller should actually use.
 *
 * The measurement stays whole in storage - it is a finding and findings are
 * not edited - and what a consumer receives is the measurement with the
 * person's narrowing applied. Two readings of the same row, and the surface
 * shows both: what this host did, and what this person asked for.
 */
export function picoModelProviderEffectiveEntry(
  record: PicoModelProviderRegistryRecord,
): PicoModelProviderEntry {
  const { entry, narrowing } = record;
  if (narrowing.contextTokens === undefined && narrowing.concurrentJobs === undefined) {
    return entry;
  }
  return parsePicoModelProviderEntry({
    ...entry,
    measurement: {
      ...entry.measurement,
      capacity: {
        ...entry.measurement.capacity,
        contextTokens: narrowing.contextTokens ?? entry.measurement.capacity.contextTokens,
        concurrentJobs: narrowing.concurrentJobs ?? entry.measurement.capacity.concurrentJobs,
      },
    },
  });
}

export class PicoModelProviderRegistry {
  public constructor(private readonly db: Database.Database) {}

  /**
   * Writes a measurement. **Replacing an entry clears its narrowing**, because
   * a preference was expressed against numbers that no longer describe the
   * host - a 4096 narrowing under a 40960 measurement means something else
   * once the host is measured at 8192, and guessing which is not a database's
   * job.
   */
  public put(entry: PicoModelProviderEntry, at: string): void {
    const existing = this.db
      .prepare('SELECT entry_json AS entryJson FROM pico_model_provider_entry WHERE entry_id = ?')
      .get(entry.entryId) as { entryJson: string } | undefined;
    const replacesMeasurement = existing !== undefined
      && (JSON.parse(existing.entryJson) as PicoModelProviderEntry).measurement.measuredAt
        !== entry.measurement.measuredAt;

    this.db.prepare(`
      INSERT INTO pico_model_provider_entry (
        entry_id, entry_json, narrowed_context_tokens, narrowed_concurrent_jobs,
        added_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(entry_id) DO UPDATE SET
        entry_json = excluded.entry_json,
        narrowed_context_tokens = CASE WHEN ? THEN NULL ELSE narrowed_context_tokens END,
        narrowed_concurrent_jobs = CASE WHEN ? THEN NULL ELSE narrowed_concurrent_jobs END,
        updated_at = excluded.updated_at
    `).run(
      entry.entryId,
      JSON.stringify(entry),
      at,
      at,
      replacesMeasurement ? 1 : 0,
      replacesMeasurement ? 1 : 0,
    );
  }

  public narrow(entryId: string, narrowing: PicoModelProviderNarrowing, at: string): void {
    const record = this.get(entryId);
    if (record === undefined) {
      throw new Error('pico_model_provider_entry_not_found');
    }
    assertPicoModelProviderNarrowing(record.entry, narrowing);
    this.db.prepare(`
      UPDATE pico_model_provider_entry
      SET narrowed_context_tokens = ?, narrowed_concurrent_jobs = ?, updated_at = ?
      WHERE entry_id = ?
    `).run(
      narrowing.contextTokens ?? null,
      narrowing.concurrentJobs ?? null,
      at,
      entryId,
    );
  }

  public get(entryId: string): PicoModelProviderRegistryRecord | undefined {
    const row = this.db.prepare(`
      SELECT entry_json AS entryJson,
             narrowed_context_tokens AS narrowedContextTokens,
             narrowed_concurrent_jobs AS narrowedConcurrentJobs,
             added_at AS addedAt, updated_at AS updatedAt
      FROM pico_model_provider_entry WHERE entry_id = ?
    `).get(entryId) as Row | undefined;
    return row === undefined ? undefined : this.toRecord(row);
  }

  public list(): readonly PicoModelProviderRegistryRecord[] {
    const rows = this.db.prepare(`
      SELECT entry_json AS entryJson,
             narrowed_context_tokens AS narrowedContextTokens,
             narrowed_concurrent_jobs AS narrowedConcurrentJobs,
             added_at AS addedAt, updated_at AS updatedAt
      FROM pico_model_provider_entry ORDER BY entry_id
    `).all() as Row[];
    return Object.freeze(rows.map((row) => this.toRecord(row)));
  }

  public remove(entryId: string): void {
    this.db.prepare('DELETE FROM pico_model_provider_entry WHERE entry_id = ?').run(entryId);
  }

  /**
   * Read back through the parser rather than trusted.
   *
   * A row is only as good as whatever wrote it, and this table is exactly the
   * kind a future migration or a hand-edit reaches. An entry that no longer
   * parses is not repaired here - it throws, because a registry quietly
   * dropping the entry a person configured is worse than one that says the
   * row is broken.
   */
  private toRecord(row: Row): PicoModelProviderRegistryRecord {
    return Object.freeze({
      entry: parsePicoModelProviderEntry(JSON.parse(row.entryJson)),
      narrowing: Object.freeze({
        ...(row.narrowedContextTokens === null ? {} : { contextTokens: row.narrowedContextTokens }),
        ...(row.narrowedConcurrentJobs === null
          ? {}
          : { concurrentJobs: row.narrowedConcurrentJobs }),
      }),
      addedAt: row.addedAt,
      updatedAt: row.updatedAt,
    });
  }
}
