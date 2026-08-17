import { mkdtempSync, rmSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { startPicoFakeModelHost, type PicoFakeModelHost } from './test-model-provider-host.js';
import {
  keyRecordFingerprintHex,
  openPicoHomeWithDevice,
  sendPicoLinkDirectRequest,
} from './test-claimed-home.js';

/**
 * ADR 0136 BR1 end to end - from a Home nobody has touched to queued library
 * reads, through nothing but the surface a person has.
 *
 * **This walk was impossible in four separate places a week ago**, and each one
 * was a store method whose only author was its own tests:
 *
 * 1. ADR 0139 AC4's effect consent, written only on an off-to-on transition
 *    that a default-on module never makes - so no depot could be fetched.
 * 2. ADR 0141 RN4's held question, produced and then dropped - so a person
 *    pressing *fetch now* was asking into the air.
 * 3. `attachPicoSupplier`, with no caller - so a fetched depot's declared
 *    library was shown to nobody and could never hold a domain.
 * 4. `PicoModelProviderRegistry.put()`, with no caller - so no entry existed,
 *    and `pickPicoDepotIntakeEntry` refused every read with `no_decided_entry`.
 *
 * A fifth was found by running this: the shipped supplier's entry point was
 * resolved from `process.cwd()`, which lands only because the image happens to
 * set `WORKDIR /app`.
 *
 * So it is one test rather than four, and it asserts the *chain*: any of those
 * closing alone leaves it failing at the next gate. Every step goes over Link
 * as a signed request from a claimed device, and nothing writes to the store.
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

const git = (args: readonly string[], cwd: string): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  });

/**
 * A real repository that declares one library supplier.
 *
 * Built rather than fixtured, because the subject is what the Home reads off
 * a working copy after a fetch, and a fixture would let this pass without a
 * fetch ever having happened.
 */
function createDeclaringRemote(declaration?: Record<string, unknown>): {
  remote: string;
  commit: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'pico-declaring-depot-'));
  dirs.push(dir);
  git(['-c', 'init.defaultBranch=main', 'init', '--quiet', dir], tmpdir());
  writeFileSync(join(dir, 'pico-depot.json'), JSON.stringify({
    schema: 'pico.depot.manifest.v1',
    suppliers: [declaration ?? {
      identifier: 'git-library',
      kind: 'library',
      slots: ['memory_item'],
      coverage: ['knowledge_base'],
      entryPoint: 'suppliers/git-library/index.js',
      protocolVersion: 1,
    }],
  }, null, 2));
  mkdirSync(join(dir, 'suppliers', 'git-library'), { recursive: true });
  cpSync(
    join(import.meta.dirname, '..', '..', '..', 'bridges', 'suppliers', 'git-library', 'index.js'),
    join(dir, 'suppliers', 'git-library', 'index.js'),
  );
  writeFileSync(join(dir, 'note.md'), 'The boiler was serviced on 3 May.\n');
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'a depot that declares a supplier'], dir);
  return { remote: `file://${dir}`, commit: git(['rev-parse', 'HEAD'], dir).trim() };
}


describe('ADR 0136 BR1 - a library gets read, and every gate on the way is a person’s', () => {
  it('walks nine steps and queues a read for every file in the depot', async () => {
    const host = await startPicoFakeModelHost();
    hosts.push(host);
    const { remote, commit } = createDeclaringRemote();
    const dir = mkdtempSync(join(tmpdir(), 'pico-whole-chain-'));
    dirs.push(dir);
    const logLines: string[] = [];
    const app = await buildApp({
      host: '127.0.0.1',
      port: 0,
      databasePath: join(dir, 'pico.sqlite'),
      deviceId: 'pico-core',
      logDestination: new Writable({
        write(chunk: Buffer, _encoding, callback) {
          logLines.push(chunk.toString('utf8'));
          callback();
        },
      }),
    } as never) as unknown as {
      inject(request: { method: string; url: string }): Promise<{ json(): unknown }>;
      picoQueueDepotLibraryReads(input: { remote: string; picoIdentityFingerprintHex: string }):
        Promise<{ queued: number; absent?: number; refused?: number; refusal?: string }>;
      close(): Promise<void>;
    };
    apps.push(app);

    const moveInCode = logLines
      .map((line) => JSON.parse(line) as { picoHomeMoveInCode?: string })
      .find((line) => typeof line.picoHomeMoveInCode === 'string')!.picoHomeMoveInCode!;
    const setup = (await app.inject({ method: 'GET', url: '/api/home/setup' })).json() as {
      host: { signingKeyFingerprintHex: string; keyAgreementPublicKeyHex: string };
    };
    const { device, sealedClaim } = await openPicoHomeWithDevice(app as never, {
      moveInCode,
      idSuffix: 'whole_chain',
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
    const person = keyRecordFingerprintHex(sealedClaim.claimantIdentityKeyRecord);
    const session = 'presence-whole-chain';

    // 1. ADR 0139 AC4. A default-on module still needs somebody to agree to
    //    what it does, and `depot.fetch` installs code.
    expect((await send('home.modules.consent.record', { identifier: 'depot' }))
      .result).toEqual({ recorded: 1 });

    // 2. ADR 0143 DP1. This material may be here - and no reach comes with it.
    expect((await send('home.depot.attach', { remote, commit })).result)
      .toMatchObject({ mayFetch: false });

    // 3. ADR 0138 CO3, and deliberately not CO4: it may go when asked.
    await send('home.depot.reach.decide', { remote, mayFetch: true, mayFetchUnasked: false });

    // 4. ADR 0143 DP8. A person presses *fetch now*, and is asked.
    const asked = (await send('home.depot.fetch.ask', { presenceSessionId: session }))
      .result as unknown as { requested: number; waiting: Array<{ requestedEventId: string }> };
    expect(asked.requested).toBe(1);
    expect(asked.waiting).toHaveLength(1);

    // 5. ADR 0141 RN4. The answer, in the session the question was asked in.
    expect((await send('home.action.approval.resolve', {
      requestedEventId: asked.waiting[0]!.requestedEventId,
      presenceSessionId: session,
      approved: true,
    })).result).toMatchObject({ outcome: 'approved', ran: true, succeeded: true });

    // 6. ADR 0143 DP3. The fetched depot declares a library, and the person
    //    names the one thing a depot may not supply.
    const offered = (await send('home.suppliers.read', {})).result as unknown as {
      declared: Array<{ identifier: string; needs: string[] }>;
    };
    expect(offered.declared).toMatchObject([{ identifier: 'git-library', needs: ['privacyDomain'] }]);
    await send('home.supplier.attach', { identifier: 'git-library', privacyDomain: 'knowledge' });

    /**
     * Everything above is in place and a read still cannot run, because ADR
     * 0142's entry does not exist. This is the assertion that makes the test a
     * chain rather than four tests in a row.
     */
    expect(await app.picoQueueDepotLibraryReads({
      remote, picoIdentityFingerprintHex: person,
    })).toEqual({ queued: 0, refusal: 'no_decided_entry' });

    // 7. ADR 0142 PE2. The Home measures a machine the person declares is
    //    theirs, and the entry that lands is undecided.
    expect((await send('home.model.provider.measure.ask', {
      reach: host.reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    })).result).toEqual({ entryId: 'a-model:measured', state: 'running' });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const read = (await send('home.model.providers.read', {}))
        .result as unknown as { measurements: Array<{ state: string }> };
      if (read.measurements.every((entry) => entry.state !== 'running')) {
        break;
      }
      // Once a second: ADR 0119 Q4's stranger bucket is sixty a minute, shared.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    // 8. A measured entry is a finding. Nothing uses it until it is decided,
    //    which is ADR 0151 PV1 and ADR 0152 rather than a caching detail.
    expect(await app.picoQueueDepotLibraryReads({
      remote, picoIdentityFingerprintHex: person,
    })).toEqual({ queued: 0, refusal: 'no_decided_entry' });

    // 9. ADR 0152 SE6. The decision is the person's, on their own device.
    await send('home.model.provider.decision.submit', {
      entryId: 'a-model:measured',
      providerClass: 'declared_own_host',
      carries: 'live_turn',
    });

    /**
     * One job per file in the working copy, and none refused - which is what
     * caught the fifth finding: the shipped supplier's entry point had been
     * resolved from `process.cwd()`, so every path came back *refused* and the
     * caller was handed a bare `queued: 0`.
     */
    const queued = await app.picoQueueDepotLibraryReads({
      remote, picoIdentityFingerprintHex: person,
    });
    expect(queued).toEqual({ queued: 3, absent: 0, refused: 0 });
  }, 180_000);
});
