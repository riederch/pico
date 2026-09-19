import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A decision this tree cites by name is one the decision record actually
 * makes.
 *
 * **The occasion** (2026-09-19, finding B223). This repository argues in
 * citations: `ADR 0119 Q4`, `ADR 0104 S5`, `ADR 0121 J1`, `ADR 0153 PK3`. The
 * number says which document and the **label** says which gate inside it - and
 * the label is the load-bearing half, because that is what names the promise a
 * line of code is keeping. Nothing held them to their documents.
 *
 * Measured: 3,600 labelled citations in sources and 1,159 in documents, of
 * which **one** named a gate its ADR does not have - an `R5` over the
 * crypto-shred path in ADR 0072, where the whole point of the citation is that
 * somebody decided this. That record has exactly one label, `R6`, and inherits
 * it from ADR 0071; its shredding decision is point 4 of a numbered list.
 *
 * **The label is written apart from its number on purpose, right here.** The
 * first version of this comment quoted the wrong citation the way it is
 * written, and this check reads its own file - so it failed on its own
 * explanation. It did not fail on the first run, and that is the part worth
 * keeping: the corpus is `git ls-files`, and an uncommitted checker is not in
 * it. A gate of this kind is blind to itself until it is committed.
 *
 * **The bare number is checked too**, and it was already sound: 118 distinct
 * ADR numbers, every one a file. That half will not fail often, which is why
 * it is cheap to keep - a renumbered ADR would break it at once.
 *
 * What this cannot do is know whether a label still says what the citing line
 * believes. It can know that the document has the label at all, and that was
 * enough to find the one that did not.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

const tracked = () => execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '');

/** Where the decisions live, keyed by the four digits their filename starts with. */
const records = new Map();
for (const path of tracked()) {
  const match = /^docs\/architecture\/(\d{4})-/u.exec(path);
  if (match !== null) records.set(match[1], path);
}

/**
 * Everything that argues: the sources and the documents both.
 *
 * `dist/` is out because it is a copy of sources that are already read, and a
 * stale build would report the same citation twice or report one that the tree
 * no longer has.
 */
const corpus = tracked()
  .filter((path) => /\.(ts|mjs|js|java|md)$/u.test(path))
  .filter((path) => !path.includes('/dist/') && !path.includes('/node_modules/'));

/**
 * `ADR 0119 Q1/Q2` and `ADR 0071/0072` are both written here, so both are
 * read: numbers may be slash-joined and so may labels, and a label that drops
 * its letters after the slash (`PK2/3`) borrows them from the one before it.
 */
const citation = /\bADR (\d{3,4}(?:\/\d{3,4})*)((?:[ ]+[A-Z]{1,3}\d{1,2}(?:\/[A-Z]{0,3}\d{1,2})*)?)/gu;

const failures = [];
const body = new Map();
let numbers = 0;
let labelled = 0;

for (const path of corpus) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  if (!text.includes('ADR ')) continue;
  for (const match of text.matchAll(citation)) {
    const cited = match[1].split('/').map((one) => one.padStart(4, '0'));
    const labels = match[2].trim();
    for (const number of cited) {
      numbers += 1;
      if (!records.has(number)) {
        failures.push(`${path} cites ADR ${number} and there is no such decision record`);
      }
    }
    if (labels === '') continue;

    // Ein Zitat mit Marke meint das *erste* genannte ADR: `ADR 0071/0072 R6`
    // sagt, dass R6 aus 0071 stammt und 0072 es traegt, und die Schreibweise
    // nennt die Quelle zuerst.
    const number = cited[0];
    const path0 = records.get(number);
    if (path0 === undefined) continue;
    if (!body.has(path0)) body.set(path0, readFileSync(join(repoRoot, path0), 'utf8'));
    const record = body.get(path0);

    let letters = '';
    for (const part of labels.split('/')) {
      const label = /^[A-Z]/u.test(part) ? part : `${letters}${part}`;
      letters = /^[A-Z]+/u.exec(label)?.[0] ?? letters;
      labelled += 1;
      if (!new RegExp(`(^|[^A-Za-z0-9])${label}([^A-Za-z0-9]|$)`, 'u').test(record)) {
        failures.push(
          `${path} cites ADR ${number} ${label}, and ${path0} has no ${label}. The number says `
          + 'which document and the label says which gate; a label the document does not have is '
          + 'a promise nobody made.',
        );
      }
    }
  }
}

if (numbers === 0) {
  failures.push(
    'not one ADR citation was found in the whole tree. Either this repository stopped arguing '
    + 'from its decisions or this reader stopped recognising how, and a check with no subject '
    + 'passes by having nothing to say.',
  );
}

if (failures.length > 0) {
  console.error('ADR citation check failed:');
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `ADR citation check passed (${numbers} citations of ${records.size} decision records across `
    + `${corpus.length} tracked sources and documents, every number a record this repository has; `
    + `${labelled} of them name a gate inside their record, and every one of those gates is a `
    + 'token that record carries).',
  );
}
