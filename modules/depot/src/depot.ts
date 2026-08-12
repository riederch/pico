import {
  picoDepotFetchPermission,
  type PicoDepotFetchPermission,
  type PicoDepotFetchCondition,
  type PicoDepotPin,
} from '@pico/protocol/depot';

/**
 * ADR 0143 DP8 - what the depot module composes, and what it deliberately does
 * not touch.
 *
 * A module owns vocabulary, composition and surface (ADR 0127). Everything
 * here is composition over facts the core supplies: it decides *whether to
 * ask* for a fetch and *what to say about a depot*, and it never fetches,
 * never opens a socket and never reads a row. The core holds
 * `pico_depot_attachment`, performs `fetchPicoDepot`, and answers the two
 * permissions - a module owns no storage and reaches nothing.
 *
 * The one function that decides anything is `picoDepotFetchIntent`, and what
 * it decides is whether a *request* is worth making. That is the module's
 * whole job in the action path: ADR 0139 says the requester is never trusted,
 * so this being wrong costs a refused request rather than an unwanted fetch.
 */

/** What a depot looks like to a surface. Facts, no methods, no decisions. */
export interface PicoDepotView {
  pin: PicoDepotPin;
  acceptedAt: string;
  mayFetch: boolean;
  mayFetchUnasked: boolean;
  /** Set when a fetch has seen a newer commit that nobody has accepted. */
  offeredCommit?: string;
  /**
   * Whether a working copy is on this device.
   *
   * Supplied by the core, not read here. A module reaches nothing (ADR 0127),
   * and this is a fact about the filesystem - the one kind of fact a module
   * must be *told* rather than allowed to go and look at.
   */
  materialised: boolean;
  /** ADR 0138 CO2. Set when the last fetch did not get through, cleared when one does. */
  lastFetchCondition?: PicoDepotFetchCondition;
}

export type PicoDepotFetchIntent =
  | { intent: 'request'; asked: boolean }
  /** ADR 0138 CO3/CO4 refused it; the reason names which switch is missing. */
  | { intent: 'skip'; reason: PicoDepotFetchPermission };

/**
 * ADR 0143 DP8. Whether this depot should be asked about now.
 *
 * **It asks the permission first and stops there when refused.** A requester
 * that submitted an action for a fetch it is not allowed to make would produce
 * a recorded request, a recorded decision and a refusal - three facts about
 * something that was never going to happen, on every scheduler tick. ADR 0140
 * would deny it correctly and the ADR 0121 chain would carry the noise
 * forever.
 *
 * Skipping here is not a second guard in front of the real one. The core still
 * refuses an unpermitted fetch, and the test for that lives with the core; this
 * only keeps a scheduler from filling the history with questions it already
 * knows the answer to.
 */
export function picoDepotFetchIntent(input: {
  depot: PicoDepotView;
  /** True when a person asked for this now; false for a scheduled sweep. */
  asked: boolean;
}): PicoDepotFetchIntent {
  const permission = picoDepotFetchPermission({
    mayFetch: input.depot.mayFetch,
    mayFetchUnasked: input.depot.mayFetchUnasked,
    asked: input.asked,
  });
  if (permission.status !== 'permitted') {
    return Object.freeze({ intent: 'skip' as const, reason: permission });
  }
  return Object.freeze({ intent: 'request' as const, asked: input.asked });
}

/**
 * ADR 0143 DP1. What a surface says about a depot, as a closed set of states
 * rather than a sentence assembled at the call site.
 *
 * `offered` is a state of the *person's* decision, not of the depot: the depot
 * is running what it was told to run either way. Naming it separately from
 * `running` is what keeps "there is something new" from reading as "something
 * changed underneath you".
 */
export const picoDepotStates = [
  /** Attached, running the accepted commit, nothing newer seen. */
  'running',
  /** A newer commit exists and is waiting for a person, changing nothing. */
  'offered',
  /** ADR 0138 CO2. The last attempt did not get through. */
  'unreachable',
  /** Permitted and attempted or not, but nothing is on this device to run. */
  'not_materialised',
  /** ADR 0138 CO3 was never granted, so nothing has been fetched. */
  'never_fetched',
] as const;

export type PicoDepotState = typeof picoDepotStates[number];

/**
 * ADR 0143 DP1 with ADR 0138 CO2. What a surface says about a depot.
 *
 * **The order is the design here, and it follows the rule the first version of
 * this function already stated**: say the thing that explains the others.
 * Every branch below is placed by asking what a person would do next if the
 * surface said the *later* thing instead.
 *
 * 1. `never_fetched` first, unchanged: a depot nobody permitted to fetch
 *    cannot have seen an offer, and the missing permission explains the rest.
 * 2. `unreachable` before `offered`, because accepting an offer while the
 *    remote is unreachable schedules a fetch that cannot succeed. Showing the
 *    offer would invite exactly the action that is going to fail, which is the
 *    same mistake as (1) in a different place.
 * 3. `not_materialised` before `offered` for the same reason and a stronger
 *    one: a depot with nothing on disk is providing nothing *now*, and an
 *    offer is a question about its future.
 * 4. `offered` before `running`, because `running` is the strongest claim in
 *    the list and anything that undermines it is said first.
 *
 * `unreachable` before `not_materialised` is the one place a reason outranks a
 * consequence, and deliberately: both mean the depot provides nothing, but
 * only one of them tells the person what to do about it. The condition is
 * cleared by a successful fetch, so this can only be read when it is current.
 */
export function picoDepotState(depot: PicoDepotView): PicoDepotState {
  if (!depot.mayFetch) {
    return 'never_fetched';
  }
  if (depot.lastFetchCondition !== undefined) {
    return 'unreachable';
  }
  if (!depot.materialised) {
    return 'not_materialised';
  }
  return depot.offeredCommit === undefined ? 'running' : 'offered';
}
