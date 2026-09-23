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
    /**
     * **Jede Zitierform, nicht nur die einfache** (2026-08-22 nachgeschärft).
     *
     * Der erste Entwurf suchte `'[^']*passphrase` und war damit blind für
     * genau zwei Zeilen, die jeder schreiben würde: ein Template-Literal und
     * doppelte Anführungszeichen. Beide gepflanzt, beide durchgegangen - ein
     * Gate, das weniger bewacht als es behauptet, und zwar meines, einen Tag
     * alt.
     *
     * Geprüft werden deshalb die **Zeichenketten** im Titelausdruck, nicht der
     * Ausdruck selbst. Das ist auch der Grund, warum `title: prompt.title`
     * durchgeht und soll: dort steht ein Verweis auf etwas, das den Satz schon
     * besitzt, und keine zweite Fassung davon.
     */
    const literals = [...value.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)]
      .map((found) => found[1] ?? found[2] ?? found[3] ?? '');
    if (literals.some((literal) => /passphrase/i.test(literal))) {
      titles += 1;
      failures.push(
        `${shown}:${index + 1}: fragt selbst nach einer Passphrase - `
        + 'der Satz gehört in picoCompanionVaultPassphrasePrompt');
    }
  }
}

/**
 * Regel 2: was die Android-Fläche noch selbst sagen darf.
 *
 * **Am 2026-08-22 nachgeschärft, nachdem zwei Pflanzungen durchgingen.** Der
 * erste Entwurf las `case "..."` in genau zwei Methoden. Eine `if`-Kette statt
 * eines `switch` schlüpfte durch - und meldete dabei "0 eigene Momente" und
 * trotzdem grün, was die schlimmere Hälfte ist: der Prüfer fand nichts zu
 * prüfen und nannte das Erfolg. Eine dritte Methode neben den beiden
 * schlüpfte ebenfalls durch.
 *
 * Also wird jetzt nicht nach einer Syntax gesucht, sondern nach der **Form
 * der Sache**: jede Methode, die einen `String step` entgegennimmt und einen
 * `String` zurückgibt, wählt Worte anhand eines Moments. Von denen darf es
 * nur die bekannten geben, und in ihnen nur die erlaubten Momente - egal ob
 * mit `switch`, `if` oder etwas Drittem geschrieben.
 *
 * **Was das nicht fängt**, damit die grüne Zeile gelesen wird, was sie
 * behauptet: einen Satz, der ohne Umweg über einen Schritt auf den Bildschirm
 * kommt. Der Startbildschirm der Activity ist so einer ("Add this phone to
 * your Home"), und die Statuszeilen sind es auch. Sie gehören der Fläche
 * absichtlich - eine Knopfbeschriftung ist kein Moment einer Zeremonie -, und
 * eine Regel, die sie einschlösse, bräuchte am ersten Tag zwölf begründete
 * Ausnahmen. Das wäre eine Schuldenliste im Gewand eines Prüfers.
 */
const activity = join(root,
  'tools/android-runtime-probe/apk/src/com/pico/a1probe/JoinActivity.java');
const java = readFileSync(activity, 'utf8');
/** Die Methoden, die Worte aus einem Schritt wählen dürfen. */
const wordChoosers = ['titleFor', 'bodyFor'];
let localSteps = 0;

const stepMethods = [...java.matchAll(
  /private static String (\w+)\(String step\) \{([\s\S]*?)\n  \}/g)];
for (const [, name] of stepMethods) {
  if (!wordChoosers.includes(name)) {
    failures.push(
      `JoinActivity.${name}: wählt Worte aus einem Schritt, steht aber nicht `
      + 'in der Liste der Methoden, die das dürfen');
  }
}
for (const [, name, body] of stepMethods) {
  if (!wordChoosers.includes(name)) {
    continue;
  }
  // Jedes Literal, das an einem Schrittnamen hängt - `case "x":` ebenso wie
  // `"x".equals(step)`. Die Syntax ist Geschmack, der Moment ist die Sache.
  for (const found of body.matchAll(/case "(\w+)":|"(\w+)"\.equals\(step\)/g)) {
    const step = found[1] ?? found[2];
    localSteps += 1;
    if (!localMoments.includes(step)) {
      failures.push(
        `JoinActivity.${name}: schreibt eigene Worte für "${step}", `
        + 'was nicht in der Liste erlaubter Momente steht');
    }
  }
}
/**
 * Und die Wachsamkeit gegen sich selbst: findet der Prüfer gar keinen Moment
 * mehr, ist das kein Erfolg, sondern ein Hinweis, dass er ins Leere greift.
 */
if (stepMethods.length > 0 && localSteps === 0) {
  failures.push(
    'JoinActivity: die Methoden, die Worte aus einem Schritt wählen, nennen '
    + 'keinen einzigen - so eine grüne Zeile hat schon einmal einen Umbau '
    + 'auf eine if-Kette verdeckt');
}

/**
 * Dritte Regel: ein öffentlicher Dienstgrund erreicht eine Person als Satz.
 *
 * `public-error.ts` verengt jeden Fehlschlag auf vier öffentliche Gründe, und
 * das ist richtig - eine Fehlermeldung aus einem Daemon ist kein Satz und kann
 * einen Pfad tragen. Beide Stellen, die das benutzten, setzten aber den
 * **Code** in den Text: "The local companion service could not start
 * (companion_profile_invalid)", daneben eine Anweisung, die für alle vier
 * dieselbe war. Der Code machte die Arbeit des Satzes (2026-08-24).
 *
 * Die Worte stehen jetzt in `picoCompanionServiceErrorBody`. Wer einen dieser
 * vier Gründe irgendwo sonst ausschreibt, baut die zweite Stimme wieder auf -
 * also darf nur der Erzeuger sie nennen und die eine Stelle, die sie in Sätze
 * übersetzt.
 */
let dashboardRefusals = 0;
let sharedRefusals = 0;

const serviceReasons = [
  'companion_profile_unavailable',
  'companion_profile_invalid',
  'pico_vault_unavailable',
  'companion_service_unavailable',
];
const reasonHomes = [
  'apps/companion-shell/src/public-error.ts',
  'apps/companion-shell/src/contract.ts',
];
/**
 * **Nur im Text, nicht im Wurf** - die erste Fassung dieser Regel suchte den
 * Code überall und meldete sofort `main.ts`, wo `companion_service_unavailable`
 * als *geworfener Fehler* über die IPC-Grenze steht. Ein Fehlerbezeichner darf
 * so heißen; niemand liest ihn. Geprüft wird der `body:` einer Präsentation,
 * denn dort steht, was eine Person sieht - und eine Prüfung, deren Fehlschläge
 * überwiegend falsch sind, bringt Leuten bei, sie zu überspringen.
 */
let reasonSpellings = 0;
let bodiesRead = 0;
for (const path of files) {
  const shown = relative(root, path);
  if (reasonHomes.includes(shown) || /\.test\.[cm]?ts$/.test(shown)) {
    continue;
  }
  const lines = readFileSync(path, 'utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*body:/.test(lines[index])) {
      continue;
    }
    let value = lines[index];
    let last = index;
    while (!/,\s*$/.test(value) && last + 1 < lines.length && last - index < 6) {
      last += 1;
      value += `\n${lines[last]}`;
    }
    index = last;
    bodiesRead += 1;
    for (const reason of serviceReasons) {
      if (!value.includes(reason)) {
        continue;
      }
      reasonSpellings += 1;
      failures.push(
        `${shown}: setzt den Dienstgrund "${reason}" in einen Text, den eine Person liest. `
        + 'Die Sätze dazu stehen in `picoCompanionServiceErrorBody`; ein Code auf dem '
        + 'Bildschirm ist die zweite Stimme, die dieser Prüfer sucht');
    }
  }
}
if (bodiesRead === 0) {
  failures.push(
    'one voice: kein einziger Präsentationstext gelesen, also lief diese Regel über nichts');
}
/** Auch hier gegen sich selbst: kein Grund gefunden heißt nicht sauber. */
{
  const producer = readFileSync(join(root, reasonHomes[0]), 'utf8');
  const missing = serviceReasons.filter((reason) => !producer.includes(reason));
  if (missing.length > 0) {
    failures.push(
      `${reasonHomes[0]}: nennt ${missing.join(', ')} nicht mehr, also prüft diese Regel `
      + 'gegen eine Liste, die es nicht mehr gibt');
  }
}

/**
 * **Zwei Flaechen, zwei Tabellen, eine Stimme** (Befund B191,
 * Nutzerentscheidung 12 vom 2026-09-22).
 *
 * Die Schale fasst ihre Ablehnungen seit jeher in Saetze; das Dashboard tat es
 * an vier Stellen und sonst gar nicht, also las eine Person
 * `invalid_memory_encryption_decision`. Die Entscheidung war, dem Dashboard
 * eine **eigene** Tabelle zu geben - Worte fuer eine Person sind keine
 * Pruefung, und ein Wertimport loest in einem blanken ES-Modul ohnehin nicht
 * auf.
 *
 * Genau dafuer gibt es diesen Pruefer: **eine zweite Tabelle ist erlaubt, eine
 * zweite Auskunft nicht.** Nennt eine Ablehnung beide Tabellen, muessen beide
 * dasselbe sagen - nicht Wort fuer Wort, aber sie duerfen sich nicht
 * widersprechen, und genau das ist hier pruefbar: derselbe Name, zwei Saetze,
 * und einer davon behauptet etwas anderes ueber die Schuld.
 *
 * Geprueft wird die Ueberschneidung, weil nur sie eine Aussage traegt: was nur
 * eine Flaeche kennt, kann nicht driften.
 */
{
  const shellTable = readFileSync(join(root, 'apps/companion-shell/src/contract.ts'), 'utf8');
  const dashboardPath = 'apps/web/src/api.ts';
  const dashboard = readFileSync(join(root, dashboardPath), 'utf8');
  const block = /picoDashboardRefusalSentences[^{]*\{([\s\S]*?)\n\}\);/u.exec(dashboard);
  if (block === null) {
    failures.push(
      `${dashboardPath}: keine Satztabelle gefunden, also lief diese Regel ueber nichts. `
      + 'Der Pruefer ohne Gegenstand ist kaputt und nicht zufrieden (B166)');
  } else {
    const names = [...block[1].matchAll(/^\s{2}([a-z][a-z0-9_]*):/gmu)].map(([, name]) => name);
    if (names.length === 0) {
      failures.push(`${dashboardPath}: die Satztabelle ist leer`);
    }
    dashboardRefusals = names.length;
    for (const name of names) {
      if (!shellTable.includes(`${name}:`)) {
        continue;
      }
      sharedRefusals += 1;
      /**
       * **Beide kennen ihn, also sagen beide dasselbe.** Nicht "sie
       * widersprechen sich nicht" - *dasselbe*. Das ist der Name dieses
       * Pruefers: eine zweite Tabelle ist erlaubt, eine zweite Stimme nicht.
       *
       * Die erste Fassung dieser Regel fragte nur, ob beide die Schuld gleich
       * zuweisen, und eine Pflanzung kam damit durch: "This device may not
       * read that space" gegen "Check what you typed" - zwei Auskuenfte, keine
       * davon nannte Pico, also fand die Regel nichts. Zwei Saetze fuer eine
       * Ablehnung sind die Drift, egal worin sie sich unterscheiden.
       */
      const sentenceOf = (text) => {
        const found = new RegExp(
          `(?:^|\\n)\\s{2,4}${name}:\\s*\\n?\\s*((?:'[^']*'\\s*(?:\\+\\s*)?)+),`,
          'u',
        ).exec(text);
        return found === null
          ? undefined
          : [...found[1].matchAll(/'([^']*)'/gu)].map(([, part]) => part).join('').trim();
      };
      const shellSentence = sentenceOf(shellTable);
      const dashboardSentence = sentenceOf(block[1]);
      if (shellSentence === undefined || dashboardSentence === undefined) {
        failures.push(
          `${name}: steht in beiden Tabellen und dieser Pruefer kann mindestens einen der `
          + 'beiden Saetze nicht lesen. Ein Vergleich, der seinen Gegenstand nicht findet, '
          + 'ist keiner (B166)');
      } else if (shellSentence !== dashboardSentence) {
        failures.push(
          `${name}: die Schale sagt "${shellSentence}" und das Dashboard "${dashboardSentence}". `
          + 'Zwei Flaechen, eine Ablehnung, zwei Saetze - eine Person, die beide sieht, '
          + 'bekommt zwei Auskuenfte');
      }
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
  + `(erlaubt: ${localMoments.join(', ')}), `
  + `${serviceReasons.length} Dienstgründe mit Satz statt Code in `
  + `${bodiesRead} Präsentationstexten (${reasonSpellings} fremde Nennungen), `
  + `${dashboardRefusals} Ablehnungen mit Satz im Dashboard, `
  + `${sharedRefusals} davon auch in der Schale und dort nicht widersprochen.\n`);
