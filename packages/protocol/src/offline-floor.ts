/**
 * ADR 0118 - the offline and model-free degradation contract.
 *
 * The floor is a guarantee, not a best effort: these five operation families
 * work with no reachable model and no reachable network. They are not a sample
 * of what happens to survive - they are the operations whose value is destroyed
 * by deferral (a photo not taken now cannot be taken later, an appointment not
 * entered now is forgotten by evening) plus the two that matter most exactly
 * when the network is gone.
 *
 * The list lives here rather than only in the check script so that both the
 * mechanical enforcement and the code that reasons about degradation read the
 * same names, and adding a family cannot quietly leave one of them behind.
 */
export const picoOfflineFloorFamilies = [
  /** Recording a memory item and its reference-only event (ADR 0069). */
  'capture',
  /** An appointment or reminder with a due instant, and its local scheduling. */
  'time_bound_entry',
  /** Finding and reading what is already on the device. */
  'local_recall',
  /** Answering a pending approval on the ADR 0099 hold channel: local IPC. */
  'decide',
  /** The ADR 0110/0112 recovery surfaces. */
  'recovery_access',
] as const;

export type PicoOfflineFloorFamily = typeof picoOfflineFloorFamilies[number];

/**
 * ADR 0118 O4. ADR 0009 offered one avatar state, "offline or degraded", for
 * two different facts. They split, because different decisions follow from
 * each: "I cannot send this" is not "I cannot have this summarized".
 *
 * They are independently true. Both may hold, either may hold alone, and a
 * surface that collapses them back into one is undoing the decision.
 */
export const picoAbsenceStates = ['no_network', 'no_model'] as const;
export type PicoAbsenceState = typeof picoAbsenceStates[number];

export interface PicoDegradationState {
  /** Every absence that currently holds, independently. */
  absences: PicoAbsenceState[];
}

/**
 * ADR 0118 O4, the load-bearing half. Neither absence may render a floor
 * operation as blocked. An avatar that reports itself broken while capture
 * works teaches the person that Pico is unreliable offline, which is the
 * opposite of what this contract buys.
 *
 * This is deliberately a total function over the family list rather than a
 * lookup with a default: a family added later gets an answer here without
 * anyone remembering to come back, and the answer is the safe one.
 */
export function isPicoFloorFamilyAvailableUnderAbsence(
  family: PicoOfflineFloorFamily,
  _state: PicoDegradationState,
): boolean {
  return (picoOfflineFloorFamilies as readonly string[]).includes(family);
}

/**
 * ADR 0118 O2. Unavailability is a typed outcome, never an empty result. An
 * empty result is indistinguishable from "nothing matched", which is how a
 * missing dependency becomes a silent wrong answer.
 */
export const picoCapabilityOutcomes = ['ok', 'unavailable'] as const;
export type PicoCapabilityOutcome = typeof picoCapabilityOutcomes[number];

export const picoUnavailabilityReasons = [
  'no_model',
  'no_network',
  /** ADR 0118: a provider that answers too slowly is unavailable, not slow. */
  'timeout',
] as const;
export type PicoUnavailabilityReason = typeof picoUnavailabilityReasons[number];

/**
 * ADR 0118 O2. Provider classes differ in where the data goes, which is a
 * privacy posture rather than a performance tier.
 */
export const picoProviderClasses = ['on_device', 'remote', 'cloud'] as const;
export type PicoProviderClass = typeof picoProviderClasses[number];

/**
 * ADR 0118 O2. Never true across classes, and the signature says why it is a
 * function at all rather than a constant: the question gets asked at the point
 * a re-plan would happen, so the refusal is written down where it applies.
 *
 * ADR 0049 already rules that a registry entry is not a trust grant.
 * Availability must not become one either - otherwise an attacker who can
 * degrade the on-device provider chooses the privacy posture, and the person
 * never sees the substitution happen.
 */
export function mayPicoFailOverBetweenProviders(
  from: PicoProviderClass,
  to: PicoProviderClass,
): boolean {
  return from === to;
}

/**
 * ADR 0118 O2. Delivery may queue; approval may not.
 *
 * A message the person already approved may wait for a route - ADR 0003's
 * queued outbound peer messages stay correct. What must not happen is the
 * reverse: a path that could not be approved offline being treated as approved
 * once the network returns. That is ADR 0116 W5's no-auto-forward rule under a
 * different pressure, and it holds the same way.
 */
export function mayPicoQueueUntilReachable(input: {
  kind: 'delivery' | 'approval';
  alreadyApproved: boolean;
}): boolean {
  if (input.kind === 'approval') {
    return false;
  }
  return input.alreadyApproved;
}
