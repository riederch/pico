import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parsePicoDepotPin, type PicoDepotPin } from '@pico/protocol/depot';
import type { PicoSupplierCondition } from '@pico/protocol/supplier-condition';

/**
 * ADR 0143 DP1/DP2/DP8 - getting a depot, and proving it is the one that was
 * accepted.
 *
 * DP1 says a depot runs at a commit a person accepted. Until this existed that
 * was a statement about a database row: nothing checked that the code on disk
 * was the code in the record. **This is where the pin stops being bookkeeping.**
 *
 * **`git` is an external program, and that is the point.** DP2 vendors what
 * runs and makes `git` the one fetch path, the same one ADR 0136 BR6 uses for
 * a tracked library - one mechanism, one integrity story, one way to be
 * offline. Pico invokes it; Pico does not reimplement it.
 *
 * Three properties are structural rather than careful.
 *
 * **The commit is fetched, never a branch.** `git fetch <remote> <commit>`
 * followed by a detached checkout: there is no ref name anywhere in this file,
 * which is DP1's missing branch field expressed as a missing argument. A
 * remote whose default branch moved produces exactly the same tree.
 *
 * **What arrived is verified against what was accepted.** A fetch that
 * succeeded is not evidence that the right thing arrived - a remote can serve
 * whatever it likes - so `HEAD` is read back and compared, and a mismatch
 * leaves nothing behind. ADR 0136 BR6's rule at the code level: verify loudly,
 * never substitute.
 *
 * **Failure is a condition, not an exception.** ADR 0138 CO2 already types
 * this: an unreachable remote is a state of the world a surface renders, and a
 * person's remedy is a network rather than a bug report. Only a *mismatch*
 * throws, because that is not the world failing but the remote disagreeing
 * with a decision a person made.
 */
export type PicoDepotFetchOutcome =
  | {
    status: 'fetched';
    pin: PicoDepotPin;
    path: string;
    /**
     * ADR 0143 DP1. Was das Remote als seinen Kopf veröffentlicht, wenn danach
     * gefragt wurde - und nur dann.
     *
     * Drei Zustände, weil es drei gibt: eine Zeichenkette ist ein *Angebot*
     * (etwas Neueres steht bereit), `null` heisst „das Remote steht auf der
     * Anheftung" und nimmt ein stehendes Angebot zurück, und `undefined`
     * heisst „es wurde nicht gefragt" und sagt über ein Angebot nichts. Der
     * planmässige Lauf fragt nie, also ist er immer der dritte Fall.
     */
    offeredCommit?: string | null;
  }
  /** ADR 0138 CO2. The attempt failed below the application. */
  | { status: 'condition'; condition: PicoSupplierCondition; detail: string };

export interface PicoDepotFetchOptions {
  pin: unknown;
  /** Where the working copy goes. Created if missing, replaced on mismatch. */
  into: string;
  /** Seconds before `git` is treated as gone. */
  timeoutMs?: number;
  /**
   * ADR 0143 DP1, entschieden am 2026-09-01. Ob dieser Abruf das Remote auch
   * fragt, was es veröffentlicht.
   *
   * **Nur, wenn eine Person danach gefragt hat.** Der planmässige Lauf ist
   * eine Instandsetzung und ausdrücklich keine Abfrage nach Commits; wer
   * *jetzt holen* drückt, fragt dagegen genau nach diesem Depot, und die
   * Antwort auf „gibt es etwas Neueres" ist ein Teil dessen, was er wissen
   * wollte.
   *
   * Ein Ref zu lesen ist hier erlaubt und für das, was *läuft*, weiter
   * verboten: DP1s fehlendes `branch`-Feld bleibt ein fehlendes Argument beim
   * Holen. Was hier zurückkommt, wird aufgeschrieben und nie ausgecheckt.
   */
  askWhatIsPublished?: boolean;
  /** Injected so tests can run the real path without a real `git` on PATH. */
  run?: (args: readonly string[], cwd: string) => string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

function runGit(args: readonly string[], cwd: string, timeoutMs: number): string {
  return execFileSync('git', [...args], {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    // ADR 0143 DP3's posture, applied to the program Pico invokes rather than
    // to one a depot named: `git` gets what it needs to run and nothing about
    // this process. A depot cannot reach the environment through the fetcher
    // any more than it can through its manifest.
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_ADVICE: '0',
    },
  });
}

/**
 * ADR 0143 DP1. Brings a depot to the commit that was accepted, or says why it
 * could not.
 *
 * Idempotent: a working copy already at the pin is left alone, so a scheduled
 * fetch over an unchanged depot costs one `rev-parse` rather than a clone.
 */
export function fetchPicoDepot(options: PicoDepotFetchOptions): PicoDepotFetchOutcome {
  const pin = parsePicoDepotPin(options.pin);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const run = options.run ?? ((args, cwd) => runGit(args, cwd, timeoutMs));

  const path = options.into;
  const gitDir = join(path, '.git');

  try {
    if (existsSync(gitDir) && headCommit(run, path) === pin.commit) {
      // Already there. A scheduled fetch over an unchanged depot must not cost
      // a clone, or the schedule becomes the reason to lengthen the interval.
      return { status: 'fetched', pin, path, ...publishedHead(run, path, pin, options) };
    }

    if (!existsSync(gitDir)) {
      // Befund B120, wie beim Arbeitsverzeichnis daneben.
      mkdirSync(path, { recursive: true, mode: 0o700 });
      run(['init', '--quiet'], path);
    }

    // No ref name anywhere: the commit is the thing fetched, which is DP1's
    // missing branch field expressed as a missing argument.
    run(['fetch', '--quiet', '--depth', '1', pin.remote, pin.commit], path);
    run(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], path);
  } catch (error) {
    // ADR 0138 CO2. The world failed, which is a state rather than a fault.
    return {
      status: 'condition',
      condition: 'unreachable',
      detail: error instanceof Error ? error.message.split('\n')[0]! : 'git_failed',
    };
  }

  const arrived = headCommit(run, path);
  if (arrived !== pin.commit) {
    // Not a condition. A fetch that succeeded and produced something else is
    // the remote disagreeing with a decision a person made, and leaving the
    // tree would leave code nobody accepted on disk.
    rmSync(path, { recursive: true, force: true });
    throw new Error('pico_depot_fetch_pin_mismatch');
  }

  return { status: 'fetched', pin, path, ...publishedHead(run, path, pin, options) };
}

/**
 * Was das Remote als seinen Kopf veröffentlicht, oder Schweigen.
 *
 * `git ls-remote <remote> HEAD` und sonst nichts: ein Zweigname käme aus einer
 * Konfiguration, die ADR 0143 DP1 nicht hat, und der Kopf ist das, was ein
 * Remote von sich aus als seine Fassung zeigt.
 *
 * **Ein Fehlschlag ist Schweigen und keine Rücknahme.** Wer nicht antworten
 * konnte, hat nicht gesagt, dass es nichts Neueres gibt - und ein stehendes
 * Angebot überlebt einen Versuch, der nicht durchkam (ADR 0138 CO2 in klein).
 */
function publishedHead(
  run: (args: readonly string[], cwd: string) => string,
  path: string,
  pin: PicoDepotPin,
  options: PicoDepotFetchOptions,
): { offeredCommit?: string | null } {
  if (options.askWhatIsPublished !== true) {
    return {};
  }
  let published: string;
  try {
    published = run(['ls-remote', pin.remote, 'HEAD'], path).split(/\s/u)[0] ?? '';
  } catch {
    return {};
  }
  if (!/^[0-9a-f]{40}$/u.test(published)) {
    // A remote that answered something that is not a commit has answered
    // nothing this can act on, and guessing would be inventing an offer.
    return {};
  }
  return { offeredCommit: published === pin.commit ? null : published };
}

function headCommit(
  run: (args: readonly string[], cwd: string) => string,
  path: string,
): string | null {
  try {
    return run(['rev-parse', 'HEAD'], path).trim();
  } catch {
    return null;
  }
}
