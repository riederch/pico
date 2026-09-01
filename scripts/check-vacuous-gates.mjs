import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * No check may report success over nothing.
 *
 * A gate that scans a tree and finds no files has two possible reports, and
 * they are opposites: "the product is clean" and "I did not look". This
 * repository has now printed the first while meaning the second three times.
 * `check-one-voice.mjs` reported "0 moments" and exited zero one day after it
 * was written, because an `if`-chain had replaced the `switch` it keyed on.
 * The version rule in `check-wire-labels.mjs` needed a guard before it was
 * ever green. And on 2026-08-24 an audit ran every check in this directory
 * against an empty tree: three of them passed, and the three were the ones
 * that say the most - "no mailbox address reaches a log", "one rule for
 * showing a key to a person", "no instant reaching a person raw", each a
 * sentence about the whole product, said truthfully about nothing.
 *
 * Fixing those three left the class open, so the audit is the check.
 *
 * **How the empty tree is built matters, and it is derived rather than
 * listed.** Every directory of this repository is mirrored - the directories
 * only, no file in any of them - so a check finds its roots exactly where it
 * expects them and nothing inside. A hand-written skeleton would be a second
 * copy of the tree's shape, which is the drift this repository keeps finding.
 * The checks themselves are copied in, because they have to run.
 *
 * **What a crash counts as.** A check that reads a file it names and dies
 * because the file is not there fails closed, which is the right direction,
 * and this cannot tell that apart from a guard. The claim is therefore
 * narrow and exactly what it says: no check *reports success* over an empty
 * product. Proving that a check guards rather than crashes is the job of the
 * plant beside it, in the check's own file.
 *
 * **A skip is not a pass.** `check-release-tag.mjs` and
 * `check-release-monotonic.mjs` answer "skipped" outside a tag build, which
 * is correct behaviour and not a claim about anything. That is read off the
 * word they print rather than kept as a list of their names here: a list of
 * two names drifts the moment a third check learns to skip, and the property
 * is right there in the output.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const scriptsDir = join(repoRoot, 'scripts');
const self = 'check-vacuous-gates.mjs';
const skipped = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage']);

/**
 * Wie ein überspringender Prüfer dazu gebracht wird, seine Arbeit zu tun.
 *
 * **Ein Sprung ist kein Bestehen - und ein Sprung, hinter den nie jemand
 * schaut, ist keine Prüfung.** Der Kommentar oben sagt seit jeher das Erste;
 * das Zweite fehlte, und am 2026-08-31 kam genau darüber eine Meldung herein
 * (Befund B46): `check-release-tag.mjs` überspringt sich ausserhalb eines
 * Tag-Baus, also wurde es hier nur in seinem Sprungbein geprüft. Was es *im*
 * Tag-Bau über einem leeren Baum tut, sah nie jemand.
 *
 * Deshalb sagt ein Prüfer, der sich überspringt, hier auch, womit er
 * loslaufen würde. Der Lauf mit dieser Umgebung muss dann dasselbe leisten wie
 * jeder andere: über einem Baum ohne Dateien nicht Erfolg melden. Wer keinen
 * Eintrag hat, fällt auf - eine Liste von einem ist billiger als ein blinder
 * Fleck, und der nächste überspringende Prüfer muss sich erklären.
 *
 * **Wie gross diese Sorte überhaupt ist**, damit es niemand zweimal ermitteln
 * muss: von den vierzig Prüfern lesen genau drei die Umgebung, und
 * zwei davon sind das Release-Paar hier. Der dritte ist dieser Audit selbst,
 * der die Umgebung nur weiterreicht. Alles andere verhält sich überall gleich
 * (gemessen am 2026-09-01).
 *
 * **Was hier nicht hineingehört**, gesagt statt vergessen: eine Umgebung, die
 * einen Prüfer ins Netz schickt. `check-release-monotonic.mjs` fragt in einem
 * Tag-Bau eine Registry, und ein Audit, das das täte, prüfte die Registry.
 * Es steht nicht in dieser Liste, weil es sich hier gar nicht überspringt -
 * es scheitert am Netz und endet ungleich null, was diese Prüfung ohnehin
 * verlangt.
 */
const forceTheWorkingPath = new Map([
  ['check-release-tag.mjs', {
    env: { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.0.0-not-this-tree' },
    why: 'ADR 0122. Im Tag-Bau hält der Prüfer den Tag gegen die Version in '
      + '`package.json`. Über einem Baum ohne diese Datei gibt es nichts zu halten, und '
      + 'genau das muss er sagen statt zu bestehen.',
  }],
  ['check-release-monotonic.mjs', {
    unforceable: true,
    why: 'ADR 0122. Seine Arbeit *ist* eine Registry-Abfrage: er liest die veröffentlichten '
      + 'Fassungen und hält die kommende dagegen. Ein Audit, das ihn dazu brächte, prüfte '
      + 'eine Registry und hinge an einem Netz - und tut es in jedem Lauf, auch wenn nichts '
      + 'freigegeben wird. Was er über einem leeren Baum täte, zeigt die Pflanzung neben '
      + 'ihm und nicht dieser Lauf. **Aufgefallen ist die Lücke in CI und nicht hier**: '
      + 'ohne `GITHUB_REF_TYPE` springt er gar nicht, sondern scheitert am Netz, und die '
      + 'Regel, die einen Sprung verlangt zu erklären, sah ihn deshalb nie.',
  }],
]);

const errors = [];
const workspace = mkdtempSync(join(tmpdir(), 'pico-vacuity-'));
let checksRun = 0;
let skippedByDesign = 0;
let exitedNonZero = 0;
let skipsLookedPast = 0;
let skipsArgued = 0;
let directoriesMirrored = 0;

try {
  mirrorDirectories(repoRoot, workspace);
  cpSync(scriptsDir, join(workspace, 'scripts'), { recursive: true });

  for (const entry of readdirSync(scriptsDir).sort()) {
    if (!entry.startsWith('check-') || !entry.endsWith('.mjs') || entry === self) {
      continue;
    }
    checksRun += 1;
    const run = spawnSync(process.execPath, [join(workspace, 'scripts', entry)], {
      cwd: workspace,
      encoding: 'utf8',
    });
    if (run.status !== 0) {
      exitedNonZero += 1;
      continue;
    }
    const firstLine = (run.stdout ?? '').split('\n')[0] ?? '';
    if (/\bskipped\b/u.test(firstLine)) {
      skippedByDesign += 1;
      const forced = forceTheWorkingPath.get(entry);
      if (forced?.unforceable === true) {
        // Argumentiert statt erzwungen: was diese Arbeit braucht, gehört nicht
        // in ein Audit. Der Grund steht oben, damit er gelesen werden kann.
        skipsArgued += 1;
        continue;
      }
      if (forced === undefined) {
        errors.push(
          `scripts/${entry} skipped over an empty tree and this audit has no way to make it `
          + 'run. A skip is not a pass, and a skip nobody looks past is not an audit: name '
          + 'the environment that makes it do its work beside the others in this file.',
        );
        continue;
      }
      const worked = spawnSync(process.execPath, [join(workspace, 'scripts', entry)], {
        cwd: workspace,
        encoding: 'utf8',
        env: { ...process.env, ...forced.env },
      });
      skipsLookedPast += 1;
      const workedLine = (worked.stdout ?? '').split('\n')[0] ?? '';
      if (worked.status === 0) {
        errors.push(
          `scripts/${entry} was given the environment that makes it work `
          + `(${JSON.stringify(forced.env)}) and still reported success over an empty tree: `
          + `${JSON.stringify(workedLine)}. That is the same failure as any other check `
          + 'calling nothing clean, one door further in.',
        );
      }
      continue;
    }
    errors.push(
      `scripts/${entry} reports success over an empty tree: ${JSON.stringify(firstLine)}. `
      + 'A check that finds nothing has two opposite things to say and must say the second '
      + 'one. Count what it looked at - per root, not in one total, because one root '
      + 'emptying while another stays full is the case a total hides - and refuse a zero.',
    );
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

for (const [entry] of forceTheWorkingPath) {
  if (!existsSync(join(scriptsDir, entry))) {
    errors.push(
      `${entry} is named here as a check that skips, and there is no such check.`,
    );
  }
}
if (checksRun === 0) {
  errors.push(
    'scripts/check-vacuous-gates.mjs found no checks to run, which is the failure it exists '
    + 'to catch, in itself.',
  );
}
if (directoriesMirrored < 2) {
  errors.push(
    `scripts/check-vacuous-gates.mjs mirrored ${directoriesMirrored} directories, so the `
    + 'tree it tested against was not this repository\'s shape and every result above is '
    + 'about something else.',
  );
}

if (errors.length > 0) {
  console.error('Vacuous-gate check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

/**
 * Die Zeile sagt jetzt drei Zahlen statt zwei, und die dritte ist die
 * ehrliche.
 *
 * Sie hiess „N refused to call nothing clean", und das war mehr, als dieser
 * Prüfer weiss: ein Prozess, der ungleich null endet, kann abgelehnt haben
 * oder abgestürzt sein, und der Kommentar oben sagt genau das. Wer die Zeile
 * las, las trotzdem eine Aussage über gutes Verhalten. Am 2026-08-31 kam eine
 * Meldung herein, ein Prüfer melde Erfolg über einem leeren Baum - er tat es
 * nicht, er stürzte ab, und diese Zeile hätte den Unterschied sagen können.
 */
console.log(
  `Vacuous-gate check passed (${checksRun} checks run against ${directoriesMirrored} `
  + `mirrored directories holding no files; ${skippedByDesign} skipped by design and `
  + `${skipsLookedPast} of those run again with the environment that makes them work and `
  + `${skipsArgued} argued as unforceable, `
  + `${exitedNonZero} ended non-zero - refused or crashed, which this audit cannot tell `
  + 'apart - and none reported success over nothing).',
);

/** The shape of the tree without any of its contents. */
function mirrorDirectories(source, target) {
  for (const entry of readdirSync(source)) {
    if (skipped.has(entry)) {
      continue;
    }
    const path = join(source, entry);
    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) {
      continue;
    }
    const mirrored = join(target, relative(source, path));
    mkdirSync(mirrored, { recursive: true });
    directoriesMirrored += 1;
    mirrorDirectories(path, mirrored);
  }
}
