import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const registered = [
  ...appSource.matchAll(
    /accessClasses\.register\(\s*'([A-Z]+)',\s*'([^']+)',\s*'([^']+)'/gu,
  ),
].map(([, method, route, accessClass]) => ({ method, route, accessClass }));

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
const arguedRoutes = [
  {
    prefix: '/api/home/domain-read-grant',
    why: 'ADR 0082 with ADR 0130 E5. The door in use is the Link operation '
      + '`home.domain.read-grant.submit`, which the companion calls from the person\'s own '
      + 'device; this is the same signed evidence over a Foundation session, and no product '
      + 'opens one for it',
  },
  {
    prefix: '/api/home/share-envelope',
    why: 'ADR 0086/0089. No companion issues or receives a share envelope, and there is no '
      + 'Link operation either - this family has no door in use at all, which is the same '
      + 'absence ADR 0130 E5 stays open on',
  },
  {
    prefix: '/api/home/reader-custody/',
    why: 'ADR 0086/0117 with ADR 0130 E5. The Foundation transport of records the product '
      + 'carries over Link instead: the window creates a reader-custody space, writes into '
      + 'it, lets a second device in and rotates the lock, and every one of those goes '
      + 'through an authority resource rather than through these routes. The argument here '
      + 'said until 2026-08-29 that nothing in the product writes reader-custody content, '
      + 'which stopped being true on 2026-08-26',
  },
  {
    prefix: '/api/auth/bootstrap',
    why: 'ADR 0130. A Home is claimed from the Client over Link (`home.claim.submit`), and '
      + 'the Foundation bootstrap is what the tool used before that walk existed',
  },
  {
    prefix: '/api/depot/attachments',
    why: 'ADR 0143. `home.depot.attach` is the door in use',
  },
  {
    prefix: '/api/model/jobs/',
    why: 'ADR 0117/0151. `home.model.read.keep` is the door in use',
  },
  {
    prefix: '/api/model/providers/mine',
    why: 'ADR 0151. `home.model.providers.read` is the door in use',
  },
  {
    prefix: '/api/memory/time-bound-entries/',
    why: 'ADR 0118 O1. `home.time_bound_entry.acknowledge` is the door in use',
  },
  {
    route: '/api/auth/session',
    prefix: '/api/auth/session',
    method: 'GET',
    why: 'ADR 0076. Die Betreiberfläche hält ihre Sitzung im Speicher, solange ihr Reiter '
      + 'offen ist, und fragt niemanden, ob sie noch gilt - ein Aufruf, der scheitert, sagt '
      + 'es ihr an der Stelle, an der es zählt. Gefunden am 2026-08-29, als der Aufrufertest '
      + 'anfing, das Verb zu lesen (Befund B44)',
  },
  {
    route: '/api/auth/session',
    prefix: '/api/auth/session',
    method: 'DELETE',
    why: 'ADR 0076. Abgemeldet wird alles auf einmal - die Fläche ruft '
      + '`DELETE /api/auth/sessions` -, weil eine Person, die aufhört, nicht meint '
      + '„dieser Reiter" sondern „dieses Home". Die Einzelsitzungs-Hälfte hat keinen '
      + 'Aufrufer (Befund B44)',
  },
  {
    route: '/api/model/providers/:entryId/decision',
    prefix: '/api/model/providers/',
    method: 'POST',
    why: 'ADR 0152 SE6. Die Tür in Gebrauch ist `home.model.provider.decision.submit`, die '
      + 'das Fenster vom Gerät der Person aus ruft; das hier ist dieselbe Entscheidung über '
      + 'eine Foundation-Sitzung, und keine öffnet dafür eine. `/narrowing` liegt unter '
      + 'demselben Präfix und wird gerufen, deshalb steht das Verb daneben',
  },
  {
    route: '/api/model/providers/:entryId/decision',
    prefix: '/api/model/providers/',
    method: 'DELETE',
    why: 'ADR 0152 SE6, die Rücknahme derselben Entscheidung: '
      + '`home.model.provider.decision.revoke` ist die Tür in Gebrauch',
  },
  {
    prefix: '/api/system/version',
    why: 'ADR 0075. A diagnostic a person never asks for and no client polls; it exists so '
      + 'somebody with a terminal can tell what is running. The only route here with '
      + 'neither a caller nor a Link twin',
  },
];

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
const routeCallerText = routeCallerFiles
  .map((path_) => readFileSync(path_, 'utf8'))
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
 * Und was hinter einem Parameter noch kommt, muss auch jemand nennen.
 *
 * Der Stamm endet am ersten `:`, also steht `/api/model/providers` für
 * `/api/model/providers/:entryId/decision` genauso wie für
 * `/api/model/providers/mine` - eine Sammeladresse bürgt für alles, was hinter
 * ihr liegt. Wo eine Route hinter dem Parameter weitergeht, wird dieses letzte
 * Stück deshalb eigens verlangt.
 *
 * **Was auch das nicht fängt**, gesagt statt geglaubt: eine Route, die *nur*
 * aus Sammeladresse und Parameter besteht - `GET /api/memory/retention-policies/:id`
 * neben der Liste, `GET /api/memory/domains/:d/items/:id` neben ihrer -, hat
 * kein eigenes Stück, an dem sie sich festhalten liesse. Zwei solche Routen
 * gibt es (Stand 2026-08-29), beide gelesen und beide ohne Aufrufer; sie
 * stehen in Befund B44 statt in einem Muster, das sie nicht sieht.
 */
function tailNamed(route) {
  const parts = route.route.split('/');
  const parameterAt = parts.findIndex((part) => part.startsWith(':'));
  if (parameterAt < 0 || parameterAt === parts.length - 1) {
    return true;
  }
  return parts.slice(parameterAt + 1)
    .filter((part) => !part.startsWith(':'))
    .every((part) => new RegExp(`/${part}(?![A-Za-z0-9_-])`, 'u').test(routeCallerText));
}

let routesChecked = 0;
let routesArgued = 0;
for (const route of registered) {
  routesChecked += 1;
  const stem = route.route.split('/:')[0];
  /**
   * The stem must end where the route ends. A plain `includes` made
   * `/api/auth/session` look reached because the dashboard names
   * `/api/auth/sessions` four lines away - one route standing in for another
   * by being a prefix of it, which is exactly the confusion this direction
   * exists to catch.
   */
  const named = new RegExp(
    `${stem.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![A-Za-z0-9_-])`,
    'gu',
  );
  if (reached(route, named) && tailNamed(route)) {
    continue;
  }
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
  if (arguedRoutes.some((entry) => (entry.route === undefined
    ? route.route.startsWith(entry.prefix)
    : entry.route === route.route)
    && (entry.method === undefined || entry.method === route.method))) {
    routesArgued += 1;
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
/** An argument for a prefix no route carries is a sentence about nothing. */
for (const entry of arguedRoutes) {
  if (!registered.some((route) => route.route.startsWith(entry.prefix))) {
    errors.push(
      `${entry.prefix} is argued here as uncalled and no route starts with it.`,
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
