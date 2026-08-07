import {
  picoConnectorOriginClass,
  type PicoConnectorObservation,
} from '@pico/protocol/home-assistant';
import type { PicoModuleIdentifier } from '@pico/protocol/module';
import type { PicoEventOriginClass } from '@pico/protocol';
import type { MemoryStore } from './memory-store.js';

/**
 * ADR 0128 H4 with ADR 0116 W1/W2. Where foreign content enters, and at what
 * class.
 *
 * A connector module brings in text somebody else wrote. This is the threshold
 * it crosses, and the whole of the threshold's job is one sentence: **the
 * class is assigned here and nothing upstream is consulted about it.**
 *
 * That is not distrust of our own module. It is the ADR 0116 W1 rule applied
 * consistently - a caller that could state a class could state a higher one,
 * and the interesting failure is never a module deciding to lie, it is a
 * module that parsed a field wrong and passed a value along. The type
 * `PicoConnectorObservation` cannot express an origin at all, and this
 * function would ignore it if it could.
 *
 * `external_content` is the floor of the ADR 0116 W2 lattice for a reason: a
 * derivation takes the lowest class among its sources, so anything Pico later
 * builds from a Home Assistant entity stays below the instruction threshold no
 * matter how many times it is summarised and re-read. That is the Morris II
 * step this lattice exists to break.
 */
export interface PicoConnectorIntakeResult {
  recorded: number;
  originClass: PicoEventOriginClass;
}

export interface PicoConnectorIntakeInput {
  module: PicoModuleIdentifier;
  observations: readonly PicoConnectorObservation[];
  /**
   * Which domain the text lands in. A custody decision, so the caller in the
   * core makes it - never the module that brought the text.
   */
  privacyDomain: string;
  /** Who owns and controls the resulting items, in the core's terms. */
  owner: string;
  /**
   * Whether the content is stored encrypted, decided by the core exactly as it
   * is on the ordinary write path.
   *
   * A caught mistake, and worth the comment: this intake first wrote foreign
   * text in plaintext while every ordinary item in the same domain was
   * encrypted - so a crypto-shred destroyed one and left the other readable.
   * The ADR 0127 M1 comparison found it on the first run, which is the whole
   * argument for asserting identical outcomes rather than each on its own.
   */
  contentPosture?: 'domain_encrypted';
  /**
   * Which retention policy governs the items. A custody decision, so it is
   * supplied here rather than chosen by the module that brought the text.
   */
  retentionPolicyRef?: string;
  newMemoryItemId: () => string;
}

export function recordPicoConnectorObservations(
  memory: MemoryStore,
  input: PicoConnectorIntakeInput,
): PicoConnectorIntakeResult {
  let recorded = 0;

  for (const observation of input.observations) {
    memory.create({
      memoryItemId: input.newMemoryItemId(),
      privacyDomain: input.privacyDomain,
      owner: input.owner,
      controller: input.owner,
      contentType: observation.contentType,
      content: observation.content,
      ...(input.contentPosture === undefined ? {} : { contentPosture: input.contentPosture }),
      ...(input.retentionPolicyRef === undefined
        ? {}
        : { retentionPolicyRef: input.retentionPolicyRef }),
      // Assigned, not accepted. The observation carries no class, and if a
      // future shape grew one it would be dropped right here.
      origin: picoConnectorOriginClass,
    });
    recorded += 1;
  }

  return { recorded, originClass: picoConnectorOriginClass };
}
