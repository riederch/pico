/**
 * ADR 0150 PU5 - when a Home may push, and how often it may not.
 *
 * **Unbounded pushing is a battery attack a Home can perform on its own
 * person.** Nothing else in this tree has that shape: every other outward act
 * costs the Home something too, while a push costs a device a radio and gives
 * the Home nothing back. So the bound is not politeness, it is the only thing
 * standing between a loop and somebody's afternoon.
 *
 * **A push is never retried.** ADR 0149 RS5 says a relay cannot report
 * delivery, so a Home that resent until something happened would be resending
 * against no signal at all - forever, by construction, since silence is what
 * it would be waiting on. One push per event, and the poll is the floor that
 * catches what a push missed. That is ADR 0118 O1's announce/acknowledge line
 * again: this announces, the device's own read is what raises.
 */

/**
 * The shortest gap between two pushes to one device.
 *
 * Five minutes, and the figure comes from what a push is *for*. It exists
 * because the six-hour poll would be too late for a pending recovery or a
 * closing objection window - events that happen once and then wait for a
 * person. A second push five minutes after the first tells that person
 * nothing the first did not, and a device that could be pushed every second
 * would be a device somebody else decides the battery life of.
 */
export const minPicoLinkPushIntervalMs = 5 * 60 * 1_000;

/**
 * ADR 0150 PU5. How far back the ledger has to remember, and no further.
 *
 * The ledger exists to answer one question - *have I already pushed this
 * device about this event?* - and `minPicoLinkPushIntervalMs` is how long an
 * answer stays interesting. A row older than that cannot change any decision;
 * keeping it only means the table grows for the life of the Home.
 *
 * A day rather than five minutes, because the floor is not the only reader: a
 * person looking at why their phone woke last night is asking about the same
 * rows, and a horizon set to the exact width of the decision would leave
 * nothing to look at. Wide enough to explain yesterday, narrow enough that the
 * ledger is not a log.
 */
export const picoLinkPushLedgerHorizonMs = 24 * 60 * 60 * 1_000;

/**
 * ADR 0150 PU5. What a Home may push about.
 *
 * A closed list, and short on purpose: a push is for what the poll would
 * reach too late, not for what changed. Adding one is a decision that some
 * event is worth a person's device waking, which is exactly the kind of
 * decision that should be spoken rather than inherited from a code path.
 */
export const picoLinkPushOccasions = [
  /** ADR 0112. A recovery is pending and its objection window is running. */
  'device_recovery_pending',
  /** ADR 0110. A window a person can still object inside is closing. */
  'objection_window_closing',
] as const;

export type PicoLinkPushOccasion = typeof picoLinkPushOccasions[number];

/**
 * Befund B145. Die Liste stand zweimal begangen: hier und im Ereignisspeicher,
 * derselbe Zweizeiler ueber derselben Konstanten. Eine geteilte Wahrheit mit
 * zwei Gaengen darueber ist die Form, in der eine Regel driftet, ohne dass ein
 * Test es sieht - die Konstante haelt beide zusammen, der *Umgang* mit ihr
 * nicht. Jetzt ist beides einmal.
 */
export function assertPicoLinkPushOccasion(
  occasion: string,
): asserts occasion is PicoLinkPushOccasion {
  if (!(picoLinkPushOccasions as readonly string[]).includes(occasion)) {
    throw new Error('unknown_pico_link_push_occasion');
  }
}

export interface PicoLinkPushDecision {
  push: boolean;
  /** Present when it refused, so a caller can say which bound it met. */
  reason?: 'too_soon' | 'already_pushed_for_this_event';
}

export interface PicoLinkPushLedgerEntry {
  deviceSigningKeyFingerprintHex: string;
  occasion: PicoLinkPushOccasion;
  /**
   * What the push was about, as the Home names it - a recovery id, a window
   * id. **Not content**: it never leaves the Home, and exists so a second push
   * for the same event is recognisable as the same event.
   */
  eventId: string;
  atMs: number;
}

/**
 * ADR 0150 PU5. Whether to push now, against what has already been pushed.
 *
 * Two refusals, and they are different: `already_pushed_for_this_event` is the
 * no-retry rule, which holds however long ago the first one was; `too_soon` is
 * the per-device floor, which holds however different the events are. A Home
 * with two genuine events a minute apart sends one and lets the poll carry the
 * other, because the person's device is the thing being spent either way.
 */
export function decidePicoLinkPush(input: {
  ledger: readonly PicoLinkPushLedgerEntry[];
  deviceSigningKeyFingerprintHex: string;
  occasion: PicoLinkPushOccasion;
  eventId: string;
  nowMs: number;
}): PicoLinkPushDecision {
  assertPicoLinkPushOccasion(input.occasion);
  if (typeof input.eventId !== 'string' || input.eventId === '') {
    throw new Error('invalid_pico_link_push_event');
  }

  const forDevice = input.ledger.filter(
    (entry) => entry.deviceSigningKeyFingerprintHex === input.deviceSigningKeyFingerprintHex,
  );

  if (forDevice.some((entry) => entry.occasion === input.occasion
    && entry.eventId === input.eventId)) {
    // Checked before the floor, and named separately, because the answer does
    // not change with time. A caller told `too_soon` would reasonably try
    // again later; there is nothing to try again for.
    return Object.freeze({ push: false, reason: 'already_pushed_for_this_event' as const });
  }

  const lastAtMs = forDevice.reduce((latest, entry) => Math.max(latest, entry.atMs), 0);
  if (lastAtMs > 0 && input.nowMs - lastAtMs < minPicoLinkPushIntervalMs) {
    return Object.freeze({ push: false, reason: 'too_soon' as const });
  }

  return Object.freeze({ push: true });
}

/**
 * **Hier stand ein zweites Hauptbuch, und das Produkt fuehrte es nie**
 * (Befund B150, 2026-09-11). `recordPicoLinkPush` haengte einen Eintrag an ein
 * Array und schnitt dabei nach einer Aufbewahrungsfrist ab. Das Home haengt an
 * `pico_link_push_ledger` an und raeumt getrennt auf - die Funktion hatte
 * keinen Aufrufer ausser ihren eigenen Tests.
 *
 * **Warum sie niemandem auffiel**, und das ist der eigentliche Fund:
 * `EventStore` hat eine Methode desselben Namens, und
 * `check-capability-reach.mjs` sucht nach `\bname\b`. Ein
 * `store.recordPicoLinkPush(...)` in `app.ts` liess die freie Funktion also
 * erreicht aussehen. Ein Name ist keine Regel (Befund B124), eine Ebene ueber
 * dem Code.
 *
 * **Der Pruefer wird dafuer nicht verschaerft**, gemessen am selben Tag: von
 * 455 exportierten Funktionen seines Geltungsbereichs war dies der einzige
 * Fall. Der zweite Treffer der Messung - `createLinuxElectronPlatformSecretPort`
 * - war ein Fehlalarm der Sonde: ein Aufruf ueber einen Modul-Namensraum sieht
 * aus wie ein Methodenaufruf und ist keiner. Eine Regel, die beide trennen
 * soll, erzeugt Rauschen fuer einen Fund.
 *
 * Was die Tests der Funktion bewiesen - ein Eintrag ueberlebt lange genug, um
 * eine Wiederholung noch abzulehnen -, steht jetzt in `event-store.test.ts`
 * gegen den Weg, den das Produkt geht.
 */
