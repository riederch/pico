/**
 * ADR 0126 P3 - what may cross from a presence into an identity, named.
 *
 * A closed list, and short on purpose: two crossings exist in this tree today
 * and the third is waiting on a runtime with a sensor. Naming the
 * kinds rather than letting each caller invent a string is what makes an audit
 * record answerable later - "what has this identity accepted from its devices"
 * is a question about a vocabulary, not about free text.
 */
export const picoStateCrossingKinds = [
  /**
   * ADR 0116 W5. A derived answer a person kept: the crossing that existed
   * before it had a name.
   */
  'recall_answer',
  /**
   * ADR 0116 W5 and ADR 0117 X2. The named values of a model read a person
   * kept - the recall's sibling, and the same act: material a device was
   * shown becoming something the identity keeps.
   *
   * It went straight into the store until 2026-08-18, which is the defect
   * this vocabulary exists to make impossible to repeat quietly.
   */
  'answered_read',
  /**
   * ADR 0129. A memory item derived on a device from readings the Home never
   * saw. Declared here and unused until a presence with a sensor exists -
   * ADR 0126 P3's other half.
   */
  'derived_observation',
] as const;

export type PicoStateCrossingKind = typeof picoStateCrossingKinds[number];

/**
 * ADR 0126 P3. The one event a crossing writes.
 *
 * Named here rather than spelled at the call site, so the door's audit type
 * and the protocol's event list are the same string by construction - two
 * closed lists over one subject drift, and this is the subject where drift
 * would mean a promotion recorded as something else.
 */
export const picoStateCrossedEventType = 'home.state_crossed' as const;
