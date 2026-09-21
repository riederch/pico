import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');

/**
 * Ein Wert, der zweimal geschrieben steht, steht zweimal gleich - und jemand
 * hat gesagt, warum er zweimal steht.
 *
 * **Der Anlass** (2026-09-07, Befund B69). `check-push-lifetime.mjs` stellte
 * diese Frage seit Monaten an genau zwei von Hand eingetragene Pfade und
 * beantwortete sie richtig. Niemand hatte sie je an den Baum gestellt. Die
 * Messung fand zehn exportierte Namen, die zweimal definiert werden, und von
 * den zehn hielt sechs ein Pruefer oder ein Test - vier hielt nichts:
 *
 * - `MAX_PICO_IDENTITY_READER_KEY_FRESHNESS_MS`, die Fuenf-Minuten-Decke aus
 *   ADR 0085 F4, in `apps/core` und `@pico/vault` - und ein drittes Mal im
 *   CLI des Vault-Daemons unter kuerzerem Namen, in einer Zeile, die sich
 *   selbst „mirrored" nannte. Der Kern schrieb `5 * 60 * 1000`, das Vault
 *   `5 * 60 * 1_000`: dieselbe Zahl, zwei Schreibweisen, was die Handschrift
 *   einer Kopie ist und nicht die einer Entscheidung.
 * - `MAX_PICO_READER_CUSTODY_SYNC_MANIFEST_MS` und
 *   `PICO_READER_CUSTODY_SYNC_GENESIS_DIGEST_HEX` in `@pico/vault`, das ein
 *   Manifest baut, und `@pico/sync`, das eines prueft.
 * - `picoCompanionDeviceAuthorityWarningDays` in `@pico/companion` und im
 *   Renderer-Vertrag der Schale.
 *
 * Drei davon mussten gar nicht doppelt sein: die Kante fuer einen Import
 * bestand bereits, sie stehen jetzt einmal im Protokoll. Was bleibt, bleibt
 * aus einem Grund, und der Grund steht unten.
 *
 * **Warum das Tor die Werte selbst vergleicht.** Ein Tor, das nur verlangt,
 * dass irgendwer die beiden Kopien bindet, waere ein Tor auf eine Hoffnung.
 * Dieses ist die Bindung: es liest beide Stellen und rechnet nach. Zahlen
 * werden ausgewertet, damit `5 * 60 * 1000` und `5 * 60 * 1_000` nicht als
 * Abweichung gelten - was zaehlt, ist der Wert, nicht die Schreibweise.
 *
 * **Warum die Dateien mit im Eintrag stehen.** `check-push-lifetime.mjs`
 * konnte mehr als nur vergleichen: es fiel auch, wenn eine der beiden Stellen
 * verschwand. Ohne die Dateiliste waere das hier stumm - zwei Kopien, von
 * denen eine geht, sehen aus wie eine Wahrheit an einer Stelle. Deshalb nennt
 * jeder Eintrag genau die Dateien, in denen der Name stehen soll.
 *
 * **Die zweite Gestalt derselben Sache: eine geschlossene Liste, von Hand noch
 * einmal ausbuchstabiert** (Befund B70). Ein Vokabular, das das Protokoll als
 * `['a', 'b'] as const` besitzt, stand an 29 Stellen ein zweites Mal da - als
 * literale Vereinigung `'a' | 'b'` in einem Typ. Der Zeilentyp der
 * Wiederherstellung schrieb alle fuenf Zustaende aus, der Renderer-Vertrag
 * fuenf Widerrufsgruende, und `picoRulesDecisions` stand zehnmal. Eine davon
 * stand im Protokoll selbst, gegen die eigene Liste eine Datei weiter.
 *
 * Das ist genau die Klasse, die dieser Baum immer wieder trifft: zwei Listen,
 * die driften. Und sie war vermeidbar, alle 29 Mal - jede Liste exportiert
 * ihren Typ, und ein Typ wird beim Bauen geloescht. Deshalb verbietet ihn
 * keine Grenze, auch nicht die zum Renderer, wo ein blosser Spezifizierer
 * nicht aufloest: der gebaute `contract.js` haelt danach keinen einzigen
 * Laufzeitimport, nachgesehen statt geglaubt.
 *
 * **Was diese Pruefung nicht kann.** Sie liest `export const NAME = ...;` am
 * Zeilenanfang. Eine Kopie ohne `export`, unter einem anderen Namen oder in
 * einem anderen Ausdruck geht an ihr vorbei - die dritte Frischeschranke im
 * CLI war genau das und wurde von der Messung gefunden, nicht von dieser
 * Regel. Das steht hier, weil ein Tor, das seine Grenze verschweigt, mehr zu
 * versprechen scheint, als es haelt.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/**
 * Jeder Name, der mehr als einmal definiert werden darf - mit den Dateien, in
 * denen er stehen muss, und dem Grund, warum ein Import es nicht tut.
 */
const argued = new Map([
  ['maxPicoLinkPushLifetimeMs', {
    files: [
      'apps/core/src/link-push-lifetime.ts',
      'apps/companion/src/link-push-gate.ts',
    ],
    reason: 'ADR 0150 PU3: das Home praegt Pushes, das Geraet ehrt sie, und '
      + 'keines darf das andere importieren - ein Home, das Geraetecode '
      + 'ausliefert, oder umgekehrt. Ein Home, das laenger praegt als ein '
      + 'Geraet ehrt, verschickt Pushes, die tot ankommen',
  }],
  ['picoCompanionConditionKinds', {
    files: [
      'apps/companion/src/conditions.ts',
      'apps/companion-shell/src/contract.ts',
    ],
    reason: 'ADR 0113 C2: `contract.ts` ist rendererseitig und haelt genau '
      + 'einen Import, und der ist typ-only. Ein Wertimport zoege den '
      + 'Modulgraphen des Companions in den Renderer',
  }],
  ['picoCompanionExclusiveConditions', {
    files: [
      'apps/companion/src/conditions.ts',
      'apps/companion-shell/src/contract.ts',
    ],
    reason: 'Befund B240, gleiche Lage wie `picoCompanionConditionKinds` '
      + 'direkt darueber: die Paare gehoeren zum Vokabular, das ein Parser '
      + 'braucht, *bevor* etwas ankommt, und `contract.ts` laedt im Renderer. '
      + 'Gebunden durch `condition-vocabulary.test.ts`, das beide Listen '
      + 'elementweise gleichsetzt - dieselbe Anordnung, die fuer die Namen '
      + 'schon gilt',
  }],
  ['picoCompanionDeviceAuthorityWarningDays', {
    files: [
      'apps/companion/src/device-lifecycle.ts',
      'apps/companion-shell/src/contract.ts',
    ],
    reason: 'ADR 0113 C2, derselbe Grund wie bei den Zustandsarten daneben',
  }],
  ['memoryRetentionModes', {
    files: [
      'packages/protocol/src/index.ts',
      'apps/web/src/protocol-values.ts',
    ],
    reason: 'Das Dashboard wird als blanke ES-Module ausgeliefert; ein blosser '
      + 'Spezifizierer wie `@pico/protocol` loest im Browser nicht auf und '
      + 'reisst den ganzen Modulgraphen mit',
  }],
  ['picoHomeClaimStates', {
    files: [
      'packages/protocol/src/index.ts',
      'apps/web/src/protocol-values.ts',
    ],
    reason: 'derselbe Grund wie bei den Aufbewahrungsarten daneben',
  }],
  ['realtimeMessageType', {
    files: [
      'packages/protocol/src/index.ts',
      'apps/web/src/protocol-values.ts',
    ],
    reason: 'derselbe Grund wie bei den Aufbewahrungsarten daneben',
  }],
  ['picoTokens', {
    files: [
      'apps/companion-shell/src/pico-design-tokens.generated.ts',
      'apps/vault-daemon/src/pico-design-tokens.generated.ts',
    ],
    reason: 'beide von `scripts/generate-design-tokens.mjs` aus einer Quelle '
      + 'geschrieben; kein Mensch tippt sie, und dieser Vergleich sagt, ob '
      + 'ein Lauf nur die Haelfte erneuert hat',
  }],
]);

const sourceFiles = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (entry.endsWith('.ts')
      && !entry.endsWith('.test.ts')
      && !entry.endsWith('.d.ts')) {
      sourceFiles.push(full);
    }
  }
};
for (const root of ['apps', 'packages', 'modules']) {
  walk(join(repoRoot, root));
}

/**
 * Jeder getrackte TypeScript-Pfad, Tests eingeschlossen - `sourceFiles` oben
 * laesst sie absichtlich weg, und die Praemissenpruefung unten braucht genau
 * sie (Befund B247).
 */
const trackedFiles = execSync('git ls-files "*.ts"', { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line !== '' && !line.includes('/dist/'));

const definitions = new Map();
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(
    /^export const ([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]*)?=\s*([\s\S]*?);$/gmu,
  )) {
    const [, name, initialiser] = match;
    if (!definitions.has(name)) {
      definitions.set(name, []);
    }
    definitions.get(name).push({
      file: relative(repoRoot, file),
      text: initialiser.replace(/\s+/gu, ' ').trim(),
    });
  }
}

// Ein Tor, das ueber nichts laeuft, sagt „sauber" und meint „ich habe nicht
// nachgesehen" (`check-vacuous-gates.mjs`).
if (definitions.size === 0) {
  console.error('Constant-copies check failed: no exported constant found at all.');
  process.exit(1);
}

/**
 * Der Wert, nicht die Schreibweise. Reine Zahlenarithmetik wird gerechnet,
 * alles andere im Text verglichen - `'00'.repeat(32)` ist kein Term, aber
 * zweimal derselbe Text.
 */
const numericPattern = /^[\d\s*+\-/().]+$/u;
const valueOf = (text) => {
  const bare = text.replace(/_/gu, '');
  if (!numericPattern.test(bare)) {
    return text;
  }
  try {
    // eslint-disable-next-line no-new-func
    const computed = Function(`"use strict"; return (${bare});`)();
    return Number.isFinite(computed) ? `= ${computed}` : text;
  } catch {
    return text;
  }
};

const copies = [...definitions.entries()]
  .filter(([, places]) => places.length > 1)
  .sort((a, b) => a[0].localeCompare(b[0]));

for (const [name, places] of copies) {
  const entry = argued.get(name);
  if (entry === undefined) {
    errors.push(
      `${name} is declared in ${places.length} places and nothing says why: `
      + `${places.map((place) => place.file).join(', ')}. `
      + 'Declare it once and import it, or add it to the argued list in this '
      + 'check with the reason an import will not do.',
    );
    continue;
  }
  const seen = places.map((place) => place.file).sort();
  const expected = [...entry.files].sort();
  if (seen.join('|') !== expected.join('|')) {
    errors.push(
      `${name} is argued to stand in ${expected.join(', ')} but stands in `
      + `${seen.join(', ')}. ${entry.reason}.`,
    );
    continue;
  }
  const values = new Map();
  for (const place of places) {
    const value = valueOf(place.text);
    if (!values.has(value)) {
      values.set(value, []);
    }
    values.get(value).push(place);
  }
  if (values.size > 1) {
    errors.push(
      `${name} has drifted: `
      + [...values.values()]
        .map((group) => `${group[0].file} says ${group[0].text}`)
        .join(', and ')
      + `. It stands twice because: ${entry.reason}.`,
    );
  }
}

for (const [name, entry] of argued) {
  const places = definitions.get(name) ?? [];
  if (places.length <= 1) {
    errors.push(
      `${name} is argued as a copy that must agree with itself, but only `
      + `${places.length} declaration remains (${entry.files.join(', ')}). `
      + 'If the copy is gone, take the entry out of this check; if it moved, '
      + 'say where.',
    );
  }
}

/**
 * Die zweite Regel: eine geschlossene Liste steht nicht ein zweites Mal als
 * literale Vereinigung da.
 *
 * Der Eintrag nennt Datei und Liste, weil ein Vokabular mit denselben zwei
 * Woertern zweimal etwas anderes heissen kann - das waere ein Grund, und ein
 * Grund gehoert aufgeschrieben.
 */
const arguedUnions = new Map([
  [
    'packages/sync/src/index.ts',
    ['picoRelayAccountStatuses'],
  ],
]);

/**
 * Warum dieser eine Eintrag (2026-09-17, Befund B187). `readerStatus` sagt,
 * ob eine *Leseerteilung* noch gilt; `picoRelayAccountStatuses` sagt, ob ein
 * *Relay-Konto* noch benutzt werden darf. Dieselben zwei Woerter, zwei
 * Gegenstaende, die nichts miteinander zu tun haben - den einen Typ hier zu
 * nennen hiesse, den Zustand einer Leseerteilung an den eines Relay-Kontos zu
 * binden.
 *
 * Diese Schublade stand seit ihrer Einfuehrung leer. Sichtbar wurde der Fall
 * erst, als der Kontostatus einen Namen bekam: ein Wortschatz ohne Namen kann
 * sich beliebig oft wiederholen, ohne je als Kopie zu gelten, und dieselbe
 * Benennung, die die echten Kopien aufdeckte, deckte auch diese Namensgleiche
 * auf.
 */

const closedLists = new Map();
for (const file of sourceFiles) {
  if (file.endsWith('.test.ts')) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(
    /^export const ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[([^\]]*?)\]\s*as const;/gmu,
  )) {
    const members = [...match[2].matchAll(/'([^']+)'/gu)].map(([, member]) => member);
    if (members.length < 2) {
      continue;
    }
    const type = new RegExp(
      `export type (\\w+) =\\s*\\n?\\s*typeof ${match[1]}\\[number\\];`,
      'u',
    ).exec(source);
    closedLists.set([...members].sort().join('|'), {
      list: match[1],
      file: relative(repoRoot, file),
      type: type?.[1],
    });
  }
}

let unionSites = 0;
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  const where = relative(repoRoot, file);
  for (const match of source.matchAll(
    /'[a-z0-9_.-]+'(?:\s*\|\s*'[a-z0-9_.-]+')+/gu,
  )) {
    const members = [...match[0].matchAll(/'([^']+)'/gu)].map(([, member]) => member);
    const key = [...new Set(members)].sort().join('|');
    const list = closedLists.get(key);
    if (list === undefined || where === list.file) {
      continue;
    }
    unionSites += 1;
    if (arguedUnions.get(where)?.includes(list.list) === true) {
      continue;
    }
    const line = source.slice(0, match.index).split('\n').length;
    errors.push(
      `${where}:${line} writes out ${list.list} by hand `
      + `(${list.file}). `
      + (list.type === undefined
        ? `That list exports no type; export \`typeof ${list.list}[number]\` and `
          + 'name it here.'
        : `Name the type instead - \`${list.type}\`, which is erased at build `
          + 'time and so crosses every boundary a value cannot.'),
    );
  }
}

/**
 * Ein Modul, das zweimal steht, steht zweimal gleich - und einer von beiden
 * traegt den Beweis fuer beide.
 *
 * **Der Anlass** (2026-09-18, Befund B215). `database-file-mode.ts` steht in
 * `apps/core/src` und in `apps/relay/src`, mit **identischem Code** und je
 * eigenem Kommentar: der Kern zitiert ADR 0071, das Relay seinen eigenen
 * gegangenen Fall (Befund B120, ein Relay gegen ein schon vorhandenes
 * Datenverzeichnis). Die Doppelung ist gewollt - zwei Anwendungen, keine
 * gemeinsame Abhaengigkeit, und ein Dateirechte-Helfer gehoert nicht ins
 * Protokoll.
 *
 * **Die Pruefung war es nicht.** Drei Tests halten `narrowToOwner` im Kern -
 * verengt nur, weitet nie, nimmt auch die `-wal`- und `-shm`-Begleitdateien -,
 * und die Relay-Fassung hatte keinen einzigen. Genau die Gestalt aus Befund
 * B213: eine Abschrift, die das Verhalten traegt und den Beweis nicht.
 *
 * **Deshalb wird hier die Gleichheit gehalten und nicht der Test abgeschrieben.**
 * Solange der Code beider Fassungen derselbe ist, gilt der Beweis der einen fuer
 * die andere; laeuft eine fort, faellt dieser Schritt und sagt, welche.
 * Kommentare bleiben ausgenommen - jede Fassung erzaehlt ihren eigenen Fall.
 */
const mirroredModules = [
  {
    proven: 'apps/core/src/database-file-mode.ts',
    mirror: 'apps/relay/src/database-file-mode.ts',
  },
];
const withoutProse = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/u, '').trimEnd())
  .filter((line) => line.trim() !== '')
  .join('\n');
/**
 * Befund B247. Die Regel darueber stuetzt sich auf einen Satz: *eine Fassung
 * ist geprueft, und solange sie gleich sind, gilt der Beweis fuer beide*.
 * Geprueft wurde davon bisher nur die zweite Haelfte.
 *
 * Verschwaende der Test der bewiesenen Fassung - geloescht, umbenannt, oder
 * nur noch importierend statt rufend -, blieben zwei identische Kopien
 * **ungepruefeten** Codes, und dieser Schritt bliebe gruen, weil er sie nur
 * gegeneinander haelt. Eine Regel, die ihre eigene Praemisse nicht prueft,
 * ist ein Pruefer ohne Gegenstand (B166) mit einem Argument davor.
 *
 * Gefragt wird deshalb beides: dass die Fassungen gleich sind, **und** dass
 * jeder Export der bewiesenen Fassung von einem Test wirklich gerufen wird.
 * Ein Import allein genuegt nicht - ein Modul zu importieren beweist nichts
 * ueber seine Funktionen.
 */
const exportedNames = (path) => {
  const source = ts.createSourceFile(
    path,
    readFileSync(join(repoRoot, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = [];
  (function walk(node) {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
        names.push(node.name.text);
      }
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
        }
      }
    }
    node.forEachChild(walk);
  })(source);
  return names;
};

/** Ruft irgendein Test dieses Pakets diesen Namen wirklich auf? */
const calledByATest = (modulePath, name) => {
  const directory = modulePath.slice(0, modulePath.lastIndexOf('/'));
  const stem = modulePath.slice(directory.length + 1).replace(/\.ts$/u, '');
  return trackedFiles
    .filter((candidate) => candidate.startsWith(`${directory}/`) && candidate.endsWith('.test.ts'))
    .some((candidate) => {
      // `git ls-files` nennt auch, was gerade nicht auf der Platte liegt.
      // Dann fehlt der Beweis, und das ist eine Meldung wert statt eines
      // Stapelabzugs (Befund B247, Pflanzung 1a).
      if (!existsSync(join(repoRoot, candidate))) return false;
      const text = readFileSync(join(repoRoot, candidate), 'utf8');
      if (!text.includes(`./${stem}.js`)) return false;
      const source = ts.createSourceFile(candidate, text, ts.ScriptTarget.Latest, true);
      let called = false;
      (function walk(node) {
        if (ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && node.expression.text === name) {
          called = true;
        }
        node.forEachChild(walk);
      })(source);
      return called;
    });
};

for (const { proven, mirror } of mirroredModules) {
  const left = withoutProse(readFileSync(join(repoRoot, proven), 'utf8'));
  const right = withoutProse(readFileSync(join(repoRoot, mirror), 'utf8'));
  if (left !== right) {
    errors.push(
      `${proven} und ${mirror} tragen denselben Helfer und nicht mehr denselben Code. `
      + 'Eine Fassung ist geprueft und die andere nicht; solange sie gleich sind, '
      + 'gilt der Beweis fuer beide. Gleichziehen, oder die ungepruefte Fassung mit '
      + 'eigenen Tests versehen und den Eintrag hier nehmen.',
    );
  }
  const exported = exportedNames(proven);
  if (exported.length === 0) {
    errors.push(
      `${proven} exportiert nichts, also traegt es keinen Beweis, den ${mirror} erben `
      + 'koennte. Der Eintrag hier steht ueber nichts.',
    );
  }
  for (const name of exported) {
    if (!calledByATest(proven, name)) {
      errors.push(
        `${proven} exportiert \`${name}\`, und kein Test daneben ruft es auf. `
        + `Dieser Eintrag laesst ${mirror} den Beweis der geprueften Fassung erben - `
        + 'gibt es den Beweis nicht, sind es zwei gleiche Kopien ungepruefeten Codes, '
        + 'und diese Pruefung sagte das Gegenteil.',
      );
    }
  }
}
if (mirroredModules.length === 0) {
  errors.push(
    'kein Modulpaar wird mehr gespiegelt, also lief dieser Schritt ueber nichts. '
    + 'Eine Null ueber keinem Korpus ist kein Befund.',
  );
}

if (errors.length > 0) {
  console.error('Constant-copies check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const definitionCount = [...definitions.values()]
  .reduce((total, places) => total + places.length, 0);
console.log(
  `Constant-copies check passed (${definitionCount} exported constants across `
  + `${sourceFiles.length} files; ${copies.length} names stand more than once, `
  + `each argued, each agreed; ${closedLists.size} closed lists, and `
  + `${unionSites} of them written out by hand as a union; `
  + `${mirroredModules.length} Modulpaar(e) stehen zweimal und tragen denselben Code, und `
  + `die ${mirroredModules.reduce((sum, pair) => sum + exportedNames(pair.proven).length, 0)} `
  + 'Exporte der bewiesenen Fassung werden von einem Test daneben wirklich gerufen - '
  + 'den Beweis, den die Spiegelung erben laesst, gibt es also).',
);
