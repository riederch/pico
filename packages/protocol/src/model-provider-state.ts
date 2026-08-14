/**
 * ADR 0152 SE5 with ADR 0118 O2 and O4 - what a provider is doing, as a word.
 *
 * O2 said unavailability must be a typed outcome rather than an empty result,
 * and left its own enforcement to the first model integration; O4 split
 * absence into `no_network` and `no_model` and left `no_model` waiting on a
 * model. The model arrived on 2026-08-13 and neither half followed it: a
 * person's surface could say a provider was decided or not decided, and
 * nothing else. **A Home whose provider had been unreachable for a day looked
 * exactly like a Home whose provider was idle.**
 *
 * So this names the states, and three decisions are the whole content:
 *
 * **It is derived, never remembered.** Every state comes from rows the job
 * queue already keeps - what the last settled job for this entry did, and
 * whether one is in flight. A `last_seen` column would be a second record to
 * keep in step, and the failure of a second record is that it goes stale
 * exactly when the thing it describes changes.
 *
 * **A job's own refusal is not the provider's state.** A role that may not run
 * on this class, an entry that may not carry these words, an answer that was
 * not the declared shape - those are facts about that job, and rendering them
 * as "the provider is broken" would send somebody to restart a machine that is
 * answering perfectly.
 *
 * **Working and gone are told apart, which is SE5's demand.** They are not the
 * same absence: one ends by itself and the other needs somebody. A first
 * answer after an idle spell may legitimately take as long as the entry's
 * declared residency (ADR 0142 PE4), so "it is thinking" is a real state and
 * not an excuse - while a job that exceeded even that deadline is *gone*
 * rather than slow, which is exactly what O2 says.
 */

export const picoModelProviderStates = [
  /** No job has ever settled on this entry. Not a fault: nothing asked yet. */
  'not_used_yet',
  /** A job is with the provider now. The first one after idle may be slow. */
  'working',
  /** The last job that settled here was answered. */
  'answered',
  /**
   * The last job could not reach it, or exceeded the deadline built from its
   * own measurement. ADR 0118 O2: too slow is unavailable, not slow.
   */
  'did_not_answer',
  /**
   * ADR 0142 PE6. The host served weights other than the ones measured.
   *
   * Its own state rather than a kind of failure, because the remedy is a
   * person's decision to re-pin rather than anything a retry can fix - and
   * ADR 0152 SE5 says it appears as a sentence, never as a warning somebody
   * can wave away.
   */
  'different_model',
] as const;

export type PicoModelProviderState = typeof picoModelProviderStates[number];

/** What the job queue knows about one entry, and nothing more. */
export interface PicoModelProviderObservation {
  /** A job that has been handed to this entry and has not settled. */
  jobInFlight: boolean;
  /** The outcome of the most recently settled job, if there was one. */
  lastOutcome?: string;
  /** When that job settled. Carried so a surface can say how old this is. */
  lastSettledAt?: string;
}

/**
 * Outcomes that say something about the *provider*.
 *
 * A closed list rather than a default, so an outcome added later reports as
 * `answered`-or-not by somebody's decision instead of silently becoming
 * evidence that a machine is down.
 */
const providerOutcomes: Record<string, PicoModelProviderState> = {
  ok: 'answered',
  provider_unreachable: 'did_not_answer',
  provider_did_not_answer_in_time: 'did_not_answer',
  model_is_not_the_measured_one: 'different_model',
};

export function picoModelProviderState(
  observation: PicoModelProviderObservation,
): PicoModelProviderState {
  if (observation.jobInFlight) {
    return 'working';
  }
  if (observation.lastOutcome === undefined) {
    return 'not_used_yet';
  }
  // A job refused for what it was rather than for where it went leaves the
  // provider unjudged: the last thing we know about the machine is whatever it
  // did before, and if that is nothing then nothing is what we know.
  return providerOutcomes[observation.lastOutcome] ?? 'not_used_yet';
}

/**
 * ADR 0118 O4. Whether a decided provider is reachable, for the absence list.
 *
 * **Only a settled failure counts.** `not_used_yet` is not absence - a Home
 * that has asked nothing knows nothing - and reporting it as `no_model` would
 * put a standing condition on every quiet Home. `working` is not absence
 * either: something is happening.
 *
 * With several decided entries, one that answers is enough. `no_model` is a
 * statement about whether summaries and suggestions can happen at all, not
 * about any one machine.
 */
export function picoModelIsReachable(
  states: readonly PicoModelProviderState[],
): boolean | undefined {
  if (states.length === 0) {
    // No decided provider at all. Not knowable rather than absent: a Home with
    // no provider is not a Home whose provider is down, and ADR 0118 O4 says
    // an unset field states nothing.
    return undefined;
  }
  if (states.some((state) => state === 'answered' || state === 'working')) {
    return true;
  }
  if (states.every((state) => state === 'not_used_yet')) {
    return undefined;
  }
  return false;
}
