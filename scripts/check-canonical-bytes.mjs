import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wie ein Feld zu unterschreibenden Bytes wird, steht im Protokoll einmal -
 * und was ausserhalb noch einmal dasteht, steht namentlich hier.
 *
 * **Der Anlass** (2026-09-01, gemessen statt vermutet, Befund B50). Die Regeln
 * standen zweimal im Protokollpaket, das Zeichenmuster dreimal. Beide
 * Fassungen wurden gegeneinander gemessen, neunzehn Proben:
 *
 * - Die **Bytes** waren nie verschieden.
 * - **Vier von neunzehn Ablehnungen** waren verschieden: `''` hiess dort
 *   `empty_field` und hier `invalid_field_charset`, zu lang hiess dort
 *   `field_too_long` und hier wieder `invalid_field_charset`.
 * - Und die Einigkeit ueber die Bytes hing an einer dritten Tatsache: die eine
 *   Fassung mass die Laenge in Bytes, die andere in Zeichen, und beide Zahlen
 *   sind nur dieselbe, solange das Zeichenmuster ASCII bleibt.
 *
 * Kein Test sah das. Sechshundertdreizehn Pruefungen des Pakets liefen gruen
 * ueber beide Fassungen, weil keine je die Ablehnung festhielt.
 *
 * **Zwei Aussagen, und die zweite ist die unbequeme.**
 *
 * 1. Im Protokollpaket hat jede dieser Regeln genau eine Fassung, und die
 *    steht in `canonical-bytes.ts`.
 * 2. Ausserhalb stehen weitere Fassungen. Sie werden **gezaehlt und genannt**,
 *    nicht stillschweigend erlaubt: die Liste unten ist der Bestand vom
 *    2026-09-01 mit dem, was die Messung ueber jede einzelne ergab. Kommt eine
 *    hinzu, die nicht darin steht, schlaegt diese Pruefung an. Verschwindet
 *    eine, ebenfalls - eine Bestandsliste, die den Baum nicht mehr trifft,
 *    beschreibt einen Baum, den es nicht gibt.
 *
 * **Ein Name ist keine Regel**, und das ist der Grund fuer die Spalte `same`.
 * `asciiBytes` heisst im Vault und im Aussehen-Codec dasselbe und tut etwas
 * anderes: dort *ohne jede Pruefung* zu kodieren. Ein Tor, das beides in eine
 * Zahl wirft, erzeugt Rauschen, und Rauschen ist, wie ein Tor ueberlesen wird.
 *
 * **Was diese Pruefung nicht kann.** Sie liest Definitionen am Zeilenanfang -
 * `const`, `let`, `function`, mit oder ohne `export`. Eine Regel, die unter
 * einem anderen Namen noch einmal geschrieben wird, ginge an ihr vorbei; das
 * faengt kein Textleser, und deshalb steht es hier statt in einem Kommentar
 * ueber die Absicht.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const home = 'packages/protocol/src/canonical-bytes.ts';
const errors = [];

/** Die Regeln, die im Protokollpaket genau eine Fassung haben duerfen. */
const singleTruths = [
  /**
   * Befund B124. Dreizehn Funktionen dieses Namens standen im Paket; neun
   * waren dieselbe Regel und sind jetzt eine. Die anderen vier heissen nur so
   * und stehen unten als *dieselbe Bezeichnung ueber einer anderen Regel* -
   * dieselbe Spalte `same: false`, aus der dieser Pruefer schon lebt.
   */
  'assertExactKeys',
  /**
   * Befund B125. Acht Fassungen in drei Schreibweisen, ausgefuehrt alle
   * gleich - und `padStart(2, '0')` zu vergessen faellt nicht auf, weil die
   * Zeichenkette Hex bleibt und nur kuerzer wird.
   */
  'bytesToHex',
  /**
   * Befund B138. Acht Fassungen, sieben Ruempfe - und Befund B125 hatte sie
   * angesehen und mit *„die Pruefungen unterscheiden sich wirklich"* stehen
   * lassen. Ausgefuehrt ueber neun Eingaben urteilen die drei pruefenden
   * Fassungen ueber jede gleich; verschieden war nur der Name der Ablehnung.
   * Die fuenf ungepruefteren unterschieden sich dagegen voneinander: aus
   * `'zzzz'` machte die eine nichts und die andere zwei Nullbytes.
   */
  'hexToBytes',
  /**
   * Befund B136. Acht Fassungen, vier Ruempfe, drei Schreibweisen - und die
   * Regel stand eine Datei weiter schon exportiert: `assertExactKeys` darunter
   * *ist* diese Funktion plus ein Wurf. Sieben der acht stimmten ueber alle
   * gemessenen Eingaben ueberein; die achte fragte `in` statt die
   * Schluesselmengen zu vergleichen und hielt damit jeden Namen fuer
   * vorhanden, der auf `Object.prototype` lebt.
   */
  'hasExactKeys',
  'canonicalTextEncoder',
  'canonicalAsciiTokenPattern',
  'canonicalHexPattern',
  'concatCanonicalElements',
  'assertAsciiToken',
  'asciiBytes',
  'fixedHexBytes',
];

/**
 * Der Bestand ausserhalb des Protokollpakets, am 2026-09-01 gemessen.
 *
 * `same: true` heisst: dieselbe Regel, ein zweites Mal geschrieben - das, was
 * driftet. `same: false` heisst: derselbe Name ueber etwas anderem.
 *
 * **Am 2026-09-02 sind die vier `same: true` verschwunden** (Befund B51, vom
 * Nutzer entschieden): Identitaetspaket, Companion-Profil und Vault holen die
 * Regel jetzt aus `canonical-bytes.ts`. Uebrig sind die drei, die nur den
 * Namen teilen - und die bleiben, weil sie etwas anderes tun.
 */
const elsewhere = [
  {
    where: 'packages/appearance/src/test-fixtures.ts',
    name: 'hexToBytes',
    same: false,
    why: 'Andere Regel unter demselben Namen, und sie bleibt dort mit Absicht (Befund B138): '
      + 'eine Paarschleife ohne jede Pruefung, die aus `zzzz` zwei Nullbytes macht. Sie steht '
      + 'in einer Testvorrichtung, und `packages/appearance` hat als einziges Paket dieses '
      + 'Baums ueberhaupt keine Abhaengigkeit - eine dafuer anzulegen waere eine Aenderung an '
      + 'der Paketgrenze und keine Aufraeumarbeit. Was sie liest, sind Fixtures aus demselben '
      + 'Paket.',
  },
  {
    where: 'apps/core/src/event-store.ts',
    name: 'assertAsciiToken',
    same: false,
    why: 'Andere Regel unter demselben Namen: die Grenze ist 256 und nicht 1024, und die '
      + 'Meldung ist ein Satz fuer einen Betreiber statt ein Ablehnungsname. Sie prueft '
      + 'Konfigurationswerte des Homes und nicht, was unterschrieben wird.',
  },
  {
    where: 'packages/vault/src/index.ts',
    name: 'asciiBytes',
    same: false,
    why: 'Derselbe Name ueber etwas anderem: sie kodiert *ohne jede Pruefung*. Eine '
      + 'Zusammenlegung wuerde dem Vault eine Pruefung geben, die er heute nicht hat - das '
      + 'ist eine Aenderung am Signierweg und keine Aufraeumarbeit.',
  },
  {
    where: 'apps/companion/src/profile.ts',
    name: 'assertExactKeys',
    same: false,
    why: 'Andere Regel unter demselben Namen (Befund B124): sie nimmt `unknown`, prueft erst, '
      + 'dass ueberhaupt ein Objekt da ist, *gibt den Datensatz zurueck* und wirft zwei '
      + 'verschiedene Meldungen mit dem Namen des Feldes darin. Das ist ein Parser fuer eine '
      + 'Profildatei und keine Pruefung vor dem Signieren.',
  },
  {
    where: 'packages/vault/src/index.ts',
    name: 'assertExactKeys',
    same: false,
    why: 'Andere Regel unter demselben Namen (Befund B124): sie unterscheidet `unexpected_field` '
      + 'von `missing_field`. Wer sie zusammenlegte, naehme dem Vault die Unterscheidung, '
      + 'welche der beiden Haelften fehlt.',
  },
  {
    where: 'packages/appearance/src/test-fixtures.ts',
    name: 'bytesToHex',
    same: true,
    why: 'Dieselbe Regel, und sie bleibt (Befund B125): `@pico/appearance` hat mit Absicht '
      + 'keine Abhaengigkeit, auch nicht auf das Protokoll. Dieselbe Grenze, die die '
      + '`asciiBytes` daneben stehen laesst.',
  },
  {
    where: 'packages/appearance/src/appearance-document-v1-codec.ts',
    name: 'asciiBytes',
    same: false,
    why: 'Derselbe Name ueber etwas anderem (eine Schleife ueber `charCodeAt`, ohne '
      + 'Pruefung) - und `@pico/appearance` hat mit Absicht *keine* Abhaengigkeit, auch '
      + 'nicht auf das Protokoll. Diese Kopie darf bleiben, solange diese Grenze gilt.',
  },
];

function sourceFiles(root) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      found.push(path);
    }
  }
  return found;
}

const roots = [];
for (const group of ['apps', 'packages', 'modules']) {
  for (const entry of readdirSync(join(repoRoot, group), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      roots.push(join(repoRoot, group, entry.name, 'src'));
    }
  }
}

const files = roots.flatMap((root) => sourceFiles(root));
if (files.length === 0) {
  errors.push(
    'scripts/check-canonical-bytes.mjs found no TypeScript source at all, so it compared '
    + 'nothing. A reader that finds no subject is broken, not clean.',
  );
}

/** Where each name is defined, as `{ file, line }`. */
const definitions = new Map(singleTruths.map((name) => [name, []]));

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  const where = relative(repoRoot, path);
  for (const [index, line] of source.split('\n').entries()) {
    for (const name of singleTruths) {
      if (new RegExp(String.raw`^(?:export\s+)?(?:const|let|function)\s+${name}\b`, 'u').test(line)) {
        definitions.get(name).push({ file: where, line: index + 1 });
      }
    }
  }
}

const seen = new Set();
let carriedSame = 0;
let carriedNameOnly = 0;

for (const name of singleTruths) {
  const found = definitions.get(name);
  const inProtocol = found.filter((place) => place.file.startsWith('packages/protocol/'));
  const outside = found.filter((place) => !place.file.startsWith('packages/protocol/'));

  if (inProtocol.length === 0) {
    errors.push(
      `${name} is named here as a rule with exactly one version inside the protocol package, `
      + 'and there is none. Either it was renamed and this file describes a tree that no '
      + `longer exists, or ${home} lost it.`,
    );
  } else if (inProtocol.length > 1 || !inProtocol[0].file.startsWith(home)) {
    errors.push(
      `${name} is defined ${inProtocol.length} times inside the protocol package `
      + `(${inProtocol.map((place) => `${place.file}:${place.line}`).join(', ')}). How a field `
      + `becomes bytes somebody signs belongs in ${home} and nowhere else in this package: on `
      + '2026-09-01 two copies of these rules produced the same bytes and four different '
      + 'refusals, and agreed on the bytes only because a third fact - the token pattern being '
      + 'ASCII-only - happened to hold in both. A truth written twice drifts, and the second '
      + 'version is the one nobody remembers when the first one changes.',
    );
  }

  for (const place of outside) {
    const carried = elsewhere.find(
      (entry) => entry.where === place.file && entry.name === name,
    );
    if (carried === undefined) {
      errors.push(
        `${place.file}:${place.line} defines ${name}, and the 2026-09-01 inventory in this `
        + 'file does not list it. A copy of a signing rule may exist outside the protocol '
        + 'package, but not unnamed: say whether it is the same rule written twice or the '
        + 'same name over something else, and why it stands.',
      );
      continue;
    }
    seen.add(`${carried.where}::${carried.name}`);
    if (carried.same) {
      carriedSame += 1;
    } else {
      carriedNameOnly += 1;
    }
  }
}

for (const entry of elsewhere) {
  if (!seen.has(`${entry.where}::${entry.name}`)) {
    errors.push(
      `The inventory lists ${entry.name} in ${entry.where}, and it is not there any more. `
      + 'Either the copy is gone and the entry should go with it, or this file is describing '
      + 'a tree that no longer exists.',
    );
  }
}

/**
 * Und eine zweite Regel, die keine Namen zaehlt, sondern eine Form (Befund
 * B137).
 *
 * Eine **Lebenslaufordnung** sagt, welcher von zwei Datensaetzen ueber
 * dasselbe spaeter kam, und sie wird zu unterschriebenen Bytes - also gehoert
 * sie in dieses Tor. Sie ist `seq:` und **genau sechzehn Ziffern**, und die
 * feste Breite ist die tragende Haelfte: jeder Vergleich darauf ist ein
 * Zeichenkettenvergleich. Eine kuerzere sortiert unter alles, eine laengere
 * nach ihrem ersten Zeichen.
 *
 * **Die Form stand am 2026-09-11 zwanzigmal im Baum.** Zehnmal als das Muster,
 * das eine zulaesst - viermal als `lifecycleOrderPattern` in drei
 * Schreibweisen, sechsmal als Literal -, und zehnmal als der Ausdruck, der
 * eine *baut*: `seq:` mit einem `padStart(16, '0')` daneben. Zwei Haelften
 * eines Formats, an zwanzig Orten getrennt gehalten, und die zweite ist die,
 * die jemand vergisst - genau wie `padStart(2, '0')` beim Hex in Befund B125.
 *
 * Erkannt wird die Form und nicht der Name, weil der Name das war, was die
 * Zaehlung sah: vier `assertLifecycleOrder`. Die uebrigen sechzehn hiessen
 * anders oder gar nichts.
 */
/**
 * Und eine dritte Regel derselben Art: so viele Bytes als Hex (Befund B140).
 *
 * **Dreiundfuenfzig Stellen am 2026-09-11**, gemessen in B139: einunddreissig
 * fuer zweiunddreissig Bytes, sechzehn fuer vierundsechzig, fuenf fuer
 * sechzehn, eine fuer zwanzig. Der Namenszaehler sah davon fast nichts, weil
 * die meisten Stellen mitten in einer Bedingung stehen und gar keinen Namen
 * tragen.
 *
 * **Was hier gehalten wird, ist die Form und nicht der Begriff.** Dieselben
 * vierundsechzig Zeichen bewachen Fingerabdruecke, oeffentliche Schluessel,
 * Digests und einen Zweig der Git-Commit-Form; dieselben zweiunddreissig
 * bewachen eine Postfachadresse, einen Pakettag, ein Betreiberkreditiv und ein
 * Relaiskonto. Jeder behaelt seinen Namen und seine Ablehnung - was er holt,
 * ist `isHexOfBytes` oder `hexOfBytesPattern`. Sie zusammenzuziehen waere die
 * Umkehrung von Befund B124.
 */
/**
 * Und die vierte Form: die kanonische Zeichenmenge mit einer Laengengrenze
 * (Befund B141).
 *
 * `canonicalAsciiTokenPattern` steht seit Langem in dieser Datei und traegt
 * **keine** Grenze - die prueft `assertAsciiToken` daneben, in Bytes. Wer das
 * Muster mit `{1,1024}` oder `{1,256}` hinschreibt, schreibt damit nicht eine
 * Kopie, sondern eine *zweite Regel*, die aussieht wie die erste: Zeichenmenge
 * und Grenze verschmolzen, und die Grenze in Zeichen statt in Bytes. Beide
 * Zahlen sind nur dieselbe, solange die Menge ASCII bleibt.
 *
 * Einundzwanzig solche Stellen standen am 2026-09-11 im Baum, und zwei davon
 * hatten das `+` aus der Menge verloren und nahmen `undefined` an. Jetzt gibt
 * es `isAsciiToken(wert, maxBytes)`.
 */
// Genau die kanonische Menge, nicht jede, die ihr aehnelt: `[A-Za-z0-9_.:-]`
// in `device-enrolment.ts` und `[A-Za-z0-9_-]` im Relais sind andere Regeln,
// und ein Tor, das sie mitmeldet, erzeugt Rauschen - der Fehler, den Befund
// B112 an einer mechanischen Regel schon einmal gemessen hat.
const tokenShape = /\/\^\[A-Za-z0-9\._:\/\+-\]\{\d+,\d+\}\$\//g;
const tokenHome = 'packages/protocol/src/canonical-bytes.ts';
let tokenFilesRead = 0;
for (const path of files) {
  const shown = relative(repoRoot, path).split('\\').join('/');
  if (shown === tokenHome || shown.endsWith('.test.ts')) {
    continue;
  }
  tokenFilesRead += 1;
  const source = readFileSync(path, 'utf8');
  for (const _ of source.matchAll(tokenShape)) {
    errors.push(
      `${shown}: writes the canonical token charset with a length bound by hand. `
      + '`isAsciiToken(value, maxBytes)` answers it. Written out here it is not a copy but a '
      + 'second rule wearing the first one\'s face: the charset and the bound fused, and the '
      + 'bound counted in characters where `assertAsciiToken` counts bytes.',
    );
  }
}

// Befund B142. Aus der Laengenregel ist eine Zeichenmengenregel geworden: wer
// `[0-9a-f]` in einem Muster hinschreibt, schreibt eine Hexregel, gleich in
// welcher Laenge und Gestalt. Sieben weitere Stellen kamen so heraus, die die
// Laengenregel nicht sah - drei `isCanonicalHex`, drei `(?:[0-9a-f]{2})+` und
// zwei mit zur Laufzeit gebauter Laenge.
const fixedHexShape = /\[0-9a-f\]/g;
const fixedHexHome = 'packages/protocol/src/canonical-bytes.ts';
const fixedHexAllowed = new Set([
  // `packages/appearance` hat als einziges Paket dieses Baums ueberhaupt keine
  // Abhaengigkeit; eine fuer ein Muster anzulegen waere eine Aenderung an der
  // Paketgrenze. Dieselbe Begruendung wie beim `hexToBytes` derselben Wurzel.
  'packages/appearance/src/official-generator-registry.ts',
  // Eine Farbe `#rrggbb`, mit `/i` und drei Fanggruppen. Dieselben Zeichen,
  // ein anderer Begriff: hier ist Hex eine Schreibweise fuer drei Kanaele und
  // keine Bytefolge, und Grossbuchstaben sind erlaubt. Eine Form ist kein
  // Begriff (Befund B140).
  'apps/vault-daemon/src/recovery-card-pdf.ts',
]);
let fixedHexFilesRead = 0;
for (const path of files) {
  const shown = relative(repoRoot, path).split('\\').join('/');
  if (shown === fixedHexHome || shown.endsWith('.test.ts') || fixedHexAllowed.has(shown)) {
    continue;
  }
  fixedHexFilesRead += 1;
  const source = readFileSync(path, 'utf8');
  for (const _ of source.matchAll(fixedHexShape)) {
    errors.push(
      `${shown}: writes the hex charset by hand. \`isHexOfBytes\` answers it and `
      + `\`hexOfBytesPattern\` builds the pattern, both in \`${fixedHexHome}\`. The concept keeps `
      + 'its own name and its own refusal - what it should not keep is its own copy of the '
      + 'characters.',
    );
  }
}
for (const allowed of fixedHexAllowed) {
  if (!files.some((path) => relative(repoRoot, path).split('\\').join('/') === allowed)) {
    errors.push(
      `${allowed} is argued as writing the fixed-length hex shape by hand, and this check does `
      + 'not read it. An exemption for a file that is gone describes a tree that does not exist.',
    );
  }
}

const lifecycleOrderHome = 'packages/protocol/src/lifecycle-order.ts';
const lifecycleOrderShapes = [
  [/seq:\(?\[0-9\]\{16\}\)?/g, 'the pattern that admits one'],
  [/seq:\(?\\d\{16\}\)?/g, 'the pattern that admits one'],
  [/`seq:\$\{/g, 'the expression that builds one'],
];
let lifecycleOrderSites = 0;
let lifecycleOrderFilesRead = 0;
let lifecycleOrderHomeFound = false;
for (const path of files) {
  const shown = relative(repoRoot, path).split('\\').join('/');
  if (shown === lifecycleOrderHome) {
    lifecycleOrderHomeFound = true;
    continue;
  }
  if (shown.endsWith('.test.ts')) {
    continue;
  }
  lifecycleOrderFilesRead += 1;
  const source = readFileSync(path, 'utf8');
  for (const [shape, what] of lifecycleOrderShapes) {
    for (const _ of source.matchAll(shape)) {
      lifecycleOrderSites += 1;
      errors.push(
        `${shown}: writes ${what} for a lifecycle order by hand. `
        + `\`${lifecycleOrderHome}\` carries both halves - the width that makes the string `
        + 'comparison work and the padding that produces it - and they are two halves of one '
        + 'format, so keeping them apart is how one of them gets forgotten.',
      );
    }
  }
}

// Ein Tor ohne Gegenstand ist kaputt und nicht sauber: verschwindet die Datei,
// die die Regel traegt, meldet diese Regel weiter null Fundstellen und meint
// damit etwas ganz anderes.
if (!lifecycleOrderHomeFound) {
  errors.push(
    `${lifecycleOrderHome} is not among the files this check reads, so the rule that nobody `
    + 'writes a lifecycle order by hand has no home to point at. Zero findings would then mean '
    + 'the shape is gone, not that it is kept in one place.',
  );
}

if (errors.length > 0) {
  console.error('Canonical-bytes check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Canonical-bytes check passed (${singleTruths.length} rules for turning a field into signed `
  + `bytes have exactly one definition each inside the protocol package, all of them in ${home}; `
  + `outside it ${carriedSame + carriedNameOnly} copies are named and dated - ${carriedSame} `
  + `the same rule written twice, ${carriedNameOnly} the same name over a different rule; `
  + `${files.length} TypeScript sources read; and the lifecycle-order shape - both the pattern that admits one and the expression that builds one - is written only in ${lifecycleOrderHome}, checked across ${lifecycleOrderFilesRead} of them; and hex of a fixed byte length only in ${fixedHexHome}, checked across ${fixedHexFilesRead} with ${fixedHexAllowed.size} argued exception; and the canonical token charset with a length bound only there too, checked across ${tokenFilesRead}).`,
);
