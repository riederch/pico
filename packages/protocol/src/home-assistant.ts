import { isPicoInstant } from './instant.js';

/**
 * ADR 0128 H4. What Home Assistant tells Pico, and what Pico is allowed to
 * believe about it.
 *
 * This is the vocabulary of a **connector** (ADR 0127): its input is written
 * by somebody else. An entity's friendly name is whatever a person typed into
 * their own Home Assistant, and a notification body can be anything a third
 * party's integration put there. Neither is a measurement, and both are text
 * that could later reach a planner.
 *
 * So the threshold is a hard ceiling rather than a default. A value that
 * entered here is `external_content` and cannot be anything else - not because
 * this file refuses to say otherwise, but because the core assigns it and
 * ignores what anyone asks for (ADR 0116 W1: only the server assigns, and a
 * client asserting an origin is refused).
 *
 * Nothing here reaches Home Assistant. Parsing what arrived is separate from
 * fetching it, which is what lets the rules be tested with no Home Assistant
 * anywhere near them (ADR 0129 made the same cut for sensors).
 */

/**
 * The one class a connector's input may carry.
 *
 * ADR 0116 W2's lattice takes the lowest class among a derivation's sources,
 * and this is the floor for anything Home Assistant said. Stated as a constant
 * so the rule has one place rather than being re-decided at each call site -
 * and so a test can pin it.
 */
export const picoConnectorOriginClass = 'external_content' as const;
export type PicoConnectorOriginClass = typeof picoConnectorOriginClass;

/** Bounds, so a hostile or broken entity cannot arrive unbounded. */
export const maxPicoHomeAssistantEntityIdChars = 255;
export const maxPicoHomeAssistantStateChars = 255;
export const maxPicoHomeAssistantFriendlyNameChars = 255;

/**
 * One entity as Home Assistant reported it.
 *
 * `friendlyName` is optional because it is a label a person may never have
 * set. It is deliberately *not* merged into `entityId`: the identifier is
 * machine vocabulary a rule can key on, the name is prose somebody wrote, and
 * collapsing them would make it impossible to tell which one a downstream
 * reader is looking at.
 */
export interface PicoHomeAssistantEntityState {
  entityId: string;
  state: string;
  friendlyName?: string;
  /** When Home Assistant says the state last changed. */
  changedAt: string;
}


function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max;
}

export function parsePicoHomeAssistantEntityState(
  value: unknown,
): PicoHomeAssistantEntityState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_home_assistant_entity_state');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const withoutName = ['changedAt', 'entityId', 'state'];
  const withName = [...withoutName, 'friendlyName'].sort();
  const matches = (expected: readonly string[]): boolean =>
    keys.length === expected.length && keys.every((key, index) => key === expected[index]);
  if (!matches(withoutName) && !matches(withName)) {
    // Exact keys. An extra field is something this contract does not know how
    // to label, and carrying it would smuggle unlabelled foreign text past the
    // threshold.
    throw new Error('invalid_pico_home_assistant_entity_state');
  }
  if (!isBoundedString(record.entityId, maxPicoHomeAssistantEntityIdChars)
    || !/^[a-z0-9_]+\.[a-z0-9_]+$/u.test(record.entityId)) {
    // `domain.object_id`, lowercase. Refused rather than normalised: an
    // identifier a rule keys on must mean one thing, and quietly rewriting it
    // would make two different entities collide.
    throw new Error('invalid_pico_home_assistant_entity_id');
  }
  if (!isBoundedString(record.state, maxPicoHomeAssistantStateChars)) {
    throw new Error('invalid_pico_home_assistant_state');
  }
  if (record.friendlyName !== undefined
    && !isBoundedString(record.friendlyName, maxPicoHomeAssistantFriendlyNameChars)) {
    throw new Error('invalid_pico_home_assistant_friendly_name');
  }
  if (!isPicoInstant(record.changedAt)) {
    throw new Error('invalid_pico_home_assistant_changed_at');
  }
  return Object.freeze({
    entityId: record.entityId,
    state: record.state,
    changedAt: record.changedAt,
    ...(record.friendlyName === undefined
      ? {}
      : { friendlyName: record.friendlyName as string }),
  });
}

/**
 * ADR 0128 H4. What a connector asks the core to record.
 *
 * It carries no origin class. A module that could name one could name a higher
 * one, and ADR 0116 W1 is explicit that only the server assigns - so the ask
 * is deliberately incapable of expressing the answer. The core stamps
 * `picoConnectorOriginClass` and does not consult this shape about it.
 */
export interface PicoConnectorObservation {
  /** Where it came from, for tracing. Machine vocabulary, never prose. */
  sourceRef: string;
  contentType: string;
  /** The foreign text itself, on its way into a privacy domain. */
  content: string;
  observedAt: string;
}
