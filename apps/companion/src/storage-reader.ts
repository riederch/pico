import {
  parsePicoHomeStorageConditionView,
  type PicoHomeStorageConditionView,
} from '@pico/protocol';
import {
  parsePicoHomeDueEntriesView,
  type PicoHomeDueEntriesView,
} from '@pico/protocol/time-bound-entry';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';

/**
 * ADR 0119 Q5 with ADR 0118 O4. Reads the Home's storage condition as this
 * device, so the companion can state it where the person actually is.
 *
 * The Foundation UI already shows this, read locally - but the Foundation UI is
 * an operator surface on the host. A person who only ever sees their companion
 * would meet the refusal with no warning, which is the outcome Q5 exists to
 * prevent, so the condition has to travel.
 *
 * It travels over the authenticated Link, not over a diagnostic endpoint: the
 * companion has no Foundation credential and should not grow one for this.
 * `home.storage.condition.read` is opted in per ADR 0107 and answers only an
 * authorized sender.
 */
export type PicoCompanionStorageReader = () => Promise<PicoHomeStorageConditionView>;

/**
 * ADR 0118 O1. Reads which time-bound entries are due, so the companion can
 * say something is waiting.
 *
 * The reply carries no title - that is domain content behind custody rules -
 * so this surface can say *that* something is due and since when, and the
 * person opens their Home to see what. Weaker than knowing, and the honest
 * shape until a custody-respecting read exists.
 */
export type PicoCompanionDueEntriesReader = () => Promise<PicoHomeDueEntriesView>;

export function createPicoCompanionDueEntriesReader(input: {
  linkClient: PicoLinkDirectClient;
}): PicoCompanionDueEntriesReader {
  return async () => {
    const response = await input.linkClient.request('home.time_bound_entries.read', {});
    if (response.outcome !== 'ok') {
      // Named, not swallowed: an empty list on a broken channel would tell the
      // person nothing is waiting when nobody actually looked.
      throw new Error(`due_entries_read_rejected:${response.outcome}`);
    }
    return parsePicoHomeDueEntriesView(response.result);
  };
}

/**
 * ADR 0118 O1's other half. The device says it told the person.
 *
 * **Only a device can say this**, which is why the Home does not: it cannot
 * observe that a notification appeared on somebody's screen, and an earlier
 * version that marked an entry raised before calling a surface left entries
 * marked with nobody told - a promise silently dropped, which this family
 * exists to prevent.
 *
 * So the acknowledgement travels the other way, per entry, after the person
 * was actually shown it. An entry nobody acknowledges stays outstanding and
 * keeps being offered: repetition is the loud failure and silence the quiet
 * one, and this is the direction to be wrong in.
 */
export type PicoCompanionDueEntryAcknowledger = (memoryItemId: string) => Promise<void>;

export function createPicoCompanionDueEntryAcknowledger(input: {
  linkClient: PicoLinkDirectClient;
}): PicoCompanionDueEntryAcknowledger {
  return async (memoryItemId: string) => {
    const response = await input.linkClient.request('home.time_bound_entry.acknowledge', {
      memoryItemId,
    });
    if (response.outcome !== 'ok') {
      // Named rather than swallowed, and the caller counts it: an
      // acknowledgement that quietly failed would look identical to one that
      // worked, and the entry would be raised again with nobody able to say
      // why.
      throw new Error(`due_entry_acknowledge_rejected:${response.outcome}`);
    }
  };
}

export function createPicoCompanionStorageReader(input: {
  linkClient: PicoLinkDirectClient;
}): PicoCompanionStorageReader {
  return async () => {
    const response = await input.linkClient.request('home.storage.condition.read', {});
    if (response.outcome !== 'ok') {
      // Named rather than swallowed. A read that failed is not a Home in good
      // health, and returning `normal` here would turn a broken read into a
      // reassurance - exactly the silent comfort this gate is against.
      throw new Error(`storage_condition_read_rejected:${response.outcome}`);
    }
    return parsePicoHomeStorageConditionView(response.result);
  };
}
