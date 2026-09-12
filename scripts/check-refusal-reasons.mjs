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
/**
 * Fuenf Gruende hingen an derselben Tuer und sind am 2026-09-12 gegangen
 * worden (Befund B151, Leserverwahrung). Was hier steht, haengt an einem
 * Aufbau, den es noch nicht gibt - und der Aufbau steht dabei, nicht ein
 * "spaeter".
 *
 * Die Saetze sind je Gruppe **einmal** geschrieben und angehaengt, weil es je
 * Gruppe **ein** Hindernis ist. Fuenfundzwanzig verschiedene Saetze zu
 * erfinden, wo es fuenf Hindernisse gibt, waere das mechanische Fuellen, vor
 * dem Befund B95 warnt - und der Leser wuerde fuenfundzwanzigmal dasselbe
 * lesen, ohne es zu merken.
 */
const derAnspruchsweg = 'Die Gruendungsevidenz wird von `verifyPicoHomeFoundingEvidence` '
  + 'geprueft, einer modulprivaten Funktion in `app.ts`, die nur ueber die Anspruchsflaeche '
  + 'erreichbar ist. Ein Gang braucht ein beanspruchtes Home, dessen Evidenz mit **einem** '
  + 'verfaelschten Feld neu unterschrieben wird - je Grund ein anderes Feld. Die Fixture dafuer '
  + 'gibt es noch nicht; `test-claimed-home.ts` baut den gelungenen Fall.';
const derUrkundenweg = 'Braucht eine Urkunde - Domaenen-Lesezugang oder Mitgliedschaft -, deren '
  + 'Schema oder Unterschrift verfaelscht ist, gegen einen Speicher, der die echte schon haelt.';
const derZuliefererweg = 'Braucht einen Zuliefererprozess, der mitten in einer Anfrage schliesst '
  + 'oder endet. Der Prueflauf startet heute keinen echten Kindprozess, der das ueberlebt.';

const notYetWalked = new Map([
  ['claimant_key_fingerprint_mismatch', derAnspruchsweg],
  ['first_device_agreement_key_mismatch', derAnspruchsweg],
  ['first_device_delegation_mismatch', derAnspruchsweg],
  ['first_device_signing_key_mismatch', derAnspruchsweg],
  ['inactive_first_device_delegation', derAnspruchsweg],
  ['invalid_claimant_founding_signature', derAnspruchsweg],
  ['invalid_claimant_key_role', derAnspruchsweg],
  ['invalid_founding_record_schema', derAnspruchsweg],
  ['invalid_host_claim_response_signature', derAnspruchsweg],
  ['invalid_host_founding_signature', derAnspruchsweg],
  ['malformed_founding_evidence', derAnspruchsweg],
  ['invalid_lifecycle_schema', derUrkundenweg],
  ['malformed_domain_read_grant', derUrkundenweg],
  ['unknown_credential', derUrkundenweg],
  ['unknown_grant', derUrkundenweg],
  ['invalid_host_activation_signature', derUrkundenweg],
  ['pico_supplier_closed', derZuliefererweg],
  ['pico_supplier_exited', derZuliefererweg],
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

/**
 * `reason: 'a' | 'b'` - das Versprechen, wo immer es steht.
 *
 * **Das Muster verlangte bis zum 2026-09-12 ein Semikolon unmittelbar dahinter**
 * (Befund B151), und das ist genau die Schreibweise, die dieses Repository am
 * seltensten benutzt. Verfehlt wurden damit:
 *
 * - die Union in einem Inline-Objekttyp - `| { ok: false; reason: 'a' | 'b' };`
 *   -, weil zwischen Union und Semikolon eine Klammer steht;
 * - die ueber mehrere Zeilen gesetzte Union, deren `reason:` eine Zeile hoeher
 *   steht als ihr Ende;
 * - und damit auch jedes `return { ok: false, reason: '...' }`.
 *
 * **Gemessen an dem Tag, an dem es auffiel:** das Tor sah **53** Gruende, und
 * mit `ok: false` ausgesprochen werden **113**. Ein Tor, das sich vornimmt,
 * jede Ablehnung dieses Produkts zu zaehlen, mass weniger als die Haelfte -
 * und seine Gruendungsmessung (Befund B71, "alle 53 sind erzeugbar") stand
 * ueber derselben zu kleinen Menge.
 *
 * `[;}]` statt `;` schliesst das. Die Parameterform - `function f(reason: 'a'
 * | 'b')` - faellt weiterhin heraus, weil dort eine runde Klammer folgt, und
 * das ist richtig so: ein Parameter ist kein Versprechen an einen Aufrufer.
 */
const declaredPattern = /\breason\??:\s*((?:\s*\|?\s*'[a-z0-9_]+')+)\s*[;}]/gu;
/**
 * **Erklaeren und aussprechen sehen gleich aus und sind es nicht**, und die
 * Weitung oben zwingt, sie zu trennen (Befund B151). Der Unterschied steht im
 * Abschluss: `;` schliesst eine Typzeile, `}` schliesst ein Objekt - es sei
 * denn, die Union traegt ein `|`, dann ist sie ein Inline-Objekttyp und wieder
 * eine Erklaerung.
 *
 * Ohne diese Trennung streicht der Erzeugungszaehler unten genau die
 * `return { ok: false, reason: '...' }` heraus, die er zaehlen soll, und meldet
 * jeden so ausgesprochenen Grund als unerzeugbar. Beim ersten Wurf der Weitung
 * genau so passiert.
 */
const isDeclaration = (match) => match[0].trimEnd().endsWith(';') || match[1].includes('|');
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
  const withoutDeclarations = source.replace(
    declaredPattern,
    (...args) => (isDeclaration([args[0], args[1]]) ? '' : args[0]),
  );
  for (const [, reason] of withoutDeclarations.matchAll(/'([a-z0-9_]+)'/gu)) {
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
/** Quelltext ohne Prosa, je Datei - fuer die Importfrage der dritten Regel. */
const sourceText = new Map();
/** Welche Dateien einen Grund werfen - fuer die Querpaketfrage darunter. */
const thrownBy = new Map();
for (const file of sourceFiles) {
  const rel = relative(repoRoot, file);
  if (!/^(apps|packages|modules)\/[^/]+\/src\//u.test(rel)) {
    continue;
  }
  const pkg = rel.split('/').slice(0, 2).join('/');
  const code = withoutComments(readFileSync(file, 'utf8'));
  sourceText.set(rel, code);
  const seen = new Set();
  for (const match of code.matchAll(thrownPattern)) {
    seen.add(match[1] ?? match[2]);
  }
  for (const reason of seen) {
    const key = `${pkg}|${reason}`;
    if (!homes.has(key)) {
      homes.set(key, []);
    }
    homes.get(key).push(rel);
    if (!thrownBy.has(reason)) {
      thrownBy.set(reason, []);
    }
    thrownBy.get(reason).push(rel);
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

/**
 * **Die dritte Frage, und sie schneidet ueber die Paketgrenze** (2026-09-11,
 * Befunde B145 und B148). Die Regel darueber laesst einen Weiterwurf zwischen
 * Paketen zu, und das ist richtig: ein Grund *soll* durch eine Schicht
 * durchgereicht werden. Was nicht richtig ist, ist eine zweite Fassung
 * derselben Regel in einem anderen Paket, die von der ersten nichts weiss.
 *
 * **Der Schnitt ist eine Anzahl und kein Schwellenwert.** Zwei Dateien in
 * verschiedenen Paketen, die sich **zwei oder mehr** Ablehnungen teilen, und
 * keine importiert das Modul der anderen. Gemessen am 2026-09-11: 16 solche
 * Paare teilen sich *einen* Namen - geteiltes Vokabular, und harmlos -, und
 * genau drei teilen sich zwei oder mehr. Eines davon war Befund B148, wo die
 * Vault-Bibliothek eine Richtung der Pfadtrennung prueft und der Daemon die
 * andere selbst nachbaut; es ist gefaltet und faellt seither heraus.
 *
 * **Drei Schnitte davor haben nicht getaugt**, und das steht in der Roadmap
 * unter B148, damit sie niemand ein zweites Mal versucht - "Modul ganz
 * unerreicht", "Modul ueberwiegend unerreicht" und "ein Typ, den das Produkt
 * nicht nennt". Der letzte ist bedeutungslos, weil ein Typ hergeleitet und
 * nicht genannt wird.
 *
 * Die zwei Eintraege unten sind **derselbe** Befund, aus zwei Richtungen
 * gesehen, und keine Erlaubnis: sie halten ihn sichtbar, bis jemand ihn
 * entscheidet.
 */
const crossKey = (a, b) => [a, b].sort().join('|');

/**
 * Jeder Pfad steht einzeln, nicht als zusammengesetzter Schluessel: sonst liest
 * `check-vacuous-gates.mjs` `a|b` als *einen* Pfad, findet ihn nicht und meldet
 * zu Recht, dass ein Pruefer sich mit einem Pfad erklaert, den es nicht gibt.
 * Am 2026-09-11 genau so passiert, beim ersten Wurf dieser Regel.
 */
const arguedCrossPackage = [
  {
    files: ['apps/core/src/event-store.ts', 'packages/protocol/src/link-mailbox.ts'],
    why: 'Befund B145. Das Protokoll modelliert das Postfachbuch mit drei Ablehnungen, die '
      + 'sein eigener Kommentar "the security of this whole design" nennt; das Home setzt '
      + 'alle drei im SQLite-Schema durch - Primaerschluessel plus zwei UNIQUE - und bildet '
      + 'die Verletzungen auf dieselben Namen ab. Nachgemessen urteilen sie gleich, und die '
      + 'SQLite-Fassung ist die staerkere: sie durch eine Speicherfassung zu ersetzen waere '
      + 'ein Rueckschritt. Was fehlt, ist nicht die Faltung, sondern eine Entscheidung '
      + 'darueber, ob das Buch bleibt - es hat keinen Produktaufrufer',
  },
  {
    files: ['apps/companion/src/link-mailbox.ts', 'packages/protocol/src/link-mailbox.ts'],
    why: 'Befund B145, dieselbe Sache von der Geraeteseite. Der Companion haelt ein Paar und '
      + 'kein Buch, und begruendet das ausdruecklich: ein Geraet hat genau ein Home, und ein '
      + 'nach Peer geschluesseltes Buch mit einem Eintrag waere eine Form, die allgemein tut. '
      + 'Die geteilten Namen sind daher dieselbe Ablehnung an zwei Orten und keine zweite '
      + 'Regel',
  },
];
const arguedCrossKeys = new Set(arguedCrossPackage.map(({ files }) => crossKey(...files)));

const importsModuleOf = (from, target) => {
  const base = target.split('/').pop().replace(/\.ts$/u, '');
  return [...(sourceText.get(from) ?? '').matchAll(/from '([^']+)'/gu)]
    .some(([, specifier]) => specifier.replace(/\.js$/u, '').split('/').pop() === base);
};

const crossPairs = new Map();
for (const [reason, files] of thrownBy) {
  if (files.length < 2) {
    continue;
  }
  for (let i = 0; i < files.length; i += 1) {
    for (let j = i + 1; j < files.length; j += 1) {
      const [a, b] = [files[i], files[j]];
      if (a.split('/').slice(0, 2).join('/') === b.split('/').slice(0, 2).join('/')) {
        continue;
      }
      if (importsModuleOf(a, b) || importsModuleOf(b, a)) {
        continue;
      }
      const key = crossKey(a, b);
      if (!crossPairs.has(key)) {
        crossPairs.set(key, []);
      }
      crossPairs.get(key).push(reason);
    }
  }
}

let arguedCrossSeen = 0;
for (const [key, reasons] of [...crossPairs].sort()) {
  if (reasons.length < 2) {
    continue;
  }
  if (!arguedCrossKeys.has(key)) {
    const [a, b] = key.split('|');
    errors.push(
      `${a} and ${b} are in different packages, share ${reasons.length} refusals `
      + `(${reasons.sort().join(', ')}) and neither imports the other's module. One rule with `
      + 'two writings on opposite sides of a package boundary drifts with nothing to hold it - '
      + 'fold it, or say here why the same words answer different questions.',
    );
    continue;
  }
  arguedCrossSeen += 1;
}

// Auch diese Liste sagt nur, was erlaubt ist - nie, ob es das noch gibt.
for (const { files } of arguedCrossPackage) {
  const key = crossKey(...files);
  if ((crossPairs.get(key) ?? []).length < 2) {
    const [a, b] = files;
    errors.push(
      `${a} and ${b} are argued here as sharing refusals across a package boundary, and they `
      + 'no longer share two. Take the entry out.',
    );
  }
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
  + `${arguedSeen} share a word between two questions and say why; `
  + `${crossPairs.size} file pairs share a refusal across a package boundary, `
  + `${arguedCrossSeen} of them share two or more and say why).`,
);
