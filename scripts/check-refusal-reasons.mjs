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
 * **Warum das hier nicht auf geworfene Meldungen ausgeweitet wird**, gemessen
 * am 2026-09-08, damit es niemand ein zweites Mal misst. Das Produkt wirft 907
 * `Error`s mit einem snake_case-Namen, und 464 davon nennt kein Test. Das sieht
 * aus wie dieselbe Frage und ist eine andere: ein Grund in einer
 * `reason:`-Vereinigung ist ein **Versprechen an einen Aufrufer** - eine
 * Antwort, die eine Tuer geben kann -, ein `throw` ist meist eine
 * **Zusicherung an sich selbst**, die mit gueltiger Eingabe gar nicht
 * erreichbar ist. Ein Tor darueber verlangte 464 Tests fuer Zustaende, die es
 * nicht geben soll, und wuerde deshalb umgangen statt befolgt.
 *
 * Die geworfenen Meldungen, die *Produktverhalten* sind, liegen ohnehin unter
 * einem Test - nachgesehen an der, die eine Person wirklich trifft: ein Home,
 * das sich weigert, auf `0.0.0.0` zu binden, solange niemand den Zugangsmodus
 * entschieden hat (`config.test.ts`).
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
 * Sie fragt, ob das Wort im **Code** einer `*.test.ts` vorkommt - nicht, ob ein
 * Test es *erwartet*. Sie hat damit dieselbe Staerke wie
 * `check-capability-reach.mjs`, die nach einem Aufrufer fragt und nicht nach
 * einem guten: sie faengt das Fehlen, nicht die Schlaefrigkeit. Das steht hier,
 * weil ein Tor, das mehr zu versprechen scheint, als es haelt, schlimmer ist
 * als keines.
 *
 * **Der Vorbehalt hatte zwei Haelften, und eine ist zu** (2026-09-11, Befund
 * B147). Bis dahin las diese Pruefung die Testdatei *mit* ihren Kommentaren,
 * ein zitierter Grund in Prosa genuegte ihr also; das ist unten geschlossen.
 * Die andere Haelfte - genannt gegen erwartet - steht noch und ist am selben
 * Tag gemessen: **jeder** der Gruende steht in einer echten Behauptung, keiner
 * nur genannt. Eine Verschaerfung faenge heute nichts und musste dafuer raten,
 * wie nah an einem `expect` nah genug ist.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/** Prosa ist kein Gang; ein Kommentar nennt einen Grund, er geht ihn nicht. */
const withoutComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/.*$/gmu, '$1');

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

/**
 * Prosa ist kein Gang - auch nicht auf der Testseite (2026-09-11, Befund B147).
 * Bis hierher las diese Schleife die Testdatei **mit** ihren Kommentaren, ein
 * Grund, der in einem Doc-Kommentar *zitiert* wurde, galt also als gegangen.
 * Dieselbe Verwechslung, die `check-capability-reach.mjs` auf der Aufruferseite
 * schon einmal gemacht hat, und dort hat sie eine Faehigkeit erreicht aussehen
 * lassen, die niemand rief.
 *
 * Gemessen, bevor es geaendert wurde: von 2.829 zitierten snake_case-Woertern
 * in Testdateien stehen 2.825 im Code, und die vier, die nur in Prosa stehen,
 * sind keine Ablehnungsgruende. Diese Zeile faengt heute also nichts - sie
 * nimmt dem Tor ein Versprechen ab, das es nicht hielt.
 */
const named = new Set();
for (const file of testFiles) {
  const code = withoutComments(readFileSync(file, 'utf8'));
  for (const [, reason] of code.matchAll(/'([a-z0-9_]+)'/gu)) {
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

/**
 * **Die zweite Frage ueber dieselbe Ablehnung** (2026-09-11, Befund B145):
 * nicht "ist sie einmal gegangen worden", sondern **"hat sie ein Zuhause"**.
 *
 * Der Anlass. `packages/protocol` erklaerte, was ein Zulieferer ueber sich
 * sagt, an zwei Stellen: `supplier.ts` und `depot-manifest.ts` teilten die
 * Muster, die Artenliste, die Schlitzliste und die Obergrenze - und gingen
 * zweimal getrennt darueber. Gemessen urteilten beide Gaenge ueber jede
 * Eingabe gleich; verschieden war der **Name**. Wer eine Adresse oder einen
 * Pfad als Bezeichner schrieb, bekam im Manifest gesagt, dass das keine
 * Identitaet ist, und im Depot nur "ungueltig" - und ein Depotmanifest
 * schreibt ein **Dritter**, also traf es den, der die Auskunft am noetigsten
 * hatte.
 *
 * **Warum je Paket und nicht je Baum.** Der naheliegende Schnitt waere "zwei
 * Dateien ohne Importbeziehung". Nachgemessen faengt der genau *nicht*: ein
 * doppelt geschriebener Gang **hat** die Importbeziehung, weil er die geteilte
 * Konstante holt und dann selbst darueber laeuft. Er haette B145 durchgelassen.
 * Die Paketgrenze faengt ihn, denn eine Regel, die in einem Paket zweimal
 * begangen wird, hat dort ein Zuhause, das sie noch nicht kennt.
 *
 * **Was das Tor nicht ist.** Es verlangt nicht, dass ein Ablehnungsname nur
 * einmal im Baum vorkommt - ein Weiterwurf ueber eine Paketgrenze ist genau
 * das, was ein Grund tun soll. Gemessen am 2026-09-11: 34 Namen standen in
 * mehr als einer Datei, davon 10 in einer Paketgrenze; fuenf davon waren eine
 * Regel mit zwei Gaengen und sind seither gefaltet.
 *
 * Ein Argument ist keine Erlaubnis. Jeder Eintrag sagt, warum zwei Stellen
 * denselben Satz sprechen und **verschiedene Fragen** beantworten.
 */
const arguedHomes = new Map([
  ['apps/core|pico_depot_not_attached',
    'Dieselbe Nachschlagefrage an drei Tueren - im Ereignisspeicher vor zwei '
    + 'Schreibvorgaengen, in `app.ts` zwischen der Entscheidung und dem Lauf. '
    + 'Kein zweiter Gang ueber eine Regel: es gibt keine Regel, nur ein '
    + 'Nachsehen, und jede Tuer muss fuer sich antworten, weil zwischen ihnen '
    + 'abgehaengt worden sein kann'],
  ['apps/vault-daemon|invalid_response',
    'Vier verschiedene Antworten des Daemons - Zeremonie, Klient, Protokoll, '
    + 'Leserzugang -, jede mit eigener Form. Ein gemeinsames Wort fuer "das ist '
    + 'nicht die Antwort, auf die ich gewartet habe", nicht ein gemeinsamer '
    + 'Gang: die vier Formen haben nichts miteinander zu tun'],
  ['packages/protocol|invalid_pico_link_address',
    '`link-packet.ts` traegt die Regel; `link-mailbox.ts` engt davor nur den '
    + 'Typ ein, damit der Parser den Wert nehmen kann. Ein eigener Name fuer '
    + '"du hast mir eine Zahl gegeben" waere eine schlechtere Auskunft als der, '
    + 'den die Regel selbst gibt'],
  ['packages/protocol|invalid_pico_link_mailbox',
    'Zwei verschiedene Gegenstaende ueber demselben Muster: in `link-packet.ts` '
    + 'die Postfachhaelfte einer Adresse, in `link-relay-surface.ts` ein '
    + 'nacktes Postfach am Betreiber. `picoLinkMailboxPattern` ist geteilt; '
    + 'was gefragt wird, ist es nicht'],
]);

const thrownPattern = /throw new Error\(\s*(?:'([a-z][a-z0-9_]{4,})'|`([a-z][a-z0-9_]{4,}):)/gu;
const homes = new Map();
for (const file of sourceFiles) {
  const rel = relative(repoRoot, file);
  if (!/^(apps|packages|modules)\/[^/]+\/src\//u.test(rel)) {
    continue;
  }
  const pkg = rel.split('/').slice(0, 2).join('/');
  const seen = new Set();
  for (const match of readFileSync(file, 'utf8').matchAll(thrownPattern)) {
    seen.add(match[1] ?? match[2]);
  }
  for (const reason of seen) {
    const key = `${pkg}|${reason}`;
    if (!homes.has(key)) {
      homes.set(key, []);
    }
    homes.get(key).push(rel);
  }
}

let arguedSeen = 0;
for (const [key, files] of [...homes].sort()) {
  if (files.length < 2) {
    continue;
  }
  const [pkg, reason] = key.split('|');
  const argument = arguedHomes.get(key);
  if (argument === undefined) {
    errors.push(
      `${reason} is thrown in ${files.length} files of ${pkg} (${files.join(', ')}). `
      + 'One rule walked twice inside one package drifts in whichever direction '
      + 'nobody is looking - fold the walk, or say here which two different '
      + 'questions share the word.',
    );
    continue;
  }
  arguedSeen += 1;
}

// Eine Liste sagt, was erlaubt ist - nie, ob es das noch gibt.
for (const key of arguedHomes.keys()) {
  const files = homes.get(key) ?? [];
  if (files.length < 2) {
    const [pkg, reason] = key.split('|');
    errors.push(
      `${reason} is argued here as sharing a word in ${pkg}, and it no longer `
      + 'stands in two files there. Take the entry out: an inventory that '
      + 'describes a tree that is gone describes nothing.',
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
    ? ', and none is argued as unwalked'
    : `, and ${notYetWalked.size} are argued as not yet walked, each with what a `
      + 'walk would need')
  + `; ${homes.size} thrown refusals have one home in their package, `
  + `${arguedSeen} share a word between two questions and say why).`,
);
