/**
 * ADR 0129 SR2. The second kind of store the core may own.
 *
 * ADR 0127 says a module owns no store; ADR 0129 sharpened that to a statement
 * about **custody** rather than about a single table shape, and this is the
 * shape that difference bought. An observation is high-rate, short-lived,
 * bounded, and **never individually governed**: no per-sample retention policy,
 * no per-sample origin class, no per-sample readership decision. It exists to
 * be condensed and then to stop existing.
 *
 * What comes out of condensation is an ordinary memory item, governed like
 * every other one. That asymmetry is the whole design: the measurement is
 * cheap and temporary, the memory it becomes is neither.
 *
 * **The buffer is not per-item encrypted, and that is a named cost.** Memory
 * items carry a key envelope each; a sample stream through that machinery
 * would write two rows per measurement and defeat the reason this store kind
 * exists at all. Instead the window is short, the ceiling is low relative to
 * the stores beside it, and a domain shred **deletes** these rows rather than
 * making them unreadable - which for data designed not to outlive its window
 * is the stronger of the two, because nothing survives to be decrypted later.
 */
export const picoObservationKinds = [
  /** ADR 0129. One reading of where the device was. */
  'location_fix',
  /** ADR 0129. One reading of how the person was moving. */
  'mobility_sample',
] as const;

export type PicoObservationKind = typeof picoObservationKinds[number];

/**
 * How long a sample may sit in the buffer.
 *
 * Two days, and the number is a judgement with a reason rather than a round
 * figure. One day cannot answer the question this exists for - a car left last
 * night and asked about tomorrow morning is more than twenty-four hours - and
 * a week is a movement profile rather than a working buffer. Forty-eight hours
 * is the smallest window that answers the reference question and its obvious
 * neighbour.
 *
 * It is enforced at open rather than by a sweep, which also answers what a
 * restore should do with a buffer: a snapshot older than the window comes back
 * empty, because a buffer restored from last week is worse than no buffer.
 */
export const maxPicoObservationAgeMs = 48 * 60 * 60 * 1_000;

export interface PicoObservation {
  kind: PicoObservationKind;
  /** Which domain governs it. The only custody it carries. */
  privacyDomain: string;
  /** When the reading was taken, on the wall clock. */
  observedAt: string;
  /** The reading itself, as the producing module wrote it. */
  payload: string;
}

function isCanonicalInstant(value: unknown): value is string {
  return typeof value === 'string'
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

/**
 * A single sample's ceiling, so one broken producer cannot write a document.
 *
 * Generous for a reading and far below anything that would make the buffer a
 * place to keep things: a location fix serialises to well under a hundred
 * bytes, so this leaves room for a payload to grow a field without leaving
 * room for it to become content.
 */
export const maxPicoObservationPayloadChars = 4_096;

export function parsePicoObservation(value: unknown): PicoObservation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_observation');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['kind', 'observedAt', 'payload', 'privacyDomain'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('invalid_pico_observation');
  }
  if (typeof record.kind !== 'string'
    || !(picoObservationKinds as readonly string[]).includes(record.kind)) {
    throw new Error('invalid_pico_observation_kind');
  }
  if (typeof record.privacyDomain !== 'string' || record.privacyDomain.trim() === '') {
    // The domain is the only custody an observation carries. Without it the
    // shred cascade has nothing to key on, and a sample nobody can reach is a
    // sample nobody can destroy.
    throw new Error('invalid_pico_observation_domain');
  }
  if (!isCanonicalInstant(record.observedAt)) {
    throw new Error('invalid_pico_observation_observed_at');
  }
  if (typeof record.payload !== 'string'
    || record.payload === ''
    || record.payload.length > maxPicoObservationPayloadChars) {
    throw new Error('invalid_pico_observation_payload');
  }
  return Object.freeze({
    kind: record.kind as PicoObservationKind,
    privacyDomain: record.privacyDomain,
    observedAt: record.observedAt,
    payload: record.payload,
  });
}
