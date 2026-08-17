import {
  parsePicoModelProviderEntry,
  type PicoModelProviderAllowance,
  type PicoModelProviderClass,
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

/**
 * ADR 0152's second question, decided by the user on 2026-08-13: **a shared
 * finding with per-person decisions attached.**
 *
 * The measurement is one row because a deployment is one deployment. What
 * hangs off it is what can differ between two residents, and there are exactly
 * three such things:
 *
 * - **the declaration** that this machine is theirs (ADR 0048). A judgement
 *   about premises, which Pico cannot measure and two people can answer
 *   differently about the same box in the same hall;
 * - **the allowance** - this turn, or this turn and retrieved memory (ADR 0151
 *   PV1), which is a disclosure decision about their own remembered words;
 * - **the credential** they hold for it (ADR 0138 CO1 custody).
 *
 * They are exactly the fields a `PicoModelProviderEntry` carries beside the
 * measurement, which is not a coincidence: **an entry is what one person's
 * decisions make of one shared finding.** So an entry is composed on read
 * rather than stored, and a person with no decision has no entry - not the
 * Home's. ADR 0138's title is the rule: reaching outside is off until somebody
 * says so, and an absent row is an absent decision rather than a quiet yes.
 */
export interface PicoModelProviderDecision {
  providerClass: PicoModelProviderClass;
  carries: PicoModelProviderAllowance;
  credentialRef?: string;
  decidedAt: string;
}

interface DecisionRow {
  providerClass: string;
  carries: string;
  credentialRef: string | null;
  decidedAt: string;
}

/**
 * ADR 0152, and the one thing nothing may decide for a person.
 *
 * A queued job names the entry it runs on, so something has to choose - and
 * choosing between providers on somebody's behalf is exactly what ADR 0152's
 * surface exists to ask about. So this chooses only when there is nothing to
 * choose:
 *
 * - **no decided entry** is ADR 0138's posture rather than a failure: reaching
 *   outside is off until somebody says so;
 * - **exactly one** is not a choice, and is used;
 * - **more than one** is a choice, and it is refused by name. Picking the
 *   first would be a background task deciding whose machine reads this
 *   person's material, silently, at a moment they were not looking.
 *
 * It lives here rather than beside either caller because it is one rule: the
 * depot intake and the recall path ask the same question for the same reason,
 * and two copies would be two answers waiting to disagree.
 */
export type PicoDecidedModelEntryChoice =
  | { entryId: string }
  | { refusal: 'no_decided_entry' | 'more_than_one_decided_entry' };

export function pickPicoDecidedModelEntry(
  decidedEntryIds: readonly string[],
): PicoDecidedModelEntryChoice {
  if (decidedEntryIds.length === 0) {
    return Object.freeze({ refusal: 'no_decided_entry' as const });
  }
  if (decidedEntryIds.length > 1) {
    return Object.freeze({ refusal: 'more_than_one_decided_entry' as const });
  }
  return Object.freeze({ entryId: decidedEntryIds[0]! });
}

export class PicoModelProviderConsent {
  public constructor(
    private readonly db: Database.Database,
    private readonly registry: PicoModelProviderRegistry,
  ) {}

  public decide(input: {
    entryId: string;
    picoIdentityFingerprintHex: string;
    providerClass: PicoModelProviderClass;
    carries: PicoModelProviderAllowance;
    credentialRef?: string;
    at: string;
  }): void {
    if (this.registry.get(input.entryId) === undefined) {
      throw new Error('pico_model_provider_entry_not_found');
    }
    // Composed before it is stored, so a decision that could not produce an
    // entry is refused where it is made rather than discovered on read.
    //
    // **This is the only class check, and there used to be two.** A guard here
    // against ADR 0048's closed list read as belt and braces and was neither:
    // the parser refuses the same value with the same error, so the guard
    // could not fail and a mutation removing it changed nothing. Two places
    // enforcing one rule is the drift shape this tree keeps removing, and a
    // rule that cannot be observed to hold is worse than one place holding it.
    this.compose(this.registry.get(input.entryId)!.entry, {
      providerClass: input.providerClass,
      carries: input.carries,
      ...(input.credentialRef === undefined ? {} : { credentialRef: input.credentialRef }),
      decidedAt: input.at,
    });

    /**
     * ADR 0151 PV4, with the half that used to be missing.
     *
     * PV4 makes the wider allowance unwritable without the reference that
     * earns it, and until 2026-08-14 the reference could name nothing at all:
     * an entry said it proves who it is, no Home could produce a secret, and
     * every job on it went out unauthenticated. A rule that a decision may
     * name only a credential this Home actually holds is what turns the
     * reference back into a claim about something.
     */
    if (input.credentialRef !== undefined
      && this.credentialSealFor(input.entryId, input.picoIdentityFingerprintHex, input.credentialRef) === undefined) {
      throw new Error('pico_model_provider_credential_not_held');
    }

    this.db.prepare(`
      INSERT INTO pico_model_provider_consent (
        entry_id, pico_identity_fingerprint_hex, provider_class, carries,
        credential_ref, decided_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(entry_id, pico_identity_fingerprint_hex) DO UPDATE SET
        provider_class = excluded.provider_class,
        carries = excluded.carries,
        credential_ref = excluded.credential_ref,
        decided_at = excluded.decided_at,
        revoked_at = NULL
    `).run(
      input.entryId,
      input.picoIdentityFingerprintHex,
      input.providerClass,
      input.carries,
      input.credentialRef ?? null,
      input.at,
    );
  }

  /**
   * ADR 0048's standing consent is revocable, and revoking is not deleting.
   *
   * The row stays with a date on it, because "this person withdrew on the
   * 14th" and "this person was never asked" are different facts and a surface
   * that showed them alike would be inventing one of them.
   */
  /**
   * ADR 0142 PE1. Drops every decision about an entry, for everyone.
   *
   * **Not `revoke` repeated, and the difference is load-bearing.** Revoking
   * keeps the row with its date, so "withdrew" stays distinguishable from
   * "never asked" - which is right while the entry still exists. When the
   * entry itself is forgotten there is nothing left for that distinction to
   * be about, and leaving the rows would be worse than useless: an entry id
   * is derived from the model name, so measuring the same model again would
   * hand a fresh finding somebody's year-old "yes".
   */
  public forget(entryId: string): void {
    this.db
      .prepare('DELETE FROM pico_model_provider_consent WHERE entry_id = ?')
      .run(entryId);
  }

  public revoke(entryId: string, picoIdentityFingerprintHex: string, at: string): void {
    this.db.prepare(`
      UPDATE pico_model_provider_consent SET revoked_at = ?
      WHERE entry_id = ? AND pico_identity_fingerprint_hex = ?
    `).run(at, entryId, picoIdentityFingerprintHex);
    /**
     * ADR 0138 CO1. The secret goes with the decision that justified holding
     * it.
     *
     * The row stays and the seal does not, and the two are different facts:
     * the withdrawal is a thing this Home should remember, the credential is a
     * thing it now has no reason to hold. Keeping it "in case they come back"
     * would be a Home storing somebody's secret for a decision they revoked.
     */
    this.db.prepare(`
      DELETE FROM pico_model_provider_credential
      WHERE entry_id = ? AND pico_identity_fingerprint_hex = ?
    `).run(entryId, picoIdentityFingerprintHex);
  }

  /**
   * ADR 0151 PV1. Records the sealed credential a decision may then name.
   *
   * One per person per entry: re-supplying replaces, which is how a rotated
   * secret arrives without a second row and without a moment where two are
   * held. The reference travels with it because it is sealed into the
   * associated data - a row edited to point at another name fails to open
   * rather than opening something else.
   */
  public putCredential(input: {
    entryId: string;
    picoIdentityFingerprintHex: string;
    credentialRef: string;
    seal: unknown;
    at: string;
  }): void {
    if (this.registry.get(input.entryId) === undefined) {
      throw new Error('pico_model_provider_entry_not_found');
    }
    this.db.prepare(`
      INSERT INTO pico_model_provider_credential (
        entry_id, pico_identity_fingerprint_hex, credential_ref, seal_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(entry_id, pico_identity_fingerprint_hex) DO UPDATE SET
        credential_ref = excluded.credential_ref,
        seal_json = excluded.seal_json,
        created_at = excluded.created_at
    `).run(
      input.entryId,
      input.picoIdentityFingerprintHex,
      input.credentialRef,
      JSON.stringify(input.seal),
      input.at,
    );
  }

  /** The seal this person holds for this entry under this exact name, if any. */
  public credentialSealFor(
    entryId: string,
    picoIdentityFingerprintHex: string,
    credentialRef: string,
  ): unknown | undefined {
    const row = this.db.prepare(`
      SELECT seal_json AS sealJson FROM pico_model_provider_credential
      WHERE entry_id = ? AND pico_identity_fingerprint_hex = ? AND credential_ref = ?
    `).get(entryId, picoIdentityFingerprintHex, credentialRef) as
      { sealJson: string } | undefined;
    return row === undefined ? undefined : JSON.parse(row.sealJson) as unknown;
  }

  /** The entry this person's decisions make of this finding, or nothing. */
  public entryFor(
    entryId: string,
    picoIdentityFingerprintHex: string,
  ): PicoModelProviderEntry | undefined {
    const record = this.registry.get(entryId);
    if (record === undefined) {
      return undefined;
    }
    const row = this.db.prepare(`
      SELECT provider_class AS providerClass, carries, credential_ref AS credentialRef,
             decided_at AS decidedAt
      FROM pico_model_provider_consent
      WHERE entry_id = ? AND pico_identity_fingerprint_hex = ? AND revoked_at IS NULL
    `).get(entryId, picoIdentityFingerprintHex) as DecisionRow | undefined;
    if (row === undefined) {
      return undefined;
    }
    return this.compose(picoModelProviderEffectiveEntry(record), {
      providerClass: row.providerClass as PicoModelProviderClass,
      carries: row.carries as PicoModelProviderAllowance,
      ...(row.credentialRef === null ? {} : { credentialRef: row.credentialRef }),
      decidedAt: row.decidedAt,
    });
  }

  public listFor(picoIdentityFingerprintHex: string): readonly PicoModelProviderEntry[] {
    return Object.freeze(this.registry.list()
      .map((record) => this.entryFor(record.entry.entryId, picoIdentityFingerprintHex))
      .filter((entry): entry is PicoModelProviderEntry => entry !== undefined));
  }

  private compose(
    finding: PicoModelProviderEntry,
    decision: PicoModelProviderDecision,
  ): PicoModelProviderEntry {
    const { credentialRef: _findingCredential, ...rest } = finding;
    return parsePicoModelProviderEntry({
      ...rest,
      providerClass: decision.providerClass,
      carries: decision.carries,
      ...(decision.credentialRef === undefined ? {} : { credentialRef: decision.credentialRef }),
    });
  }
}
