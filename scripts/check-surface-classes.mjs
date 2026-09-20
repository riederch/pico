import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arguedRoutes } from './argued-routes.mjs';
import { picoRegisteredRoutes } from './registered-routes.mjs';
import {
  picoLinkOperationsPath,
  readPicoLinkDirectOperations,
} from './link-operations.mjs';

/**
 * ADR 0134 obligation 4 asks `docs/protocol/public-surfaces.md` to decide
 * whether a format may be revised in place, and that answer has to be readable
 * rather than interpreted. The document states the rule: a route's class is the
 * first word of its status, a canonical form names its class in a column, and
 * both come from the terms table.
 *
 * A rule about how a document is written is a wish until something reads it.
 * This check reads it. It found the case that prompted it: the founding record
 * was judged from the prose around the route that stores it, because the record
 * itself appeared in no table at all.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const path = 'docs/protocol/public-surfaces.md';
const text = readFileSync(join(repoRoot, path), 'utf8');
const errors = [];

/** Rows of a `| a | b | c |` table under a heading, header and rule dropped. */
export function tableRowsUnder(document, heading) {
  const lines = document.split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return null;
  }
  const rows = [];
  let seenTable = false;
  for (const line of lines.slice(start + 1)) {
    if (/^#{2,3} /u.test(line)) {
      break;
    }
    if (!line.trimStart().startsWith('|')) {
      if (seenTable) {
        seenTable = false;
      }
      continue;
    }
    seenTable = true;
    const cells = line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
    if (cells.every((cell) => /^-+$/u.test(cell)) || cells.length < 2) {
      continue;
    }
    rows.push(cells);
  }
  return rows;
}

const termRows = tableRowsUnder(text, '## Compatibility terms');
if (termRows === null || termRows.length === 0) {
  errors.push(`${path}: the compatibility terms table is missing.`);
}
// The header row is the first one; every later row names a term.
const terms = new Set(
  (termRows ?? []).slice(1).map(([term]) => term.toLowerCase()),
);

/**
 * Only these grant an in-place revision under ADR 0134. The other terms
 * describe communication scope or a compatibility promise, and a status must
 * not lead with them: `Pico-compatible` is something an implementation claims,
 * never something this table hands out.
 */
const classTerms = new Set(['experimental', 'reserved', 'internal']);

for (const term of classTerms) {
  if (!terms.has(term)) {
    errors.push(`${path}: the terms table no longer defines "${term}".`);
  }
}

const surfaceRows = (tableRowsUnder(text, '## Current public surfaces') ?? [])
  .slice(1);
if (surfaceRows.length === 0) {
  errors.push(`${path}: no public surface rows found.`);
}
for (const [surface, status] of surfaceRows) {
  const first = (status ?? '').split(/\s+/u)[0]?.toLowerCase() ?? '';
  if (!classTerms.has(first)) {
    errors.push(
      `${path}: surface ${surface} has status "${status}", whose first word `
      + 'is not a class term. ADR 0134 obligation 4 reads that word.',
    );
  }
}

const formRows = (tableRowsUnder(text, '## Canonical forms and their class') ?? [])
  .slice(1);
if (formRows.length === 0) {
  errors.push(`${path}: no canonical form rows found.`);
}
for (const [form, klass] of formRows) {
  if (!classTerms.has((klass ?? '').toLowerCase())) {
    errors.push(
      `${path}: canonical form ${form} has class "${klass}", which is not a `
      + 'class term.',
    );
  }
}

/**
 * --- Completeness: a route that is not in here is an undocumented surface ---
 *
 * The class rule above assumes the document knows about the route. Nineteen
 * did not appear at all - among them the ADR 0107 Link intake, which is the
 * most consequential route this Home has - and nobody had miscounted: each was
 * added by somebody with no reason to open this file, and the list rotted the
 * same quiet way ADR 0104 S5's variable table did.
 *
 * **A list a document keeps and nothing reads is a list that drifts**, and
 * this one drifting is not cosmetic. ADR 0134 obligation 4 asks this document
 * whether a surface may be revised in place; a surface it does not mention
 * gets no answer, so the question is settled at the call site by whoever is
 * there - which is the judgement call the class rule exists to remove.
 *
 * The registry in `app.ts` is the other side, and it is exhaustive by
 * construction: `assertClassified` refuses to start with an unregistered
 * route, so no route can hide from this comparison.
 *
 * Prose counts. Several routes are described in a paragraph rather than a row
 * - reader-custody is one family under one sentence - and a rule that only
 * accepted table rows would push a document into a shape its subject does not
 * have. What is checked is that the route is *there*, not where.
 *
 * **The method is part of the route.** A first draft compared paths alone and
 * let a documented `GET` cover a `DELETE` nobody had written down - two
 * different consequences behind one line. A wildcard family is the exception
 * and is read as covering its members whatever the verb, because that is what
 * `POST`/`GET /api/home/reader-custody/*` says in the sentence it lives in.
 */
const appPath = 'apps/core/src/app.ts';
const appSource = readFileSync(join(repoRoot, appPath), 'utf8');
/**
 * **Ueber den gemeinsamen Leser seit dem 2026-09-20 (Befund B235).** Hier
 * stand ein Muster, das nur Zeichenketten kennt - und genau eine Route steht
 * als Konstante: `PICO_LINK_CONTINUITY_READ_PATH`, und die ist `public`. Sie
 * war nie Teil dieses Vergleichs, und dieser Pruefer war dabei gruen.
 */
const { registrations: registered, unreadable } = picoRegisteredRoutes();
for (const registration of unreadable) {
  errors.push(
    `${appPath}: this reader cannot resolve ${registration}. A registration nobody can read is a `
    + 'route nobody is holding.',
  );
}

if (registered.length === 0) {
  errors.push(
    `${appPath}: no access-class registrations found. This reader compares two `
    + 'sides and one of them just disappeared, which is a broken reader rather '
    + 'than a clean document.',
  );
}

/** Paths this document names, including the wildcard families. */
const documentedPaths = [
  ...text.matchAll(/(\/api\/[A-Za-z0-9/:*_-]+)/gu),
].map(([path_]) => path_);
const documentedPrefixes = documentedPaths
  .filter((path_) => path_.endsWith('*'))
  .map((path_) => path_.slice(0, -1));

export function documentsRoute(document, method, route, prefixes) {
  if (prefixes.some((prefix) => route.startsWith(prefix))) {
    return true;
  }
  return document.includes(`${method} ${route}`);
}

for (const { method, route, accessClass } of registered) {
  if (!documentsRoute(text, method, route, documentedPrefixes)) {
    errors.push(
      `${path}: ${method} ${route} (${accessClass}) is served and appears `
      + 'nowhere in this document. ADR 0134 obligation 4 cannot answer for a '
      + 'surface it does not mention.',
    );
  }
}

const registeredRoutes = registered.map(({ route }) => route);
for (const documented of new Set(documentedPaths)) {
  const covered = documented.endsWith('*')
    ? registeredRoutes.some((route) => route.startsWith(documented.slice(0, -1)))
    : registeredRoutes.includes(documented);
  if (!covered) {
    errors.push(
      `${path}: ${documented} is documented as a surface and is not served. A `
      + 'stale row is a compatibility statement about something that is gone.',
    );
  }
}

// --- The closed operation set, which nothing was reading --------------------

/**
 * ADR 0107. **Remote capability is opt-in per operation** - "adding one is a
 * decision, not a consequence of adding a route".
 *
 * Nothing enforced that. This reader checked the Foundation's HTTP routes both
 * ways and left `picoLinkDirectOperations` alone, which is the wrong way round:
 * those routes are the local diagnostic surface ADR 0030 keeps local, and the
 * operation set is the one that travels - published through the ADR 0107 D4
 * intake and, since ADR 0149, over somebody else's relay.
 *
 * On the day this was written the set held thirty operations and this document
 * named seven. Twenty-three had been opted into remote capability with nothing
 * recording the decision. Four of them were added the same week, by an author
 * who read the ADR's sentence and still did not write them down - which is the
 * argument for a check rather than a habit.
 *
 * Grouping is allowed, because the document already groups: one row may name a
 * family with `/` between the operations, and the sentence is about the family.
 */
// Read through the shared reader rather than a second regex of its own: this
// file counted 46 and `check-link-reachability.mjs` counted 45 for as long as
// both existed, because its reader had no hyphen in its character class
// (2026-08-24).
const operationsPath = picoLinkOperationsPath;
const operations = readPicoLinkDirectOperations();

if (operations.length === 0) {
  errors.push(
    `${operationsPath}: no Link operations found. This reader compares two sides `
    + 'and one of them just disappeared.',
  );
}

/**
 * Operations named in a row's **first cell**, which is where a surface is
 * named; the third is prose.
 *
 * The first version read the whole row and found `depot.fetch` in a sentence
 * explaining why an operation needs an approval - an effect name, not an
 * operation - and reported it as a documented surface that does not exist. A
 * reader that forces prose to avoid naming things is a reader that makes the
 * document worse.
 */
export function documentedLinkOperations(document) {
  const named = new Set();
  for (const [, row] of document.matchAll(/^\|([^\n]*)\|$/gmu)) {
    const surface = row.split('|')[0] ?? '';
    if (!surface.includes('pico.link.direct')) {
      continue;
    }
    for (const [, name] of surface.matchAll(/`([a-z][a-z0-9_.-]*\.[a-z0-9_.-]+)`/gu)) {
      if (name !== 'pico.link.direct') {
        named.add(name);
      }
    }
  }
  return named;
}

const documentedOperations = documentedLinkOperations(text);

for (const operation of operations) {
  if (!documentedOperations.has(operation)) {
    errors.push(
      `${path}: the Link operation \`${operation}\` is in the closed set and `
      + 'appears in no row of this document. ADR 0107 makes remote capability '
      + 'opt-in per operation; the opt-in is recorded here or nowhere.',
    );
  }
}
for (const documented of documentedOperations) {
  if (!operations.includes(documented)) {
    errors.push(
      `${path}: \`${documented}\` is documented as a Link operation and is not `
      + 'in the closed set. A stale row is a compatibility statement about '
      + 'something that is gone.',
    );
  }
}

// --- Probes: the reader has to be able to fail ------------------------------

const probes = [
  {
    name: 'a status that does not lead with a class term',
    document:
      '## Current public surfaces\n\n| Surface | Current status | Notes |\n'
      + '|---|---|---|\n| `GET /x` | stable diagnostic surface | n |\n',
    heading: '## Current public surfaces',
    check: (rows) =>
      rows.slice(1).some(([, status]) =>
        !classTerms.has(status.split(/\s+/u)[0].toLowerCase())
      ),
  },
  {
    name: 'a canonical form with no class',
    document:
      '## Canonical forms and their class\n\n| Form | Class | Notes |\n'
      + '|---|---|---|\n| `pico.x.v1` | probably fine | n |\n',
    heading: '## Canonical forms and their class',
    check: (rows) =>
      rows.slice(1).some(([, klass]) => !classTerms.has(klass.toLowerCase())),
  },
];

if (documentsRoute('`GET /api/x`', 'DELETE', '/api/x', [])) {
  errors.push(
    'Self-probe failed: a documented GET was read as covering an '
    + 'undocumented DELETE on the same path.',
  );
}
if (documentsRoute('`GET /api/x`', 'GET', '/api/x/y', [])) {
  errors.push('Self-probe failed: a documented path was treated as a prefix.');
}
if (!documentsRoute('', 'POST', '/api/home/reader-custody/items', ['/api/home/reader-custody/'])) {
  errors.push('Self-probe failed: a documented wildcard did not cover its family.');
}
if (documentedLinkOperations('| `pico.link.direct` `home.a.b` | Internal | n |').size !== 1) {
  errors.push('Self-probe failed: a documented Link operation was not read from its row.');
}
if (documentedLinkOperations('| `pico.link.direct` `home.a.b` / `home.c.d` | Internal | n |').size !== 2) {
  errors.push('Self-probe failed: a documented family was read as one operation.');
}
if (documentedLinkOperations('| `pico.model.job.v1` | Internal | n |').size !== 0) {
  errors.push('Self-probe failed: a row that is not a Link operation was read as one.');
}
if (documentedLinkOperations('| `pico.link.direct` `home.a.b` | Internal | needs `x.y` |').size !== 1) {
  errors.push('Self-probe failed: a name in the prose column was read as an operation.');
}

for (const probe of probes) {
  const rows = tableRowsUnder(probe.document, probe.heading);
  if (rows === null || !probe.check(rows)) {
    errors.push(`Self-probe failed: the reader did not catch ${probe.name}.`);
  }
}

/**
 * Third direction: a served route somebody calls.
 *
 * The two directions above compare the registry against
 * `public-surfaces.md` - a route must be written down, and a written-down
 * route must be served. Neither asks whether anybody *asks* for it, and on
 * 2026-08-24 seventeen of sixty-one had no caller: twenty-eight are reached
 * by the dashboard, sixteen by the Companion or the Vault daemon over
 * Foundation HTTP, and the rest by nothing outside `app.ts` and its tests.
 *
 * That is not seventeen defects, and the argument list below is the point of
 * the check rather than an escape from it. Most of them are the *second*
 * door: the product speaks Pico Link, and `home.depot.attach` is the door in
 * use while `POST /api/depot/attachments` waits for a Foundation session that
 * no product opens. The rest are the reader-custody writer half, whose
 * absence this repository records in several places and which now says so
 * here too, next to the routes it is about.
 *
 * **A route is matched by the static part of its path**, because a client
 * builds `/api/model/jobs/${id}/keep` and the registry spells
 * `:jobId`. Tests do not count as callers, for the reason
 * `check-capability-reach.mjs` gives: a capability only a test reaches is a
 * capability nobody has.
 */

const routeCallerFiles = [];
const collectRouteCallers = (directory) => {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'out'
      || (directory === repoRoot && entry === 'scripts')) {
      continue;
    }
    const path_ = join(directory, entry);
    if (statSync(path_).isDirectory()) {
      collectRouteCallers(path_);
    } else if (/\.(ts|mjs|html|js)$/u.test(path_)
      && !/\.test\.(ts|mjs)$/u.test(path_)
      && path_ !== join(repoRoot, appPath)) {
      routeCallerFiles.push(path_);
    }
  }
};
collectRouteCallers(repoRoot);
/**
 * Ein Kommentar ist kein Aufrufer.
 *
 * **Gefunden am 2026-09-02 (Befund B55).** `GET /api/events` wird von nichts
 * gerufen - die Fläche liest `/api/events/tail` und schreibt mit `POST` -, und
 * dieser Prüfer nannte sie erreicht. Der Grund stand in vier Saetzen im
 * Protokollpaket: „the current Foundation POST /api/events", „what
 * `POST /api/events` accepts" und zwei weitere. Prosa über eine Route zaehlte
 * als Nennung, und weil in einem Kommentar kein `'POST'` *in
 * Anfuehrungszeichen* steht, sah die Verbpruefung dort gar kein Verb und liess
 * die Nennung fuer jedes gelten.
 *
 * `check-fingerprint-display` macht das seit dem 2026-08-21 richtig, und der
 * Kommentar dort sagt auch, was es kostete, es nicht zu tun: „half the files
 * that argue about this defect quote it".
 */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//gu, ' ')
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1');

const routeCallerText = routeCallerFiles
  .map((path_) => stripComments(readFileSync(path_, 'utf8')))
  .join('\n');

/**
 * Ob eine Route einen Aufrufer hat - und bei Adressen, die mehrere Verben
 * bedienen, ob es *ihr* Aufrufer ist.
 *
 * **Warum das überhaupt eine Frage ist.** Gesucht wird die Adresse; welches
 * Verb ein Aufrufer darauf schickt, steht ein paar Zeichen daneben. Solange
 * eine Adresse von genau einem Verb bedient wird, ist das gleichgültig. Am
 * 2026-08-29 wurden fünfzehn Adressen gezählt, die mehr als eines tragen -
 * dreiunddreissig Routen zusammen -, und dort bürgte ein einziger Aufrufer für
 * alle: wer `POST /api/auth/session` rief, liess `GET` und `DELETE` darauf als
 * erreicht gelten. Sieben Routen standen so bedient und ungerufen da, und der
 * Prüfer, dessen ganze Aufgabe das ist, sagte nichts.
 *
 * **Wie es enger wird, ohne falsch zu werden.** Nur für diese Adressen wird
 * genauer hingesehen, und nur in einem Fenster von zweihundert Zeichen um die
 * Nennung herum - so weit, wie ein `method:` in diesem Baum von seiner Adresse
 * entfernt steht. Findet sich dort das Verb, gilt die Route als gerufen; findet
 * sich *gar kein* Verb, gilt sie ebenfalls als gerufen, weil ein Aufrufer, der
 * seine Methode woanders herholt, kein Beweis für das Gegenteil ist. Nur ein
 * Fenster, das ausschliesslich *andere* Verben nennt, zählt als Nein.
 *
 * Das Ergebnis wurde gegen eine Handzählung derselben sieben gehalten, bevor
 * es hier stehen blieb. Befund B43 und B44 halten beides fest.
 */
const methodsPerPath = new Map();
for (const route of registered) {
  methodsPerPath.set(route.route, (methodsPerPath.get(route.route) ?? 0) + 1);
}
const httpVerbs = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
function reached(route, named) {
  named.lastIndex = 0;
  const mentions = [...routeCallerText.matchAll(named)];
  if (mentions.length === 0) {
    return false;
  }
  if ((methodsPerPath.get(route.route) ?? 1) < 2) {
    return true;
  }
  return mentions.some((mention) => {
    const window = routeCallerText.slice(
      Math.max(0, mention.index - 200),
      mention.index + 200,
    );
    const seen = httpVerbs.filter((verb) => window.includes(`'${verb}'`));
    return seen.length === 0 || seen.includes(route.method);
  });
}

/**
 * Die *ganze* Route als Muster, und nicht ihr Stamm.
 *
 * **Bis zum 2026-09-02 stand hier ein Stamm** - die Adresse, am ersten `:`
 * abgeschnitten - und daneben die Zusage, er müsse „enden, wo die Route
 * endet". Die Vorschau `(?![A-Za-z0-9_-])` hielt das für ein *angehängtes
 * Zeichen* (`/api/auth/session` gegen `/api/auth/sessions`) und nicht für ein
 * *angehängtes Segment*: `/api/events` stand deshalb mitten in
 * `/api/events/tail`, und die Liste bürgte für die Einzelroute daneben. Befund
 * B55.
 *
 * Jetzt wird die Route ganz gebaut: feste Stücke wörtlich, jeder Parameter als
 * Platzhalter für genau ein Segment, und das Ganze muss an einer URL-Grenze
 * enden - Anführungszeichen, Backtick, `?`, `#` oder Zeilenende. Ein Aufrufer,
 * der `` `/api/model/providers/${id}/decision` `` schreibt, wird gefunden; die
 * Liste `/api/memory/retention-policies` bürgt nicht mehr für
 * `/api/memory/retention-policies/:id`.
 *
 * **Damit fällt weg, was B44 für unauffindbar hielt.** Dort stand, eine Route
 * aus Sammeladresse und Parameter habe „kein eigenes Stück, an dem ein Muster
 * sie festhalten könnte", und ein Muster, das sie fände, meldete auch
 * Richtiges als falsch. Gemessen, bevor es hier stand: **fünf** von 61 Routen
 * ändern ihr Urteil, und jede einzelne wurde von Hand nachgesehen. Keine ist
 * ein Fehlalarm.
 *
 * **Was auch das nicht fängt**, gesagt statt geglaubt: einen Aufrufer, der die
 * Adresse aus Teilen zusammensetzt, statt sie an einer Stelle hinzuschreiben.
 * Keiner tut das heute (2026-09-02 gemessen), und der Tag, an dem einer es
 * tut, ist der Tag, an dem dieser Prüfer über ihn nichts sagt.
 *
 * **Und einen Transportschalter sieht er auch nicht** (2026-09-02 gemessen,
 * Befund B57). Die Zeremonien des Vault-Daemons nennen einen Foundation-Pfad
 * und stellen die Anfrage *entweder* darüber *oder* über Link -
 * `picoFoundationRequest` entscheidet das an einem `linkClient`, und
 * `picoLinkFoundationRequest` bildet denselben Pfad auf eine
 * Autoritätsressource ab. Wo jeder Produktaufrufer einen Link-Client mitgibt,
 * wird der HTTP-Weg nie genommen, obwohl der Pfad dasteht.
 *
 * Von den sieben so abgebildeten Pfaden trifft das heute zwei:
 * `/api/home/membership-lifecycle` und
 * `/api/home/reader-custody/reader-grant-lifecycle` - beide werden nur von
 * `apps/companion/src/home-authority.ts` aufgerufen, und die gibt in beiden
 * Fällen `livingDeviceLinkClient` mit. Die anderen fünf stehen in `cli.ts`,
 * wo der Standardtransport `local` ist, also wirklich HTTP.
 *
 * Das steht hier und nicht als Argument in der Liste unten: ein Argument sagt
 * „diese Route hat keinen Aufrufer", und die Gegenprobe würde es sofort
 * widerlegen, weil der Abgleich den Pfad findet. Was fehlt, ist keine
 * Begründung, sondern eine Auflösung, die einen Transportschalter lesen kann -
 * und die hat ein Textleser nicht.
 */
function wholeRoutePattern(route) {
  const body = route.split('/')
    .filter((part) => part !== '')
    .map((part) => (part.startsWith(':')
      // Ein Parameter ist genau ein Segment: ein `${…}` im Template oder ein
      // hingeschriebener Wert. Kein `/`, sonst bürgte er wieder für die Route
      // darunter.
      ? '(?:\\$\\{[^}]*\\}|[A-Za-z0-9_.:%-]+)'
      : part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')))
    .join('/');
  return new RegExp(`/${body}(?=[\`'"?#]|\\s|$)`, 'gu');
}

let routesChecked = 0;
let routesArgued = 0;
for (const route of registered) {
  routesChecked += 1;
  /**
   * Beide Fragen werden gestellt, und dann erst entschieden.
   *
   * **Die Reihenfolge war der Fehler** (2026-09-02, beim Pflanzen gefunden,
   * Befund B55). Zuerst stand hier `if (reached) continue;` und die
   * Widerspruchspruefung darunter - also lief sie fuer genau die Routen nie,
   * um die es geht: eine begruendete Route, die der Abgleich *doch* findet,
   * nahm den ersten Ausgang und kam am Widerspruch vorbei. Die Pflanzung
   * bestand weiter, nur mit anderen Zahlen, und das war der Beweis.
   */
  const isReached = reached(route, wholeRoutePattern(route.route));
  /**
   * Ein Argument darf ein Verb nennen, und wo es eines nennt, gilt es nur
   * dafür. `/api/auth/session` ist ein Präfix von `/api/auth/sessions`, und ein
   * Argument über das erste dürfte das zweite nicht mit stillstellen - genau
   * die Verwechslung, die dieser Prüfer an anderer Stelle schon einmal
   * eingefangen hat.
   *
   * Und wo ein Argument eine einzelne Route meint, nennt es sie ganz. Ein
   * Präfix mit Verb sah zuerst genau genug aus und stellte prompt
   * `POST /api/model/providers/:entryId/narrowing` mit stumm - eine Route, die
   * gerufen wird. Aufgefallen ist es beim Pflanzen, nicht beim Schreiben.
   */
  const argument = arguedRoutes.find((entry) => (entry.route === undefined
    ? route.route.startsWith(entry.prefix)
    : entry.route === route.route)
    && (entry.method === undefined || entry.method === route.method));
  if (argument === undefined && isReached) {
    continue;
  }
  if (argument !== undefined) {
    routesArgued += 1;
    /**
     * **Ein Argument, das nicht mehr stimmt, ist eine Luege in dieser Datei.**
     *
     * Bis zum 2026-09-02 hatte dieser Pruefer genau *eine* Art zu fallen: eine
     * Route ohne Aufrufer und ohne Argument. Zu *grosszuegig* zu sein war
     * unsichtbar - und genau daran sind B44 und B55 vorbeigekommen. Zwei
     * Pflanzungen zeigten es: mit dem alten Stamm-Abgleich und ohne das
     * Entfernen von Kommentaren bestand er weiter, nur mit anderen Zahlen.
     *
     * Diese Richtung ist die Gegenprobe und sie ist entscheidbar: was hier als
     * *ohne Aufrufer* begruendet steht, darf der Abgleich nicht finden. Wird
     * es gefunden, ist entweder inzwischen ein Client gebaut worden - dann
     * gehoert das Argument weg - oder der Abgleich ist zu weit geworden.
     * Gemessen, bevor es hier stand: heute null Widersprueche.
     */
    if (isReached) {
      errors.push(
        `${appPath}: ${route.method} ${route.route} is argued here as having no caller, and `
        + 'the caller search finds one. Either somebody built the client and this argument '
        + 'outlived it, or the search grew wide enough to vouch for a route from something '
        + 'that is not its caller. Both are worth stopping for; a stale argument is a lie in '
        + 'this file.',
      );
    }
    continue;
  }
  errors.push(
    `${appPath}: ${route.method} ${route.route} is served and nothing outside this file `
    + 'and its tests asks for it. Either a client is missing, or the door in use is '
    + 'somewhere else and that belongs beside the other arguments in this check.',
  );
}
if (routesChecked === 0) {
  errors.push(
    `${appPath}: no served route was checked for a caller, so this direction passed over `
    + 'nothing.',
  );
}
/**
 * Ein Argument über eine Route, die es nicht gibt, ist ein Satz über nichts.
 *
 * **Und bis zum 2026-09-02 prüfte das die Route-Einträge gar nicht** (Befund
 * B55). Die Schleife las nur `entry.prefix`, also trugen die Route-Einträge
 * ihre Adresse ein zweites Mal als `prefix` - allein, um hier durchzukommen.
 * Eine Wahrheit, zweimal geschrieben, und die zweite Fassung war nur dafür da,
 * eine Prüfung stillzustellen. Jetzt liest die Schleife beide Gestalten, und
 * bei einem Route-Eintrag auch sein Verb.
 */
for (const entry of arguedRoutes) {
  const covered = entry.route === undefined
    ? registered.some((route) => route.route.startsWith(entry.prefix))
    : registered.some((route) => route.route === entry.route
      && (entry.method === undefined || route.method === entry.method));
  if (!covered) {
    errors.push(
      `${entry.method === undefined ? '' : `${entry.method} `}`
      + `${entry.route ?? entry.prefix} is argued here as uncalled and no served route `
      + 'matches it.',
    );
  }
}

if (errors.length > 0) {
  console.error('Surface-class check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Surface-class check passed (${surfaceRows.length} surfaces, `
  + `${formRows.length} canonical forms, all classed; `
  + `${registered.length} served routes and ${operations.length} Link `
  + `operations, each named; ${registered.length - routesArgued} of those routes have a `
  + `caller and ${routesArgued} are argued without one).`,
);
