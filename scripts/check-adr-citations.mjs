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

/**
 * Befund B250. Eine Entscheidung, die nicht mehr gilt, hat trotzdem eine
 * Datei - und die Regel oben laesst jede Nummer durch, zu der es eine gibt.
 *
 * Vier Zeilen der Statusmatrix stehen auf `superseded` - welche, sagt die
 * Matrix und der Befund, nicht dieser Kommentar: die Regel unten gilt fuer
 * jede Quelle, und diese Datei ist eine. Eine Regel mit einer Ausnahme fuer
 * sich selbst waere schwaecher als eine ohne.
 *
 * Es ist der einzige maschinenlesbare Zustand, den dieses Projekt ueber eine
 * Entscheidung fuehrt - die ADRs selbst haben einen freien
 * `## Status`-Abschnitt aus Prosa, aus dem sich nichts ableiten laesst.
 *
 * **Zwei Saetze, beide heute wahr, beide von nichts gehalten.**
 *
 * Erstens: keine der vier wird von einer Quelle zitiert. Ein Zitat in
 * Produktcode liest sich als aktuell - es hiesse, diese Zeile folge einer
 * Regel, die nicht mehr gilt, und bei einer der vier zeigt die alte Kernregel
 * sogar *in die andere Richtung*. Dokumente sind ausgenommen:
 * dieses Repository schreibt seine Historie absichtlich in die Prosa, und die
 * Konformitaetsfixtures **muessen** sagen, was sie einmal waren.
 *
 * Zweitens: jede der vier nennt ihren Nachfolger, der existiert und selbst
 * nicht abgeloest ist. Eine Abloesung ohne Nachfolger waere eine Entscheidung,
 * die aufgehoert hat zu gelten, ohne dass etwas an ihre Stelle trat - und das
 * waere ein Loch und keine Abloesung.
 */
const matrixPath = 'docs/architecture/implementation-status.md';
const matrixStatus = new Map();
const matrixReason = new Map();
for (const line of readFileSync(join(repoRoot, matrixPath), 'utf8').split('\n')) {
  if (!line.startsWith('| [')) continue;
  const columns = line.split('|').map((column) => column.trim());
  const number = /^\[(\d{4})\]/u.exec(columns[1]);
  if (number === null) continue;
  matrixStatus.set(number[1], columns[4]);
  matrixReason.set(number[1], columns.slice(5).join(' | '));
}
const superseded = [...matrixStatus].filter(([, status]) => status === 'superseded').map(([n]) => n);
if (matrixStatus.size === 0) {
  failures.push(
    `${matrixPath}: no rows read, so the superseded rules below ran over nothing (B166).`,
  );
}
for (const number of superseded) {
  const successor = /[Ss]uperseded by ADR (\d{4})/u.exec(matrixReason.get(number));
  if (successor === null) {
    failures.push(
      `${matrixPath}: ADR ${number} is filed superseded and its row names no successor. `
      + 'A decision that stopped holding with nothing in its place is a hole rather than a '
      + 'supersession, and a reader has nowhere to go.',
    );
    continue;
  }
  const status = matrixStatus.get(successor[1]);
  if (status === undefined) {
    failures.push(
      `${matrixPath}: ADR ${number} names ADR ${successor[1]} as its successor and the matrix `
      + 'has no row for it.',
    );
  } else if (status === 'superseded') {
    failures.push(
      `${matrixPath}: ADR ${number} is superseded by ADR ${successor[1]}, which is itself `
      + 'superseded. The chain has to end at a decision that holds.',
    );
  }
}

/**
 * Nur Quellen, nicht Dokumente. Ein Dokument darf sagen, was einmal galt;
 * eine Zeile Produktcode, die eine abgeloeste Entscheidung nennt, behauptet,
 * ihr zu folgen.
 */
const supersededSet = new Set(superseded);
for (const path of corpus) {
  if (!/\.(ts|mts|cts|mjs|cjs|js)$/u.test(path)) continue;
  const text = readFileSync(join(repoRoot, path), 'utf8');
  for (const [, number] of text.matchAll(/\bADR (\d{4})\b/gu)) {
    if (!supersededSet.has(number)) continue;
    failures.push(
      `${path} cites ADR ${number}, which the matrix files as superseded`
      + `${/[Ss]uperseded by ADR (\d{4})/u.exec(matrixReason.get(number)) === null
        ? ''
        : ` by ADR ${/[Ss]uperseded by ADR (\d{4})/u.exec(matrixReason.get(number))[1]}`}. `
      + 'A citation in code reads as the rule this line follows. Name the decision that '
      + 'holds today, or - if the line really is about the older one - say so in prose '
      + 'rather than as a bare citation.',
    );
  }
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
    + `token that record carries; ${superseded.length} records are filed superseded, each `
    + 'naming a successor that holds, and no source cites one).',
  );
}
