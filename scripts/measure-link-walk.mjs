import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPicoLinkDirectOperations } from './link-operations.mjs';

/**
 * Welche Link-Operationen ein echtes Home je von einem echten Client
 * *angenommen* hat - gemessen, nicht behauptet.
 *
 * **Kein Tor.** Es heisst absichtlich nicht `check-`: es fährt eine ganze
 * Testmenge mit echten Prozessen und braucht dafür anderthalb Minuten, es
 * urteilt nicht, und es fasst eine Datei im Bauverzeichnis an. Ein Entwickler
 * ruft es, wenn er die Zahl wissen will; `release:verify` ruft es nicht.
 *
 * **Warum es das gibt.** Am 2026-08-28 wurde gezählt, wieviele der
 * vierundfünfzig Operationen je durchgekommen sind: achtzehn. Die anderen
 * hatten, was drei Prüfungen prüfen - einen Namen in der geschlossenen Liste,
 * eine erschöpfende Fallunterscheidung im Home, einen Client, der den Namen
 * nennt - und keine davon ist die vierte Aussage: dass jemand sie annimmt.
 * Genau diese Lücke hat die Befunde B31, B34 und B36 durchgelassen. Die Zahl
 * ist seither in `Roadmap.md` und in `progress.md` genannt, und eine genannte
 * Zahl, die niemand nachrechnen kann, driftet.
 *
 * **Wie gemessen wird, und warum so.** Das Home schreibt jede angenommene
 * Operation mit, solange `PICO_LINK_TRACE` gesetzt ist. Diese Zeile steht
 * nicht im Produkt: sie wird hier in das gebaute `app.js` eingesetzt und
 * danach wieder entfernt. Eine dauerhafte Mitschrift wäre eine Aufzeichnung
 * darüber, wer wann was gefragt hat - eine Fläche, die es ohne eine
 * Entscheidung nicht geben soll, und ein Testwerkzeug ist kein Anlass, sie zu
 * schaffen.
 *
 * Gefahren wird die Companion-Shell-Testmenge, weil sie die einzige Stelle im
 * Baum ist, an der echte Prozesse einander antworten. Andere Tests bauen ihre
 * Link-Anfragen selbst oder sprechen mit einem erfundenen Client, und beides
 * beantwortet die Frage nicht, die hier gestellt wird.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const builtApp = join(repoRoot, 'apps', 'core', 'dist', 'app.js');

/**
 * Die Stelle, an der eine verifizierte Anfrage zu einer Handlung wird - eine
 * Zeile, die genau einmal vorkommt. Kommt sie nicht vor, wurde nicht gebaut
 * oder die Stelle heisst anders; beides ist ein Abbruch und keine Null.
 */
const dispatchLine =
  '    const dispatchPicoLinkOperation = async (operation, args, principal, scheduleAfterReply) => {\n';

const traced = (tracePath) => dispatchLine
  + '        const __picoTraced = await __picoDispatchInner(operation, args, principal, scheduleAfterReply);\n'
  + `        try { (await import('node:fs')).appendFileSync(${JSON.stringify(tracePath)}, `
  + 'operation + " " + __picoTraced.outcome + "\\n"); } catch {}\n'
  + '        return __picoTraced;\n'
  + '    };\n'
  + '    const __picoDispatchInner = async (operation, args, principal, scheduleAfterReply) => {\n';

const operations = readPicoLinkDirectOperations();
if (operations.length === 0) {
  console.error('Could not read the closed operation list, so there is nothing to measure against.');
  process.exit(1);
}

let source;
try {
  source = readFileSync(builtApp, 'utf8');
} catch {
  console.error(`${builtApp} is not there. Run \`pnpm build\` first: this measures the Home that runs, not the one that is written.`);
  process.exit(1);
}
if (!source.includes(dispatchLine)) {
  console.error('The dispatch line this measurement patches is not in the built Home. Rebuild, or fix this script against the current shape.');
  process.exit(1);
}

const workspace = mkdtempSync(join(tmpdir(), 'pico-link-walk-'));
const backup = join(workspace, 'app.js');
const tracePath = join(workspace, 'trace.txt');
copyFileSync(builtApp, backup);

/**
 * Zurückgelegt wird auch dann, wenn etwas schiefgeht oder jemand abbricht -
 * ein gepatchtes Bauverzeichnis, das liegen bleibt, wäre eine stille
 * Veränderung an dem, was der nächste Lauf misst.
 */
const restore = () => {
  try {
    copyFileSync(backup, builtApp);
  } catch {
    console.error(`Could not restore ${builtApp}; a copy is at ${backup}.`);
  }
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    restore();
    process.exit(130);
  });
}

let failed;
try {
  writeFileSync(builtApp, source.replace(dispatchLine, traced(tracePath)));
  writeFileSync(tracePath, '');
  process.stdout.write('Running the companion-shell suite against a Home that writes down what it accepts.\n');
  execFileSync('npx', ['pnpm@9.0.0', '--filter', '@pico/companion-shell', 'test'], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
} catch (error) {
  // Nicht abgebrochen: eine rote Testmenge misst weniger, aber sie misst, und
  // die Zahl mit dem Hinweis daneben ist ehrlicher als gar keine.
  failed = String(error.stderr ?? '').slice(-800);
} finally {
  restore();
}

const lines = readFileSync(tracePath, 'utf8').split('\n').filter((line) => line !== '');
const accepted = new Set(lines.filter((line) => line.endsWith(' ok')).map((line) => line.split(' ')[0]));
const refusedOnly = new Set(lines
  .map((line) => line.split(' ')[0])
  .filter((operation) => !accepted.has(operation)));
rmSync(workspace, { recursive: true, force: true });

if (lines.length === 0 && failed === undefined) {
  // Ein Lauf, der nichts mitgeschrieben hat, hat nicht gemessen, dass nichts
  // durchkommt - er hat nicht gemessen. Gesagt statt als Null gedruckt.
  console.error('The suite passed and the Home wrote down nothing at all, so this measured nothing. The trace is not reaching the Home; fix that before believing a number.');
  process.exit(1);
}

const unwalked = operations.filter((operation) => !accepted.has(operation));
console.log(`\n${accepted.size} of ${operations.length} operations were accepted by a running Home.`);
if (refusedOnly.size > 0) {
  console.log(`${refusedOnly.size} reached it and were only ever refused: ${[...refusedOnly].join(', ')}`);
}
if (unwalked.length > 0) {
  console.log('\nNot accepted by any walk in this run:');
  for (const operation of unwalked) {
    console.log(`  ${operation}`);
  }
  console.log('\nRoadmap.md finding B36 says why each of these stands.');
}
if (failed !== undefined) {
  console.log('\nThe suite did not pass, so this run measured less than a green one would:');
  console.log(failed);
  process.exit(1);
}
