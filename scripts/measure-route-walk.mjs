import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Welche Foundation-Routen ein laufendes Home je einem *anderen Prozess*
 * beantwortet hat - gemessen, nicht behauptet.
 *
 * **Der Zwilling von `measure-link-walk.mjs`, eine Fläche darüber**, und aus
 * demselben Anlass: `check-surface-classes` hält fest, dass jede bediente Route
 * einen Aufrufer hat, und das ist eine andere Aussage als die, dass ein Home
 * sie je angenommen hat. Am 2026-08-29 waren es 27 von 61 (Befund B43).
 *
 * **Welche Testmengen gefahren werden, ist abgeleitet und nicht gewaehlt**
 * (2026-09-02, Befund B54). Bis dahin standen hier zwei - Web und
 * Companion-Shell -, und die Zahl las sich wie „so viele der bedienten Routen
 * sind je begangen worden". Sie hiess in Wahrheit „so viele hat *diese Auswahl*
 * begangen". Der Vault-Daemon faehrt seine Zeremonien gegen ein echtes,
 * abgespaltetes Home und ruft dabei Routen, die hier als nie begangen
 * gemeldet wurden. Die Auswahl ist jetzt die Eigenschaft, die sie meinte: jede
 * Testmenge, die ein echtes Home startet.
 *
 * **Kein Tor**, und der Name sagt es: `measure-` statt `check-`. Es fährt zwei
 * Testmengen mit echten Prozessen, dauert Minuten, urteilt nicht und fasst eine
 * Datei im Bauverzeichnis an - `release:verify` ruft es nicht.
 *
 * **Die Mitschrift bleibt draussen aus dem Produkt.** Ein Home, das dauerhaft
 * notiert, wer wann welche Route geöffnet hat, führte ein Zugriffsprotokoll,
 * das niemand entschieden hat; ein Messwerkzeug ist kein Anlass, eines zu
 * schaffen. Der Haken wird hier eingesetzt und danach wieder entfernt, auch bei
 * Abbruch.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const builtApp = join(repoRoot, 'apps', 'core', 'dist', 'app.js');
const appSource = join(repoRoot, 'apps', 'core', 'src', 'app.ts');

/** Die Stelle, an der das Home seine Erweiterungen registriert. Genau einmal. */
const registerLine = '    await app.register(websocket);\n';

const traced = (tracePath) => registerLine
  + "    app.addHook('onResponse', async (request, reply) => {\n"
  + '        try {\n'
  + '            const url = request.routeOptions?.url ?? request.url;\n'
  + `            (await import('node:fs')).appendFileSync(${JSON.stringify(tracePath)}, `
  + "request.method + ' ' + url + ' ' + reply.statusCode + '\\n');\n"
  + '        } catch { }\n'
  + '    });\n';

/**
 * Jede Route, die das Home bedient - aus der Quelle gelesen und nicht getippt.
 * Eine Liste daneben wäre die zweite, die abweichen kann.
 */
function servedRoutes() {
  const source = readFileSync(appSource, 'utf8');
  return [...new Set(
    [...source.matchAll(/app\.(get|post|put|delete|patch)\('([^']+)'/gu)]
      .map(([, method, route]) => `${method.toUpperCase()} ${route}`),
  )];
}

const served = servedRoutes();
if (served.length === 0) {
  console.error(`Could not read a single served route from ${appSource}, so there is nothing to measure against.`);
  process.exit(1);
}

let source;
try {
  source = readFileSync(builtApp, 'utf8');
} catch {
  console.error(`${builtApp} is not there. Run \`pnpm build\` first: this measures the Home that runs, not the one that is written.`);
  process.exit(1);
}
if (!source.includes(registerLine)) {
  console.error('The line this measurement patches is not in the built Home. Rebuild, or fix this script against the current shape.');
  process.exit(1);
}

const workspace = mkdtempSync(join(tmpdir(), 'pico-route-walk-'));
const backup = join(workspace, 'app.js');
const tracePath = join(workspace, 'trace.txt');
copyFileSync(builtApp, backup);

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
  writeFileSync(builtApp, source.replace(registerLine, traced(tracePath)));
  writeFileSync(tracePath, '');
  process.stdout.write('Running every suite that starts a real Home, against one that writes down what it answers.\n');
  execFileSync('npx', [
    'pnpm@9.0.0',
    '--filter', '@pico/web',
    '--filter', '@pico/companion-shell',
    '--filter', '@pico/vault-daemon',
    'test',
  ], { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
} catch (error) {
  failed = String(error.stderr ?? '').slice(-800);
} finally {
  restore();
}

const lines = readFileSync(tracePath, 'utf8').split('\n').filter((line) => line !== '');
const answered = new Set();
const refusedOnly = new Set();
for (const line of lines) {
  const [method, route, status] = line.split(' ');
  const name = `${method} ${route}`;
  if (Number(status) < 400) {
    answered.add(name);
  } else {
    refusedOnly.add(name);
  }
}
for (const name of answered) {
  refusedOnly.delete(name);
}
rmSync(workspace, { recursive: true, force: true });

if (lines.length === 0 && failed === undefined) {
  console.error('The suites passed and the Home wrote down nothing at all, so this measured nothing. The trace is not reaching the Home; fix that before believing a number.');
  process.exit(1);
}

/**
 * `/ws` beantwortet keinen `onResponse` - ein Handschlag wird zur Verbindung
 * und nicht zu einer Antwort. Gesagt statt als Lücke gezählt.
 */
const invisible = new Set(['GET /ws']);
const unanswered = served.filter((route) => !answered.has(route) && !invisible.has(route));

/**
 * Gezählt wird der Schnitt, nicht die Mitschrift.
 *
 * Das Home beantwortet auch, was nicht in `app.ts` steht - `/health` etwa
 * kommt aus einem Plugin -, und eine Zahl, die das mitzählte, sagte „so viele
 * der bedienten" über etwas anderes. Was ausserhalb liegt, wird daneben
 * genannt statt in die Quote gerechnet.
 */
const servedSet = new Set(served);
const answeredServed = [...answered].filter((route) => servedSet.has(route));
const answeredElsewhere = [...answered].filter((route) => !servedSet.has(route));
console.log(`\n${answeredServed.length} of ${served.length} served routes answered another process with a success.`);
if (answeredElsewhere.length > 0) {
  console.log(`${answeredElsewhere.length} more came from outside \`app.ts\`: ${answeredElsewhere.sort().join(', ')}`);
}
if (refusedOnly.size > 0) {
  console.log(`${refusedOnly.size} were reached and only ever refused: ${[...refusedOnly].sort().join(', ')}`);
}
console.log(`\n${unanswered.length} did not, and \`check-surface-classes\` says which of them are argued:`);
for (const route of unanswered.sort()) {
  console.log(`  ${route}`);
}
console.log('\nRoadmap.md findings B43 and B44 hold the last count and what it meant.');
if (failed !== undefined) {
  console.log('\nA suite did not pass, so this run measured less than a green one would:');
  console.log(failed);
  process.exit(1);
}
