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
 */
const elsewhere = [
  {
    where: 'packages/identity/src/index.ts',
    name: 'assertAsciiToken',
    same: true,
    why: 'Dasselbe Muster und dieselbe Grenze von 1024, aber in Zeichen statt in Bytes '
      + 'gemessen, und mit einem Grund als Parameter: sie sagt `invalid_delegation_id` und '
      + 'nennt damit das *Feld*, wo die Fassung im Protokoll `invalid_field_charset` sagt und '
      + 'den *Fehler* nennt. Keine der beiden ist die bessere, und welche gilt, ist eine '
      + 'Entscheidung ueber Ablehnungsnamen auf dem Signierweg - Befund B51.',
  },
  {
    where: 'packages/identity/src/index.ts',
    name: 'fixedHexBytes',
    same: true,
    why: 'Zeichen fuer Zeichen dieselbe Regel, nur ohne den `typeof`-Schutz und mit dem '
      + 'Muster als Literal statt als Konstante. Haengt an derselben Entscheidung wie die '
      + 'Zeile darueber (B51).',
  },
  {
    where: 'apps/companion/src/profile.ts',
    name: 'assertAsciiToken',
    same: true,
    why: 'Dieselbe Regel mit einem Grund als Parameter, wie im Identitaetspaket (B51).',
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
    name: 'canonicalHexPattern',
    same: true,
    why: 'Dasselbe Muster, ein zweites Mal geschrieben. Der Vault haengt am Protokoll und '
      + 'koennte es holen (B51).',
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
  + `the same rule written twice and awaiting the decision in finding B51, ${carriedNameOnly} `
  + `the same name over a different rule; ${files.length} TypeScript sources read).`,
);
