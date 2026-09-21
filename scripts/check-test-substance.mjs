import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankStringsAndComments, braceSpan, callSpan } from './source-spans.mjs';
import { picoRepoRoot } from './operated-surfaces.mjs';

/**
 * Ein Test ohne Behauptung laeuft und beweist nichts.
 *
 * **Der Anlass** (2026-09-09, Befund B108). Befund B107 hat gefragt, welche
 * *Regel* ueberhaupt einen Gegenstand hat, und eine gefunden, die seit ihrem
 * ersten Tag nichts las. Dieselbe Frage gehoert an die 2.788 Tests dieses
 * Baums: ein `it`, das seinen Gegenstand aufruft und nichts behauptet, ist
 * gruen, solange der Aufruf nicht wirft - und gruen ist genau das, was
 * niemand nachliest.
 *
 * **Vier Eigenschaften, alle vier beim Messen schon wahr**, und keine hielt
 * etwas:
 *
 * 1. **Jeder Test behauptet etwas** - selbst oder durch einen Helfer, der es
 *    tut. 2.796 Faelle, keiner stumm.
 * 2. **Jede Behauptung hat einen Matcher.** `expect(x)` allein ist eine Zeile,
 *    die nichts prueft und wie eine Pruefung aussieht. 8.822 Stueck, keine
 *    nackt.
 * 3. **Kein `.only`, kein `.skip`, kein `.todo`.** Ein einziges `it.only`
 *    schaltet *alle uebrigen Tests derselben Datei ab*, und der Lauf meldet
 *    weiter gruen - ein gruener Lauf, der fast nichts gefahren hat.
 * 4. **Keine Testdatei ohne einen Test.** Eine Datei, die nur noch Aufbau
 *    enthaelt, zaehlt im Bericht mit und prueft nichts.
 *
 * **Die Helfer sind abgeleitet und nicht gelistet**: eine Funktion, in deren
 * *eigenem* Rumpf `expect(` steht - Rumpf heisst hier bis zur schliessenden
 * geschweiften Klammer, nicht bis zu einer Zeilenzahl (die Lehre aus B105 und
 * B106). Neununddreissig sind es heute; ohne sie meldete diese Pruefung 57
 * falsche Treffer, weil `expectAppearanceError(...)` fuer sie keine Behauptung
 * waere.
 *
 * **Und `it.each(table)(name, fn)`**: die Behauptungen stehen im *zweiten*
 * Aufruf der Kette. Wer nur den ersten liest, findet eine Tabelle und keine
 * Behauptung und meldet sie als stumm - auch das waren falsche Treffer beim
 * ersten Messen.
 *
 * **`pattern.test(x)` ist kein Testfall.** Ein `\b` vor `test` steht auch
 * hinter einem Punkt, also meldete der erste Anlauf neun Methodenaufrufe an
 * regulaeren Ausdruecken als Tests ohne Behauptung - in Dateien, die je ein
 * halbes Dutzend `expect` tragen. Alle neun standen in der Liste, keine war
 * echt.
 */
const errors = [];
let temporaryRootMakers = 0;
const tracked = execSync('git ls-files "*.ts"', { cwd: picoRepoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line !== '');
const sources = new Map(tracked.map((path) => [path, readFileSync(join(picoRepoRoot, path), 'utf8')]));

/**
 * Welche Dateien der **Laeufer** als Tests fuehrt - nicht, welche Endung
 * dieser Pruefer sich ausgedacht hat.
 *
 * **Der Anlass** (2026-09-21, Befund B242). Hier stand
 * `path.endsWith('.test.ts')`. Vitest laeuft ohne eigene Konfiguration und
 * nimmt darum sein Standardmuster `**\/*.{test,spec}.?(c|m)[jt]s?(x)` - das
 * sind vier Dateien mehr, als hier geprueft wurden: die `.test.mjs` unter
 * `apps/companion-shell/scripts/`. Der Lauf fuehrt sie aus, dieses Tor sah sie
 * nie. Ein eingechecktes `.only` darin haette jeden anderen Fall derselben
 * Datei stillgelegt, und der Bericht waere gruen geblieben.
 *
 * Gemessen waren es 267 gegen 271. Keine der vier war schmutzig - der Defekt
 * war der blinde Fleck, nicht sein Inhalt.
 *
 * Deshalb steht hier jetzt das Muster des Laeufers und nicht eine Endung. Es
 * ist eine Abschrift, und eine Abschrift darf nicht still veralten: faellt
 * unten die Annahme weg, dass niemand `include` setzt, schlaegt dieser Pruefer
 * an, statt weiter ueber der falschen Menge gruen zu sein.
 */
const runnerTestFile = /\.(?:test|spec)\.(?:c|m)?[jt]sx?$/u;
const allTracked = execSync('git ls-files', { cwd: picoRepoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line !== '');
const testFiles = allTracked.filter((path) => runnerTestFile.test(path));
for (const path of testFiles) {
  if (!sources.has(path)) {
    sources.set(path, readFileSync(join(picoRepoRoot, path), 'utf8'));
  }
}

/**
 * Die Annahme, auf der das Muster oben steht: dieses Repository konfiguriert
 * dem Laeufer keine eigene Dateimenge. Setzte jemand ein `include`, waere die
 * Abschrift falsch, ohne dass irgendetwas anschluege - und genau das ist der
 * Fehler, den dieser Befund behebt, einmal hoeher gelegt.
 */
const runnerConfigs = allTracked.filter(
  (path) => /(?:^|\/)vitest(?:\.\w+)?\.config\.[cm]?[jt]s$/u.test(path)
    || /(?:^|\/)vitest\.workspace\.[cm]?[jt]s$/u.test(path),
);
for (const path of runnerConfigs) {
  if (/\binclude\s*:/u.test(readFileSync(join(picoRepoRoot, path), 'utf8'))) {
    errors.push(
      `${path} sets \`include\` for the test runner, and this check mirrors the runner's `
      + 'default pattern instead. One of the two is now wrong about which files are tests, '
      + 'and a file this check never reads is a file whose discipline nobody holds.',
    );
  }
}

const helpers = new Set();
/**
 * Auch ueber die Testdateien des Laeufers, nicht nur ueber `*.ts`: ein
 * behauptender Helfer in einer `.test.mjs` waere sonst unbekannt, und die
 * Faelle, die ihn rufen, wuerden als behauptungslos gemeldet (Befund B242).
 */
for (const path of [...new Set([...tracked, ...testFiles])]) {
  const flat = blankStringsAndComments(sources.get(path), path);
  for (const declaration of flat.matchAll(
    /(?:function\s+([A-Za-z_$][\w$]*)\s*\(|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\()/gu,
  )) {
    const span = braceSpan(flat, declaration.index);
    if (span === null) {
      continue;
    }
    if (/\bexpect\s*\(/u.test(flat.slice(span[0], span[1]))) {
      helpers.add(declaration[1] ?? declaration[2]);
    }
  }
}
const helperNames = [...helpers].filter((name) => !/^(?:it|test|describe)$/u.test(name));
const asserts = new RegExp(
  '\\bexpect\\s*\\(|\\bassert\\w*\\s*\\(|\\.rejects\\b|\\.resolves\\b'
  + (helperNames.length === 0 ? '' : `|\\b(?:${helperNames.join('|')})\\s*\\(`),
  'u',
);

/**
 * **Der Leser prueft sich selbst, und die Probe wohnt bei ihm** (Befunde B108,
 * B109). Nach dem Ausblenden muessen die Klammern einer Datei aufgehen; tut
 * sie es nicht, hat der Ausblender etwas falsch gelesen, und *jede* Spanne
 * daraus ist unzuverlaessig. Genau so ist der Fehler gefunden worden, der die
 * Probe veranlasst hat: ein regulaerer Ausdruck wie
 * `/<section id="admin-section"[^>]*\shidden/` traegt zwei
 * Anfuehrungszeichen, und der Ausblender hielt sie fuer eine Zeichenkette.
 * Vier von 511 Dateien gingen nicht auf; acht Testfaelle und sechsundzwanzig
 * Behauptungen waren dadurch unsichtbar.
 *
 * Die Probe stand einen Tag lang *hier* - und drei andere Pruefer benutzten
 * denselben Leser ohne sie. Seit B109 steht sie in `source-spans.mjs` selbst,
 * also kann sie kein Aufrufer vergessen. Diese Schleife blendet die 511
 * Quellen aus, damit die Probe ueber alle laeuft und die Zahl im Bericht
 * steht.
 */
let balanced = 0;
for (const path of tracked) {
  blankStringsAndComments(sources.get(path), path);
  balanced += 1;
}

let cases = 0;
let assertions = 0;
for (const path of testFiles) {
  const source = sources.get(path);
  const flat = blankStringsAndComments(source, path);

  for (const marked of flat.matchAll(/(?<![.\w$])(?:it|test|describe)\.(only|skip|todo)\b/gu)) {
    errors.push(
      `${path}:${source.slice(0, marked.index).split('\n').length}: \`.${marked[1]}\` is `
      + 'committed. `.only` switches off every other test in the file and the run still '
      + 'reports green; `.skip` and `.todo` are a test that is counted and not run.',
    );
  }

  let inFile = 0;
  for (const call of flat.matchAll(/(?<![.\w$])(?:it|test)(\.\w+)?\s*\(/gu)) {
    let span = callSpan(flat, call.index + call[0].length - 1);
    if (span === null) {
      continue;
    }
    // `it.each(table)(name, fn)`: die Behauptungen stehen im zweiten Aufruf.
    while (flat[span[1]] === '(') {
      const next = callSpan(flat, span[1]);
      if (next === null) {
        break;
      }
      span = next;
    }
    cases += 1;
    inFile += 1;
    if (asserts.test(flat.slice(span[0], span[1]))) {
      continue;
    }
    const title = /^(?:it|test)(?:\.\w+)?\s*\(\s*(['"`])([^'"`]*)\1/u
      .exec(source.slice(call.index, call.index + 200));
    errors.push(
      `${path}:${source.slice(0, call.index).split('\n').length}: the test `
      + `${title === null ? '' : `\`${title[2]}\` `}asserts nothing. It runs its subject and `
      + 'passes as long as nothing throws, which is a green line that proves no property.',
    );
  }
  if (inFile === 0) {
    errors.push(
      `${path}: is named as a test file and holds no test. It is counted in the report and `
      + 'checks nothing.',
    );
  }

  for (const call of flat.matchAll(/\bexpect\s*\(/gu)) {
    const span = callSpan(flat, call.index + 'expect'.length);
    if (span === null) {
      continue;
    }
    assertions += 1;
    if (/^\s*\./u.test(flat.slice(span[1], span[1] + 30))) {
      continue;
    }
    errors.push(
      `${path}:${source.slice(0, call.index).split('\n').length}: \`expect(...)\` carries no `
      + 'matcher. It reads like a check and asserts nothing at all.',
    );
  }
}

if (testFiles.length === 0 || cases === 0 || assertions === 0 || helperNames.length === 0
  || balanced === 0) {
  console.error(
    'Test-substance check failed: no test file, no test case, no assertion or no asserting '
    + 'helper was read, so this check passed over nothing.',
  );
  process.exit(1);
}

/**
 * **Wer ein Temp-Verzeichnis anlegt, raeumt es weg** (Befund B172, 2026-09-14).
 *
 * Aufgefallen ist das nicht am Code, sondern an der Maschine: **2.304
 * liegengebliebene `pico-host-options-*`** in einem `/tmp`, das auf dieser
 * Maschine im Arbeitsspeicher liegt. Eine einzige Testdatei von 123 legte
 * Verzeichnisse an und entfernte keines - gemessen: ein Lauf liess **18**
 * zurueck, die 2.304 entsprechen also rund 128 Laeufen.
 *
 * Die Regel ist grob mit Absicht: sie fragt, ob die Datei ueberhaupt ein
 * Entfernen *nennt*, nicht ob es jeden Pfad trifft. Das ist dieselbe Staerke
 * wie bei den Nachbarn hier - sie faengt das Fehlen, nicht die Schlaefrigkeit -
 * und genau dieses Fehlen war der Fall.
 */
for (const path of testFiles) {
  const text = sources.get(path);
  if (!text.includes('mkdtempSync(') && !text.includes('mkdtemp(')) {
    continue;
  }
  temporaryRootMakers += 1;
  if (/\brmSync\(|\brm\(|rimraf/u.test(text)) {
    continue;
  }
  errors.push(
    `${path} creates a temporary directory and never removes one. On a `
    + 'machine whose `/tmp` is memory this accumulates run by run until somebody notices the '
    + 'machine rather than the code.',
  );
}

if (errors.length > 0) {
  console.error('Test-substance check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Test-substance check passed (${testFiles.length} test files, ${cases} cases, each asserting `
  + `something itself or through one of ${helperNames.length} derived helpers; ${assertions} `
  + 'assertions, each with a matcher; no committed `.only`, `.skip` or `.todo`; '
  + `${balanced} sources whose brackets still balance once strings and comments are blanked; `
  + `${temporaryRootMakers} test files make a temporary directory and every one removes it).`,
);
