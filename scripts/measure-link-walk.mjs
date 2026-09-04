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

/**
 * **Und die Ressource dahinter, seit dem 2026-09-02** (Befund B58).
 *
 * `home.authority.list` und `home.authority.submit` sind Sammelrufe: sie
 * verzweigen ueber ein `resource`-Feld, und die Zahl oben zaehlt den *Namen*.
 * Wer eine der beiden Operationen einmal durchbringt, faerbt damit alle
 * zwoelf Ressourcen dahinter gruen - eine Aufloesungsstufe, auf der genau die
 * Frage wieder offen ist, die diese Messung beantworten soll.
 *
 * `check-link-reachability` hat dieselbe Luecke eine Ebene darueber schon
 * einmal gefunden: `reader_custody_domains` wurde vom Home ausgeliefert und
 * von keinem Client je erfragt. Dort ging es um *benannt*; hier geht es um
 * *angenommen*.
 */
const traced = (tracePath) => dispatchLine
  + '        const __picoTraced = await __picoDispatchInner(operation, args, principal, scheduleAfterReply);\n'
  + `        try { (await import('node:fs')).appendFileSync(${JSON.stringify(tracePath)}, `
  + 'operation + " " + __picoTraced.outcome '
  + '+ ((args && typeof args.resource === "string") ? " resource:" + args.resource : "") '
  + '+ ((args && typeof args.phase === "string") ? " phase:" + args.phase : "") '
  + '+ "\\n"); } catch {}\n'
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
  process.stdout.write('Running every suite that starts a real Home, against one that writes down what it accepts.\n');
  execFileSync('npx', [
    'pnpm@9.0.0',
    '--filter', '@pico/companion-shell',
    '--filter', '@pico/vault-daemon',
    '--filter', '@pico/web',
    'test',
  ], {
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

/**
 * Eine Zeile ist `Operation Ergebnis [Ressource]`.
 *
 * Nach Feldern gelesen und nicht am Zeilenende erkannt: `endsWith(' ok')` war
 * richtig, solange nur zwei Felder dastanden, und wurde am 2026-09-02 mit dem
 * dritten still falsch - jede angenommene Autoritaetsanfrage waere als
 * abgelehnt gezaehlt worden. Aufgefallen beim Schreiben, weil das Format sich
 * aenderte; ein Leser, der Felder liest, kann daran nicht zerbrechen.
 */
const lines = readFileSync(tracePath, 'utf8').split('\n').filter((line) => line !== '');
const entries = lines.map((line) => {
  const [operation, outcome, ...qualifiers] = line.split(' ');
  const named = (prefix) => qualifiers
    .find((qualifier) => qualifier.startsWith(prefix))?.slice(prefix.length);
  return { operation, outcome, resource: named('resource:'), phase: named('phase:') };
});

/**
 * **Was „angenommen" heisst, und warum es nicht `ok` allein ist** (2026-09-04,
 * Befund B66).
 *
 * Diese Messung las bis heute `outcome === 'ok'`. Das Home antwortet auf drei
 * Wegen erfolgreich, und zwei davon heissen anders: eine eingeleitete
 * Wiederherstellung und eine eingereichte Wurzelrotation *nehmen* an - sie
 * legen einen anhaengigen Vorgang an und starten das Vetofenster. Sie als
 * Ablehnung zu zaehlen hiesse, den folgenreichsten Weg des Hauses fuer
 * verschlossen zu halten.
 *
 * Die Liste steht hier mit Grund statt als drei Woerter, und der Lauf sagt
 * unten zu *jedem* gesehenen Ergebnis, wie er es gezaehlt hat - ein viertes
 * Erfolgswort kann sich damit nicht als Ablehnung verstecken.
 */
const acceptingOutcomes = new Map([
  ['ok', 'die gewöhnliche Annahme'],
  ['recovery_pending', 'ADR 0110: die Wiederherstellung ist eingeleitet und das Vetofenster läuft'],
  ['rotation_pending', 'ADR 0114: die Wurzelrotation ist eingereicht und das Vetofenster läuft'],
]);
const wasAccepted = (entry) => acceptingOutcomes.has(entry.outcome);
const accepted = new Set(entries.filter(wasAccepted).map((entry) => entry.operation));
const refusedOnly = new Set(entries
  .map((entry) => entry.operation)
  .filter((operation) => !accepted.has(operation)));

/**
 * ADR 0107 D4. Die Ressourcen hinter den zwei Sammelrufen, aus dem Home
 * gelesen statt danebengeschrieben.
 */
const homeSource = readFileSync(join(repoRoot, 'apps', 'core', 'src', 'app.ts'), 'utf8');
const servedResources = new Set();
for (const name of ['executeHomeAuthorityList', 'executeHomeAuthoritySubmit']) {
  const body = new RegExp(`function ${name}\\(([\\s\\S]*?)\\n  \\}`, 'u').exec(homeSource);
  if (body === null) {
    continue;
  }
  for (const found of body[1].matchAll(/case '(\w+)':/gu)) {
    servedResources.add(found[1]);
  }
}
const acceptedResources = new Set(entries
  .filter((entry) => wasAccepted(entry) && entry.resource !== undefined)
  .map((entry) => entry.resource));

/**
 * **Und der dritte Sammelruf, der bis heute für alles einstand** (Befund B66).
 *
 * `home.device.recovery.submit` verzweigt über `args.phase` in drei Stufen:
 * `prepare` liest den Kopf, `initiate` ersetzt den Geräte-Satz und startet das
 * Vetofenster, `complete` schliesst ab. Eine davon durchzubringen färbte den
 * Namen grün - und die eine, auf die es ankommt, ist nicht die harmloseste.
 *
 * Aus dem Home gelesen statt danebengeschrieben, wie die Ressourcen darüber.
 */
const servedPhases = new Set();
const recoveryCase = /case 'home\.device\.recovery\.submit':([\s\S]*?)\n        case '/u
  .exec(homeSource);
if (recoveryCase !== null) {
  for (const found of recoveryCase[1].matchAll(/args\.phase === '(\w+)'/gu)) {
    servedPhases.add(found[1]);
  }
}
const acceptedPhases = new Set(entries
  .filter((entry) => wasAccepted(entry) && entry.phase !== undefined)
  .map((entry) => entry.phase));
rmSync(workspace, { recursive: true, force: true });

if (lines.length === 0 && failed === undefined) {
  // Ein Lauf, der nichts mitgeschrieben hat, hat nicht gemessen, dass nichts
  // durchkommt - er hat nicht gemessen. Gesagt statt als Null gedruckt.
  console.error('The suite passed and the Home wrote down nothing at all, so this measured nothing. The trace is not reaching the Home; fix that before believing a number.');
  process.exit(1);
}

const unwalked = operations.filter((operation) => !accepted.has(operation));
console.log(`\n${accepted.size} of ${operations.length} operations were accepted by a running Home.`);

/**
 * Und die Aufloesungsstufe darunter, weil ein Sammelruf sonst fuer alles
 * buergt, was hinter ihm liegt (Befund B58).
 */
if (servedResources.size === 0) {
  console.log('No authority resource could be read from the Home, so nothing was measured one level down.');
} else {
  const unwalkedResources = [...servedResources].filter((resource) => !acceptedResources.has(resource));
  console.log(`${acceptedResources.size} of ${servedResources.size} authority resources behind `
    + '`home.authority.list` and `home.authority.submit` were accepted with an `ok`.');
  if (unwalkedResources.length > 0) {
    console.log('No resource of these was accepted in this run:');
    for (const resource of unwalkedResources.sort()) {
      console.log(`  ${resource}`);
    }
  }
}
if (servedPhases.size === 0) {
  console.log('No recovery phase could be read from the Home, so nothing was measured one level down there.');
} else {
  const unwalkedPhases = [...servedPhases].filter((phase) => !acceptedPhases.has(phase));
  console.log(`${acceptedPhases.size} of ${servedPhases.size} phases behind `
    + '`home.device.recovery.submit` were accepted.');
  if (unwalkedPhases.length > 0) {
    console.log('No walk in this run got past this phase:');
    for (const phase of unwalkedPhases.sort()) {
      console.log(`  ${phase}`);
    }
  }
}

/**
 * Jedes gesehene Ergebnis mit der Zählung daneben. Ein neues Erfolgswort des
 * Homes taucht hier als „refused" auf, statt die Zahl oben still zu senken.
 */
const seenOutcomes = new Map();
for (const entry of entries) {
  seenOutcomes.set(entry.outcome, (seenOutcomes.get(entry.outcome) ?? 0) + 1);
}
console.log('\nEvery outcome this run saw, and how it was counted:');
for (const [outcome, count] of [...seenOutcomes].sort((a, b) => b[1] - a[1])) {
  const reason = acceptingOutcomes.get(outcome);
  console.log(`  ${outcome} x${count} - ${reason === undefined ? 'refused' : `accepted (${reason})`}`);
}

if (refusedOnly.size > 0) {
  console.log(`\n${refusedOnly.size} reached it and were only ever refused: ${[...refusedOnly].join(', ')}`);
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
