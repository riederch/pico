import {
  parsePicoHomeStorageConditionView,
  type PicoHomeStorageConditionView,
} from '@pico/protocol';
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
