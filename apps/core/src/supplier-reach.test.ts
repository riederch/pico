import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0138 CO3/CO4, reachable at last.
 *
 * The columns, the CHECK and the event existed since 2026-08-11 and
 * `setPicoSupplierReach` had no caller outside its own tests, so both defaults
 * were the only state a Home could be in. An ADR titled *off until someone
 * says so* had nowhere for anybody to say so.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface AppUnderTest {
  inject(request: { method: string; url: string }): Promise<{ json(): unknown }>;
  close(): Promise<void>;
}

async function claimedHome() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-reach-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString('utf8'));
        callback();
      },
    }),
  } as never) as unknown as AppUnderTest;
  apps.push(app);

  const moveInCode = logLines
    .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
    .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
  const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
    host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
  };
  const { device, sealedClaim } = await openPicoHomeWithDevice(app as never, {
    moveInCode,
    idSuffix: 'supplier_reach',
  });
  const send = async (operation: string, args: Record<string, unknown>) =>
    await sendPicoLinkDirectRequest(app as never, {
      operation: operation as never,
      args,
      sender: device,
      identityKeyRecord: sealedClaim.claimantIdentityKeyRecord,
      hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
      hostKeyAgreementPublicKeyHex: setup.host.keyAgreementPublicKeyHex,
    });
  return { app, databasePath, send };
}

describe('ADR 0138 CO3/CO4 - the two decisions, made where the person is', () => {
  it('lists what is attached, off by default, and turns reaching on', async () => {
    const { databasePath, send } = await claimedHome();

    const writing = await EventStore.open(databasePath, {});
    writing.attachPicoSupplier({
      manifest: {
        identifier: 'a-library',
        kind: 'library',
        slots: ['memory_item'],
        coverage: ['privat'],
        privacyDomain: 'privat',
      } as never,
      attachedAt: '2026-08-17T10:00:00.000Z',
    } as never);
    writing.close();

    const listed = (await send('home.suppliers.read', {})).result as {
      suppliers: Array<Record<string, unknown>>;
    };
    // Attaching says a supplier exists. It does not say Pico may spend a
    // person's money or tell anyone they asked.
    expect(listed.suppliers).toHaveLength(1);
    expect(listed.suppliers[0]).toMatchObject({
      identifier: 'a-library',
      mayReachOutside: false,
      mayReachUnasked: false,
    });
    // What it is wired to is not what a person deciding about money needs.
    expect(listed.suppliers[0]).not.toHaveProperty('slots');
    expect(listed.suppliers[0]).not.toHaveProperty('coverage');

    const decided = await send('home.supplier.reach.decide', {
      identifier: 'a-library',
      mayReachOutside: true,
      mayReachUnasked: false,
    });
    expect(decided.response.outcome).toBe('ok');

    const after = (await send('home.suppliers.read', {})).result as {
      suppliers: Array<Record<string, unknown>>;
    };
    expect(after.suppliers[0]).toMatchObject({
      mayReachOutside: true,
      mayReachUnasked: false,
    });
  });

  it('refuses unasked traffic without reaching, by name', async () => {
    // CO4 cannot be granted without CO3, and the person is owed the reason:
    // unasked traffic is visible to nobody, so it cannot be the only thing
    // they allowed. Named rather than left to the database CHECK.
    const { databasePath, send } = await claimedHome();
    const writing = await EventStore.open(databasePath, {});
    writing.attachPicoSupplier({
      manifest: {
        identifier: 'a-library',
        kind: 'library',
        slots: ['memory_item'],
        coverage: ['privat'],
        privacyDomain: 'privat',
      } as never,
      attachedAt: '2026-08-17T10:00:00.000Z',
    } as never);
    writing.close();

    const refused = await send('home.supplier.reach.decide', {
      identifier: 'a-library',
      mayReachOutside: false,
      mayReachUnasked: true,
    });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('unasked_needs_reaching');
  });

  it('refuses a supplier that is not attached', async () => {
    const { send } = await claimedHome();
    const refused = await send('home.supplier.reach.decide', {
      identifier: 'never-attached',
      mayReachOutside: true,
      mayReachUnasked: false,
    });
    expect(refused.result.refusal).toBe('not_attached');
  });

  it('records the decision content-free, and records it at all', async () => {
    /**
     * `home.supplier_attachment_changed` was a declared event type nothing
     * ever appended, because nothing ever made the decision it records.
     */
    const { app, databasePath, send } = await claimedHome();
    const writing = await EventStore.open(databasePath, {});
    writing.attachPicoSupplier({
      manifest: {
        identifier: 'a-library',
        kind: 'library',
        slots: ['memory_item'],
        coverage: ['privat'],
        privacyDomain: 'privat',
      } as never,
      attachedAt: '2026-08-17T10:00:00.000Z',
    } as never);
    writing.close();

    await send('home.supplier.reach.decide', {
      identifier: 'a-library',
      mayReachOutside: true,
      mayReachUnasked: true,
    });

    const events = (await app.inject({
      method: 'GET',
      url: '/api/events/tail?limit=40',
    })).json() as { events: Array<{ type: string; payload: Record<string, unknown> }> };
    const changed = events.events.filter(
      (event) => event.type === 'home.supplier_attachment_changed',
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]?.payload).toEqual({
      identifier: 'a-library',
      mayReachOutside: true,
      mayReachUnasked: true,
    });
  });
});
