import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { formatPicoLinkPacketAddress } from '@pico/protocol/link-packet';
import { picoLinkMailboxExchangeRequestSchema } from '@pico/protocol/link-mailbox-exchange';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0104 S5 with ADR 0031 and ADR 0148 - the relay entries, split.
 *
 * S5 recorded these three as unclassifiable, and that was right: they are not
 * one thing. **The account is an identity and the URL is a reachability**, and
 * the tests below are about that line holding in both directions - a decided
 * identity that the environment cannot take back, and a change that says what
 * it costs before it happens rather than after.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];
const stores: EventStore[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface AppWithInject {
  inject(request: {
    method: string;
    url: string;
    payload?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ statusCode: number; json(): unknown }>;
  close(): Promise<void>;
}

function databasePath(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return join(dir, 'pico.sqlite');
}

async function openStore(path: string): Promise<EventStore> {
  const store = await EventStore.open(path, {});
  stores.push(store);
  return store;
}

async function boot(input: {
  databasePath: string;
  linkRelayOperator?: string;
  linkRelayAccountId?: string;
}): Promise<{
  app: AppWithInject;
  operator: string;
  logged: (key: string) => string;
}> {
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: input.databasePath,
    deviceId: 'pico-core',
    ...(input.linkRelayOperator === undefined
      ? {} : { linkRelayOperator: input.linkRelayOperator }),
    ...(input.linkRelayAccountId === undefined
      ? {} : { linkRelayAccountId: input.linkRelayAccountId }),
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  }) as unknown as AppWithInject;
  apps.push(app);

  const logged = (key: string): string => {
    for (const line of logLines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (typeof parsed[key] === 'string') {
        return parsed[key];
      }
    }
    throw new Error(`pico_host_log_missing:${key}`);
  };

  await app.inject({
    method: 'POST',
    url: '/api/auth/bootstrap',
    payload: { bootstrapCode: logged('operatorBootstrapCode'), passphrase: 'relay identity pass' },
  });
  const session = (await app.inject({
    method: 'POST',
    url: '/api/auth/session',
    payload: { passphrase: 'relay identity pass' },
  })).json() as { session: string };

  return { app, operator: `Bearer ${session.session}`, logged };
}

const mailbox = (hex: string, operator: string): string =>
  formatPicoLinkPacketAddress({ mailbox: hex.repeat(32), operator });

async function seedMailbox(store: EventStore, at: string): Promise<void> {
  store.exchangePicoLinkMailbox({
    principal: {
      picoIdentityFingerprintHex: 'a'.repeat(64),
      deviceSigningKeyFingerprintHex: 'b'.repeat(64),
      deviceKeyAgreementKeyFingerprintHex: 'c'.repeat(64),
      delegationId: 'deleg_relay_identity',
    },
    homeInbound: mailbox('1', 'relay.example.invalid'),
    deviceInbound: mailbox('2', 'relay.example.invalid'),
    exchangedAt: at,
  });
}

describe('ADR 0104 S5 - an inherited relay identity never overwrites a decided one', () => {
  it('records that it inherited, so the two facts stay apart', async () => {
    const store = await openStore(databasePath('pico-relay-inherit-'));
    expect(store.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_from_the_host',
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: true,
    })).toEqual({ ok: true });
    expect(store.picoLinkRelayIdentity()).toEqual({
      operator: 'relay.example.invalid',
      accountId: 'acct_from_the_host',
      decidedAt: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: true,
    });
  });

  it('leaves a decided identity alone when the environment says otherwise', async () => {
    // The door this table exists to close: an add-on option that could still
    // change the answer would be the environment deciding through the back.
    const store = await openStore(databasePath('pico-relay-decided-'));
    store.decidePicoLinkRelayIdentity({
      operator: 'chosen.example.invalid',
      accountId: 'acct_chosen',
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: false,
    });
    store.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_from_the_host',
      at: '2026-08-14T11:00:00.000Z',
      inheritedFromHost: true,
    });
    expect(store.picoLinkRelayIdentity()).toEqual({
      operator: 'chosen.example.invalid',
      accountId: 'acct_chosen',
      decidedAt: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: false,
    });
  });
});

describe('ADR 0148 - changing the account is a move, not an edit', () => {
  it('refuses while mailboxes exist and says how many', async () => {
    const store = await openStore(databasePath('pico-relay-move-'));
    store.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_first',
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: true,
    });
    await seedMailbox(store, '2026-08-14T10:30:00.000Z');

    expect(store.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_second',
      at: '2026-08-14T11:00:00.000Z',
      inheritedFromHost: false,
    })).toEqual({ ok: false, reason: 'mailboxes_exist', mailboxes: 1 });
    // Refused rather than half-applied: a stored account nobody answers at
    // would be worse than the one that is there.
    expect(store.picoLinkRelayIdentity()?.accountId).toBe('acct_first');
  });

  it('lets the same answer through, because saying it again is not a move', async () => {
    // Re-deciding the identity it already holds costs nobody an exchange, and
    // a refusal there would make confirming a value impossible.
    const store = await openStore(databasePath('pico-relay-same-'));
    store.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_first',
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: true,
    });
    await seedMailbox(store, '2026-08-14T10:30:00.000Z');

    expect(store.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_first',
      at: '2026-08-14T11:00:00.000Z',
      inheritedFromHost: false,
    })).toEqual({ ok: true });
    expect(store.picoLinkRelayIdentity()?.inheritedFromHost).toBe(false);
  });

  it('changes freely when no relationship would be stranded', async () => {
    const store = await openStore(databasePath('pico-relay-free-'));
    store.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_first',
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: true,
    });
    expect(store.decidePicoLinkRelayIdentity({
      operator: 'other.example.invalid',
      accountId: 'acct_second',
      at: '2026-08-14T11:00:00.000Z',
      inheritedFromHost: false,
    })).toEqual({ ok: true });
    expect(store.picoLinkRelayIdentity()).toEqual({
      operator: 'other.example.invalid',
      accountId: 'acct_second',
      decidedAt: '2026-08-14T11:00:00.000Z',
      inheritedFromHost: false,
    });
  });
});

describe('ADR 0104 S5 at the surface', () => {
  it('inherits the host entries on first boot and says nobody decided', async () => {
    const { app, operator } = await boot({
      databasePath: databasePath('pico-relay-boot-'),
      linkRelayOperator: 'relay.example.invalid',
      linkRelayAccountId: 'acct_from_the_host',
    });
    expect((await app.inject({
      method: 'GET',
      url: '/api/link/relay-identity',
      headers: { authorization: operator },
    })).json()).toEqual({
      operator: 'relay.example.invalid',
      accountId: 'acct_from_the_host',
      decided: false,
      decidedAt: expect.any(String),
      // Said before anybody asks for a change, because it is what one costs.
      mailboxes: 0,
    });
  });

  it('records an answer and says it applies at the next start', async () => {
    // The transport and the addresses this Home hands out are resolved at
    // start and have to agree. Implying otherwise would have somebody
    // believing their Picos moved operator while the process ran on the old
    // one.
    const { app, operator } = await boot({
      databasePath: databasePath('pico-relay-decide-'),
      linkRelayOperator: 'relay.example.invalid',
      linkRelayAccountId: 'acct_from_the_host',
    });
    const set = await app.inject({
      method: 'POST',
      url: '/api/link/relay-identity',
      headers: { authorization: operator },
      payload: { operator: 'chosen.example.invalid', accountId: 'acct_chosen' },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({
      operator: 'chosen.example.invalid',
      accountId: 'acct_chosen',
      decided: true,
      appliesAtNextStart: true,
    });

    const read = (await app.inject({
      method: 'GET',
      url: '/api/link/relay-identity',
      headers: { authorization: operator },
    })).json() as { decided: boolean; operator: string };
    expect(read).toMatchObject({ decided: true, operator: 'chosen.example.invalid' });
  });

  it('refuses a change at the route with the count, rather than as a validation error', async () => {
    const path = databasePath('pico-relay-route-move-');
    const seeded = await openStore(path);
    seeded.decidePicoLinkRelayIdentity({
      operator: 'relay.example.invalid',
      accountId: 'acct_first',
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: true,
    });
    await seedMailbox(seeded, '2026-08-14T10:30:00.000Z');
    seeded.close();
    stores.splice(stores.indexOf(seeded), 1);

    const { app, operator } = await boot({ databasePath: path });
    const refused = await app.inject({
      method: 'POST',
      url: '/api/link/relay-identity',
      headers: { authorization: operator },
      payload: { operator: 'other.example.invalid', accountId: 'acct_second' },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: 'mailboxes_exist', mailboxes: 1 });
  });

  it('is administration rather than a person\'s setting', async () => {
    // ADR 0087. One account per Home, so the route is `host-admin` like a
    // retention policy - and the class is a gate rather than a label.
    const { app } = await boot({ databasePath: databasePath('pico-relay-class-') });
    expect((await app.inject({
      method: 'POST',
      url: '/api/link/relay-identity',
      payload: { operator: 'other.example.invalid', accountId: 'acct_second' },
    })).statusCode).toBe(401);
  });

  it('refuses an answer that is not one', async () => {
    const { app, operator } = await boot({ databasePath: databasePath('pico-relay-bad-') });
    expect((await app.inject({
      method: 'POST',
      url: '/api/link/relay-identity',
      headers: { authorization: operator },
      payload: { operator: 'relay.example.invalid', accountId: '' },
    })).statusCode).toBe(400);
  });
});

describe('ADR 0031 - the identity reaches the addresses this Home hands out', () => {
  it('issues addresses at the decided operator rather than the configured one', async () => {
    // The point of the split. An instance whose person answered hands out
    // their operator's addresses, and the environment it was started with no
    // longer names where its Picos are reached.
    const path = databasePath('pico-relay-address-');
    const seeded = await openStore(path);
    seeded.decidePicoLinkRelayIdentity({
      operator: 'chosen.example.invalid',
      accountId: 'acct_chosen',
      at: '2026-08-14T10:00:00.000Z',
      inheritedFromHost: false,
    });
    seeded.close();
    stores.splice(stores.indexOf(seeded), 1);

    const { app, logged } = await boot({
      databasePath: path,
      // The host says one operator. The person said another.
      linkRelayOperator: 'relay.example.invalid',
      linkRelayAccountId: 'acct_from_the_host',
    });
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
      host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
    };
    const { device, sealedClaim } = await openPicoHomeWithDevice(
      app as unknown as Parameters<typeof openPicoHomeWithDevice>[0],
      { moveInCode: logged('picoHomeMoveInCode'), idSuffix: 'relay_identity_20260814' },
    );

    const exchanged = await sendPicoLinkDirectRequest(
      app as unknown as Parameters<typeof sendPicoLinkDirectRequest>[0],
      {
        operation: 'home.link.mailbox.exchange',
        args: {
          schema: picoLinkMailboxExchangeRequestSchema,
          deviceInbound: mailbox('3', 'chosen.example.invalid'),
        },
        sender: device,
        identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
        hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
        hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
      },
    );
    expect(exchanged.response.outcome).toBe('ok');
    expect(String(exchanged.result.homeInbound).split('@')[1]).toBe('chosen.example.invalid');
  });
});
