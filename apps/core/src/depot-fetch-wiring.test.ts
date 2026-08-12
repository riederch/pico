import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { picoDepotModuleManifest } from '@pico/module-depot/manifest';
import { buildApp } from './app.js';
import { PicoDepotWorkspace } from './depot-workspace.js';
import { EventStore } from './event-store.js';

/**
 * ADR 0143 DP8. The fetch end to end, against a real `git` and a real remote.
 *
 * Everything below the sweep already had tests. What did not was that a
 * running Pico ever joins them up: that a scheduled sweep produces an ADR 0139
 * request, that ADR 0140 decides it, that ADR 0141 records it, and that
 * something on disk changes as a result. A mock remote would prove the
 * arrangement and not the thing.
 */
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pico-depot-wiring-${label}-`));
  tempDirs.push(dir);
  return dir;
}

const git = (args: readonly string[], cwd: string): string => execFileSync('git', [...args], {
  cwd,
  encoding: 'utf8',
  env: {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    GIT_AUTHOR_NAME: 'Pico Test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Pico Test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
    GIT_CONFIG_NOSYSTEM: '1',
  },
});

/** A real repository with one commit, addressed as `file://`. */
function createRemote(): { remote: string; commit: string } {
  const dir = tempDir('remote');
  git(['init', '--quiet', '--initial-branch', 'main'], dir);
  writeFileSync(join(dir, 'index.js'), 'export default 1;\n');
  git(['add', 'index.js'], dir);
  git(['commit', '--quiet', '-m', 'first'], dir);
  const commit = git(['rev-parse', 'HEAD'], dir).trim();
  return { remote: `file://${dir}`, commit };
}

interface AppWithSweep {
  picoSweepDepotFetches(asked: boolean, approvalWindow?: {
    presenceSessionId: string;
    endsAtMs: number;
    startedAtMs: number;
    durationMs: number;
  }): number;
  close(): Promise<void>;
}

async function boot(databasePath: string): Promise<AppWithSweep> {
  return await buildApp({
    host: '127.0.0.1',
    port: 0,
    databasePath,
    deviceId: 'pico-core',
    logDestination: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
  }) as unknown as AppWithSweep;
}

function databasePathIn(dir: string): string {
  return join(dir, 'pico.sqlite');
}

function attach(databasePath: string, input: {
  remote: string;
  commit: string;
  mayFetch: boolean;
  mayFetchUnasked: boolean;
  /** ADR 0139 AC4. Absent means nobody agreed, which is its own test below. */
  consented?: boolean;
  /** ADR 0140 RL4. Absent means no standing rule, which is its own test below. */
  ruled?: boolean;
}): void {
  const store = new EventStore(databasePath);
  if (input.consented !== false) {
    store.setPicoModuleActivation({
      changes: [{
        identifier: 'depot',
        active: true,
        // The effects as the manifest declares them, which is what a person
        // would have read.
        effects: picoDepotModuleManifest.effects,
      }],
      decidedAt: '2026-08-12T08:00:00.000Z',
    });
  }
  // ADR 0140 RL4. `external_write` never resolves to `allow` from the risk
  // class alone, so a standing rule is what lets an unattended sweep act at
  // all. Absent means every path below has to find a person.
  if (input.ruled !== false) {
    store.setPicoRuleDecision({
      effectName: 'depot.fetch',
      privacyDomain: 'private',
      decision: 'allow',
      decidedAt: '2026-08-12T08:00:00.000Z',
    });
  }
  store.attachPicoDepot({
    pin: { remote: input.remote, commit: input.commit },
    acceptedAt: '2026-08-12T09:00:00.000Z',
  });
  if (input.mayFetch) {
    store.setPicoDepotReach({
      remote: input.remote,
      mayFetch: true,
      mayFetchUnasked: input.mayFetchUnasked,
    });
  }
  store.close();
}

function attachmentOf(databasePath: string, remote: string) {
  const store = new EventStore(databasePath);
  try {
    return store.picoDepotAttachment(remote);
  } finally {
    store.close();
  }
}

describe('ADR 0143 DP8 depot fetch, wired', () => {
  it('brings a permitted depot to its pin and records that it got through', async () => {
    const { remote, commit } = createRemote();
    const dir = tempDir('home');
    const databasePath = databasePathIn(dir);
    attach(databasePath, { remote, commit, mayFetch: true, mayFetchUnasked: true });

    const app = await boot(databasePath);
    try {
      expect(app.picoSweepDepotFetches(false)).toBe(1);
    } finally {
      await app.close();
    }

    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    const path = workspace.pathFor(remote);
    expect(existsSync(join(path, 'index.js'))).toBe(true);
    expect(git(['rev-parse', 'HEAD'], path).trim()).toBe(commit);

    const after = attachmentOf(databasePath, remote);
    expect(after?.lastFetchCondition).toBeUndefined();
    expect(after?.lastFetchAt).toEqual(expect.any(String));
  });

  it('asks nobody and fetches nothing when ADR 0138 CO4 was not granted', async () => {
    // CO3 without CO4: a person may ask for this, and a sweep may not take it.
    const { remote, commit } = createRemote();
    const databasePath = databasePathIn(tempDir('home-co4'));
    attach(databasePath, { remote, commit, mayFetch: true, mayFetchUnasked: false });

    const app = await boot(databasePath);
    try {
      expect(app.picoSweepDepotFetches(false)).toBe(0);
      // The same depot, the same decision path, one input changed.
      expect(app.picoSweepDepotFetches(true)).toBe(1);
    } finally {
      await app.close();
    }

    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    expect(existsSync(join(workspace.pathFor(remote), 'index.js'))).toBe(true);
  });

  it('records an unreachable remote as a condition rather than throwing', async () => {
    // ADR 0138 CO2. The world failing is a state a surface renders, and the
    // person's remedy is a network rather than a bug report.
    const missing = join(tempDir('gone'), 'never-existed');
    const databasePath = databasePathIn(tempDir('home-unreachable'));
    attach(databasePath, {
      remote: `file://${missing}`,
      commit: 'a'.repeat(40),
      mayFetch: true,
      mayFetchUnasked: true,
    });

    const app = await boot(databasePath);
    try {
      expect(() => app.picoSweepDepotFetches(false)).not.toThrow();
    } finally {
      await app.close();
    }

    const after = attachmentOf(databasePath, `file://${missing}`);
    expect(after?.lastFetchCondition).toBe('unreachable');
    expect(after?.lastFetchAt).toEqual(expect.any(String));
  });

  it('leaves a depot nobody permitted alone', async () => {
    const { remote, commit } = createRemote();
    const databasePath = databasePathIn(tempDir('home-co3'));
    attach(databasePath, { remote, commit, mayFetch: false, mayFetchUnasked: false });

    const app = await boot(databasePath);
    try {
      expect(app.picoSweepDepotFetches(false)).toBe(0);
      // Not even when a person asks: CO3 was never granted.
      expect(app.picoSweepDepotFetches(true)).toBe(0);
    } finally {
      await app.close();
    }

    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    expect(existsSync(workspace.pathFor(remote))).toBe(false);
  });

  it('costs no clone when the working copy is already at the pin', async () => {
    // A scheduled fetch that always clones is a schedule people lengthen.
    const { remote, commit } = createRemote();
    const databasePath = databasePathIn(tempDir('home-idempotent'));
    attach(databasePath, { remote, commit, mayFetch: true, mayFetchUnasked: true });

    const app = await boot(databasePath);
    try {
      app.picoSweepDepotFetches(false);
      const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
      const marker = join(workspace.pathFor(remote), 'not-from-git.txt');
      writeFileSync(marker, 'still here\n');

      app.picoSweepDepotFetches(false);
      // A second clone would have replaced the tree and taken this with it.
      expect(existsSync(marker)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('removes the working copy when the attachment goes, at the next start', async () => {
    const { remote, commit } = createRemote();
    const dir = tempDir('home-detach');
    const databasePath = databasePathIn(dir);
    attach(databasePath, { remote, commit, mayFetch: true, mayFetchUnasked: true });

    const first = await boot(databasePath);
    try {
      first.picoSweepDepotFetches(false);
    } finally {
      await first.close();
    }

    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    expect(existsSync(workspace.pathFor(remote))).toBe(true);

    const store = new EventStore(databasePath);
    store.detachPicoDepot(remote);
    store.close();

    const second = await boot(databasePath);
    await second.close();
    expect(existsSync(workspace.pathFor(remote))).toBe(false);
  });

  it('runs nothing without an ADR 0139 AC4 consent record, CO3 and CO4 notwithstanding', async () => {
    // Both reach switches on and still nothing happens, because consent is not
    // a permission the attachment carries - it is the record of a sentence a
    // person read, and it lives with the module.
    const { remote, commit } = createRemote();
    const databasePath = databasePathIn(tempDir('home-unconsented'));
    attach(databasePath, {
      remote, commit, mayFetch: true, mayFetchUnasked: true, consented: false,
    });

    const app = await boot(databasePath);
    try {
      // Read ahead of the loop rather than discovered by failing. An
      // unconsented effect makes the decision *throw* - correctly, because a
      // request for an effect nobody agreed to exists is not a question with
      // an answer - and a sweep that hit it would take every depot after it
      // down over something no depot could have fixed.
      expect(app.picoSweepDepotFetches(false)).toBe(0);
      expect(app.picoSweepDepotFetches(true)).toBe(0);
    } finally {
      await app.close();
    }

    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    expect(existsSync(workspace.pathFor(remote))).toBe(false);
  });

  it('neither acts nor asks when no rule allows it and nobody is present', async () => {
    // ADR 0140 RL3's floor: `external_write` never resolves to `allow` from
    // the risk class alone, which is the correct default for the only effect
    // in the tree that installs code. Without a recorded rule the decision is
    // `require_approval`, and ADR 0141 RN4 requires the presence session it
    // would be parked against. A scheduled sweep has none, so it does neither
    // - and above all it does not crash on the way to finding that out.
    const { remote, commit } = createRemote();
    const databasePath = databasePathIn(tempDir('home-unruled'));
    attach(databasePath, {
      remote, commit, mayFetch: true, mayFetchUnasked: true, ruled: false,
    });

    const app = await boot(databasePath);
    try {
      expect(() => app.picoSweepDepotFetches(false)).not.toThrow();
      expect(app.picoSweepDepotFetches(false)).toBe(0);
      // Asking without a presence session is the same answer: RN4's window is
      // what makes a question askable, not the `asked` flag.
      expect(app.picoSweepDepotFetches(true)).toBe(0);
    } finally {
      await app.close();
    }

    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    expect(existsSync(workspace.pathFor(remote))).toBe(false);
  });

  it('parks a question instead when a person is there to answer it', async () => {
    // The other half of the same rule. With a presence session the decision
    // can be `require_approval`, which is a question standing in front of a
    // person rather than a fetch.
    const { remote, commit } = createRemote();
    const databasePath = databasePathIn(tempDir('home-parked'));
    attach(databasePath, {
      remote, commit, mayFetch: true, mayFetchUnasked: true, ruled: false,
    });

    const app = await boot(databasePath);
    try {
      const startedAtMs = Date.parse('2026-08-12T12:00:00.000Z');
      expect(app.picoSweepDepotFetches(true, {
        presenceSessionId: 'presence-1',
        startedAtMs,
        durationMs: 300_000,
        endsAtMs: startedAtMs + 300_000,
      })).toBe(1);
    } finally {
      await app.close();
    }

    // Asked, decided, recorded - and nothing fetched, because the question is
    // still standing.
    const workspace = new PicoDepotWorkspace(PicoDepotWorkspace.defaultRoot(databasePath));
    expect(existsSync(workspace.pathFor(remote))).toBe(false);
  });

  it('does not create a workspace directory for a depot it never fetches', async () => {
    const databasePath = databasePathIn(tempDir('home-empty'));
    mkdirSync(join(databasePath, '..'), { recursive: true });

    const app = await boot(databasePath);
    try {
      expect(app.picoSweepDepotFetches(false)).toBe(0);
    } finally {
      await app.close();
    }

    expect(existsSync(PicoDepotWorkspace.defaultRoot(databasePath))).toBe(false);
  });
});
