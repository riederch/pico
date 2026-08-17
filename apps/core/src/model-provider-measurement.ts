import type { PicoModelProviderClass } from '@pico/protocol/model-provider';

/**
 * ADR 0142 PE1/PE2 with ADR 0152 - a measurement a person asked for, while it
 * runs.
 *
 * **The thing that had no product path at all.** `PicoModelProviderRegistry
 * .put()` is the only way an entry comes into existence and it had no caller
 * outside its own tests; every model-provider route operates on an entry that
 * already exists. So the registry was empty on every real Home, the companion's
 * provider list was permanently hidden, `pickPicoDepotIntakeEntry` refused with
 * `no_decided_entry`, and nothing that wants a model could run. The only way to
 * produce an entry was `scripts/measure-model-provider.ts`, which says of
 * itself that it is "a development tool rather than a product surface" and that
 * "it writes nothing".
 *
 * **Held in memory, and the log holds the record.** A measurement takes minutes
 * - it generates long completions at several context widths, unloads the model
 * to time a cold load, and runs two jobs at once to count lanes - so it cannot
 * be a window call. It is also not a question parked against a presence
 * session the way ADR 0141 RN4's approvals are: nobody has to be there while it
 * runs, and a person who closes the window has not withdrawn anything.
 *
 * So this holds only what is *currently* running or recently finished, and the
 * durable statement is the event pair the Home appends. A restart loses the
 * live view and leaves a started-without-settled pair in the log, which is
 * honest: the work stopped, it was not quietly completed. Asking again is
 * cheap, and a settled measurement's real product is the registry entry, which
 * is persisted by the registry.
 */

/** ADR 0119 Q5. A ceiling that refuses rather than forgetting an older one. */
export const maxPicoModelProviderMeasurements = 8;

/**
 * How long a finished measurement stays readable.
 *
 * Long enough that a person who walked away comes back to an answer rather than
 * to an empty list, and short enough that the list is about now. A settled
 * measurement whose entry landed is readable in the provider list from then on,
 * so nothing is lost when this expires - only the *news* of it.
 */
export const picoModelProviderMeasurementRetentionMs = 30 * 60 * 1_000;

export type PicoModelProviderMeasurementState = 'running' | 'settled' | 'failed';

export interface PicoModelProviderMeasurementView {
  entryId: string;
  reach: string;
  model: string;
  providerClass: PicoModelProviderClass;
  state: PicoModelProviderMeasurementState;
  startedAt: string;
  settledAt?: string;
  /** Present only when it failed, and it names what happened. */
  refusal?: string;
  /** What the measurement wanted the person to know, in its own words. */
  notes?: readonly string[];
}

export type PicoModelProviderMeasurementRefusal =
  /** One host, one measurement. A second would fight the first for the card. */
  | 'already_measuring'
  | 'too_many_measurements';

interface Entry extends PicoModelProviderMeasurementView {
  startedAtMs: number;
  settledAtMs?: number;
}

export class PicoModelProviderMeasurements {
  private readonly entries = new Map<string, Entry>();

  public constructor(private readonly now: () => number = () => Date.now()) {}

  /**
   * Records that one is starting, or says why it may not.
   *
   * **A running measurement blocks a second on the same entry**, and that is
   * not bookkeeping: the measurement deliberately unloads the model to time a
   * cold load, so two at once would each be measuring the other's interference
   * and both numbers would be wrong. ADR 0142's entries are observations, and
   * an observation of a disturbed host is not one.
   */
  public start(input: {
    entryId: string;
    reach: string;
    model: string;
    providerClass: PicoModelProviderClass;
    at: string;
  }): { ok: true } | { ok: false; refusal: PicoModelProviderMeasurementRefusal } {
    this.prune();
    const running = this.entries.get(input.entryId);
    if (running !== undefined && running.state === 'running') {
      return { ok: false, refusal: 'already_measuring' };
    }
    if (running === undefined && this.entries.size >= maxPicoModelProviderMeasurements) {
      // ADR 0119 Q5: the ceiling refuses and says so, rather than dropping the
      // oldest and leaving somebody's result to vanish while they waited.
      return { ok: false, refusal: 'too_many_measurements' };
    }
    this.entries.set(input.entryId, {
      entryId: input.entryId,
      reach: input.reach,
      model: input.model,
      providerClass: input.providerClass,
      state: 'running',
      startedAt: input.at,
      startedAtMs: this.now(),
    });
    return { ok: true };
  }

  /** Marks one finished. `refusal` absent means an entry was written. */
  public settle(input: {
    entryId: string;
    at: string;
    refusal?: string;
    notes?: readonly string[];
  }): void {
    const entry = this.entries.get(input.entryId);
    if (entry === undefined) {
      return;
    }
    this.entries.set(input.entryId, {
      ...entry,
      state: input.refusal === undefined ? 'settled' : 'failed',
      settledAt: input.at,
      settledAtMs: this.now(),
      ...(input.refusal === undefined ? {} : { refusal: input.refusal }),
      ...(input.notes === undefined || input.notes.length === 0
        ? {}
        : { notes: Object.freeze([...input.notes]) }),
    });
  }

  public list(): readonly PicoModelProviderMeasurementView[] {
    this.prune();
    return Object.freeze([...this.entries.values()]
      .sort((left, right) => right.startedAtMs - left.startedAtMs)
      .map((entry) => {
        // The bookkeeping milliseconds stay in here. What a surface reads is
        // the instant, because a duration computed on the device would be that
        // device's clock deciding how long the Home has been working.
        const { startedAtMs: _started, settledAtMs: _settled, ...view } = entry;
        return Object.freeze(view);
      }));
  }

  public size(): number {
    this.prune();
    return this.entries.size;
  }

  private prune(): void {
    const nowMs = this.now();
    for (const [entryId, entry] of [...this.entries]) {
      if (entry.settledAtMs !== undefined
        && nowMs - entry.settledAtMs > picoModelProviderMeasurementRetentionMs) {
        this.entries.delete(entryId);
      }
    }
  }
}

/**
 * ADR 0137 IN1's shape, applied to an entry a person is naming for the first
 * time.
 *
 * Derived from the model rather than asked for, because an identifier is
 * Pico's bookkeeping and asking a person to invent one would be asking them to
 * do filing. The reach is not in it: ADR 0142's entry describes one deployment,
 * and a person who moves the same model to a different card is measuring a
 * different thing and will be told the identifier is taken.
 */
export function picoModelProviderEntryIdFor(model: string): string {
  const derived = model.toLowerCase().replace(/[^a-z0-9._:-]+/gu, '-').replace(/^-+|-+$/gu, '');
  if (derived === '') {
    throw new Error('pico_model_provider_entry_id_has_no_model');
  }
  return derived;
}
