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
  + `${formRows.length} canonical forms, all classed).`,
);
