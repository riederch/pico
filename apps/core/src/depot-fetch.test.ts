import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fetchPicoDepot } from './depot-fetch.js';

/**
 * ADR 0143 DP1. The pin stops being bookkeeping here: until this existed,
 * "a depot runs at a commit a person accepted" was a statement about a
 * database row, and nothing checked that the code on disk was the code in the
 * record.
 *
 * Everything below runs real `git` against a real local repository. No
 * network: a bare repo in a temp directory is a remote in every sense that
 * matters to this file.
 */
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function temp(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `pico-depot-${label}-`));
  tempDirs.push(dir);
  return dir;
}

function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
}

/** A local bare repository with two commits on its default branch. */
function makeRemote(): { remote: string; first: string; second: string } {
  const work = temp('work');
  git(['init', '--quiet', '-b', 'main'], work);
  writeFileSync(join(work, 'index.js'), 'export default async () => ({});\n');
  git(['add', '-A'], work);
  git(['commit', '--quiet', '-m', 'first'], work);
  const first = git(['rev-parse', 'HEAD'], work).trim();

  writeFileSync(join(work, 'index.js'), 'export default async () => ({ changed: true });\n');
  git(['add', '-A'], work);
  git(['commit', '--quiet', '-m', 'second'], work);
  const second = git(['rev-parse', 'HEAD'], work).trim();

  const bare = temp('remote');
  git(['clone', '--quiet', '--bare', work, bare], work);
  // A `file://` URL rather than a bare path: a remote is an address, and a
  // path is a position relative to whoever is asking.
  return { remote: `file://${bare}`, first, second };
}

describe('ADR 0143 DP1 - the fetch brings the accepted commit', () => {
  it('checks out exactly the pinned commit', () => {
    const { remote, first } = makeRemote();
    const into = join(temp('into'), 'depot');

    const outcome = fetchPicoDepot({ pin: { remote, commit: first }, into });
    expect(outcome.status).toBe('fetched');
    expect(git(['rev-parse', 'HEAD'], into).trim()).toBe(first);
    expect(readFileSync(join(into, 'index.js'), 'utf8')).not.toContain('changed');
  });

  it('ignores the branch head entirely', () => {
    // The gate's own sentence, end to end. The remote's default branch is at
    // `second`; pinning `first` produces `first`, and no ref name appears
    // anywhere in the fetch - DP1's missing branch field as a missing
    // argument.
    const { remote, first, second } = makeRemote();
    const into = join(temp('into'), 'depot');

    fetchPicoDepot({ pin: { remote, commit: first }, into });
    expect(git(['rev-parse', 'HEAD'], into).trim()).toBe(first);
    expect(first).not.toBe(second);
  });

  it('moves to a newer commit only when the pin says so', () => {
    // Which is what accepting an offer does: the pin changes first, and the
    // fetch follows it.
    const { remote, first, second } = makeRemote();
    const into = join(temp('into'), 'depot');

    fetchPicoDepot({ pin: { remote, commit: first }, into });
    fetchPicoDepot({ pin: { remote, commit: second }, into });
    expect(git(['rev-parse', 'HEAD'], into).trim()).toBe(second);
    expect(readFileSync(join(into, 'index.js'), 'utf8')).toContain('changed');
  });

  it('costs nothing when the working copy is already at the pin', () => {
    // A scheduled fetch over an unchanged depot must not cost a clone, or the
    // schedule becomes the reason to lengthen the interval.
    const { remote, first } = makeRemote();
    const into = join(temp('into'), 'depot');
    fetchPicoDepot({ pin: { remote, commit: first }, into });

    const calls: string[][] = [];
    const outcome = fetchPicoDepot({
      pin: { remote, commit: first },
      into,
      run: (args, cwd) => {
        calls.push([...args]);
        return git(args, cwd);
      },
    });
    expect(outcome.status).toBe('fetched');
    expect(calls).toEqual([['rev-parse', 'HEAD']]);
  });
});

describe('ADR 0143 DP1 - what arrived is verified against what was accepted', () => {
  it('refuses when the remote serves something else, and leaves nothing behind', () => {
    // A fetch that succeeded is not evidence that the right thing arrived. Not
    // a condition either: this is the remote disagreeing with a decision a
    // person made, and leaving the tree would leave code nobody accepted on
    // disk.
    const { remote, first, second } = makeRemote();
    const into = join(temp('into'), 'depot');

    expect(() => fetchPicoDepot({
      pin: { remote, commit: first },
      into,
      run: (args, cwd) => {
        // The remote answers the fetch, but hands over the other commit.
        if (args[0] === 'fetch') {
          return git([...args.slice(0, -1), second], cwd);
        }
        return git(args, cwd);
      },
    })).toThrow('pico_depot_fetch_pin_mismatch');

    expect(existsSync(into)).toBe(false);
  });

  it('reports an unreachable remote as a condition rather than a crash', () => {
    // ADR 0138 CO2. The world failed, which is a state a surface renders and a
    // person answers with a network rather than a bug report.
    //
    // A `file://` remote that does not exist rather than a hostname that does
    // not resolve: same outcome, no DNS, and nothing about this test depends
    // on what the machine running it can reach.
    const into = join(temp('into'), 'depot');
    const outcome = fetchPicoDepot({
      pin: {
        remote: `file://${join(temp('gone'), 'never-existed')}`,
        commit: 'a'.repeat(40),
      },
      into,
      timeoutMs: 15_000,
    });
    expect(outcome.status).toBe('condition');
    expect(outcome).toMatchObject({ condition: 'unreachable' });
  });

  it('reports a commit the remote does not have as a condition', () => {
    const { remote } = makeRemote();
    const into = join(temp('into'), 'depot');
    const outcome = fetchPicoDepot({
      pin: { remote, commit: 'b'.repeat(40) },
      into,
    });
    expect(outcome).toMatchObject({ status: 'condition', condition: 'unreachable' });
  });

  it('refuses a pin that asks to follow a ref before it touches the disk', () => {
    const into = join(temp('into'), 'depot');
    expect(() => fetchPicoDepot({
      pin: {
        remote: 'https://git.example.invalid/x.git',
        commit: 'a'.repeat(40),
        branch: 'main',
      },
      into,
    })).toThrow('pico_depot_cannot_follow_a_ref');
    expect(existsSync(into)).toBe(false);
  });
});
