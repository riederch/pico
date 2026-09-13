import type Database from 'better-sqlite3';
import {
  isPicoPresenceConnected,
  maxPicoPresencesPerIdentity,
  parsePicoPresenceAnnouncement,
  picoPresenceLeaseMs,
  type PicoPresenceAffordance,
  type PicoPresenceAnnouncement,
  type PicoPresenceType,
} from '@pico/protocol/presence';

/**
 * ADR 0126 P2 - which presences of one identity exist, what each can do, and
 * which of them is there right now.
 *
 * **The registry is the easy half and it says so.** ADR 0126 is explicit that
 * the part deciding correctness is ownership - an action must not run twice
 * because two presences received the same context - and that is P4, blocked on
 * an Action Runner that does not exist. What this holds is the half P4 will
 * need: a durable list, a lease, and affordances that are facts rather than
 * permissions.
 *
 * **Nothing here stores a connection state.** A presence that lost power
 * cannot write `disconnected`, so a stored status is a claim that outlives its
 * subject - the Home would go on reporting a dead device as present until
 * something noticed. What is stored is when it last announced itself, and the
 * answer is computed against a lease. Silence needs nobody to report it, which
 * is ADR 0118 O2's posture applied one layer down.
 */

export interface PicoPresenceView {
  presenceId: string;
  presenceType: PicoPresenceType;
  /**
   * ADR 0126. What the runtime declared it can do, unchanged by anything the
   * person decided.
   *
   * A withheld affordance stays here, because it is still true: the phone
   * still has a camera. What the person changed is whether Pico may use it,
   * and that is the next field. Merging them would make "you have no camera"
   * and "you told me not to use your camera" the same row, and no surface
   * could then say the second sentence.
   */
  affordances: readonly PicoPresenceAffordance[];
  /** ADR 0126 P6. What the person switched off, by name. */
  withheld: readonly PicoPresenceAffordance[];
  /** ADR 0126 P6. False when the person switched the whole presence off. */
  enabled: boolean;
  registeredAt: string;
  lastSeenAt: string;
  /** ADR 0118 O2. Derived from the lease, never read from a column. */
  connected: boolean;
}

export type PicoPresenceRefusal =
  /** ADR 0119 Q5. This identity holds as many presences as it may. */
  'presence_quota_reached';

export class PicoPresenceRegistry {
  public constructor(
    private readonly db: Database.Database,
    private readonly leaseMs: number = picoPresenceLeaseMs,
  ) {}

  /**
   * ADR 0126 P2. A presence saying it is here, and what it can do.
   *
   * One call for both registering and refreshing, because they are the same
   * statement: *this presence exists and is running now*. Two operations would
   * make a runtime decide which it was after a restart, and a runtime that
   * guessed wrong would either fail to register or reset its own history.
   *
   * The affordances are replaced rather than merged. A presence that lost its
   * camera is making a true statement about now, and a registry that unioned
   * the old list would keep planning against a fact that stopped being one.
   */
  public announce(input: {
    picoIdentityFingerprintHex: string;
    announcement: unknown;
    at: string;
  }): { ok: true; presence: PicoPresenceView } | { ok: false; refusal: PicoPresenceRefusal } {
    const announcement: PicoPresenceAnnouncement =
      parsePicoPresenceAnnouncement(input.announcement);

    const existing = this.rowFor(input.picoIdentityFingerprintHex, announcement.presenceId);
    if (existing === undefined) {
      const held = this.db
        .prepare('SELECT COUNT(*) AS held FROM pico_presence WHERE pico_identity_fingerprint_hex = ?')
        .get(input.picoIdentityFingerprintHex) as { held: number };
      if (held.held >= maxPicoPresencesPerIdentity) {
        // ADR 0119 Q5. A ceiling refuses; it never makes room by forgetting a
        // device somebody still owns.
        return { ok: false, refusal: 'presence_quota_reached' };
      }
    }

    this.db
      .prepare(`
        INSERT INTO pico_presence (
          presence_id, pico_identity_fingerprint_hex, presence_type,
          affordances_json, registered_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(pico_identity_fingerprint_hex, presence_id) DO UPDATE SET
          presence_type = excluded.presence_type,
          affordances_json = excluded.affordances_json,
          last_seen_at = excluded.last_seen_at
      `)
      .run(
        announcement.presenceId,
        input.picoIdentityFingerprintHex,
        announcement.presenceType,
        JSON.stringify(announcement.affordances),
        // `registered_at` is only written on insert: the update clause leaves
        // it alone, so "since when has this device been mine" survives every
        // restart it ever makes.
        existing?.registeredAt ?? input.at,
        input.at,
      );

    return {
      ok: true,
      presence: this.viewOf(
        this.rowFor(input.picoIdentityFingerprintHex, announcement.presenceId)!,
        Date.parse(input.at),
      ),
    };
  }

  /**
   * Every presence of this identity, newest sighting first.
   *
   * Presences that have gone quiet stay in the list. A device that is off is
   * still one of the person's devices, and dropping it would turn "my laptop
   * is asleep" into "my laptop is gone" - ADR 0152 SE5's distinction between
   * an absence that ends by itself and one that needs somebody.
   */
  public forIdentity(
    picoIdentityFingerprintHex: string,
    nowMs: number,
  ): readonly PicoPresenceView[] {
    const rows = this.db
      .prepare(`
        SELECT pico_identity_fingerprint_hex AS identityFingerprintHex,
               presence_id AS presenceId, presence_type AS presenceType,
               affordances_json AS affordancesJson,
               registered_at AS registeredAt, last_seen_at AS lastSeenAt
        FROM pico_presence
        WHERE pico_identity_fingerprint_hex = ?
        ORDER BY last_seen_at DESC, presence_id
      `)
      .all(picoIdentityFingerprintHex) as PresenceRow[];
    return Object.freeze(rows.map((row) => this.viewOf(row, nowMs)));
  }

  /**
   * ADR 0126. Presences that can do a thing, and are there to do it.
   *
   * Takes affordances rather than anything about a device. This is the whole
   * planning surface the registry offers, and it is deliberately the only one:
   * a caller that wanted to know the presence *type* would be writing the
   * branch ADR 0126 exists to prevent, and here there is nothing to branch on.
   */
  public offering(input: {
    picoIdentityFingerprintHex: string;
    affordances: readonly PicoPresenceAffordance[];
    nowMs: number;
  }): readonly PicoPresenceView[] {
    return this.forIdentity(input.picoIdentityFingerprintHex, input.nowMs)
      .filter((presence) => presence.connected
        && presence.enabled
        // Declared *and* not withheld. The two are separate facts everywhere
        // else in this file; this is the one place they are combined, because
        // "can this be done here" is the question a plan actually asks.
        && input.affordances.every((affordance) => presence.affordances.includes(affordance)
          && !presence.withheld.includes(affordance)));
  }

  /**
   * Ends a presence, at the person's word.
   *
   * The row goes rather than being tombstoned, and that is the opposite of
   * what a mailbox does (ADR 0147 RY4) for a reason: a mailbox's tombstone
   * answers a *stranger* who still holds the address, and there is no stranger
   * here. A person removing their own old laptop is entitled to have it gone
   * from the list, and the same device announcing again is simply a device
   * that is back.
   */
  public forget(input: { picoIdentityFingerprintHex: string; presenceId: string }): boolean {
    /*
     * **In einer Transaktion, seit Befund B163 (2026-09-13).** Der Kommentar
     * unten nennt den Schaden, und ein Absturz zwischen den zwei Loeschungen
     * stellt genau ihn her: die Praesenz ist fort, ihre Schalter bleiben. Wer
     * danach ein neues Geraet unter derselben Kennung koppelt, erbt sie - und
     * zwar unsichtbar, weil die Zeile, die sie erklaeren wuerde, geloescht ist.
     *
     * Es ist dieselbe Lehre wie ueberall hier: ein Satz, der eine Gefahr
     * nennt, ist kein Schutz vor ihr.
     */
    return this.db.transaction(() => {
      const gone = this.db
        .prepare('DELETE FROM pico_presence WHERE pico_identity_fingerprint_hex = ? AND presence_id = ?')
        .run(input.picoIdentityFingerprintHex, input.presenceId).changes > 0;
      if (gone) {
        // The switches go with the device. Keeping them would mean a person who
        // removed a phone and later paired a new one under the same id would
        // silently inherit last year's answers - decisions they made about a
        // device that no longer exists.
        this.db
          .prepare('DELETE FROM pico_presence_switch WHERE pico_identity_fingerprint_hex = ? AND presence_id = ?')
          .run(input.picoIdentityFingerprintHex, input.presenceId);
      }
      return gone;
    })();
  }

  /**
   * ADR 0126 P6, generalising ADR 0129 SR6 beyond spatial recall.
   *
   * **A row means switched off; absence means the person has not said no.**
   * That is the opposite default from SR6's capture, and for the reason SR6
   * gives for its own: capture defaults off because *recording* is an act
   * somebody would not expect from installing a feature. An affordance is not
   * an act - it is a fact a runtime declared about itself - and defaulting it
   * off would make every newly paired device useless until the person went
   * through a list.
   *
   * Passing no affordance switches the whole presence, which is a different
   * statement from switching each of its affordances: "not this device" keeps
   * meaning that after the device gains a microphone.
   */
  public setSwitch(input: {
    picoIdentityFingerprintHex: string;
    presenceId: string;
    affordance?: PicoPresenceAffordance;
    enabled: boolean;
    at: string;
  }): { changed: boolean } {
    const affordance = input.affordance ?? null;
    if (input.enabled) {
      const removed = this.db
        .prepare(`
          DELETE FROM pico_presence_switch
          WHERE pico_identity_fingerprint_hex = ? AND presence_id = ?
            AND IFNULL(affordance, '') = IFNULL(?, '')
        `)
        .run(input.picoIdentityFingerprintHex, input.presenceId, affordance).changes;
      return { changed: removed > 0 };
    }
    const written = this.db
      .prepare(`
        INSERT INTO pico_presence_switch (
          pico_identity_fingerprint_hex, presence_id, affordance, decided_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `)
      .run(input.picoIdentityFingerprintHex, input.presenceId, affordance, input.at).changes;
    return { changed: written > 0 };
  }

  private rowFor(
    picoIdentityFingerprintHex: string,
    presenceId: string,
  ): PresenceRow | undefined {
    return this.db
      .prepare(`
        SELECT pico_identity_fingerprint_hex AS identityFingerprintHex,
               presence_id AS presenceId, presence_type AS presenceType,
               affordances_json AS affordancesJson,
               registered_at AS registeredAt, last_seen_at AS lastSeenAt
        FROM pico_presence
        WHERE pico_identity_fingerprint_hex = ? AND presence_id = ?
      `)
      .get(picoIdentityFingerprintHex, presenceId) as PresenceRow | undefined;
  }

  private viewOf(row: PresenceRow, nowMs: number): PicoPresenceView {
    const switches = this.db
      .prepare(`
        SELECT affordance FROM pico_presence_switch
        WHERE pico_identity_fingerprint_hex = ? AND presence_id = ?
      `)
      .all(row.identityFingerprintHex, row.presenceId) as Array<{ affordance: string | null }>;
    return Object.freeze({
      presenceId: row.presenceId,
      presenceType: row.presenceType,
      affordances: Object.freeze(JSON.parse(row.affordancesJson) as PicoPresenceAffordance[]),
      withheld: Object.freeze(switches
        .map((entry) => entry.affordance)
        .filter((affordance): affordance is PicoPresenceAffordance => affordance !== null)
        .sort()),
      enabled: !switches.some((entry) => entry.affordance === null),
      registeredAt: row.registeredAt,
      lastSeenAt: row.lastSeenAt,
      connected: isPicoPresenceConnected({ lastSeenAt: row.lastSeenAt }, nowMs, this.leaseMs),
    });
  }
}

interface PresenceRow {
  identityFingerprintHex: string;
  presenceId: string;
  presenceType: PicoPresenceType;
  affordancesJson: string;
  registeredAt: string;
  lastSeenAt: string;
}
