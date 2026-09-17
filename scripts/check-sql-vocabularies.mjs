import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A closed vocabulary the database enforces says the same words as the one
 * TypeScript enforces, and the TypeScript one has a name.
 *
 * **The occasion** (2026-09-17, finding B185). A `CHECK (col IN (...))` is the
 * last refusal a Home can make - the one that catches what the code missed.
 * There are 51 CHECK constraints in the schema, and turning 48 of them into
 * tautologies left all 1201 core tests green: nothing walks them. That is
 * defensible for defence in depth, so the useful question is not whether they
 * are walked but whether they still **agree** with the code. Each of these
 * vocabularies is a truth written twice, and this repository knows what a
 * truth written twice does.
 *
 * Disagreement has two shapes and both are quiet. If SQL admits less than
 * TypeScript, a value the code can produce is refused at the very last step,
 * after everything above it said yes. If SQL admits more, a value the code
 * refuses would be stored by anything that reaches the database another way -
 * a migration, a repair, a future writer.
 *
 * **What counts as a vocabulary on each side is derived, not listed.** In SQL:
 * a `CHECK` whose body is `<column> IN ('...', ...)`. In TypeScript: an
 * exported `[...] as const` array or an exported union of string literals.
 * They match when the sets of words are equal - the name and the order are the
 * code's business, the words are the contract.
 *
 * **Why the TypeScript side must be *named*.** Two of these vocabularies were
 * written inline at each use - `'pending' | 'vetoed' | 'effective'` four times
 * in one file, `'delegation' | 'key'` in three - and an anonymous vocabulary is
 * invisible to `copies:check`, which watches exported names. Naming them is
 * what made this check possible at all.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const schemaFile = join(repoRoot, 'apps', 'core', 'src', 'migrations.ts');

/**
 * A SQL vocabulary that deliberately says more than the code, and why.
 *
 * `admitsCollapsedName` is **verified, not trusted**: the surviving name must
 * still be in the set, and every extra word must be one that no TypeScript
 * vocabulary knows. An argument that stops being true fails here.
 */
const argued = [
  {
    table: 'pico_home_founding_record',
    column: 'schema',
    kind: 'admitsCollapsedName',
    surviving: 'pico.home.founding-record.v1',
    why: 'ADR 0134 F2 collapsed the v1/v2 founding-record schemas into the surviving '
      + 'v1 name on 2026-08-10, and this baseline is derived - read back from '
      + 'sqlite_master after the steps it folds. A migration describes what a '
      + 'database already holds, so it must not follow a renamed constant; '
      + 'check-wire-labels.mjs argues the same spelling for the same reason',
  },
];

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith('.ts') && !path.includes('.test.')) found.push(path);
  }
  return found;
}

/** The body of every `CHECK (...)`, paired with the table it stands in. */
function checkConstraints(text) {
  const found = [];
  let index = 0;
  for (;;) {
    const start = text.indexOf('CHECK (', index);
    if (start < 0) return found;
    let depth = 1;
    let end = start + 'CHECK ('.length;
    while (depth > 0 && end < text.length) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')') depth -= 1;
      end += 1;
    }
    const opener = text.lastIndexOf('CREATE TABLE', start);
    const table = /CREATE TABLE(?: IF NOT EXISTS)? (\w+)/u
      .exec(text.slice(opener, opener + 80));
    found.push({
      table: table === null ? '?' : table[1],
      body: text.slice(start, end).split(/\s+/u).join(' '),
    });
    index = end;
  }
}

const words = (text) => [...text.matchAll(/'([^']*)'/gu)].map((match) => match[1]);
/** A vocabulary is its set of words; the separator is a character none holds. */
const asKey = (list) => [...new Set(list)].sort().join('');

const schemaText = readFileSync(schemaFile, 'utf8');
const sqlVocabularies = [];
for (const constraint of checkConstraints(schemaText)) {
  const match = /(\w+)\s+IN\s*\(\s*((?:'[^']*'\s*,?\s*)+)\)/u.exec(constraint.body);
  if (match === null) continue;
  sqlVocabularies.push({
    table: constraint.table,
    column: match[1],
    words: words(match[2]),
  });
}

const named = new Map();
for (const root of ['apps', 'packages', 'modules']) {
  for (const path of sourceFiles(join(repoRoot, root))) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/export const (\w+)\s*=\s*\[([^\]]*)\]\s*as const/gsu)) {
      const list = words(match[2]);
      if (list.length > 0) named.set(asKey(list), `${match[1]} (${relative(repoRoot, path)})`);
    }
    for (const match of text.matchAll(/export type (\w+)\s*=\s*((?:\s*\|?\s*'[^']*')+)\s*;/gu)) {
      const list = words(match[2]);
      if (list.length > 0) named.set(asKey(list), `${match[1]} (${relative(repoRoot, path)})`);
    }
  }
}
const everyNamedWord = new Set([...named.keys()].flatMap((key) => key.split('')));

const arguedByColumn = new Map(argued.map((entry) => [`${entry.table}.${entry.column}`, entry]));
const failures = [];
let matched = 0;
for (const vocabulary of sqlVocabularies) {
  const qualified = `${vocabulary.table}.${vocabulary.column}`;
  const twin = named.get(asKey(vocabulary.words));
  const entry = arguedByColumn.get(qualified);
  if (twin !== undefined) {
    matched += 1;
    if (entry !== undefined) {
      failures.push(
        `${qualified} is argued as ${entry.kind}, but ${twin} says exactly these words; drop the entry`,
      );
    }
    continue;
  }
  if (entry === undefined) {
    failures.push(
      `${qualified} admits ${JSON.stringify(vocabulary.words)} and no exported TypeScript `
      + 'vocabulary says exactly those words. Either the two have drifted, or the '
      + 'TypeScript one is written inline and has no name to compare against.',
    );
    continue;
  }
  if (!vocabulary.words.includes(entry.surviving)) {
    failures.push(
      `${qualified} is argued as admitting a collapsed name beside ${entry.surviving}, `
      + 'which is not in the set',
    );
    continue;
  }
  for (const word of vocabulary.words) {
    if (word === entry.surviving) continue;
    if (everyNamedWord.has(word)) {
      failures.push(
        `${qualified} is argued as admitting the collapsed name ${word}, but a TypeScript `
        + 'vocabulary still says it',
      );
    }
  }
}

if (failures.length > 0) {
  console.error('SQL vocabulary check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `SQL vocabulary check passed (${sqlVocabularies.length} closed vocabularies the database `
    + `enforces, ${matched} of them saying exactly the words an exported TypeScript vocabulary `
    + `says; ${argued.length} argued as admitting a name the protocol collapsed away, and the `
    + 'surviving name is checked to be in the set rather than believed).',
  );
}
