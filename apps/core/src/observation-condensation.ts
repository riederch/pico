import type { PicoModuleIdentifier } from '@pico/protocol/module';
import type { PicoObservation } from '@pico/protocol/observation';
import type { MemoryStore } from './memory-store.js';

/**
 * ADR 0129 SR2. Readings become a memory and then stop existing.
 *
 * This is the half of the second store kind that makes it a buffer rather than
 * a second place to keep things. A window of samples goes in; what a module
 * made of them comes out as an ordinary memory item, governed like every other
 * one; the samples that were consumed are deleted.
 *
 * **The module decides what it means; the core decides everything else.**
 * Which readings are worth keeping is a composition and belongs to the module.
 * The privacy domain, the encryption posture, the retention policy and the act
 * of deleting are custody, and custody is not the module's.
 *
 * **Nothing is deleted unless something was written.** The order is deliberate
 * and it is the same argument the ADR 0118 O1 scheduler makes: a record that
 * failed to be written is one the next pass can try again, while readings
 * deleted before the memory exists are gone with nothing to show for them.
 */
export interface PicoCondensationInput {
  module: PicoModuleIdentifier;
  /** What the module made of the window, if it made anything. */
  memory?: {
    memoryItemId: string;
    contentType: string;
    content: string;
  };
  /** The readings the module used, deleted only once the memory exists. */
  consumed: ReadonlyArray<PicoObservation & { observationId: number }>;
  privacyDomain: string;
  owner: string;
  contentPosture?: 'domain_encrypted';
  retentionPolicyRef?: string;
  deleteObservations: (observationIds: readonly number[]) => number;
}

export interface PicoCondensationResult {
  recorded: boolean;
  consumed: number;
}

export function condensePicoObservations(
  memory: MemoryStore,
  input: PicoCondensationInput,
): PicoCondensationResult {
  if (input.memory === undefined) {
    // Nothing was derived, so nothing is consumed. Deleting the window anyway
    // would throw away readings a later pass could still make sense of - a
    // drive that has not finished is not a drive that produced nothing.
    return { recorded: false, consumed: 0 };
  }

  memory.create({
    memoryItemId: input.memory.memoryItemId,
    privacyDomain: input.privacyDomain,
    owner: input.owner,
    controller: input.owner,
    contentType: input.memory.contentType,
    content: input.memory.content,
    ...(input.contentPosture === undefined ? {} : { contentPosture: input.contentPosture }),
    ...(input.retentionPolicyRef === undefined
      ? {}
      : { retentionPolicyRef: input.retentionPolicyRef }),
    // ADR 0116 W2. A derivation takes the lowest class among its sources, and
    // a device's own sensors are the person's own instrument rather than
    // somebody else's words - so this is `own_pico` and not the connector
    // floor. It is still not `person_present`: nobody said anything.
    origin: 'own_pico',
  });

  const consumed = input.deleteObservations(
    input.consumed.map((observation) => observation.observationId),
  );

  return { recorded: true, consumed };
}
