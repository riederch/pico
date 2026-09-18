import { timingSafeEqual } from 'node:crypto';
import Database from 'better-sqlite3';
import type {
  PicoRelayAccountSummary,
} from '@pico/protocol/link-relay-operator';
import type { PicoLinkMailboxStatus } from '@pico/protocol/link-delivery';
import {
  picoRelayAccountRefLength,
  type PicoRelayAccountStatus,
} from '@pico/protocol/link-relay-operator';
import { narrowToOwner } from './database-file-mode.js';
import { picoRelayCredentialDigest } from './operator-claim.js';
import {
  picoLinkMailboxPattern,
  parsePicoLinkPacketAddress,
  type PicoLinkPacket,
} from '@pico/protocol/link-packet';
import {
  resolvePicoLinkDelivery,
  type PicoLinkDeliveryOutcome,
  type PicoLinkQueuedPacket,
} from '@pico/protocol/link-delivery';

/**
 * ADR 0149 - what a relay keeps, and the very short list of things it can be.
 *
 * Every row here is either a label this relay issued or ciphertext it cannot
 * read. That is not modesty; it is ADR 0031's prohibition list read as a
 * specification. A component that must not decrypt payloads, own identity
 * keys, issue credentials, authorise actions or decide rules has almost
 * nothing left to be except a queue with a door on it.
 *
 * **Nothing in this file parses a Pico identity, a delegation or a signature,
 * and that absence is ADR 0149 RS2.** An account is a bearer credential the
 * operator issued out of band, carrying a quota and nothing else. The relay
 * never learns which Pico holds one, so "relay account identity is not Pico
 * identity" holds because there is no code path that could learn otherwise.
 */

/** ADR 0149 RS6. What a caller is told when a bound refuses. */
export const picoRelayRefusals = [
  'unknown_account',
  'account_mailbox_quota_reached',
  /**
   * ADR 0154 RO6. The second axis, which used to have no ceiling at all.
   *
   * Packets per mailbox came from the caller's register request and was stored
   * unchecked, so an account with a quota of one could ask for a mailbox
   * holding a million. Named separately from the quota refusal, because they
   * are two different things for an operator to raise.
   */
  'capacity_above_account_ceiling',
  'mailbox_not_yours',
  'mailbox_already_registered',
] as const;

export type PicoRelayRefusal = typeof picoRelayRefusals[number];

export interface PicoRelayMailbox {
  mailbox: string;
  /**
   * ADR 0154 RO4. The digest of the owning account's credential, never the
   * credential. Renamed from `accountId` when the credential stopped being
   * stored: a field called id that holds a key is how a key reaches a log line.
   */
  accountDigest: string;
  status: PicoLinkMailboxStatus;
  capacity: number;
  registeredAt: string;
}

export interface PicoRelayCollected {
  tag: string;
  expiresAt: string;
  payload: string;
}

export class PicoRelayStore {
  private readonly db: Database.Database;

  /** The hostname this relay answers as, for a client that just connected. */
  public get operatorName(): string {
    return this.operator;
  }

  public constructor(databasePath: string, private readonly operator: string) {
    if (typeof operator !== 'string' || operator.trim() === '') {
      throw new Error('invalid_pico_relay_operator');
    }
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    /**
     * Befund B203. Anders als bei den Fremdschluesseln hat der Schalter hier
     * einen Gegenstand: dieser Store kehrt Postfaecher, und die Zeile darueber
     * sagt, warum das zaehlt - was hier liegt, ist versiegelt, die Adressen
     * sind es nicht. Ohne diesen Pragma bleiben die Bytes einer gekehrten
     * Zeile in der Seite stehen, bis etwas sie ueberschreibt.
     */
    this.db.pragma('secure_delete = ON');
    // Befund B120. Was hier liegt, ist versiegelt - die Adressen sind es nicht.
    narrowToOwner(databasePath);
    this.db.exec(`
      -- ADR 0154 RO2/RO4. One row or none, holding the digest of the operator
      -- credential. A relay's database is not the key to the relay it came
      -- from, which it was until this table existed.
      CREATE TABLE IF NOT EXISTS relay_operator (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        credential_digest TEXT NOT NULL,
        claimed_at TEXT NOT NULL
      );

      -- ADR 0154 RO4/RO5/RO6. Keyed by digest, bounded on both axes, and
      -- endable. No migration from the earlier shape, which keyed accounts by
      -- the credential itself: no relay has ever been published, and
      -- \`versioning.md\` records that nothing is kept for good yet. Writing a
      -- migration for a database that exists nowhere would be inventing a
      -- compatibility burden and then honouring it.
      CREATE TABLE IF NOT EXISTS relay_account (
        account_digest TEXT PRIMARY KEY,
        mailbox_quota INTEGER NOT NULL,
        max_capacity INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );

      -- A revoked mailbox stays, because ADR 0147 RY4 needs the revoked
      -- answer to be possible at all, and forgetting it would turn a
      -- deliberate ending into a typo the sender reads as its own mistake.
      CREATE TABLE IF NOT EXISTS relay_mailbox (
        mailbox TEXT PRIMARY KEY,
        account_digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'revoked')),
        capacity INTEGER NOT NULL,
        registered_at TEXT NOT NULL
      );

      -- The packet, as it arrived. The payload is ciphertext this relay has no
      -- key for and no reason to have one.
      CREATE TABLE IF NOT EXISTS relay_packet (
        mailbox TEXT NOT NULL,
        tag TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        payload TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        PRIMARY KEY (mailbox, tag)
      );
    `);
  }

  public close(): void {
    this.db.close();
  }

  /**
   * ADR 0153 PK2. Whether this store can still do its job, asked cheaply.
   *
   * A store-and-forward whose disk has gone read-only, vanished under it or
   * corrupted is still a running process, and that is the failure nobody sees
   * until the packets were needed. So the health listener asks the table
   * rather than the event loop. It throws on failure rather than returning
   * false, because the reason belongs in the caller's log and a boolean would
   * throw it away.
   */
  public probe(): void {
    this.db.prepare('SELECT COUNT(*) AS n FROM relay_mailbox').get();
  }

  /**
   * Whether anybody may register here at all.
   *
   * A relay with no accounts refuses every registration as `unknown_account`,
   * which is correct and indistinguishable at the door from a caller using the
   * wrong credential. The boot log is the one place that difference can be
   * stated, and stating it needs this question asked rather than assumed.
   */
  public hasAccounts(): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM relay_account WHERE status = 'active'")
      .get() as { n: number };
    return row.n > 0;
  }

  /**
   * ADR 0154 RO2. Whether anybody has claimed this relay.
   *
   * Asked at boot to decide whether to mint a claim code, and by `describe` so
   * a client that has just connected can tell "fresh" from "somebody else's".
   */
  public isClaimed(): boolean {
    return this.db.prepare('SELECT COUNT(*) AS n FROM relay_operator').get() !== undefined
      && (this.db.prepare('SELECT COUNT(*) AS n FROM relay_operator').get() as { n: number }).n > 0;
  }

  /**
   * ADR 0154 RO2/RO3. Records the operator credential's digest, once.
   *
   * Returns false rather than overwriting: a second claim on a claimed relay
   * is either a mistake or somebody replaying a log line, and both want the
   * same answer.
   */
  public claim(input: { credentialDigest: string; at: string }): boolean {
    if (this.isClaimed()) {
      return false;
    }
    this.db
      .prepare('INSERT INTO relay_operator (id, credential_digest, claimed_at) VALUES (1, ?, ?)')
      .run(input.credentialDigest, input.at);
    return true;
  }

  /**
   * ADR 0154 RO1. Whether a presented credential administers this relay.
   *
   * Compared in constant time, like the claim code beside it. The values are
   * digests rather than secrets, so the leak an ordinary `===` offers is a
   * prefix of a hash rather than of a key - but "the thing that leaks is not
   * quite the secret" is the reasoning that ages badly, and the fix is one
   * function call.
   */
  public isOperator(credential: string): boolean {
    const row = this.db
      .prepare('SELECT credential_digest AS digest FROM relay_operator WHERE id = 1')
      .get() as { digest: string } | undefined;
    if (row === undefined) {
      return false;
    }
    const expected = Buffer.from(row.digest, 'utf8');
    const actual = Buffer.from(picoRelayCredentialDigest(credential), 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  /**
   * ADR 0154 RO8. Forgets the operator so a fresh claim code can be minted.
   *
   * The accounts stay. Losing the administration credential is not a reason to
   * cut off every customer, and conflating the two would make the recovery
   * path more destructive than the loss it recovers from.
   */
  public forgetOperator(): void {
    this.db.prepare('DELETE FROM relay_operator').run();
  }

  /**
   * ADR 0154 RO3/RO4. Issues an account, storing the digest of a credential
   * this relay generated.
   *
   * The credential is the caller's to return to the operator once; nothing
   * here keeps it, which is why there is no route that can hand it back.
   */
  public createAccount(input: {
    credential: string;
    mailboxQuota: number;
    maxCapacity: number;
    at: string;
  }): PicoRelayAccountSummary {
    if (!Number.isInteger(input.mailboxQuota) || input.mailboxQuota <= 0) {
      throw new Error('invalid_pico_relay_quota');
    }
    if (!Number.isInteger(input.maxCapacity) || input.maxCapacity <= 0) {
      throw new Error('invalid_pico_relay_capacity');
    }
    const digest = picoRelayCredentialDigest(input.credential);
    this.db
      .prepare(`
        INSERT INTO relay_account
          (account_digest, mailbox_quota, max_capacity, status, created_at)
        VALUES (?, ?, ?, 'active', ?)
      `)
      .run(digest, input.mailboxQuota, input.maxCapacity, input.at);
    return this.accountSummaries().find((account) => account.accountRef === refOf(digest))!;
  }

  /**
   * ADR 0154 RO5. Ends an account, keeping the row.
   *
   * ADR 0147 RY4's reasoning applied one level up: "never existed" and "ended"
   * are different facts, and only one of them stays answerable if the row goes.
   * The mailboxes stay as they are - the credential stops working, which is
   * what revoking a credential means.
   */
  public revokeAccount(input: { accountRef: string; at: string }):
  { ok: true; mailboxesEnded: number; packetsDropped: number }
    | { ok: false; refusal: 'unknown_account' | 'account_already_revoked' } {
    const found = this.accountSummaries().find((account) => account.accountRef === input.accountRef);
    if (found === undefined) {
      return { ok: false, refusal: 'unknown_account' };
    }
    if (found.status === 'revoked') {
      return { ok: false, refusal: 'account_already_revoked' };
    }
    /**
     * ADR 0154 RO5 with ADR 0147 RY4. **The mailboxes end with the account,
     * and the first version of this forgot them.**
     *
     * Revoking only the account left its mailboxes `open`, so this relay went
     * on answering `accepted` to senders posting into an address nobody could
     * ever collect from - the old credential is refused, and no new one
     * inherits a mailbox. ADR 0149 names that failure in its own words, about
     * a different mechanism: a sender writing into nothing while both sides
     * believe the exchange succeeded is the thing a relay exists to prevent.
     * It arrived here through the mechanism meant to end a relationship.
     *
     * So an account's mailboxes are revoked with it, which makes `deliver`
     * answer `mailbox_revoked` on its own - RY4's existing vocabulary, no new
     * outcome - and their queues go, for `deregister`'s stated reason: those
     * packets were addressed to a relationship that has ended, and holding
     * them would be holding material for somebody who has stopped listening.
     */
    const ended = this.db.transaction(() => {
      this.db
        .prepare(`
          UPDATE relay_account SET status = 'revoked', revoked_at = ?
          WHERE substr(account_digest, 1, ?) = ?
        `)
        .run(input.at, picoRelayAccountRefLength, input.accountRef);
      const open = this.db
        .prepare(`
          SELECT mailbox FROM relay_mailbox
          WHERE substr(account_digest, 1, ?) = ? AND status = 'open'
        `)
        .all(picoRelayAccountRefLength, input.accountRef) as Array<{ mailbox: string }>;
      let dropped = 0;
      for (const row of open) {
        this.db.prepare("UPDATE relay_mailbox SET status = 'revoked' WHERE mailbox = ?")
          .run(row.mailbox);
        dropped += this.db
          .prepare('DELETE FROM relay_packet WHERE mailbox = ?')
          .run(row.mailbox).changes;
      }
      // Counted rather than done quietly. Dropping a queue is the one
      // destructive thing revocation does, and the only public reader of a
      // queue is the account that just stopped existing - so if this number
      // does not travel, nothing can ever observe it, including a test.
      return { ended: open.length, dropped };
    })();
    return { ok: true, mailboxesEnded: ended.ended, packetsDropped: ended.dropped };
  }

  /**
   * ADR 0154 RO4. What the operator can see, which is everything except a key.
   *
   * The handle is the digest's first bytes: enough to point at a row and
   * revoke it, and not a credential. A list route that named accounts by their
   * credential would hand every key back on every read.
   */
  public accountSummaries(): readonly PicoRelayAccountSummary[] {
    const rows = this.db
      .prepare(`
        SELECT
          a.account_digest AS digest,
          a.mailbox_quota AS mailboxQuota,
          a.max_capacity AS maxCapacity,
          a.status AS status,
          a.created_at AS createdAt,
          a.revoked_at AS revokedAt,
          (
            SELECT COUNT(*) FROM relay_mailbox m
            WHERE m.account_digest = a.account_digest AND m.status = 'open'
          ) AS openMailboxes
        FROM relay_account a
        ORDER BY a.created_at, a.account_digest
      `)
      .all() as Array<{
      digest: string;
      mailboxQuota: number;
      maxCapacity: number;
      status: PicoRelayAccountStatus;
      createdAt: string;
      revokedAt: string | null;
      openMailboxes: number;
    }>;
    return Object.freeze(rows.map((row) => Object.freeze({
      accountRef: refOf(row.digest),
      status: row.status,
      mailboxQuota: row.mailboxQuota,
      maxCapacity: row.maxCapacity,
      openMailboxes: row.openMailboxes,
      createdAt: row.createdAt,
      ...(row.revokedAt === null ? {} : { revokedAt: row.revokedAt }),
    })));
  }

  /**
   * ADR 0149 RS7. Whether a presented credential is an account in good
   * standing, asked from the door before a body is read.
   *
   * The same question `activeAccount` answers and the only part the rate
   * limiter needs: it charges a budget, it does not act on the account.
   */
  public isActiveAccount(credential: string): boolean {
    return this.activeAccount(credential) !== undefined;
  }

  /**
   * The account a presented credential belongs to, or nothing.
   *
   * A revoked account answers the same as one that never existed. ADR 0077 C4
   * is the Home's version of the same rule: telling a caller that their
   * credential *used* to work is a fact about the operator's decisions, and
   * the caller already knows what they did.
   */
  private activeAccount(credential: string): {
    digest: string;
    mailboxQuota: number;
    maxCapacity: number;
  } | undefined {
    return this.db
      .prepare(`
        SELECT account_digest AS digest, mailbox_quota AS mailboxQuota, max_capacity AS maxCapacity
        FROM relay_account WHERE account_digest = ? AND status = 'active'
      `)
      .get(picoRelayCredentialDigest(credential)) as {
      digest: string; mailboxQuota: number; maxCapacity: number;
    } | undefined;
  }

  /**
   * ADR 0149 RS2/RS6. Takes a mailbox for an account, or says which bound
   * refused.
   *
   * The mailbox name comes from the caller rather than from here, because ADR
   * 0148 issues an address on the side that will hand it over - an address is
   * theirs to issue and this relay's to hold. What is checked is that it is
   * 128 bits of the shape ADR 0147 fixed, so a caller cannot register
   * `alice` and make its own mailbox guessable.
   */
  public register(input: {
    accountId: string;
    mailbox: string;
    capacity: number;
    registeredAt: string;
  }): { ok: true; mailbox: PicoRelayMailbox } | { ok: false; refusal: PicoRelayRefusal } {
    if (!picoLinkMailboxPattern.test(input.mailbox)) {
      throw new Error('invalid_pico_link_mailbox');
    }
    const account = this.activeAccount(input.accountId);
    if (account === undefined) {
      return { ok: false, refusal: 'unknown_account' };
    }
    if (input.capacity > account.maxCapacity) {
      // ADR 0154 RO6. The axis that had no ceiling: capacity arrives from the
      // caller, and without this an account with a quota of one could ask for
      // a mailbox holding a million packets.
      return { ok: false, refusal: 'capacity_above_account_ceiling' };
    }
    if (this.mailboxFor(input.mailbox) !== undefined) {
      // Including a revoked one. Reusing a name whose tombstone answers
      // `mailbox_revoked` would make that answer a lie to whoever still holds
      // the old address.
      return { ok: false, refusal: 'mailbox_already_registered' };
    }
    const held = this.db
      .prepare("SELECT COUNT(*) AS held FROM relay_mailbox WHERE account_digest = ? AND status = 'open'")
      .get(account.digest) as { held: number };
    if (held.held >= account.mailboxQuota) {
      // ADR 0119 Q5's posture, in somebody else's machine: a ceiling refuses
      // and never makes room by dropping what is already there.
      return { ok: false, refusal: 'account_mailbox_quota_reached' };
    }

    this.db
      .prepare(`
        INSERT INTO relay_mailbox (mailbox, account_digest, status, capacity, registered_at)
        VALUES (?, ?, 'open', ?, ?)
      `)
      .run(input.mailbox, account.digest, input.capacity, input.registeredAt);
    return { ok: true, mailbox: this.mailboxFor(input.mailbox)! };
  }

  public mailboxFor(mailbox: string): PicoRelayMailbox | undefined {
    const row = this.db
      .prepare(`
        SELECT mailbox, account_digest AS accountDigest, status, capacity, registered_at AS registeredAt
        FROM relay_mailbox WHERE mailbox = ?
      `)
      .get(mailbox) as PicoRelayMailbox | undefined;
    return row === undefined ? undefined : Object.freeze({ ...row });
  }

  /**
   * ADR 0149 RS3. Delivery takes no credential, and there is nothing to take
   * one from: ADR 0147 RY1 removed the sender field, so a packet carries no
   * claim about who sent it.
   *
   * The decision itself is `resolvePicoLinkDelivery`, unchanged - the ordering
   * of `mailbox_unknown`, `mailbox_revoked`, expiry, duplication and fullness
   * was made in ADR 0147 and this wires it rather than restating it.
   */
  public deliver(input: {
    packet: PicoLinkPacket;
    nowMs: number;
    acceptedAt: string;
  }): PicoLinkDeliveryOutcome {
    const address = parsePicoLinkPacketAddress(input.packet.to);
    if (address.operator !== this.operator) {
      // Not ours to hold. Refusing as unknown rather than as a routing error
      // is deliberate: there is no inter-operator routing (ADR 0028 non-goal),
      // and a distinct answer would invite a caller to expect one.
      return 'mailbox_unknown';
    }
    const registration = this.mailboxFor(address.mailbox);
    const queue = this.queueFor(address.mailbox);

    const delivery = resolvePicoLinkDelivery({
      registration: registration === undefined ? undefined : {
        address: input.packet.to,
        status: registration.status,
        capacity: registration.capacity,
      },
      queue,
      packet: input.packet,
      nowMs: input.nowMs,
    });

    if (delivery.outcome === 'accepted' && !queue.some((held) => held.tag === input.packet.tag)) {
      this.db
        .prepare(`
          INSERT INTO relay_packet (mailbox, tag, expires_at, payload, accepted_at)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(address.mailbox, input.packet.tag, input.packet.expiresAt, input.packet.payload, input.acceptedAt);
    }
    // Expiry is the sender's instruction, so acting on it is following one.
    // Nothing here drops a live packet: that would be the decision ADR 0119 Q5
    // forbids, leaving the sender told `accepted` and the recipient shown
    // nothing, with both right and nobody told.
    this.pruneExpired(input.nowMs);
    return delivery.outcome;
  }

  /**
   * ADR 0149 RS4/RS5. Hands over what is waiting and **removes nothing**.
   *
   * A relay that dropped a packet as it handed it over would lose it whenever
   * a collector crashed between the socket and the disk, invisibly on both
   * sides. ADR 0118 O1 settled the shape: being told twice is a cost a person
   * can absorb, being told never is the failure that matters.
   *
   * A mailbox belonging to another account answers as though it were not
   * there. Telling one customer that another holds a given mailbox is a fact
   * this relay has no reason to disclose.
   */
  public collect(input: {
    accountId: string;
    mailbox: string;
    nowMs: number;
  }): { ok: true; packets: readonly PicoRelayCollected[] } | { ok: false; refusal: PicoRelayRefusal } {
    const account = this.activeAccount(input.accountId);
    const registration = this.mailboxFor(input.mailbox);
    if (account === undefined
      || registration === undefined
      || registration.accountDigest !== account.digest) {
      // One answer for three states: not yours, not there, and a credential
      // this relay has stopped honouring. ADR 0154 RO5 - a revoked account
      // learns that its credential no longer works, and nothing about whose
      // mailbox it was asking after.
      return { ok: false, refusal: 'mailbox_not_yours' };
    }
    this.pruneExpired(input.nowMs);
    const rows = this.db
      .prepare(`
        SELECT tag, expires_at AS expiresAt, payload FROM relay_packet
        WHERE mailbox = ? ORDER BY accepted_at, tag
      `)
      .all(input.mailbox) as PicoRelayCollected[];
    return { ok: true, packets: Object.freeze(rows.map((row) => Object.freeze({ ...row }))) };
  }

  /** ADR 0149 RS5. What removes. Acknowledging a tag nobody holds is not an error. */
  public acknowledge(input: {
    accountId: string;
    mailbox: string;
    tags: readonly string[];
  }): { ok: true; removed: number } | { ok: false; refusal: PicoRelayRefusal } {
    const account = this.activeAccount(input.accountId);
    const registration = this.mailboxFor(input.mailbox);
    if (account === undefined
      || registration === undefined
      || registration.accountDigest !== account.digest) {
      // One answer for three states: not yours, not there, and a credential
      // this relay has stopped honouring. ADR 0154 RO5 - a revoked account
      // learns that its credential no longer works, and nothing about whose
      // mailbox it was asking after.
      return { ok: false, refusal: 'mailbox_not_yours' };
    }
    const statement = this.db.prepare('DELETE FROM relay_packet WHERE mailbox = ? AND tag = ?');
    let removed = 0;
    for (const tag of input.tags) {
      removed += statement.run(input.mailbox, tag).changes;
    }
    return { ok: true, removed };
  }

  /**
   * ADR 0147 RY4. Ends a mailbox and leaves the tombstone that makes
   * `mailbox_revoked` answerable.
   *
   * Its queue goes: those packets were addressed to a relationship that has
   * ended, and holding them would be holding material for somebody who has
   * stopped listening.
   */
  public deregister(input: {
    accountId: string;
    mailbox: string;
  }): { ok: true } | { ok: false; refusal: PicoRelayRefusal } {
    const account = this.activeAccount(input.accountId);
    const registration = this.mailboxFor(input.mailbox);
    if (account === undefined
      || registration === undefined
      || registration.accountDigest !== account.digest) {
      // One answer for three states: not yours, not there, and a credential
      // this relay has stopped honouring. ADR 0154 RO5 - a revoked account
      // learns that its credential no longer works, and nothing about whose
      // mailbox it was asking after.
      return { ok: false, refusal: 'mailbox_not_yours' };
    }
    /*
     * **In einer Transaktion, seit Befund B163 (2026-09-13).** Genau dieses
     * Paar steht in dieser Datei ein zweites Mal - in `revokeAccount`, und
     * dort ist es seit jeher eingefasst. Hier war es das nicht: ein Absturz
     * dazwischen liesse ein zurueckgezogenes Postfach mit seinen Paketen
     * zurueck, auf einem Relay, dessen ganze Haltung ist, so wenig zu halten
     * wie moeglich (ADR 0147).
     *
     * Die Begruendung steht drueben schon geschrieben: "those packets were
     * addressed to a relationship that has ended". Zurueckziehen und leeren
     * sind eine Handlung und keine zwei - und dieser Satz zitiert `deregister`
     * namentlich, waehrend `deregister` ihn nicht einhielt.
     */
    this.db.transaction(() => {
      this.db.prepare("UPDATE relay_mailbox SET status = 'revoked' WHERE mailbox = ?").run(input.mailbox);
      this.db.prepare('DELETE FROM relay_packet WHERE mailbox = ?').run(input.mailbox);
    })();
    return { ok: true };
  }

  private queueFor(mailbox: string): readonly PicoLinkQueuedPacket[] {
    return this.db
      .prepare('SELECT tag, expires_at AS expiresAt FROM relay_packet WHERE mailbox = ? ORDER BY accepted_at, tag')
      .all(mailbox) as PicoLinkQueuedPacket[];
  }

  /**
   * ADR 0147 RY6. Drops everything the senders instructed this relay to stop
   * holding - **in every mailbox, not only the one being touched.**
   *
   * Befund B165. Bis zum 2026-09-13 lief dies je Postfach, und gefahren wird
   * es nur beim Zustellen und beim Abholen. Ein Postfach, das niemand mehr
   * anfasst - ein verlorenes Geraet, eine App, die abgeraeumt wurde, eine
   * Beziehung, die ohne Abmeldung endete -, behielt seine abgelaufenen Pakete
   * also fuer immer. Hergestellt: eine Stunde nach dem Ablauf beider Pakete
   * das eine Postfach abholen, und das andere haelt seines unveraendert.
   *
   * RY6 sagt, warum das falsch ist: *"An expired packet is one the sender
   * instructed the relay to stop holding, so pruning it is following an
   * instruction."* Eine Anweisung, die nur befolgt wird, wenn zufaellig jemand
   * vorbeikommt, ist keine befolgte Anweisung - und ADR 0147 nennt das Relay
   * die erste Stelle im System, die fremden Verkehr haelt.
   *
   * Es ist auch *weniger* Arbeit als vorher: ein Satz statt eines Lesens mit
   * Schleife. Der Vergleich traegt als Zeichenkette, weil jeder Ablauf ein auf
   * das Raster gerundeter ISO-Zeitpunkt ist (`pico_link_expiry_not_on_bucket`
   * weist alles andere ab) und `toISOString` fuer alle dieselbe Breite und
   * dieselbe Zeitzone schreibt.
   */
  private pruneExpired(nowMs: number): void {
    this.db
      .prepare('DELETE FROM relay_packet WHERE expires_at <= ?')
      .run(new Date(nowMs).toISOString());
  }
}

/**
 * ADR 0154 RO4. A non-secret handle for one account.
 *
 * The digest's first bytes. Truncation is safe here because the value is only
 * ever compared against digests this relay computed - it names a row, it never
 * authenticates one, and every route that acts on it has already checked the
 * operator credential.
 */
function refOf(digest: string): string {
  return digest.slice(0, picoRelayAccountRefLength);
}
