import { execFileSync } from 'node:child_process';
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
 * **The root is the one place files are named too**, added 2026-08-17 after
 * the question "should we reorganise the root?" turned out to have a better
 * answer than moving anything. Eleven tracked files sat there unnamed, and
 * nothing would ever have said so: the directory direction above only looks at
 * directories, so a file with no directory to belong to was invisible to this
 * check and to every other one. Keeping the root tidy is worth a few lines
 * here; rearranging it would have invalidated 846 paths in ADR bodies that
 * ADR 0128 forbids rewriting.
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

/**
 * Names a tool chose, at the repository root.
 *
 * The same shape of rule as `node_modules` above and for the same reason: a
 * reader finds `pnpm-lock.yaml` by knowing pnpm, not by reading our map, and
 * naming it in the tree would spend a line of orientation on something that
 * needs none. What is left after this are files *we* named, which are found
 * only by reading the map - so those the tree has to carry.
 *
 * Concrete names rather than a pattern, because that is what makes it stable:
 * these change when the toolchain changes, and a check failing at that moment
 * is the check working.
 */
const toolOwnedRootFiles = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
]);

/**
 * The repository's own root files, as git knows them.
 *
 * **Tracked rather than merely present**, and that distinction is the reason
 * this shells out at all - the first and only gate that does. A working copy
 * accumulates local artefacts; this one carries two generated Recovery Card
 * PDFs, and a file that is ignored exists on one machine, so it cannot leave
 * anybody else's map incomplete. Reading the directory instead would report
 * somebody's scratch file as a documentation defect.
 *
 * Depth one, and only here. Naming every file in the tree would be a second
 * copy of it, which is the failure this whole check exists to catch; the root
 * is the exception because the root is where loose things land, with no
 * directory to belong to and nothing else looking at them.
 */
function trackedRootFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--', ':(top)*'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter((entry) => entry !== '' && !entry.includes('/'))
      .filter((entry) => !notPartOfTheTree(entry) && !toolOwnedRootFiles.has(entry));
  } catch {
    // Not a git checkout, or no git. Reported in the summary rather than
    // passed over: a direction that did not run must not read as a direction
    // that found nothing.
    return null;
  }
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

const rootFiles = trackedRootFiles();
for (const file of rootFiles ?? []) {
  if (!named.has(file)) {
    errors.push(
      `${path}: \`${file}\` is tracked at the repository root and the repository `
      + 'structure does not name it. The root is where a file with no directory to '
      + 'belong to lands, so an unnamed one is invisible to a reader and to every '
      + 'other check.',
    );
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
  // Said rather than folded into the pass: a direction that could not run is
  // not a direction that found nothing, and only the summary can tell a reader
  // which of the two they are looking at.
  + `${rootFiles === null
    ? 'root files not compared - not a git checkout'
    : `${rootFiles.length} tracked root files`}, `
  + `${named.size} entries named, each real; ${adrNumbers.length} ADRs, `
  + `${rowed.size} with a row and ${withoutRow.size} deliberately without one).`,
);
