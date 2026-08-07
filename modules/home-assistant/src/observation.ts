import {
  maxPicoHomeAssistantFriendlyNameChars,
  type PicoConnectorObservation,
  type PicoHomeAssistantEntityState,
} from '@pico/protocol/home-assistant';

/**
 * ADR 0128 H4. Turning what Home Assistant said into something the core can
 * hold - and nothing more.
 *
 * The module composes; the core decides. What is decided elsewhere and only
 * asked for here:
 *
 * - **the origin class.** These observations carry none. A module that could
 *   name one could name a higher one, so the ask is incapable of expressing
 *   the answer and the core stamps `external_content` without consulting it
 *   (ADR 0116 W1: only the server assigns).
 * - **the privacy domain.** Which domain foreign text lands in is a custody
 *   decision, and custody is the core's.
 * - **whether to record at all.** Ceilings, quotas and the ADR 0119 Q1 reserve
 *   are guards, and a module holds none.
 */
export const picoHomeAssistantContentType = 'application/vnd.pico.home-assistant.entity-state' as const;

/**
 * How an entity's state reads once it is stored.
 *
 * JSON rather than a sentence, because this is content on its way into a
 * privacy domain and the reader that eventually shows it is not written yet.
 * A sentence built here would bake in a language and a phrasing before anyone
 * knows what surface asks for it.
 */
export interface PicoHomeAssistantObservedState {
  state: string;
  friendlyName?: string;
}

export function toPicoHomeAssistantObservations(
  entities: readonly PicoHomeAssistantEntityState[],
): readonly PicoConnectorObservation[] {
  return Object.freeze(entities.map((entity) => {
    const observed: PicoHomeAssistantObservedState = {
      state: entity.state,
      ...(entity.friendlyName === undefined
        ? {}
        : { friendlyName: entity.friendlyName.slice(0, maxPicoHomeAssistantFriendlyNameChars) }),
    };
    return Object.freeze({
      // The identifier, never the name. A trace that carried prose would put
      // foreign text somewhere nobody expects to find it - a log line, an
      // error message - outside the domain that governs it.
      sourceRef: entity.entityId,
      contentType: picoHomeAssistantContentType,
      content: JSON.stringify(observed),
      observedAt: entity.changedAt,
    });
  }));
}

/**
 * ADR 0128 H4. Which entities are worth recording at all.
 *
 * A Home Assistant install has hundreds of entities and most of them change
 * every few seconds. Recording all of them would be the ADR 0129 mistake in a
 * different costume: a sample stream landing in memory items, each with a
 * retention policy and a domain key, none of them a memory.
 *
 * So an observation is kept only where the state actually changed since what
 * the Home already holds. The comparison is against what was last recorded,
 * supplied by the caller, because the module owns no store.
 */
export function picoHomeAssistantChangedEntities(input: {
  entities: readonly PicoHomeAssistantEntityState[];
  lastSeen: ReadonlyMap<string, string>;
}): readonly PicoHomeAssistantEntityState[] {
  return Object.freeze(input.entities.filter((entity) =>
    input.lastSeen.get(entity.entityId) !== entity.state));
}
