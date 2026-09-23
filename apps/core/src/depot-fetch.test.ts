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

  it('costs two local commands when the working copy is already at the pin', () => {
    /**
     * A scheduled fetch over an unchanged depot must not cost a clone, or the
     * schedule becomes the reason to lengthen the interval.
     *
     * Seit Nutzerentscheidung 16 sind es **zwei** statt einer, und beide
     * fragen nichts im Netz: `ls-remote --get-url` loest nur auf, was eine
     * `~/.gitconfig` aus der Adresse machen wuerde, und `rev-parse` liest die
     * Arbeitskopie. Die Zusicherung dieses Gangs ist damit unveraendert - er
     * zaehlt sie beide auf, damit ein dritter Befehl auffaellt.
     */
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
    expect(calls).toEqual([
      ['ls-remote', '--get-url', remote],
      ['rev-parse', 'HEAD'],
    ]);
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

  it('refuses a remote a gitconfig rewrites on the way, before it fetches anything', () => {
    /**
     * Befund B208, Nutzerentscheidung 16 vom 2026-09-22.
     *
     * `picoDepotRemotePattern` verbietet einen blanken Pfad mit dem Satz, eine
     * Adresse muesse *einen* Ort benennen - und der Abruf reicht `HOME` durch,
     * damit `git` seine Zugangsdaten findet. Eine `~/.gitconfig` mit
     * `insteadOf` schreibt die Adresse damit um, bevor irgendetwas geholt
     * wird: die Commit-Pinnung blieb wirksam, die Herkunft nicht.
     *
     * Gemessen mit einem echten `HOME`, in dem eine echte Umschreibung steht -
     * nicht mit einem nachgestellten `run`, denn *ob git die Umschreibung
     * anwendet* ist genau die Frage, und ein Nachbau haette sie beantwortet
     * statt sie zu stellen.
     */
    const { remote, first } = makeRemote();
    const elsewhere = makeRemote();
    const home = temp('home');
    writeFileSync(
      join(home, '.gitconfig'),
      `[url "${elsewhere.remote}"]\n\tinsteadOf = ${remote}\n`,
      { mode: 0o600 },
    );
    const into = join(temp('into'), 'depot');

    const withRewrite = (args: readonly string[], cwd: string): string => execFileSync('git', [...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH ?? '',
        HOME: home,
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_ADVICE: '0',
      },
    });

    // Erst die Messung, die den Befund traegt: git *folgt* der Umschreibung.
    expect(withRewrite(['ls-remote', '--get-url', remote], home).trim()).toBe(elsewhere.remote);

    expect(() => fetchPicoDepot({ pin: { remote, commit: first }, into, run: withRewrite }))
      .toThrow('pico_depot_remote_rewritten');
    // Und nichts liegt auf der Platte: abgelehnt wird, bevor geholt wird.
    expect(existsSync(join(into, '.git'))).toBe(false);
  });

  it('fetches when the same gitconfig leaves this remote alone', () => {
    /**
     * Die Gegenseite, damit die Regel nicht mehr verbietet als sie soll: eine
     * `~/.gitconfig` darf da sein und Regeln fuer *andere* Adressen tragen.
     * Nur die genannte muss die genannte bleiben.
     */
    const { remote, first } = makeRemote();
    const other = makeRemote();
    const home = temp('home-benign');
    writeFileSync(
      join(home, '.gitconfig'),
      `[url "${other.remote}"]\n\tinsteadOf = https://nothing.invalid/x\n`,
      { mode: 0o600 },
    );
    const into = join(temp('into'), 'depot');

    const outcome = fetchPicoDepot({
      pin: { remote, commit: first },
      into,
      run: (args, cwd) => execFileSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH ?? '',
          HOME: home,
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_ADVICE: '0',
        },
      }),
    });

    expect(outcome.status).toBe('fetched');
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

describe('ADR 0143 DP3 - what Pico hands the program it invokes', () => {
  it('runs git with a stripped environment, not with this process\'s', () => {
    // The rule is stated in the fetcher and reachable only through the real
    // runner, so every other test in this file - which injects its own - would
    // pass with the environment leaking. A depot must not reach this process's
    // environment through the fetcher any more than through its manifest.
    //
    // `GIT_DIR` is the probe because git obeys it: if it leaked, the fetch
    // would work on a repository that is not the one asked for, and this
    // succeeding is the evidence that it did not arrive.
    const { remote, first } = makeRemote();
    const into = join(temp('into'), 'depot');
    const before = { dir: process.env.GIT_DIR, trace: process.env.GIT_TRACE };
    process.env.GIT_DIR = join(temp('elsewhere'), 'not-a-repository.git');
    process.env.GIT_TRACE = '1';

    try {
      const outcome = fetchPicoDepot({
        pin: { remote, commit: first },
        into,
      });

      expect(outcome.status).toBe('fetched');
      expect(existsSync(join(into, '.git'))).toBe(true);
      expect(readFileSync(join(into, 'index.js'), 'utf8')).toContain('async () => ({})');
    } finally {
      if (before.dir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = before.dir;
      }
      if (before.trace === undefined) {
        delete process.env.GIT_TRACE;
      } else {
        process.env.GIT_TRACE = before.trace;
      }
    }
  });
});
