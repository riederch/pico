/**
 * ADR 0126 P2 - what a presence is on the wire, and the one thing an
 * affordance must never become.
 *
 * **A microphone has no risk class. Recording with it has one.** ADR 0126
 * spends a section on that sentence, and this file is where the distinction
 * either holds or quietly stops holding: an affordance is a *fact* about what
 * a runtime can do, and a capability (ADR 0036) is something Pico does through
 * a connector, evaluated against policy. Sharing a name would be bad; sharing
 * a *shape* would be worse, because then a risk class could be attached to an
 * affordance and nothing would complain.
 *
 * So an affordance is a bare member of a closed list. It has nowhere to put a
 * `riskClass`, nowhere to put `requiresConfirmation`, and no room for the
 * per-affordance object that would eventually grow one. That is not a
 * simplification waiting to be relaxed - the absence is the gate.
 */

export const picoPresenceSchema = 'pico.presence.v1' as const;

/**
 * ADR 0126. What a presence is, for a person reading a list of their devices.
 *
 * **Nothing plans on this**, and that is the whole reason it is allowed to
 * exist. ADR 0126 says the Core plans against declared affordances and never
 * against device classes - "a branch on a device type is the shape this
 * decision exists to prevent". A person still has to recognise which of their
 * devices a row is about, so the label stays, and
 * `scripts/check-presence-affordances.mjs` refuses a planning path that reads
 * it.
 */
export const picoPresenceTypes = [
  /** ADR 0113's tray and window: the first presence of an identity (P5). */
  'desktop_companion',
  /** ADR 0131's Android full client. */
  'mobile_companion',
  /** ADR 0015's Light Client shape: interaction, little durable knowledge. */
  'surface',
  /** ADR 0126's embodiment: a presence with physical sensors or actuators. */
  'embodiment',
] as const;

export type PicoPresenceType = typeof picoPresenceTypes[number];

/**
 * ADR 0126 P2. The closed vocabulary, and every member earns its place by
 * something in this tree that already needs it.
 *
 * Closed rather than namespaced-and-open, unlike ADR 0036's capability names:
 * an unknown capability is somebody else's connector and may be ignored, while
 * an unknown affordance is a runtime claiming a fact the Core would have to
 * plan against without knowing what it means. The Core cannot ignore that
 * safely, so it refuses it.
 */
export const picoPresenceAffordances = [
  /** A screen this presence can put a surface on (ADR 0113's window). */
  'display',
  /** It can raise something the person will see when not looking (ADR 0112). */
  'notification',
  /** ADR 0123: a field the renderer never sees, for a passphrase or a code. */
  'secure_input',
  /** ADR 0103's Recovery Card scan. A camera exists; using it is an action. */
  'camera',
  'microphone',
  /** ADR 0132: this runtime can put a Recovery Card on paper. */
  'printer',
  /** ADR 0129: this runtime has a position sensor. Reading it is an action. */
  'location',
  /** ADR 0124: this runtime can present the composite tier rather than a still. */
  'composite_tier',
] as const;

export type PicoPresenceAffordance = typeof picoPresenceAffordances[number];

/**
 * ADR 0126 P2. How long an announcement is believed without being repeated.
 *
 * A lease rather than a status field, because "connected" is not a fact a
 * Home can hold - it is a fact that decays. A presence that crashed cannot
 * write `disconnected`, and a Home that stored one would keep saying a dead
 * device is present until something noticed. So the record carries when it was
 * last heard from, the answer is computed, and silence is the same as absence
 * without anybody having to report it (ADR 0118 O2's posture).
 */
export const picoPresenceLeaseMs = 90 * 1_000;

/** ADR 0119 Q5. How many presences one identity may register. */
export const maxPicoPresencesPerIdentity = 32;

export const picoPresenceIdPattern = /^[a-z0-9][a-z0-9_-]{7,63}$/u;

export interface PicoPresenceAnnouncement {
  schema: typeof picoPresenceSchema;
  presenceId: string;
  presenceType: PicoPresenceType;
  affordances: readonly PicoPresenceAffordance[];
}

export interface PicoPresenceRecord extends PicoPresenceAnnouncement {
  /** When this presence first announced itself. */
  registeredAt: string;
  /** When it last did. Everything about connectedness is derived from this. */
  lastSeenAt: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_presence_announcement');
  }
  return value as Record<string, unknown>;
}

export function parsePicoPresenceAnnouncement(value: unknown): PicoPresenceAnnouncement {
  const record = asRecord(value);
  const known = ['schema', 'presenceId', 'presenceType', 'affordances'];
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    /**
     * An unknown field is refused rather than dropped, and this is the field
     * the refusal is really for: a runtime that sent `riskClass` alongside an
     * affordance would be making the mistake ADR 0126 spends a section on, and
     * silently ignoring it would let the mistake spread before anybody saw it.
     */
    throw new Error(`pico_presence_announcement_carries_no:${unexpected}`);
  }
  if (record.schema !== picoPresenceSchema) {
    throw new Error('invalid_pico_presence_schema');
  }
  if (typeof record.presenceId !== 'string' || !picoPresenceIdPattern.test(record.presenceId)) {
    throw new Error('invalid_pico_presence_id');
  }
  if (typeof record.presenceType !== 'string'
    || !(picoPresenceTypes as readonly string[]).includes(record.presenceType)) {
    throw new Error('invalid_pico_presence_type');
  }
  if (!Array.isArray(record.affordances)) {
    throw new Error('invalid_pico_presence_affordances');
  }
  const affordances: PicoPresenceAffordance[] = [];
  for (const affordance of record.affordances) {
    if (typeof affordance !== 'string'
      || !(picoPresenceAffordances as readonly string[]).includes(affordance)) {
      // An unknown affordance is a fact the Core would have to plan against
      // without knowing what it means, which is not something it can ignore
      // safely.
      throw new Error('invalid_pico_presence_affordance');
    }
    if (affordances.includes(affordance as PicoPresenceAffordance)) {
      throw new Error('duplicate_pico_presence_affordance');
    }
    affordances.push(affordance as PicoPresenceAffordance);
  }
  return Object.freeze({
    schema: picoPresenceSchema,
    presenceId: record.presenceId,
    presenceType: record.presenceType as PicoPresenceType,
    // Sorted, so two runtimes declaring the same facts in a different order
    // produce the same record rather than a spurious change.
    affordances: Object.freeze([...affordances].sort()),
  });
}

/**
 * ADR 0126 P2 with ADR 0118 O2. Whether this presence is currently there.
 *
 * Computed, never stored. A presence that lost power cannot write
 * `disconnected`, so a stored status is a claim that outlives its subject.
 */
export function isPicoPresenceConnected(
  record: Pick<PicoPresenceRecord, 'lastSeenAt'>,
  nowMs: number,
  leaseMs: number = picoPresenceLeaseMs,
): boolean {
  const lastSeenMs = Date.parse(record.lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) {
    return false;
  }
  // A `lastSeenAt` in the future is not treated as extra credit. ADR 0120: a
  // wrong clock costs a presence that looks absent, never one that looks
  // present after it stopped.
  return lastSeenMs <= nowMs && nowMs - lastSeenMs < leaseMs;
}
