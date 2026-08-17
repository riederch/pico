import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { EventStore } from './event-store.js';
import { PicoDepotWorkspace } from './depot-workspace.js';
import { startPicoFakeModelHost, type PicoFakeModelHost } from './test-model-provider-host.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * Everything a person can add, taken back.
 *
 * **Found by a check rather than by a person.** `detachPicoDepot`,
 * `detachPicoSupplier` and `PicoModelProviderRegistry.remove` all existed,
 * were tested, and had no caller outside those tests - the same shape as the
 * five defects found by hand in the week before, which is why the shape now
 * has a gate (`store:check`) instead of a discoverer.
 *
 * Each of the three takes something different back, and the differences are
 * the subject here: a supplier detach must not touch what was derived, a depot
 * detach must reach the filesystem, and forgetting a machine must not leave a
 * decision behind for the next measurement of the same model to inherit.
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

function createDeclaringRemote(): { remote: string; commit: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pico-detach-depot-'));
  dirs.push(dir);
  git(['-c', 'init.defaultBranch=main', 'init', '--quiet', dir], tmpdir());
  writeFileSync(join(dir, 'pico-depot.json'), JSON.stringify({
    schema: 'pico.depot.manifest.v1',
    suppliers: [{
      identifier: 'git-library',
      kind: 'library',
      slots: ['memory_item'],
      coverage: ['knowledge_base'],
      entryPoint: 'suppliers/git-library/index.js',
      protocolVersion: 1,
    }],
  }));
  mkdirSync(join(dir, 'suppliers', 'git-library'), { recursive: true });
  writeFileSync(join(dir, 'suppliers', 'git-library', 'index.js'), '// not run here\n');
  writeFileSync(join(dir, 'note.md'), 'The boiler was serviced on 3 May.\n');
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'a depot'], dir);
  return { remote: `file://${dir}`, commit: git(['rev-parse', 'HEAD'], dir).trim() };
}

interface AppUnderTest {
  inject(request: { method: string; url: string }): Promise<{ json(): unknown }>;
  close(): Promise<void>;
}

async function claimedHome() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-taking-back-'));
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
    idSuffix: 'taking_back',
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

describe('ADR 0143 DP8 - taking back "this material may be here"', () => {
  it('removes the row and the working copy with it', async () => {
    /**
     * The filesystem is brought to the record rather than left to the
     * boot-time orphan sweep. Until that sweep runs there is executable code
     * on disk that no attachment stands behind, which is what a supplier
     * process would be pointed at.
     */
    const { remote, commit } = createDeclaringRemote();
    const { databasePath, send } = await claimedHome();
    await send('home.modules.consent.record', { identifier: 'depot' });
    await send('home.depot.attach', { remote, commit });
    await send('home.depot.reach.decide', { remote, mayFetch: true, mayFetchUnasked: false });
    const asked = (await send('home.depot.fetch.ask', { presenceSessionId: 'presence-detach' }))
      .result as unknown as { waiting: Array<{ requestedEventId: string }> };
    await send('home.action.approval.resolve', {
      requestedEventId: asked.waiting[0]!.requestedEventId,
      presenceSessionId: 'presence-detach',
      approved: true,
    });

    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    expect(existsSync(workspace.pathFor(remote))).toBe(true);

    expect((await send('home.depot.detach', { remote })).result).toEqual({ detached: true });
    expect(existsSync(workspace.pathFor(remote))).toBe(false);

    const read = (await send('home.depots.read', {})).result as unknown as {
      depots: unknown[];
    };
    expect(read.depots).toEqual([]);
  }, 60_000);

  it('refuses a depot nobody attached, by name', async () => {
    const { send } = await claimedHome();
    const refused = await send('home.depot.detach', { remote: 'file:///nowhere' });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('not_attached');
  });
});

describe('ADR 0136 with ADR 0129 SR6 - stopping a supplier is not forgetting', () => {
  it('detaches it and leaves what was derived exactly where it was', async () => {
    const { remote, commit } = createDeclaringRemote();
    const { databasePath, send } = await claimedHome();
    await send('home.modules.consent.record', { identifier: 'depot' });
    await send('home.depot.attach', { remote, commit });
    await send('home.depot.reach.decide', { remote, mayFetch: true, mayFetchUnasked: false });
    const asked = (await send('home.depot.fetch.ask', { presenceSessionId: 'presence-detach' }))
      .result as unknown as { waiting: Array<{ requestedEventId: string }> };
    await send('home.action.approval.resolve', {
      requestedEventId: asked.waiting[0]!.requestedEventId,
      presenceSessionId: 'presence-detach',
      approved: true,
    });
    await send('home.supplier.attach', {
      identifier: 'git-library',
      privacyDomain: 'knowledge',
    });

    // Something Pico derived and put in that domain. Detaching must not reach
    // it: it is an ordinary memory item under ordinary custody.
    const writing = await EventStore.open(databasePath, {});
    writing.memory().create({
      memoryItemId: 'mem_from_library_01',
      privacyDomain: 'knowledge',
      owner: 'person',
      controller: 'person',
      contentType: 'text/plain',
      content: 'The boiler was serviced on 3 May.',
    } as never);
    writing.close();

    expect((await send('home.supplier.detach', { identifier: 'git-library' })).result)
      .toEqual({ detached: true });

    const after = (await send('home.suppliers.read', {})).result as unknown as {
      suppliers: unknown[];
      declared: Array<{ identifier: string }>;
    };
    expect(after.suppliers).toEqual([]);
    // And it is offered again, because the depot still declares it. Detaching
    // took back the answer, not the question.
    expect(after.declared.map((entry) => entry.identifier)).toEqual(['git-library']);

    const reading = await EventStore.open(databasePath, {});
    const kept = reading.memory().getInDomain('mem_from_library_01', 'knowledge');
    reading.close();
    /**
     * **The content and the state, not merely the row.** Asserting the item
     * was *defined* passed a planted deletion: `deleteInDomain` is a soft
     * delete that sets `content = NULL` and leaves the row, so the weaker
     * assertion held while the sentence it was about was gone.
     */
    expect(kept?.deletionState).toBe('active');
    expect(kept?.content).toBe('The boiler was serviced on 3 May.');
  }, 60_000);

  it('refuses a supplier nobody attached, by name', async () => {
    const { send } = await claimedHome();
    const refused = await send('home.supplier.detach', { identifier: 'never-attached' });
    expect(refused.result.refusal).toBe('not_attached');
  });
});

describe('ADR 0142 PE1 - forgetting a measured machine', () => {
  const measure = async (
    send: (operation: string, args: Record<string, unknown>) => Promise<{
      response: { outcome: string };
      result: Record<string, unknown>;
    }>,
    reach: string,
  ) => {
    await send('home.model.provider.measure.ask', {
      reach,
      model: 'a-model:measured',
      providerClass: 'declared_own_host',
    });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const read = (await send('home.model.providers.read', {}))
        .result as unknown as { measurements: Array<{ state: string }> };
      if (read.measurements.every((entry) => entry.state !== 'running')) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error('measurement_never_settled');
  };

  it('takes the decision with it, so a later measurement inherits nothing', async () => {
    /**
     * The reason this is not `revoke` repeated. An entry id is derived from
     * the model name, so measuring the same model again produces the same id -
     * and a decision left behind would hand a fresh finding somebody's old
     * answer about a different one.
     */
    const host = await startPicoFakeModelHost();
    hosts.push(host);
    const { send } = await claimedHome();
    await measure(send, host.reach);
    await send('home.model.provider.decision.submit', {
      entryId: 'a-model:measured',
      providerClass: 'declared_own_host',
      carries: 'live_turn',
    });
    expect(((await send('home.model.providers.read', {}))
      .result as unknown as { providers: Array<{ decided: boolean }> })
      .providers[0]?.decided).toBe(true);

    expect((await send('home.model.provider.forget', { entryId: 'a-model:measured' })).result)
      .toEqual({ forgotten: true });
    expect(((await send('home.model.providers.read', {}))
      .result as unknown as { providers: unknown[] }).providers).toEqual([]);

    // Measured again: the same identifier, and nobody has decided about it.
    await measure(send, host.reach);
    const providers = (await send('home.model.providers.read', {}))
      .result as unknown as { providers: Array<{ entryId: string; decided: boolean }> };
    expect(providers.providers).toHaveLength(1);
    expect(providers.providers[0]).toMatchObject({
      entryId: 'a-model:measured',
      decided: false,
    });
  }, 120_000);

  it('refuses a machine nobody measured, by name', async () => {
    const { send } = await claimedHome();
    const refused = await send('home.model.provider.forget', { entryId: 'never-measured' });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('not_measured');
  });
});
