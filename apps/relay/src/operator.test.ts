import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  picoRelayAccountRefLength,
  picoRelayOperatorHeader,
  picoRelayOperatorRoutes,
} from '@pico/protocol/link-relay-operator';
import { PicoRelayClaimCode, picoRelayCredentialDigest } from './operator-claim.js';
import {
  PicoRelayRateLimit,
  picoRelayOperatorRequestsPerMinute,
  picoRelayUnauthenticatedRequestsPerMinute,
} from './rate-limit.js';
import { startPicoRelayOperatorListener } from './operator.js';
import { startPicoRelayServer } from './server.js';
import { PicoRelayStore } from './store.js';

/**
 * ADR 0154. Claiming a relay and administering it, without it learning a Pico.
 */
const dirs: string[] = [];
const closers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) {
    await close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Relay {
  store: PicoRelayStore;
  claimCode: PicoRelayClaimCode;
  url: string;
  advance(ms: number): void;
  call(route: string, body?: unknown, credential?: string): Promise<{
    status: number;
    body: Record<string, unknown>;
  }>;
}

async function relay(): Promise<Relay> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-operator-'));
  dirs.push(dir);
  const store = new PicoRelayStore(join(dir, 'relay.sqlite'), 'relay.example');
  closers.push(() => store.close());
  const claimCode = new PicoRelayClaimCode();
  // A clock the test moves, so the bucket's refill is arithmetic rather than
  // a wait - and so the other tests here are not silently racing it.
  let clockMs = Date.parse('2026-08-16T12:00:00.000Z');
  const listener = await startPicoRelayOperatorListener({
    store,
    claimCode,
    host: '127.0.0.1',
    port: 0,
    now: () => new Date(clockMs),
  });
  closers.push(() => listener.close());
  const url = `http://127.0.0.1:${listener.port}`;
  return {
    store,
    claimCode,
    url,
    advance: (ms) => {
      clockMs += ms;
    },
    call: async (route, body, credential) => {
      const response = await fetch(`${url}${route}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(credential === undefined ? {} : { [picoRelayOperatorHeader]: credential }),
        },
        body: JSON.stringify(body ?? {}),
      });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    },
  };
}

async function claimed(): Promise<{ relay: Relay; credential: string }> {
  const opened = await relay();
  const code = opened.claimCode.mint();
  const answer = await opened.call(picoRelayOperatorRoutes.claim, { claimCode: code });
  return { relay: opened, credential: answer.body.credential as string };
}

describe('ADR 0154 RO2 - claiming is a log line, spent once', () => {
  it('trades the code for a credential and then stops accepting it', async () => {
    const opened = await relay();
    const code = opened.claimCode.mint();

    const first = await opened.call(picoRelayOperatorRoutes.claim, { claimCode: code });
    expect(first.status).toBe(200);
    expect(first.body.credential).toMatch(/^[0-9a-f]{32}$/u);
    expect(first.body.operator).toBe('relay.example');
    expect(opened.store.isClaimed()).toBe(true);

    // A leaked log line cannot be replayed after the first claim.
    const second = await opened.call(picoRelayOperatorRoutes.claim, { claimCode: code });
    expect(second.status).toBe(409);
    expect(second.body.refusal).toBe('already_claimed');
  });

  it('tells a spent relay apart from a mistyped code', async () => {
    // Two different things to do next: one is "look at the log", the other is
    // "you already claimed this". Folding them together would send somebody
    // hunting for a code that is sitting spent.
    const opened = await relay();
    opened.claimCode.mint();
    const wrong = await opened.call(picoRelayOperatorRoutes.claim, { claimCode: 'x'.repeat(43) });
    expect(wrong.body.refusal).toBe('invalid_claim_code');

    const code = opened.claimCode.mint();
    await opened.call(picoRelayOperatorRoutes.claim, { claimCode: code });
    const late = await opened.call(picoRelayOperatorRoutes.claim, { claimCode: code });
    expect(late.body.refusal).toBe('already_claimed');
  });

  it('never writes the claim code to the database', () => {
    // A code beside the database would be handed to whoever restores a backup,
    // and a relay's backup is the artifact an operator hands around.
    const code = new PicoRelayClaimCode();
    const minted = code.mint();
    expect(code.consume(minted)).toBe(true);
    expect(code.consume(minted)).toBe(false);
    expect(code.isPending()).toBe(false);
  });
});

describe('ADR 0154 RO3/RO4 - the relay issues, and keeps a digest', () => {
  it('generates the account credential and returns it exactly once', async () => {
    const { relay: opened, credential } = await claimed();

    const created = await opened.call(
      picoRelayOperatorRoutes.accountCreate,
      { mailboxQuota: 4, maxCapacity: 32 },
      credential,
    );
    expect(created.status).toBe(200);
    const issued = created.body.credential as string;
    expect(issued).toMatch(/^[0-9a-f]{32}$/u);

    // The list route names accounts by a handle, never by the key.
    const listed = await opened.call(picoRelayOperatorRoutes.accountList, {}, credential);
    const accounts = listed.body.accounts as Array<Record<string, unknown>>;
    expect(accounts).toHaveLength(1);
    expect(JSON.stringify(accounts)).not.toContain(issued);
    expect(accounts[0]?.accountRef)
      .toBe(picoRelayCredentialDigest(issued).slice(0, picoRelayAccountRefLength));
  });

  it('refuses a caller that tries to choose the credential', async () => {
    const { relay: opened, credential } = await claimed();
    const created = await opened.call(
      picoRelayOperatorRoutes.accountCreate,
      { mailboxQuota: 1, maxCapacity: 1, credential: 'deadbeef'.repeat(4) },
      credential,
    );
    expect(created.status).toBe(400);
    expect(String(created.body.error)).toContain('carries_no:credential');
  });

  it('stores no credential a stolen database would yield', async () => {
    const { relay: opened, credential } = await claimed();
    const created = await opened.call(
      picoRelayOperatorRoutes.accountCreate,
      { mailboxQuota: 1, maxCapacity: 8 },
      credential,
    );
    const issued = created.body.credential as string;

    // The whole reason RO4 exists: `acknowledge` deletes packets, so a
    // database that held credentials would buy silently dropping everybody's
    // mail.
    const summaries = JSON.stringify(opened.store.accountSummaries());
    expect(summaries).not.toContain(issued);
    expect(summaries).not.toContain(credential);
    expect(opened.store.isOperator(credential)).toBe(true);
    expect(opened.store.isOperator('0'.repeat(32))).toBe(false);
  });
});

describe('ADR 0154 RO5 - an account can be taken back', () => {
  it('stops the credential working and keeps the row', async () => {
    const { relay: opened, credential } = await claimed();
    const created = await opened.call(
      picoRelayOperatorRoutes.accountCreate,
      { mailboxQuota: 2, maxCapacity: 8 },
      credential,
    );
    const issued = created.body.credential as string;
    const ref = (created.body.account as { accountRef: string }).accountRef;

    expect(opened.store.register({
      accountId: issued,
      mailbox: '1'.repeat(32),
      capacity: 4,
      registeredAt: '2026-08-16T12:00:00.000Z',
    }).ok).toBe(true);

    const revoked = await opened.call(
      picoRelayOperatorRoutes.accountRevoke,
      { accountRef: ref },
      credential,
    );
    expect(revoked.status).toBe(200);

    // The credential stops working everywhere it used to work.
    expect(opened.store.register({
      accountId: issued,
      mailbox: '2'.repeat(32),
      capacity: 4,
      registeredAt: '2026-08-16T12:00:00.000Z',
    })).toEqual({ ok: false, refusal: 'unknown_account' });
    expect(opened.store.collect({
      accountId: issued,
      mailbox: '1'.repeat(32),
      nowMs: Date.parse('2026-08-16T12:00:00.000Z'),
    })).toEqual({ ok: false, refusal: 'mailbox_not_yours' });

    // And the row stays, because "never existed" and "ended" are different
    // facts and only one of them survives a delete.
    const listed = await opened.call(picoRelayOperatorRoutes.accountList, {}, credential);
    const accounts = listed.body.accounts as Array<Record<string, unknown>>;
    expect(accounts[0]?.status).toBe('revoked');
    expect(accounts[0]?.revokedAt).toBeTypeOf('string');
  });

  it('refuses a second revocation and an unknown handle by name', async () => {
    const { relay: opened, credential } = await claimed();
    const created = await opened.call(
      picoRelayOperatorRoutes.accountCreate,
      { mailboxQuota: 1, maxCapacity: 4 },
      credential,
    );
    const ref = (created.body.account as { accountRef: string }).accountRef;
    await opened.call(picoRelayOperatorRoutes.accountRevoke, { accountRef: ref }, credential);

    expect((await opened.call(
      picoRelayOperatorRoutes.accountRevoke,
      { accountRef: ref },
      credential,
    )).body.refusal).toBe('account_already_revoked');
    expect((await opened.call(
      picoRelayOperatorRoutes.accountRevoke,
      { accountRef: 'a'.repeat(picoRelayAccountRefLength) },
      credential,
    )).body.refusal).toBe('unknown_account');
  });
});

describe('ADR 0154 RO6 - the quota bounds both axes', () => {
  it('refuses a mailbox bigger than the account may hold', async () => {
    const { relay: opened, credential } = await claimed();
    const created = await opened.call(
      picoRelayOperatorRoutes.accountCreate,
      { mailboxQuota: 1, maxCapacity: 8 },
      credential,
    );
    const issued = created.body.credential as string;

    // Without this an account with a quota of one could ask for a mailbox
    // holding a million packets, and the quota would be half a bound.
    expect(opened.store.register({
      accountId: issued,
      mailbox: '3'.repeat(32),
      capacity: 9,
      registeredAt: '2026-08-16T12:00:00.000Z',
    })).toEqual({ ok: false, refusal: 'capacity_above_account_ceiling' });

    expect(opened.store.register({
      accountId: issued,
      mailbox: '3'.repeat(32),
      capacity: 8,
      registeredAt: '2026-08-16T12:00:00.000Z',
    }).ok).toBe(true);
  });
});

describe('ADR 0154 RO1/RO7 - the administration surface is not the mailbox surface', () => {
  it('refuses every route without the operator credential', async () => {
    const { relay: opened } = await claimed();
    for (const route of [
      picoRelayOperatorRoutes.describe,
      picoRelayOperatorRoutes.accountList,
      picoRelayOperatorRoutes.accountCreate,
      picoRelayOperatorRoutes.accountRevoke,
    ]) {
      expect((await opened.call(route, {})).status).toBe(401);
      expect((await opened.call(route, {}, '0'.repeat(32))).status).toBe(401);
    }
  });

  it('answers an unknown route exactly as a wrong method', async () => {
    const { relay: opened, credential } = await claimed();
    const unknown = await fetch(`${opened.url}/nothing-here`, { method: 'POST' });
    const wrongMethod = await fetch(`${opened.url}${picoRelayOperatorRoutes.accountList}`, {
      method: 'GET',
      headers: { [picoRelayOperatorHeader]: credential },
    });
    expect(wrongMethod.status).toBe(unknown.status);
    expect(await wrongMethod.text()).toBe(await unknown.text());
  });

  it('keeps every operator route off the mailbox port', async () => {
    // The reason this listener exists at all. ADR 0153 PK3, checked against
    // the operator route table rather than against one remembered path.
    const dir = mkdtempSync(join(tmpdir(), 'pico-relay-operator-public-'));
    dirs.push(dir);
    const store = new PicoRelayStore(join(dir, 'relay.sqlite'), 'relay.example');
    closers.push(() => store.close());
    const server = await startPicoRelayServer({ store, host: '127.0.0.1', port: 0 });
    closers.push(() => server.close());

    const unknown = await fetch(`http://127.0.0.1:${server.port}/nothing-here`);
    const unknownBody = await unknown.text();
    for (const route of Object.values(picoRelayOperatorRoutes)) {
      const answer = await fetch(`http://127.0.0.1:${server.port}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      expect(answer.status).toBe(unknown.status);
      expect(await answer.text()).toBe(unknownBody);
    }
  });
});

describe('ADR 0154 RO8 - a lost credential is recoverable', () => {
  it('forgets the operator and keeps the accounts', async () => {
    const { relay: opened, credential } = await claimed();
    await opened.call(
      picoRelayOperatorRoutes.accountCreate,
      { mailboxQuota: 1, maxCapacity: 4 },
      credential,
    );

    opened.store.forgetOperator();

    // Losing the administration credential is not a reason to cut off every
    // customer, so the reset is narrower than the loss it recovers from.
    expect(opened.store.isClaimed()).toBe(false);
    expect(opened.store.isOperator(credential)).toBe(false);
    expect(opened.store.accountSummaries()).toHaveLength(1);
    expect(opened.store.hasAccounts()).toBe(true);
  });
});

describe('ADR 0154 RO9 - a bound on the door, and what it is for', () => {
  it('refuses an unauthenticated caller past its budget, and says when to come back', async () => {
    const opened = await relay();
    opened.claimCode.mint();

    // Ten a minute. A person typing a claim code off a screen needs two or
    // three; anybody at this budget is not typing.
    for (let attempt = 0; attempt < picoRelayUnauthenticatedRequestsPerMinute; attempt += 1) {
      expect((await opened.call(picoRelayOperatorRoutes.claim, { claimCode: 'x'.repeat(43) })).status)
        .toBe(409);
    }
    const refused = await fetch(`${opened.url}${picoRelayOperatorRoutes.claim}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ claimCode: 'x'.repeat(43) }),
    });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ refusal: 'too_many_requests' });
    // Never zero: a `Retry-After: 0` invites the retry this exists to stop.
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);

    // And it refills rather than latching.
    opened.advance(60_000);
    expect((await opened.call(picoRelayOperatorRoutes.claim, { claimCode: 'x'.repeat(43) })).status)
      .toBe(409);
  });

  it('leaves the operator\'s own budget untouched while a stranger hammers', async () => {
    // The whole reason there are two buckets. One would let anybody who can
    // reach the port lock the operator out of their own relay - trading a
    // resource bound for a denial of service against the person who needs the
    // door.
    const { relay: opened, credential } = await claimed();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await opened.call(picoRelayOperatorRoutes.accountList, {}, '0'.repeat(32));
    }
    expect((await opened.call(picoRelayOperatorRoutes.accountList, {}, credential)).status)
      .toBe(200);
  });

  it('bounds the operator too, so a stolen credential is not a load generator', async () => {
    const { relay: opened, credential } = await claimed();
    let refusedAt = -1;
    for (let attempt = 0; attempt <= picoRelayOperatorRequestsPerMinute; attempt += 1) {
      const answer = await opened.call(picoRelayOperatorRoutes.accountList, {}, credential);
      if (answer.status === 429) {
        refusedAt = attempt;
        break;
      }
    }
    expect(refusedAt).toBeGreaterThan(0);
    expect(refusedAt).toBeLessThanOrEqual(picoRelayOperatorRequestsPerMinute);
  });

  it('charges the bound before the route, so a refused probe learns nothing', async () => {
    // The 404 on this port answers an unknown route exactly like a wrong
    // method. A bound applied after route matching would answer 429 for one
    // and 404 for the other, and the difference is a map.
    const opened = await relay();
    for (let attempt = 0; attempt < picoRelayUnauthenticatedRequestsPerMinute; attempt += 1) {
      await opened.call(picoRelayOperatorRoutes.claim, { claimCode: 'x'.repeat(43) });
    }
    const unknown = await fetch(`${opened.url}/nothing-here`, { method: 'POST' });
    const known = await fetch(`${opened.url}${picoRelayOperatorRoutes.accountList}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(known.status).toBe(unknown.status);
    expect(await known.text()).toBe(await unknown.text());
  });

  it('does not refill on a clock that went backwards', () => {
    // ADR 0120's posture: a bad clock costs a wait, never an open door.
    let clockMs = 1_000_000;
    const limit = new PicoRelayRateLimit({
      capacity: 2,
      perMinute: 60,
      now: () => clockMs,
    });
    expect(limit.take().allowed).toBe(true);
    expect(limit.take().allowed).toBe(true);
    clockMs -= 60_000;
    expect(limit.take().allowed).toBe(false);
  });
});
