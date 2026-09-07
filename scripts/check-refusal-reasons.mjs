import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Jede Ablehnung, die dieses Produkt aussprechen kann, ist einmal gegangen
 * worden.
 *
 * **Der Anlass** (2026-09-07, Befund B71). Die Frage war urspruenglich eine
 * andere: welche Ablehnungsgruende stehen in einem Typ und koennen gar nicht
 * entstehen? Antwort: **keiner** - alle 53 sind erzeugbar, und die vier, die
 * meine erste Messung nannte, waren Fehlalarme ihres eigenen Musters.
 *
 * Die zweite Haelfte derselben Messung war die interessante: **zwoelf Gruende
 * konnte ein laufendes Home zurueckgeben, und kein einziger Test nannte sie.**
 * Darunter drei Ablehnungen von `registerPicoIdentityReaderKey`, der Tuer, an
 * der ein Schluessel die Vollmacht bekommt, Reader-Custody zu oeffnen. Die
 * Probe darauf: die Bindung "der Schluessel ist der, den die Delegation nennt"
 * ausgebaut - 1.098 Tests blieben gruen, und nur der neu geschriebene fiel.
 * ADR 0083 existiert fuer genau diese Bindung.
 *
 * **Warum ein Tor und keine Liste im Kopf.** Ein Grund ohne Gang ist ein
 * Versprechen, das niemand geprueft hat; er sieht im Typ genauso aus wie einer,
 * der taeglich faellt. Der Unterschied ist von aussen nicht zu sehen, und
 * deshalb muss ihn etwas nachrechnen.
 *
 * **Was die zusammengesetzte Form kostet.** `recovery_${row.status}` erzeugt
 * vier Gruende, ohne einen davon hinzuschreiben; die Pruefung erkennt das an
 * seinem Praefix. Damit gilt *jeder* Grund, der mit `rotation_` anfaengt, als
 * erzeugbar - auch einer, den keine Vorlage je bildet. Nachgestellt: ein
 * erfundenes `rotation_impossible` faellt hier nicht als unerzeugbar auf,
 * sondern eine Regel weiter, weil kein Test es nennt. Das Tor beisst, sagt
 * aber den zweitbesten Satz.
 *
 * **Was diese Pruefung nicht kann, und das ist der Preis ihrer Einfachheit.**
 * Sie fragt, ob das Wort in irgendeiner `*.test.ts` vorkommt - nicht, ob ein
 * Test es *erwartet*. Ein Wort in einem Kommentar genuegt ihr. Sie hat damit
 * dieselbe Staerke wie `check-capability-reach.mjs`, die nach einem Aufrufer
 * fragt und nicht nach einem guten: sie faengt das Fehlen, nicht die
 * Schlaefrigkeit. Das steht hier, weil ein Tor, das mehr zu versprechen
 * scheint, als es haelt, schlimmer ist als keines.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/**
 * Gruende, die ein laufendes Produkt aussprechen kann und die noch niemand
 * gegangen ist - mit dem, was ein Gang dafuer braucht. Kein "spaeter": jeder
 * Eintrag sagt, woran es haengt.
 *
 * Und eine Regel dazu, die sich gegen diese Liste selbst richtet: steht ein
 * Grund hier *und* nennt ihn ein Test, ist das ein Fehler. Eine Liste, die
 * Bezahltes fuehrt, glaubt bald niemand mehr, und dann verdeckt sie das
 * Unbezahlte daneben.
 */
const notYetWalked = new Map([
  // Leer, und das ist ein Zustand und kein Zufall: am 2026-09-07 standen hier
  // vier Gruende, und alle vier sind am selben Tag gegangen worden. Was hier
  // steht, ist eine Schuld mit einem Grund - nie ein "spaeter".
]);

const sourceFiles = [];
const testFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      (entry.endsWith('.test.ts') ? testFiles : sourceFiles).push(full);
    }
  }
};
for (const root of ['apps', 'packages', 'modules']) {
  walk(join(repoRoot, root));
}

/** `reason: 'a' | 'b';` in einem Typ - das Versprechen. */
const declaredPattern = /\breason\??:\s*((?:\s*\|?\s*'[a-z0-9_]+')+)\s*;/gu;
const declared = new Map();
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(declaredPattern)) {
    for (const [, reason] of match[1].matchAll(/'([a-z0-9_]+)'/gu)) {
      if (!declared.has(reason)) {
        declared.set(reason, new Set());
      }
      declared.get(reason).add(relative(repoRoot, file));
    }
  }
}

/**
 * Erzeugt wird ein Grund als Literal - oder aus einem Praefix zusammengesetzt,
 * wie `recovery_${row.status}`. Die zweite Form kostet Genauigkeit und wird
 * deshalb getrennt gezaehlt statt stillschweigend mitgerechnet.
 */
const producedLiteral = new Set();
const templatePrefixes = new Set();
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const [, reason] of source.replace(declaredPattern, '').matchAll(/'([a-z0-9_]+)'/gu)) {
    producedLiteral.add(reason);
  }
  for (const [, prefix] of source.matchAll(/`([a-z0-9_]+_)\$\{/gu)) {
    templatePrefixes.add(prefix);
  }
}
const byTemplate = (reason) =>
  [...templatePrefixes].some((prefix) => reason.startsWith(prefix));

const named = new Set();
for (const file of testFiles) {
  for (const [, reason] of readFileSync(file, 'utf8').matchAll(/'([a-z0-9_]+)'/gu)) {
    named.add(reason);
  }
}

// Ein Tor ueber nichts sagt "sauber" und meint "ich habe nicht nachgesehen".
if (declared.size === 0) {
  console.error('Refusal-reason check failed: no refusal reason declared anywhere.');
  process.exit(1);
}

let composed = 0;
let walked = 0;
for (const [reason, files] of [...declared].sort()) {
  const where = [...files].join(', ');
  if (!producedLiteral.has(reason)) {
    if (!byTemplate(reason)) {
      errors.push(
        `${reason} is declared in ${where} and nothing produces it. `
        + 'A refusal nobody can reach is a promise that cannot be kept - '
        + 'either produce it or take it out of the type.',
      );
      continue;
    }
    composed += 1;
  }
  if (named.has(reason)) {
    walked += 1;
    if (notYetWalked.has(reason)) {
      errors.push(
        `${reason} is listed here as not yet walked, and a test now names it. `
        + 'Take the entry out: a list that keeps a debt already paid is a list '
        + 'nobody believes.',
      );
    }
    continue;
  }
  const excuse = notYetWalked.get(reason);
  if (excuse === undefined) {
    errors.push(
      `${reason} is declared in ${where} and no test names it. `
      + 'A running product can answer with it and nothing has ever been '
      + 'through it. Walk it, or say here what a walk would need.',
    );
  }
}

if (errors.length > 0) {
  console.error('Refusal-reason check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Refusal-reason check passed (${declared.size} refusal reasons declared across `
  + `${sourceFiles.length} sources, every one of them producible - ${composed} only `
  + `as a composed string; ${walked} are named by a test`
  + (notYetWalked.size === 0
    ? ', and none is argued as unwalked).'
    : `, and ${notYetWalked.size} are argued as not yet walked, each with what a `
      + 'walk would need).'),
);
