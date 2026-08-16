import Database from 'better-sqlite3';
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
  'mailbox_not_yours',
  'mailbox_already_registered',
] as const;

export type PicoRelayRefusal = typeof picoRelayRefusals[number];

export interface PicoRelayMailbox {
  mailbox: string;
  accountId: string;
  status: 'open' | 'revoked';
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

  public constructor(databasePath: string, private readonly operator: string) {
    if (typeof operator !== 'string' || operator.trim() === '') {
      throw new Error('invalid_pico_relay_operator');
    }
    this.db = new Database(databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relay_account (
        account_id TEXT PRIMARY KEY,
        mailbox_quota INTEGER NOT NULL
      );

      -- A revoked mailbox stays, because ADR 0147 RY4 needs the revoked
      -- answer to be possible at all, and forgetting it would turn a
      -- deliberate ending into a typo the sender reads as its own mistake.
      CREATE TABLE IF NOT EXISTS relay_mailbox (
        mailbox TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
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
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM relay_account').get() as { n: number };
    return row.n > 0;
  }

  /** Operator business, out of band. The relay learns a quota and no more. */
  public upsertAccount(input: { accountId: string; mailboxQuota: number }): void {
    if (!Number.isInteger(input.mailboxQuota) || input.mailboxQuota <= 0) {
      throw new Error('invalid_pico_relay_quota');
    }
    this.db
      .prepare(`
        INSERT INTO relay_account (account_id, mailbox_quota) VALUES (?, ?)
        ON CONFLICT(account_id) DO UPDATE SET mailbox_quota = excluded.mailbox_quota
      `)
      .run(input.accountId, input.mailboxQuota);
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
    const account = this.db
      .prepare('SELECT mailbox_quota AS quota FROM relay_account WHERE account_id = ?')
      .get(input.accountId) as { quota: number } | undefined;
    if (account === undefined) {
      return { ok: false, refusal: 'unknown_account' };
    }
    if (this.mailboxFor(input.mailbox) !== undefined) {
      // Including a revoked one. Reusing a name whose tombstone answers
      // `mailbox_revoked` would make that answer a lie to whoever still holds
      // the old address.
      return { ok: false, refusal: 'mailbox_already_registered' };
    }
    const held = this.db
      .prepare("SELECT COUNT(*) AS held FROM relay_mailbox WHERE account_id = ? AND status = 'open'")
      .get(input.accountId) as { held: number };
    if (held.held >= account.quota) {
      // ADR 0119 Q5's posture, in somebody else's machine: a ceiling refuses
      // and never makes room by dropping what is already there.
      return { ok: false, refusal: 'account_mailbox_quota_reached' };
    }

    this.db
      .prepare(`
        INSERT INTO relay_mailbox (mailbox, account_id, status, capacity, registered_at)
        VALUES (?, ?, 'open', ?, ?)
      `)
      .run(input.mailbox, input.accountId, input.capacity, input.registeredAt);
    return { ok: true, mailbox: this.mailboxFor(input.mailbox)! };
  }

  public mailboxFor(mailbox: string): PicoRelayMailbox | undefined {
    const row = this.db
      .prepare(`
        SELECT mailbox, account_id AS accountId, status, capacity, registered_at AS registeredAt
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
    this.pruneExpired(address.mailbox, input.nowMs);
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
    const registration = this.mailboxFor(input.mailbox);
    if (registration === undefined || registration.accountId !== input.accountId) {
      return { ok: false, refusal: 'mailbox_not_yours' };
    }
    this.pruneExpired(input.mailbox, input.nowMs);
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
    const registration = this.mailboxFor(input.mailbox);
    if (registration === undefined || registration.accountId !== input.accountId) {
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
    const registration = this.mailboxFor(input.mailbox);
    if (registration === undefined || registration.accountId !== input.accountId) {
      return { ok: false, refusal: 'mailbox_not_yours' };
    }
    this.db.prepare("UPDATE relay_mailbox SET status = 'revoked' WHERE mailbox = ?").run(input.mailbox);
    this.db.prepare('DELETE FROM relay_packet WHERE mailbox = ?').run(input.mailbox);
    return { ok: true };
  }

  private queueFor(mailbox: string): readonly PicoLinkQueuedPacket[] {
    return this.db
      .prepare('SELECT tag, expires_at AS expiresAt FROM relay_packet WHERE mailbox = ? ORDER BY accepted_at, tag')
      .all(mailbox) as PicoLinkQueuedPacket[];
  }

  private pruneExpired(mailbox: string, nowMs: number): void {
    for (const held of this.queueFor(mailbox)) {
      if (Date.parse(held.expiresAt) <= nowMs) {
        this.db.prepare('DELETE FROM relay_packet WHERE mailbox = ? AND tag = ?').run(mailbox, held.tag);
      }
    }
  }
}
