import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openPicoHomeWithDevice, sendPicoLinkDirectRequest } from './test-claimed-home.js';

/**
 * ADR 0143 DP3 with ADR 0137 IN5, reachable at last.
 *
 * **A depot could be fetched and its suppliers were shown to nobody.** The
 * declaration parser, the attachment table, the ceiling and the reach switches
 * all existed; `attachPicoSupplier` had no caller outside its own tests and
 * `picoDepotSupplierNeedsFromPerson` had none at all. So `home.suppliers.read`
 * answered with an empty list on every real Home, the window's supplier
 * section hid itself, and the library reads ADR 0136 BR1 exists for could
 * never be queued - `depotLibrarySuppliers` filters on attachments, and there
 * were none to filter.
 *
 * Found by fetching a real depot that declares a library supplier and reading
 * the answer: `pico-depot.json` on disk naming `git-library`, and
 * `{"suppliers":[]}` coming back.
 *
 * Third instance in a week of one shape - a store method whose only author was
 * its own tests. The other two were ADR 0139 AC4's effect consent and the
 * appointment it silently blocked.
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

async function fetchedHome(remote: string, commit: string) {
  const dir = mkdtempSync(join(tmpdir(), 'pico-supplier-attach-'));
  dirs.push(dir);
  const logLines: string[] = [];
  const app = await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath: join(dir, 'pico.sqlite'),
    deviceId: 'pico-core',
    depotWorkspaceRoot: join(dir, 'depots'),
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
    idSuffix: 'supplier_attach',
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

  // The whole product path in front of this one, because a declaration only
  // exists once a fetch has actually put the manifest on disk.
  const session = 'presence-supplier-attach';
  await send('home.modules.consent.record', { identifier: 'depot' });
  await send('home.depot.attach', { remote, commit });
  await send('home.depot.reach.decide', { remote, mayFetch: true, mayFetchUnasked: false });
  const asked = await send('home.depot.fetch.ask', { presenceSessionId: session });
  const waiting = (asked.result as unknown as {
    waiting: Array<{ requestedEventId: string }>;
  }).waiting;
  await send('home.action.approval.resolve', {
    requestedEventId: waiting[0]!.requestedEventId,
    presenceSessionId: session,
    approved: true,
  });
  return { app, send };
}

const suppliersOf = async (
  send: (operation: string, args: Record<string, unknown>) => Promise<{
    result: Record<string, unknown>;
  }>,
) => (await send('home.suppliers.read', {})).result as unknown as {
  suppliers: Array<Record<string, unknown>>;
  declared: Array<Record<string, unknown>>;
};

describe('ADR 0143 DP3 - what a depot brings, offered to the person', () => {
  it('offers a declared supplier and says what it still needs', async () => {
    const { remote, commit } = createDeclaringRemote();
    const { send } = await fetchedHome(remote, commit);

    const read = await suppliersOf(send);
    // Nothing is attached yet, and that is not the same as nothing existing.
    expect(read.suppliers).toEqual([]);
    expect(read.declared).toHaveLength(1);
    expect(read.declared[0]).toMatchObject({
      identifier: 'git-library',
      kind: 'library',
      remote,
      // The single field a depot may not supply, named rather than implied.
      needs: ['privacyDomain'],
    });
    // What it is wired to is not what a person deciding where its material
    // belongs needs to read - the same omission the attached list makes.
    expect(read.declared[0]).not.toHaveProperty('slots');
    expect(read.declared[0]).not.toHaveProperty('coverage');
    expect(read.declared[0]).not.toHaveProperty('entryPoint');
  });

  it('attaches it with the person’s domain and stops offering it', async () => {
    const { remote, commit } = createDeclaringRemote();
    const { send } = await fetchedHome(remote, commit);

    const attached = await send('home.supplier.attach', {
      identifier: 'git-library',
      privacyDomain: 'knowledge',
    });
    expect(attached.response.outcome).toBe('ok');
    expect(attached.result).toEqual({
      identifier: 'git-library',
      privacyDomain: 'knowledge',
    });

    const after = await suppliersOf(send);
    // It moved from one list to the other. A supplier in both would be a
    // person being asked to decide something they already decided.
    expect(after.declared).toEqual([]);
    expect(after.suppliers).toHaveLength(1);
    expect(after.suppliers[0]).toMatchObject({
      identifier: 'git-library',
      // ADR 0138 CO3/CO4: attaching says where material belongs. It does not
      // say Pico may go out for it.
      mayReachOutside: false,
      mayReachUnasked: false,
    });
  });

  it('records the manifest the depot declared, never what the caller sent', async () => {
    /**
     * The same rule as `home.modules.consent.record`: a device that could name
     * its own slots and coverage would be writing the capabilities it is about
     * to be granted.
     */
    const { remote, commit } = createDeclaringRemote();
    const { send } = await fetchedHome(remote, commit);

    await send('home.supplier.attach', {
      identifier: 'git-library',
      privacyDomain: 'knowledge',
      kind: 'bridge',
      slots: ['calendar_entry'],
      coverage: ['everything'],
    });

    const after = await suppliersOf(send);
    expect(after.suppliers[0]).toMatchObject({ kind: 'library' });
  });

  it('refuses a supplier no fetched depot declares, by name', async () => {
    const { remote, commit } = createDeclaringRemote();
    const { send } = await fetchedHome(remote, commit);
    const refused = await send('home.supplier.attach', {
      identifier: 'never-declared',
      privacyDomain: 'knowledge',
    });
    expect(refused.response.outcome).toBe('invalid_arguments');
    expect(refused.result.refusal).toBe('not_declared');
  });

  it('refuses an attachment with no domain at all', async () => {
    // The one field that is the person's. Absent is not an empty string, and
    // neither is a domain.
    const { remote, commit } = createDeclaringRemote();
    const { send } = await fetchedHome(remote, commit);
    expect((await send('home.supplier.attach', { identifier: 'git-library' }))
      .response.outcome).toBe('invalid_arguments');
    const empty = await send('home.supplier.attach', {
      identifier: 'git-library',
      privacyDomain: '   ',
    });
    expect(empty.response.outcome).toBe('invalid_arguments');
    expect(String(empty.result.refusal)).toContain('supplier');
  });

  it('offers nothing from a depot that was attached and never fetched', async () => {
    /**
     * A declaration is something on disk. An attachment row alone is a person
     * saying material may be here, and reading suppliers out of it would be
     * offering to attach something nobody has looked at yet.
     */
    const { remote, commit } = createDeclaringRemote();
    const { send } = await fetchedHome(remote, commit);
    const second = createDeclaringRemote({
      identifier: 'unfetched-library',
      kind: 'library',
      slots: ['memory_item'],
      coverage: ['knowledge_base'],
      entryPoint: 'suppliers/git-library/index.js',
      protocolVersion: 1,
    });
    await send('home.depot.attach', { remote: second.remote, commit: second.commit });

    const read = await suppliersOf(send);
    expect(read.declared.map((entry) => entry.identifier)).toEqual(['git-library']);
  });
});
