import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { startPicoFakeModelHost, type PicoFakeModelHost } from './test-model-provider-host.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0142 PE1/PE2 with ADR 0152 - a provider entry a person can actually get.
 *
 * **`PicoModelProviderRegistry.put()` had no caller outside its own tests.**
 * Every model-provider route operates on an entry that already exists, so the
 * registry was empty on every real Home: the companion's provider list hid
 * itself permanently, `pickPicoDepotIntakeEntry` refused every library read with
 * `no_decided_entry`, and ADR 0116 W1's questions had nothing to run against.
 * The only way to produce an entry was `scripts/measure-model-provider.ts`,
 * which says of itself that it is "a development tool rather than a product
 * surface" and that "it writes nothing" - and a script path stands against the
 * decision that every configuration goes through the Pico Client.
 *
 * Measured against a real HTTP server rather than a stubbed `fetch`, because the
 * measurement is a sequence whose order carries meaning and a function that
 * answers by URL cannot get the order wrong.
 */
const dirs: string[] = [];
const apps: Array<{ close(): Promise<void> }> = [];
const hosts: PicoFakeModelHost[] = [];

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.close();
  }
  for (const host of hosts.splice(0)) {
    await host.close();
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
  const dir = mkdtempSync(join(tmpdir(), 'pico-measure-ask-'));
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
    idSuffix: 'measure_ask',
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

type Send = (operation: string, args: Record<string, unknown>) => Promise<{
  response: { outcome: string };
  result: Record<string, unknown>;
}>;

interface MeasurementView {
  entryId: string;
  state: string;
  refusal?: string;
  notes?: string[];
}

/** Waits for the measurement to leave `running`, or gives up loudly. */
async function settled(send: Send, entryId: string): Promise<MeasurementView> {
  /**
   * Asked once a second, not as fast as possible, and the first version of
   * this asked every 50 ms and got `quota_exceeded` on the fourth test.
   *
   * That is ADR 0119 Q4 working: the stranger bucket is sixty requests a
   * minute *shared*, charged before the seal is opened, so a surface that
   * polls hard is indistinguishable from a flood. It is also why the
   * measurement list rides along with `home.model.providers.read` instead of
   * having its own route - the same budget would be spent by the real window.
   */
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const read = (await send('home.model.providers.read', {}))
      .result as unknown as { measurements: MeasurementView[] };
    const found = read.measurements.find((entry) => entry.entryId === entryId);
    if (found !== undefined && found.state !== 'running') {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('measurement_never_settled');
}

describe('ADR 0142 PE2 - the Home measures a host a person named', () => {
  it('returns while the work runs, then writes an undecided entry', async () => {
    const host = await startPicoFakeModelHost();
    hosts.push(host);
    const { databasePath, send } = await claimedHome();

    const asked = await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      // ADR 0048: a person's judgement, never a measurement. Pico cannot tell
      // from an address whether a machine stands in somebody's home.
      providerClass: 'declared_own_host',
    });
    expect(asked.response.outcome).toBe('ok');
    // The work is minutes on a real host, so the answer is that it began.
    expect(asked.result).toEqual({ entryId: 'a-model:measured', state: 'running' });

    const finished = await settled(send as Send, 'a-model:measured');
    expect(finished.state).toBe('settled');

    const store = await EventStore.open(databasePath, {});
    const entries = store.picoModelProviderRegistry().list();
    store.close();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.entry.entryId).toBe('a-model:measured');
    /**
     * ADR 0151 PV1. **A measurement grants nothing.** No credential was sent,
     * so the entry carries the narrow allowance and the wider one stays
     * something a credential buys through ADR 0152's decision surface.
     */
    expect(entries[0]?.entry.carries).toBe('live_turn');
  }, 60_000);

  it('leaves the entry for the person to decide about', async () => {
    // The measurement is a finding. Deciding is separate, and the surface that
    // asks already existed - this only had nothing to ask about.
    const host = await startPicoFakeModelHost();
    hosts.push(host);
    const { send } = await claimedHome();
    await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    });
    await settled(send as Send, 'a-model:measured');

    const providers = (await send('home.model.providers.read', {}))
      .result as unknown as { providers: Array<Record<string, unknown>> };
    expect(providers.providers).toHaveLength(1);
    expect(providers.providers[0]).toMatchObject({
      entryId: 'a-model:measured',
      decided: false,
    });
  }, 60_000);

  it('carries what the measurement wanted said, in its own words', async () => {
    /**
     * ADR 0151 PV5's hole, which only a measurement can see: this host answers
     * a credential that cannot be right, so a `credentialRef` on its entry
     * would claim a provider proved who it is when nothing was proved. The note
     * reaches the person rather than staying in a log.
     */
    const host = await startPicoFakeModelHost();
    hosts.push(host);
    const { send } = await claimedHome();
    await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    });

    const finished = await settled(send as Send, 'a-model:measured');
    expect(finished.notes?.join(' ')).toContain('credential that cannot be right');
  }, 60_000);

  it('says a host does not serve the model, rather than failing blankly', async () => {
    // ADR 0118 O4. The refusal the measurement produced, not a flattened one.
    const host = await startPicoFakeModelHost({ model: 'something-else:latest' });
    hosts.push(host);
    const { databasePath, send } = await claimedHome();
    await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    });

    const finished = await settled(send as Send, 'a-model:measured');
    expect(finished.state).toBe('failed');
    expect(finished.refusal).toContain('pico_model_provider_model_not_served');

    // And nothing was written. A failed measurement is not a quiet entry.
    const store = await EventStore.open(databasePath, {});
    const entries = store.picoModelProviderRegistry().list();
    store.close();
    expect(entries).toEqual([]);
  }, 60_000);

  it('refuses a host that is not there, and says so as a state', async () => {
    const { send } = await claimedHome();
    const asked = await send('home.model.provider.measure.ask', {
      // Nothing is listening. ADR 0118 O2's absence, arriving as a measurement
      // outcome rather than as a thrown request.
      reach: 'http://127.0.0.1:1',
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    });
    expect(asked.response.outcome).toBe('ok');
    const finished = await settled(send as Send, 'a-model:measured');
    expect(finished.state).toBe('failed');
    expect(finished.refusal).not.toBe(undefined);
  }, 60_000);

  it('refuses a second measurement of the same host while one runs', async () => {
    /**
     * Not bookkeeping: the measurement deliberately unloads the model to time a
     * load, so two at once would each be measuring the other's interference and
     * both numbers would be wrong. ADR 0142's entries are observations.
     */
    const host = await startPicoFakeModelHost();
    hosts.push(host);
    const { send } = await claimedHome();
    const ask = {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    };
    await send('home.model.provider.measure.ask', ask);
    const second = await send('home.model.provider.measure.ask', ask);
    expect(second.response.outcome).toBe('invalid_arguments');
    expect(second.result.refusal).toBe('already_measuring');

    // And it may be asked again once the first one is done.
    await settled(send as Send, 'a-model:measured');
    expect((await send('home.model.provider.measure.ask', ask)).response.outcome).toBe('ok');
    await settled(send as Send, 'a-model:measured');
  }, 60_000);

  it('refuses a class no one declared', async () => {
    const { send } = await claimedHome();
    for (const providerClass of ['not_a_class', '', undefined]) {
      const refused = await send('home.model.provider.measure.ask', {
        reach: 'http://127.0.0.1:1',
        model: 'a-model:measured',
        ...(providerClass === undefined ? {} : { providerClass }),
      });
      expect(refused.response.outcome, String(providerClass)).toBe('invalid_arguments');
    }
  });

  it('records that it began and how it ended, without the numbers', async () => {
    /**
     * A pair rather than one record at the end: a Home that restarts
     * mid-measurement leaves a start with no finish, which says the work
     * stopped rather than that it quietly completed. No measured number is in
     * the payload - those are the entry's, and a second copy here would drift
     * from the one a caller reads.
     */
    const host = await startPicoFakeModelHost();
    hosts.push(host);
    const { app, send } = await claimedHome();
    await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    });
    await settled(send as Send, 'a-model:measured');

    const events = (await app.inject({
      method: 'GET',
      url: '/api/events/tail?limit=40',
    })).json() as { events: Array<{ type: string; payload: Record<string, unknown> }> };
    const changed = events.events.filter(
      (event) => event.type === 'home.model_provider_measurement_changed',
    );
    expect(changed.map((event) => event.payload.state)).toEqual(['running', 'settled']);
    expect(changed[0]?.payload).toEqual({
      entryId: 'a-model:measured',
      model: 'a-model:measured',
      reach: host.reach,
      providerClass: 'declared_own_host',
      state: 'running',
    });
    expect(JSON.stringify(changed)).not.toContain('tokensPerSecond');
  }, 60_000);
});

/**
 * ADR 0151 PV1 - the Home measures a host that reads a credential.
 *
 * **Until one was secured, this path was unreachable by construction.** The
 * measurer sent no credential and had no way to, so a host behind an
 * authenticating proxy answered its first probe with 401 and nothing about the
 * deployment could be observed at all - no window, no throughput, no lanes,
 * and therefore no entry. Three rules closed the circle from the other side:
 * a credential is sealed against an entry, an entry exists only once a
 * measurement wrote one, and the measurement needed the credential.
 */
describe('ADR 0151 PV1 - measuring a host behind an authenticating proxy', () => {
  it('measures it with the secret the ask carried, and holds it afterwards', async () => {
    const host = await startPicoFakeModelHost({ credential: 'issued-by-the-house-proxy' });
    hosts.push(host);
    const { databasePath, send } = await claimedHome();

    const asked = await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
      credentialRef: 'house-proxy',
      credential: 'issued-by-the-house-proxy',
    });
    expect(asked.response.outcome).toBe('ok');
    const finished = await settled(send as Send, 'a-model:measured');
    expect(finished.state).toBe('settled');

    const store = await EventStore.open(databasePath, {});
    const entries = store.picoModelProviderRegistry().list();
    store.close();
    expect(entries).toHaveLength(1);
    // A measurement that proved the far side reads a credential still grants
    // nothing: PV1's proof is spent by a person, at the decision surface.
    expect(entries[0]?.entry.carries).toBe('live_turn');
    expect(entries[0]?.entry.credentialRef).toBeUndefined();

    // The note the open host earns is exactly what this host does not: it
    // refused a credential that cannot be right.
    expect(finished.notes?.join(' ') ?? '').not.toContain('credential that cannot be right');

    // And the secret is held now, so the second measurement needs only its
    // name - which is the whole reason it was sealed after the entry landed.
    const again = await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
      credentialRef: 'house-proxy',
    });
    expect(again.response.outcome).toBe('ok');
    expect((await settled(send as Send, 'a-model:measured')).state).toBe('settled');
  }, 120_000);

  it('measures nothing without it, and names the probe that was refused', async () => {
    const host = await startPicoFakeModelHost({ credential: 'issued-by-the-house-proxy' });
    hosts.push(host);
    const { send } = await claimedHome();

    await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    });

    const finished = await settled(send as Send, 'a-model:measured');
    expect(finished.state).toBe('failed');
    // ADR 0118 O4's words: what the host did, not "failed".
    expect(finished.refusal).toBe('pico_model_provider_probe_failed:/api/version:401');
  }, 60_000);

  it('refuses a name it holds no secret for rather than measuring openly', async () => {
    /**
     * Falling back to an unauthenticated run would answer a different question
     * and file the answer in the same field: a report saying this host refuses
     * everything, about a host that was never asked properly. ADR 0142 PE2 is
     * what forbids it.
     */
    const host = await startPicoFakeModelHost({ credential: 'issued-by-the-house-proxy' });
    hosts.push(host);
    const { send } = await claimedHome();

    const refused = await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
      credentialRef: 'a-name-nobody-filed-anything-under',
    });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('pico_model_provider_credential_not_held');
  }, 30_000);

  it('still refuses to spend the proof over a transport that does not protect it', async () => {
    /**
     * ADR 0151 PV5, on the far side of a successful proof. This host reads a
     * credential and refuses a wrong one - everything PV1 asks for - and its
     * reach is plain HTTP, so the bearer is readable by everyone who could
     * already reach the port. Securing a host over `http:` buys the live turn
     * and nothing else, which is what the deployment note about the TLS proxy
     * is for.
     */
    const host = await startPicoFakeModelHost({ credential: 'issued-by-the-house-proxy' });
    hosts.push(host);
    const { send } = await claimedHome();
    await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
      credentialRef: 'house-proxy',
      credential: 'issued-by-the-house-proxy',
    });
    await settled(send as Send, 'a-model:measured');

    const decided = await send('home.model.provider.decision.submit', {
      entryId: 'a-model:measured',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'house-proxy',
    });
    expect(decided.response.outcome).toBe('invalid_arguments');
    expect(decided.result.refusal).toBe('pico_model_provider_credential_on_unprotected_transport');
  }, 60_000);
});
