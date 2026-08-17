import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository tree in `ReadmeTech.md`, checked against the repository.
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

if (errors.length > 0) {
  console.error('Documentation structure check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Documentation structure check passed (${topLevel.length} top-level directories, `
  + `${named.size} entries named, each real).`,
);
