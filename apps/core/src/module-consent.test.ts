import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0139 AC4, reachable at last.
 *
 * **The consent row had exactly one author: the tests.** Effect consent was
 * written only as a module was switched *on*, and ADR 0127 M3 ships modules on
 * - so a module that was never off never made the transition, and every Home's
 * steady state was "active, and agreed to nothing". `depot` declares
 * `depot.fetch`, the one effect in the tree that installs code, so no depot
 * could ever be fetched by anybody.
 *
 * Reading it never showed this, because every test of a depot fetch called
 * `setPicoModuleActivation` in its own fixture, with a comment saying the
 * effects were "what a person would have read". No person could read them. A
 * live walk - attach, permit, press *fetch now* - returned `requested: 0` with
 * no reason given, and that is what found it.
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
  const dir = mkdtempSync(join(tmpdir(), 'pico-module-consent-'));
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
    idSuffix: 'module_consent',
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

interface AwaitingEntry {
  identifier: string;
  drift: { added: string[]; removed: string[]; changed: string[] };
  declares: Array<{ name: string; description: string; risk: string }>;
}

const awaitingOf = async (
  send: (
    operation: string,
    args: Record<string, unknown>,
  ) => Promise<{ result: Record<string, unknown> }>,
): Promise<AwaitingEntry[]> =>
  ((await send('home.modules.consent.read', {})).result as unknown as {
    awaiting: AwaitingEntry[];
  }).awaiting;

describe('ADR 0139 AC4 - the question, where a person can answer it', () => {
  it('says a shipped module declares something nobody has agreed to', async () => {
    const { send } = await claimedHome();
    const awaiting = await awaitingOf(send);

    const depot = awaiting.find((entry) => entry.identifier === 'depot');
    expect(depot).toBeDefined();
    // The drift, not a boolean: ADR 0127 M4's posture is that somebody being
    // asked is told what moved.
    expect(depot?.drift).toEqual({ added: ['depot.fetch'], removed: [], changed: [] });
    // And the sentences themselves, because a list of effect names is not a
    // thing a person can agree to.
    expect(depot?.declares).toEqual([
      expect.objectContaining({ name: 'depot.fetch', risk: 'external_write' }),
    ]);
    expect(depot?.declares[0]?.description.length).toBeGreaterThan(20);
  });

  it('leaves the question standing when it is only read', async () => {
    // Looking at a question must not be the same act as answering it, which
    // is why read and record are two operations rather than one.
    const { send } = await claimedHome();
    await awaitingOf(send);
    await awaitingOf(send);
    expect((await awaitingOf(send)).map((entry) => entry.identifier)).toContain('depot');
  });

  it('records the agreement and takes the module off the list', async () => {
    const { send } = await claimedHome();
    const recorded = await send('home.modules.consent.record', { identifier: 'depot' });
    expect(recorded.response.outcome).toBe('ok');
    expect(recorded.result).toEqual({ recorded: 1 });
    expect((await awaitingOf(send)).map((entry) => entry.identifier)).not.toContain('depot');
  });

  it('records the manifest rather than what the caller sent', async () => {
    /**
     * The record of what was agreed must not be writable from the side that
     * benefits from it. A device sending its own sentence - or a gentler risk
     * class - would be forging the thing a person is later shown.
     */
    const { databasePath, send } = await claimedHome();
    await send('home.modules.consent.record', {
      identifier: 'depot',
      effects: [{
        name: 'depot.fetch',
        description: 'Does something harmless.',
        risk: 'local_read',
      }],
    });

    const store = await EventStore.open(databasePath, {});
    const consented = store.picoModuleEffectConsent('depot');
    store.close();
    expect(consented).toHaveLength(1);
    expect(consented[0]?.risk).toBe('external_write');
    expect(consented[0]?.description).not.toContain('harmless');
  });

  it('refuses a module nobody ships, by name', async () => {
    const { send } = await claimedHome();
    const refused = await send('home.modules.consent.record', { identifier: 'not-a-module' });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('unknown_module');
  });

  it('refuses to record consent for a module that is switched off', async () => {
    // An agreement about behaviour that is switched off is an answer to a
    // question nobody is being asked.
    // Switched off directly rather than through `/api/home/modules`, which
    // wants a Foundation operator session (ADR 0087). The deactivation is this
    // test's precondition, not its subject.
    const { databasePath, send } = await claimedHome();
    const writing = await EventStore.open(databasePath, {});
    writing.setPicoModuleActivation({
      changes: [{ identifier: 'depot', active: false, effects: [] }],
      decidedAt: '2026-08-17T10:00:00.000Z',
    });
    writing.close();

    const refused = await send('home.modules.consent.record', { identifier: 'depot' });
    expect(refused.result.refusal).toBe('module_not_active');
  });

  it('records that it happened, content-free', async () => {
    const { app, send } = await claimedHome();
    await send('home.modules.consent.record', { identifier: 'depot' });

    const events = (await app.inject({
      method: 'GET',
      url: '/api/events/tail?limit=40',
    })).json() as { events: Array<{ type: string; payload: Record<string, unknown> }> };
    const changed = events.events.filter(
      (event) => event.type === 'home.module_activation_changed'
        && 'consented' in event.payload,
    );
    expect(changed).toHaveLength(1);
    expect(changed[0]?.payload).toEqual({ consented: ['depot'] });
  });
});

describe('ADR 0139 AC4 - what the missing agreement was actually blocking', () => {
  it('names the precondition when a person asks for a fetch, and stops naming it', async () => {
    /**
     * The defect end to end, in the order a person meets it: press *fetch
     * now*, be told which agreement is missing rather than shown a silent
     * zero, agree, and have the same press get somewhere.
     */
    const { send } = await claimedHome();

    const blocked = (await send('home.depot.fetch.ask', {
      presenceSessionId: 'presence-consent-1',
    })).result as unknown as { requested: number; blocked?: string };
    expect(blocked).toMatchObject({ requested: 0, blocked: 'effects_not_consented' });

    await send('home.modules.consent.record', { identifier: 'depot' });

    const after = (await send('home.depot.fetch.ask', {
      presenceSessionId: 'presence-consent-1',
    })).result as unknown as { requested: number; blocked?: string };
    // No depot is attached, so nothing was requested - but the standing
    // precondition is gone, and that is a different answer from the same
    // number with a reason attached.
    expect(after.requested).toBe(0);
    expect(after.blocked).toBeUndefined();
  });
});
