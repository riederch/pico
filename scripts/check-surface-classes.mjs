import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const operationsPath = 'packages/protocol/src/index.ts';
const operationsSource = readFileSync(join(repoRoot, operationsPath), 'utf8');
const operationBlock = /export const picoLinkDirectOperations = \[([\s\S]*?)\] as const;/u
  .exec(operationsSource);
const operations = operationBlock === null
  ? []
  : [...operationBlock[1].matchAll(/'([a-z0-9_.-]+)'/gu)].map(([, name]) => name);

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
  + 'operations, each named).',
);
