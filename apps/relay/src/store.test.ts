import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePicoLinkPacket, picoLinkPacketSchema } from '@pico/protocol/link-packet';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { PicoRelayStore } from './store.js';

/**
 * ADR 0149. A relay holds mailboxes for accounts and never learns a Pico.
 *
 * The test that carries the most is RS5: collecting twice returns the same
 * packets, because collection removes nothing. A relay that dropped a packet
 * as it handed it over would lose it whenever a collector crashed between the
 * socket and the disk, invisibly on both sides.
 */
const tempDirs: string[] = [];
const operator = 'relay.example.invalid';
const nowMs = Date.parse('2026-08-12T11:00:00.000Z');
const expiresAt = '2026-08-12T12:00:00.000Z';
const acceptedAt = '2026-08-12T11:00:00.000Z';

const mailboxOf = (seed: string) => seed.repeat(32).slice(0, 32);

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openStore(): PicoRelayStore {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-'));
  tempDirs.push(dir);
  return new PicoRelayStore(join(dir, 'relay.sqlite'), operator);
}

function packet(over: { mailbox?: string; tag?: string; expiresAt?: string; payload?: string } = {}) {
  return parsePicoLinkPacket({
    schema: picoLinkPacketSchema,
    to: `${over.mailbox ?? mailboxOf('a')}@${operator}`,
    tag: over.tag ?? mailboxOf('b'),
    expiresAt: over.expiresAt ?? expiresAt,
    payload: over.payload ?? 'AAAA',
  });
}

/**
 * A ready store, plus a second connection to the same file.
 *
 * The second connection exists to install an obstacle, not to write data: a
 * transaction is invisible while both of its writes succeed, so the only way
 * to walk one is to make the second write fail for a reason of the database's
 * own. A trigger does that and a stubbed method would not - a stub proves the
 * arrangement of the test rather than the behaviour of the code.
 */
function readyStoreWithDatabase(): { store: PicoRelayStore; db: Database.Database } {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-'));
  tempDirs.push(dir);
  const path = join(dir, 'relay.sqlite');
  const store = new PicoRelayStore(path, operator);
  store.createAccount({ credential: 'account-1', mailboxQuota: 2, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
  store.register({ accountId: 'account-1', mailbox: mailboxOf('a'), capacity: 4, registeredAt: acceptedAt });
  return { store, db: new Database(path) };
}

function readyStore(capacity = 4): PicoRelayStore {
  const store = openStore();
  store.createAccount({ credential: 'account-1', mailboxQuota: 2, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
  store.register({
    accountId: 'account-1',
    mailbox: mailboxOf('a'),
    capacity,
    registeredAt: acceptedAt,
  });
  return store;
}

describe('ADR 0149 RS2 - an account, never a Pico', () => {
  it('refuses a mailbox for an account it does not know', () => {
    const store = openStore();
    expect(store.register({
      accountId: 'nobody', mailbox: mailboxOf('a'), capacity: 4, registeredAt: acceptedAt,
    })).toEqual({ ok: false, refusal: 'unknown_account' });
    store.close();
  });

  it('refuses a mailbox name that is not 128 bits', () => {
    // A caller registering `alice` would be making its own mailbox guessable,
    // and an addressable mailbox somebody can guess is an open relay into that
    // one relationship (ADR 0147 RY2).
    const store = openStore();
    store.createAccount({ credential: 'account-1', mailboxQuota: 2, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
    expect(() => store.register({
      accountId: 'account-1', mailbox: 'alice', capacity: 4, registeredAt: acceptedAt,
    })).toThrow('invalid_pico_link_mailbox');
    store.close();
  });

  it('holds a quota and nothing else about an account', () => {
    const store = openStore();
    store.createAccount({ credential: 'account-1', mailboxQuota: 1, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
    expect(store.register({
      accountId: 'account-1', mailbox: mailboxOf('a'), capacity: 4, registeredAt: acceptedAt,
    }).ok).toBe(true);
    expect(store.register({
      accountId: 'account-1', mailbox: mailboxOf('c'), capacity: 4, registeredAt: acceptedAt,
    })).toEqual({ ok: false, refusal: 'account_mailbox_quota_reached' });
    store.close();
  });

  it('refuses to reuse a name whose tombstone still answers', () => {
    // Reusing it would make `mailbox_revoked` a lie to whoever still holds the
    // old address.
    const store = readyStore();
    store.deregister({ accountId: 'account-1', mailbox: mailboxOf('a') });
    expect(store.register({
      accountId: 'account-1', mailbox: mailboxOf('a'), capacity: 4, registeredAt: acceptedAt,
    })).toEqual({ ok: false, refusal: 'mailbox_already_registered' });
    store.close();
  });
});

describe('ADR 0149 RS3 - delivery takes no credential', () => {
  it('accepts a packet from nobody in particular', () => {
    const store = readyStore();
    expect(store.deliver({ packet: packet(), nowMs, acceptedAt })).toBe('accepted');
    store.close();
  });

  it('answers the ADR 0147 vocabulary rather than one of its own', () => {
    const store = readyStore(1);
    expect(store.deliver({ packet: packet({ mailbox: mailboxOf('c') }), nowMs, acceptedAt }))
      .toBe('mailbox_unknown');
    expect(store.deliver({
      packet: packet({ expiresAt: '2026-08-12T10:00:00.000Z' }), nowMs, acceptedAt,
    })).toBe('packet_expired');
    expect(store.deliver({ packet: packet(), nowMs, acceptedAt })).toBe('accepted');
    expect(store.deliver({ packet: packet({ tag: mailboxOf('d') }), nowMs, acceptedAt }))
      .toBe('mailbox_full');
    store.close();
  });

  it('answers a revoked mailbox by name', () => {
    const store = readyStore();
    store.deregister({ accountId: 'account-1', mailbox: mailboxOf('a') });
    expect(store.deliver({ packet: packet(), nowMs, acceptedAt })).toBe('mailbox_revoked');
    store.close();
  });

  it('treats another operator as unknown rather than as a routing error', () => {
    // There is no inter-operator routing (ADR 0028 non-goal), and a distinct
    // answer would invite a caller to expect one.
    const store = readyStore();
    const foreign = parsePicoLinkPacket({
      schema: picoLinkPacketSchema,
      to: `${mailboxOf('a')}@other.relay.invalid`,
      tag: mailboxOf('b'),
      expiresAt,
      payload: 'AAAA',
    });
    expect(store.deliver({ packet: foreign, nowMs, acceptedAt })).toBe('mailbox_unknown');
    store.close();
  });

  it('accepts a retry without duplicating it', () => {
    const store = readyStore();
    expect(store.deliver({ packet: packet(), nowMs, acceptedAt })).toBe('accepted');
    expect(store.deliver({ packet: packet(), nowMs, acceptedAt })).toBe('accepted');
    const collected = store.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    expect(collected.ok && collected.packets).toHaveLength(1);
    store.close();
  });

  it('never drops a live packet to make room', () => {
    // ADR 0119 Q5: a ceiling refuses and never trims. The sender told
    // `accepted` and the recipient shown nothing would both be right.
    const store = readyStore(1);
    store.deliver({ packet: packet(), nowMs, acceptedAt });
    expect(store.deliver({ packet: packet({ tag: mailboxOf('d') }), nowMs, acceptedAt }))
      .toBe('mailbox_full');
    const collected = store.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    expect(collected.ok && collected.packets.map((p) => p.tag)).toEqual([mailboxOf('b')]);
    store.close();
  });

  it('drops what the sender itself ended, which is not eviction', () => {
    const store = readyStore(1);
    store.deliver({ packet: packet(), nowMs, acceptedAt });
    const later = Date.parse('2026-08-12T13:00:00.000Z');
    expect(store.deliver({
      packet: packet({ tag: mailboxOf('d'), expiresAt: '2026-08-12T14:00:00.000Z' }),
      nowMs: later,
      acceptedAt,
    })).toBe('accepted');
    store.close();
  });
});

describe('ADR 0149 RS4 - collection needs the account that registered', () => {
  it('answers another account as though the mailbox were not there', () => {
    // Telling one customer that another holds a given mailbox is a fact this
    // relay has no reason to disclose.
    const store = readyStore();
    store.createAccount({ credential: 'account-2', mailboxQuota: 1, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
    expect(store.collect({ accountId: 'account-2', mailbox: mailboxOf('a'), nowMs }))
      .toEqual({ ok: false, refusal: 'mailbox_not_yours' });
    expect(store.collect({ accountId: 'account-2', mailbox: mailboxOf('z'), nowMs }))
      .toEqual({ ok: false, refusal: 'mailbox_not_yours' });
    store.close();
  });

  it('refuses another account acknowledging or deregistering', () => {
    const store = readyStore();
    store.createAccount({ credential: 'account-2', mailboxQuota: 1, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
    expect(store.acknowledge({ accountId: 'account-2', mailbox: mailboxOf('a'), tags: [] }).ok)
      .toBe(false);
    expect(store.deregister({ accountId: 'account-2', mailbox: mailboxOf('a') }).ok).toBe(false);
    store.close();
  });
});

describe('ADR 0149 RS5 - a collected packet is not a delivered one', () => {
  it('returns the same packets twice, because collection removes nothing', () => {
    // **The gate.** A relay that dropped a packet as it handed it over would
    // lose it whenever a collector crashed between the socket and the disk,
    // and the loss would be invisible on both sides.
    const store = readyStore();
    store.deliver({ packet: packet(), nowMs, acceptedAt });

    const first = store.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    const second = store.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    expect(first).toEqual(second);
    expect(first.ok && first.packets[0]?.payload).toBe('AAAA');
    store.close();
  });

  it('removes only on acknowledgement, and only what was named', () => {
    const store = readyStore();
    store.deliver({ packet: packet(), nowMs, acceptedAt });
    store.deliver({ packet: packet({ tag: mailboxOf('d') }), nowMs, acceptedAt });

    expect(store.acknowledge({
      accountId: 'account-1', mailbox: mailboxOf('a'), tags: [mailboxOf('b')],
    })).toEqual({ ok: true, removed: 1 });

    const left = store.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    expect(left.ok && left.packets.map((p) => p.tag)).toEqual([mailboxOf('d')]);
    store.close();
  });

  it('treats acknowledging a tag nobody holds as nothing to do', () => {
    const store = readyStore();
    expect(store.acknowledge({
      accountId: 'account-1', mailbox: mailboxOf('a'), tags: [mailboxOf('d')],
    })).toEqual({ ok: true, removed: 0 });
    store.close();
  });

  it('never says a packet was delivered, because it cannot observe that', () => {
    // ADR 0147 RY5 from the other side: the relay reports what it holds and
    // what was acknowledged by whoever holds the account, and nothing about a
    // person.
    const store = readyStore();
    const outcome = store.deliver({ packet: packet(), nowMs, acceptedAt });
    expect(outcome).toBe('accepted');
    expect(['delivered', 'read']).not.toContain(outcome);
    store.close();
  });
});

describe('ADR 0147 RY4 - deregistration leaves a tombstone', () => {
  it('keeps the mailbox as revoked and drops what it was holding', () => {
    // The packets were addressed to a relationship that has ended; holding
    // them would be holding material for somebody who stopped listening.
    const store = readyStore();
    store.deliver({ packet: packet(), nowMs, acceptedAt });
    expect(store.deregister({ accountId: 'account-1', mailbox: mailboxOf('a') })).toEqual({ ok: true });

    expect(store.mailboxFor(mailboxOf('a'))?.status).toBe('revoked');
    const collected = store.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    expect(collected.ok && collected.packets).toHaveLength(0);
    store.close();
  });

  it('leaves the mailbox standing when its packets cannot be dropped', () => {
    // B163. The tombstone and the emptying are one act, not two. Revoked with
    // its queue still on disk is the state a relay must never be in: ADR 0147
    // is a relay holding as little as possible, and this would be it holding
    // material for a relationship it has already declared over - where no
    // collector will ever come for it and no expiry sweep will ever run.
    //
    // The same pair stands a second time in this file, in `revokeAccount`,
    // where it has always been transactional and its comment cites this method
    // by name. One neighbour had the lesson and the other did not.
    const { store, db } = readyStoreWithDatabase();
    store.deliver({ packet: packet(), nowMs, acceptedAt });

    db.exec(`
      CREATE TRIGGER planted_packet_delete_fails
      BEFORE DELETE ON relay_packet
      BEGIN SELECT RAISE(ABORT, 'planted_packet_delete_fails'); END
    `);
    expect(() => store.deregister({ accountId: 'account-1', mailbox: mailboxOf('a') }))
      .toThrow('planted_packet_delete_fails');

    // Still open, still holding its packet: the address keeps answering
    // and its owner can try again. Half-deregistered would be silent.
    expect(store.mailboxFor(mailboxOf('a'))?.status).toBe('open');
    const held = store.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    expect(held.ok && held.packets).toHaveLength(1);

    db.exec('DROP TRIGGER planted_packet_delete_fails');
    expect(store.deregister({ accountId: 'account-1', mailbox: mailboxOf('a') })).toEqual({ ok: true });
    expect(store.mailboxFor(mailboxOf('a'))?.status).toBe('revoked');
    db.close();
    store.close();
  });

  it('survives a restart, because store-and-forward that forgets is neither', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-relay-restart-'));
    tempDirs.push(dir);
    const path = join(dir, 'relay.sqlite');

    const first = new PicoRelayStore(path, operator);
    first.createAccount({ credential: 'account-1', mailboxQuota: 2, maxCapacity: 1_000, at: '2026-01-01T00:00:00.000Z' });
    first.register({ accountId: 'account-1', mailbox: mailboxOf('a'), capacity: 4, registeredAt: acceptedAt });
    first.deliver({ packet: packet(), nowMs, acceptedAt });
    first.close();

    const second = new PicoRelayStore(path, operator);
    const collected = second.collect({ accountId: 'account-1', mailbox: mailboxOf('a'), nowMs });
    expect(collected.ok && collected.packets.map((p) => p.tag)).toEqual([mailboxOf('b')]);
    second.close();
  });
});

describe('ADR 0149 RS1 - wer auf dieser Maschine die Adressen lesen darf', () => {
  /**
   * Befund B120, gegen einen laufenden Relaisprozess gegangen: gegen ein
   * Datenverzeichnis, das schon existierte, blieben `644 relay.sqlite`,
   * `644 -wal` und `644 -shm` in einem Verzeichnis mit `755` liegen.
   *
   * Was darin steht, ist versiegelt - ADR 0107 siegelt Ende zu Ende und ein
   * Relay haelt keinen Schluessel. Die *Adressen* sind es nicht:
   * `check-link-seal.mjs` verbietet eine Mailboxadresse in einer
   * Protokollzeile, weil eine Mailbox eine Beziehung ist, und diese Datei
   * haelt alle auf einmal. Ein Relay ist die eine Komponente, die auf der
   * Maschine eines anderen laeuft (RS1) - genau dort hoert "ein weiteres Konto
   * auf diesem Rechner" auf, hypothetisch zu sein.
   */
  it('haelt Datenbank und Begleitdateien beim Eigentuemer, auch in einem offenen Verzeichnis', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pico-relay-mode-'));
    tempDirs.push(directory);
    const data = join(directory, 'data');
    mkdirSync(data, { recursive: true });
    chmodSync(data, 0o755);

    const store = new PicoRelayStore(join(data, 'relay.sqlite'), 'relay.example.invalid');
    store.close();

    for (const name of ['relay.sqlite', 'relay.sqlite-wal', 'relay.sqlite-shm']) {
      let mode: number | null = null;
      try {
        mode = statSync(join(data, name)).mode & 0o777;
      } catch {
        continue;
      }
      expect(mode & ~0o600).toBe(0);
    }
  });
});
