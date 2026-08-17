import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Documents that claim to enumerate something, checked against the something.
 *
 * **Written after finding two stale hand-kept copies in one file.** That
 * document's endpoint table named nine routes while the Home served
 * sixty-one, and its directory tree was missing three apps, two packages,
 * three top-level directories and a Dockerfile that had been renamed. The
 * endpoint table was deleted and replaced by a pointer at the document a check
 * already reads. A directory tree has no such document - it is genuinely
 * useful orientation and it is nobody's source of truth - so it gets a check
 * instead.
 *
 * Both directions, in the idiom `check-surface-classes.mjs` uses. A directory
 * that exists and is unnamed leaves a reader with an incomplete map; a name
 * with no directory behind it sends them looking for something that is gone.
 * The second is the worse one, and it is the one a rename produces.
 *
 * Depth one only, deliberately. Naming every file would be a second copy of
 * the tree, which is the failure this exists to catch.
 *
 * The second subject is `implementation-status.md`, which says it "tracks
 * every numbered ADR file currently present" - and was missing one. That one
 * turned out to be missing on purpose, which is the interesting part: ADR 0146
 * is a draft sketch whose own status says it gets no matrix row, because those
 * follow acceptance rather than drafting.
 *
 * **So the exemption is a list here, two commits after an exemption list was
 * replaced by a rule.** The difference is what the exemption is made of. A
 * dot-directory is tooling by a property anybody can derive, so deriving it is
 * right and a list of them drifts. "This ADR is a draft and owes no row" is a
 * judgement somebody made about one document; judgements get written down
 * where a reader meets them, which is the matrix itself, with the reason
 * beside them.
 *
 * **What this cannot do is judge the reason.** Moving a real ADR into that
 * table with a sentence beside it passes, and should: deciding an ADR is a
 * draft is somebody's call, not a checker's. What the check buys is that the
 * absence is visible and argued in a document reviewers read, instead of being
 * a row nobody wrote.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const path = 'ReadmeTech.md';
const text = readFileSync(join(repoRoot, path), 'utf8');
const errors = [];

/**
 * What is not the repository's own shape.
 *
 * A rule rather than a list, and the first version was a list: `.git`,
 * `.github`, `.claude`, `.idea`, `.vscode` - which failed on the first run
 * against two dot-directories nobody had thought of. A hand-kept exemption
 * list is the same thing this check exists to catch, one level up.
 *
 * A dot-directory is tooling or state; `node_modules` is installed rather than
 * written. `.github/workflows` is still *named* in the block on purpose, and
 * the second direction below confirms it exists.
 */
function notPartOfTheTree(name) {
  return name.startsWith('.') || name === 'node_modules';
}

const block = /## Repository structure\n\n```text\n([\s\S]*?)```/u.exec(text);
if (block === null) {
  errors.push(`${path}: no repository structure block found.`);
}

/** Entries the block names, at any depth, with their tree glyphs removed. */
const named = new Set();
for (const line of (block?.[1] ?? '').split('\n')) {
  const entry = /^[│├└─\s]*([A-Za-z0-9._/-]+)/u.exec(line)?.[1];
  if (entry === undefined || entry === '.') {
    continue;
  }
  named.add(entry);
}

const topLevel = readdirSync(repoRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !notPartOfTheTree(entry.name))
  .map((entry) => entry.name);

for (const directory of topLevel) {
  if (!named.has(directory)) {
    errors.push(
      `${path}: \`${directory}/\` exists and the repository structure does not name it. `
      + 'A reader gets an incomplete map, which is how three apps and two packages '
      + 'went missing from this block.',
    );
  }
  // One level in, for the directories whose children the block already lists -
  // so an added app or package cannot hide inside a named parent.
  if (!['apps', 'packages', 'docs', 'docker'].includes(directory)) {
    continue;
  }
  for (const child of readdirSync(join(repoRoot, directory), { withFileTypes: true })) {
    if (notPartOfTheTree(child.name)) {
      continue;
    }
    if (!named.has(child.name)) {
      errors.push(
        `${path}: \`${directory}/${child.name}\` exists and the repository structure `
        + 'does not name it.',
      );
    }
  }
}

for (const entry of named) {
  // A leading path is written as one string in the block (`.github/workflows`).
  const candidates = [entry, ...topLevel.map((directory) => join(directory, entry))];
  if (!candidates.some((candidate) => existsSync(join(repoRoot, candidate)))) {
    errors.push(
      `${path}: the repository structure names \`${entry}\` and nothing by that name `
      + 'exists. A rename leaves a reader looking for something that is gone.',
    );
  }
}

// --- The ADR matrix against the ADRs ----------------------------------------

const matrixPath = 'docs/architecture/implementation-status.md';
const matrix = readFileSync(join(repoRoot, matrixPath), 'utf8');
const adrNumbers = readdirSync(join(repoRoot, 'docs', 'architecture'))
  .filter((entry) => /^\d{4}-.*\.md$/u.test(entry))
  .map((entry) => entry.slice(0, 4));

/**
 * Rows of the matrix, and the deliberate absences named beneath it.
 *
 * The exemption section is cut out before the rows are counted, because its
 * entries are rows too - the first version counted them as tracked ADRs, which
 * made the exemption satisfy the very check it is an exemption from and
 * reported 154 of 154 tracked while one was not.
 */
const exemptionSection = /### Deliberately without a row\n([\s\S]*?)\n## /u.exec(matrix);
const rowed = new Set(
  [...(exemptionSection === null
    ? matrix
    : matrix.replace(exemptionSection[0], '')).matchAll(/^\| \[(\d{4})\]/gmu)]
    .map(([, number]) => number),
);
const withoutRow = new Set(
  [...(exemptionSection?.[1] ?? '').matchAll(/^\| \[(\d{4})\]/gmu)]
    .map(([, number]) => number),
);

for (const number of adrNumbers) {
  if (!rowed.has(number) && !withoutRow.has(number)) {
    errors.push(
      `${matrixPath}: ADR ${number} has a file and no row. This matrix says it tracks `
      + 'every numbered ADR; a draft that owes none is named under "Deliberately '
      + 'without a row" with its reason, so an absence is a statement rather than '
      + 'an omission.',
    );
  }
}
for (const number of rowed) {
  if (!adrNumbers.includes(number)) {
    errors.push(
      `${matrixPath}: a row claims ADR ${number} and no such file exists.`,
    );
  }
}

if (errors.length > 0) {
  console.error('Documentation structure check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Documentation structure check passed (${topLevel.length} top-level directories, `
  + `${named.size} entries named, each real; ${adrNumbers.length} ADRs, `
  + `${rowed.size} with a row and ${withoutRow.size} deliberately without one).`,
);
