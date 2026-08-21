import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ein Moment, eine Stimme.
 *
 * ADR 0131 sagt, Android sei ein vollwertiger Client und keine Oberfläche.
 * Der Satz hat eine Folge, die man erst beim zweiten Client merkt: sobald
 * zwei Flächen dieselbe Zeremonie zeigen, muss jemand entscheiden, wem die
 * *Worte* gehören - und wenn niemand entscheidet, schreibt jede Fläche eigene.
 *
 * **Zweimal gemessen, zweimal gefunden** (2026-08-21). Erst die elf Schritte
 * des Beitritts: sie standen in `apps/companion-shell/src/contract.ts`, also
 * in der Electron-Schale, und das Telefon schrieb daneben fünf eigene. Dann
 * die Vault-Passphrase: **sechs Schreibweisen desselben Moments**, fünf davon
 * im Electron-Hauptprozess allein, und die sechste auf dem Telefon - die sich
 * obendrein von den elf Sätzen daneben unterschied, weil sie "phone" sagte,
 * wo alle anderen "device" sagen.
 *
 * Der zweite Befund ist der lehrreichere: die Drift brauchte gar keinen
 * zweiten Client. Ein Hauptprozess mit fünf Aufrufstellen genügte.
 *
 * Zwei Regeln, und beide sind Listen, weil eine Liste ein Reviewer lesen kann:
 *
 *  1. Ein Bildschirmtitel, der nach einer Passphrase fragt, entsteht nur in
 *     `apps/companion/src/vault-passphrase-prompt.ts`.
 *  2. Eine Fläche, die `PicoCompanionEnrolmentSurface` bedient, schreibt
 *     eigene Worte nur für Momente, die unten namentlich erlaubt sind.
 *
 * **Was er nicht bewacht**, damit niemand mehr hineinliest: Fließtext, der
 * eine Passphrase *erwähnt*, bleibt erlaubt - "Pico braucht die Passphrase,
 * die du gewählt hast" ist eine Erklärung und keine zweite Fassung der Frage.
 * Geprüft wird die **Frage**: ein Titel. Testdateien bleiben außen vor - eine
 * Fixture prüft den Mechanismus und erreicht keine Person. Und Regel 2 prüft die
 * Android-Activity, weil sie die einzige Fläche außerhalb des TypeScript-Baums
 * ist; eine dritte Fläche müsste hier eingetragen werden, und dass das
 * auffällt, ist der Zweck.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

/** Wo die Frage nach einer Passphrase gestellt werden darf. */
const promptHome = 'apps/companion/src/vault-passphrase-prompt.ts';

/**
 * Momente, für die eine Fläche eigene Worte behalten darf.
 *
 * `approval` steht hier, weil ADR 0106 den *Satz* liefert, den eine Person
 * unterschreibt - was die Fläche schreibt, ist nur die Frage darüber, und die
 * hat auf einem Telefon eine Schaltfläche und im Fenster keine.
 */
const localMoments = ['approval'];

const searched = ['apps', 'tools/android-runtime-probe'];
const failures = [];

const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (/\.(ts|cts|mts|mjs|java)$/.test(path)) {
      files.push(path);
    }
  }
};
for (const directory of searched) {
  walk(join(root, directory));
}

let titles = 0;
for (const path of files) {
  const shown = relative(root, path);
  // Tests bauen sich Aufforderungen, um den *Mechanismus* zu prüfen - eine
  // Fixture-Passphrase ist keine zweite Stimme, weil sie niemand liest.
  if (shown === promptHome || /\.test\.[cm]?ts$/.test(shown)) {
    continue;
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*title:/.test(lines[index])) {
      continue;
    }
    /**
     * Der **Wert** des Titels, nicht die Zeile danach.
     *
     * Der erste Entwurf hängte blind die Folgezeile an und meldete drei
     * Fehlalarme: dort stand `body:` mit einer Erklärung, in der das Wort
     * vorkommt. Ein Titel endet auf ein Komma; ein Ternär läuft weiter. Also
     * wird gesammelt, bis der Ausdruck fertig ist - und nicht eine Zeile
     * pauschal dazugenommen.
     */
    let value = lines[index];
    let last = index;
    while (!/,\s*$/.test(value) && last + 1 < lines.length && last - index < 4) {
      last += 1;
      value += `\n${lines[last]}`;
    }
    index = last;
    if (/'[^']*passphrase/i.test(value)) {
      titles += 1;
      failures.push(
        `${shown}:${index + 1}: fragt selbst nach einer Passphrase - `
        + 'der Satz gehört in picoCompanionVaultPassphrasePrompt');
    }
  }
}

/** Regel 2: was die Android-Fläche noch selbst sagen darf. */
const activity = join(root,
  'tools/android-runtime-probe/apk/src/com/pico/a1probe/JoinActivity.java');
const java = readFileSync(activity, 'utf8');
let localSteps = 0;
for (const name of ['titleFor', 'bodyFor']) {
  const body = java.match(
    new RegExp(`private static String ${name}\\(String step\\) \\{([\\s\\S]*?)\\n  \\}`));
  if (body === null) {
    // Verschwunden ist in Ordnung - dann schreibt die Fläche gar nichts mehr.
    continue;
  }
  for (const found of body[1].matchAll(/case "(\w+)":/g)) {
    localSteps += 1;
    if (!localMoments.includes(found[1])) {
      failures.push(
        `JoinActivity.${name}: schreibt eigene Worte für "${found[1]}", `
        + 'was nicht in der Liste erlaubter Momente steht');
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`  ${failure}\n`);
  }
  process.stderr.write(`\none voice: ${failures.length} zweite Stimme(n).\n`);
  process.exit(1);
}
process.stdout.write(
  `one voice: ${files.length} Dateien, ${titles} fremde Passphrase-Fragen, `
  + `${localSteps} eigene Momente der Android-Fläche `
  + `(erlaubt: ${localMoments.join(', ')}).\n`);
