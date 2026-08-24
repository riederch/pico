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
const trackedRows = exemptionSection === null
  ? matrix
  : matrix.replace(exemptionSection[0], '');
const rowed = new Set(
  [...trackedRows.matchAll(/^\| \[(\d{4})\]/gmu)]
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

/**
 * Third direction: the evidence a row names must exist.
 *
 * This matrix is the one document whose whole job is to be true *now* - the
 * ADRs keep their text under ADR 0128 and record what was decided, and a path
 * that has moved since stays in an ADR body as history. Here a path is a
 * pointer somebody is meant to follow, and a pointer into nothing is a claim
 * that cannot be checked.
 *
 * **Measured before being written, because the broad version is unusable.**
 * Over every backticked token the matrix holds, 44 look dead across the docs
 * tree and almost all of them are fine: `07_Governance/QA_Checklist.md` is
 * relative to the design system's own root, `pico_core/config.yaml` is the
 * add-on's name before it was renamed and belongs in the ADR that decided it,
 * `./helper.js` is an example in prose, and a bare `main.ts` is how English
 * names a file. So the rule is narrowed to what cannot be any of those: a
 * token that begins with a directory this repository actually has at its root,
 * carries a file extension and no glob. That is 880 paths, and it found two -
 * `scripts/reachability.mjs`, which the same row spells in full four hundred
 * words earlier, and `packages/module-spatial-recall/src/ports.ts`, which is
 * `modules/`. The second was the pointer at ADR 0129 SR5's deferral: the one
 * link to work that is waiting, aimed at nothing.
 *
 * It needs no exemption list, which is the test of whether a rule this cheap
 * is the right one.
 */
const topLevelDirectories = new Set(
  readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !notPartOfTheTree(entry.name))
    .map((entry) => entry.name),
);
let matrixPathsChecked = 0;
matrix.split('\n').forEach((line, index) => {
  if (!line.startsWith('|')) {
    return;
  }
  for (const [, token] of line.matchAll(/`([^`\s]+)`/gu)) {
    const named = token.replace(/[.,;:)]+$/u, '');
    if (!named.includes('/')
      || named.includes('*')
      || !topLevelDirectories.has(named.split('/')[0])
      || !/\.[a-z0-9]{1,5}$/iu.test(named)) {
      continue;
    }
    matrixPathsChecked += 1;
    if (existsSync(join(repoRoot, named))) {
      continue;
    }
    errors.push(
      `${matrixPath}:${index + 1}: names \`${named}\`, and there is no such file. This `
      + 'matrix is read as the current state, so a path in it is a pointer somebody '
      + 'follows rather than a record of where something was. Name where the file is '
      + 'now, or say in the row that it is gone.',
    );
  }
});
if (matrixPathsChecked === 0) {
  errors.push(
    `${matrixPath}: no path under a root directory was checked, so this direction passed `
    + 'over nothing. Either the matrix stopped naming evidence or the reading of it broke.',
  );
}

// --- Second indexes over the ADRs --------------------------------------------

/**
 * A document that lists ADRs is either pointing at a few or trying to be the
 * index, and only one of those keeps working.
 *
 * **The README was the second index and it stopped at 0102.** Its
 * documentation map listed seventy-six ADRs, each with a hand-written
 * description, and everything from 0103 on - fifty-two decisions, including
 * every one made this month - was simply absent. Nobody noticed, because a
 * list that is never wrong about what it contains is only wrong about what it
 * omits. The block was deleted and replaced by a pointer at
 * `implementation-status.md`, which is checked in both directions above -
 * exactly what was done to that same file's stale endpoint table.
 *
 * The threshold is generous on purpose. `ReadmeTech.md`'s largest topical
 * group is seven ADRs behind one subject, which is the *useful* form of this
 * and must keep passing; a document approaching twenty is no longer pointing
 * at decisions, it is enumerating them, and the enumeration exists elsewhere.
 */
const secondIndexThreshold = 20;
const markdownFiles = [];
const collectMarkdown = (directory) => {
  for (const entry of readdirSync(join(repoRoot, directory), { withFileTypes: true })) {
    if (notPartOfTheTree(entry.name)) {
      continue;
    }
    const here = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      collectMarkdown(here);
    } else if (entry.name.endsWith('.md')) {
      markdownFiles.push(here.replace(/^\.\//u, ''));
    }
  }
};
for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
  if (notPartOfTheTree(entry.name)) {
    continue;
  }
  if (entry.isDirectory()) {
    collectMarkdown(entry.name);
  } else if (entry.name.endsWith('.md')) {
    markdownFiles.push(entry.name);
  }
}

for (const file of markdownFiles) {
  if (file === matrixPath) {
    continue;
  }
  const listed = new Set();
  for (const line of readFileSync(join(repoRoot, file), 'utf8').split('\n')) {
    if (!/^\s*[-*]/u.test(line)) {
      continue;
    }
    for (const [, number] of line.matchAll(/docs\/architecture\/(\d{4})-/gu)) {
      listed.add(number);
    }
  }
  if (listed.size >= secondIndexThreshold) {
    errors.push(
      `${file}: lists ${listed.size} architecture decisions. That is an index, and the index is `
      + `\`${matrixPath}\`, which is checked against the tree in both directions. A second one `
      + 'drifts silently - this document carried seventy-six and stopped at 0102, missing every '
      + 'decision made in the following month.',
    );
  }
}

// --- The matrix's own claims about absence -----------------------------------

/**
 * Sentences that say a named symbol has no caller, checked against the tree.
 *
 * **Written after finding three stale ones in an afternoon.** ADR 0151's row
 * said `picoModelProviderMayCarry` had no caller "because nothing assembles a
 * job yet" - jobs had been assembled for weeks and `picoModelJobRefusal` calls
 * it from two places. ADR 0113's said production profile and keystore-binding
 * creation remained open; both are written by the shell's first run. And ADR
 * 0151's status said no scheduler existed, while a model-job sweep runs on its
 * own interval.
 *
 * None of those was a lie when it was written. That is exactly the problem: a
 * status note is prose about code, and prose does not move when code does, so
 * the reader most likely to trust it is the one who cannot check.
 *
 * **Only the present tense is checked, and only with a named symbol.** "*had*
 * no caller" is history and often the whole point of a status note - this
 * repository's notes are mostly about defects that were closed. "*has* no
 * caller" is a claim about now, and now is checkable.
 */
const absenceClaim = /`([A-Za-z][A-Za-z0-9_]*)`[^.|]{0,140}?\b(?:has|have) no caller\b/gu;
const treeSources = [];
const collectSources = (directory) => {
  for (const entry of readdirSync(join(repoRoot, directory), { withFileTypes: true })) {
    if (notPartOfTheTree(entry.name) || entry.name === 'dist') {
      continue;
    }
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      collectSources(path);
    } else if (/\.(ts|mts|cts)$/u.test(entry.name) && !/\.test\.ts$/u.test(entry.name)
      && !/\/test-[^/]+$/u.test(path)) {
      treeSources.push(readFileSync(join(repoRoot, path), 'utf8'));
    }
  }
};
for (const directory of ['apps', 'packages', 'modules']) {
  collectSources(directory);
}

let claimsChecked = 0;
for (const [, symbol] of matrix.matchAll(absenceClaim)) {
  claimsChecked += 1;
  const called = new RegExp(`\\.?\\b${symbol}\\s*\\(`, 'gu');
  // Its own declaration is not a call, so a single occurrence in one file is
  // the definition and nothing more.
  const occurrences = treeSources
    .reduce((total, source) => total + (source.match(called)?.length ?? 0), 0);
  const declared = new RegExp(`(?:function|public|const)\\s+${symbol}\\b`, 'u')
    .test(treeSources.join('\n'));
  if (occurrences > (declared ? 1 : 0)) {
    errors.push(
      `${matrixPath}: says \`${symbol}\` has no caller, and the tree calls it. A status note is `
      + 'prose about code and does not move when the code does - which is how three of these went '
      + 'stale in one afternoon. Past tense ("had no caller") is history and is not checked.',
    );
  }
}

/**
 * Rows that say nothing is built, against the column that says what is.
 *
 * **Written 2026-08-20 after finding four of these in one file.** ADR 0131's
 * row opened "Nothing here is built and no Android artifact exists" while its
 * own appended notes below described an APK on a Galaxy A55, a two-process
 * custody split and four measured gates. ADR 0132's said it while
 * `recovery-card-content.ts` existed; ADR 0135's said it under a status
 * column reading `implemented`; ADR 0130's fifth note said renewing another
 * device "is not built" and its sixth, the same day, named the function that
 * does it.
 *
 * Every one was true when written, and that is the point the check above
 * already makes about prose. This one needs no knowledge of the tree at all:
 * a cell that claims *nothing* is built contradicts its own status column,
 * and the contradiction is visible inside one row.
 *
 * **What this deliberately cannot see.** The claim has to be about the whole
 * row - "nothing is built" - because a partially implemented ADR may say
 * truthfully that some named half is not, and telling those apart is reading,
 * not matching. ADR 0130's was found by hand and would still pass here. The
 * cure for a claim that outlives its truth is the past tense, which is what
 * those four now use; history is not a claim about now.
 */
const builtNothingClaim = /\bnothing (?:here )?(?:is|has been) built\b/iu;
const mayClaimNothingBuilt = new Set(['concept-only', 'not implemented', 'reserved']);
let statusClaimsChecked = 0;
for (const row of trackedRows.split('\n')) {
  if (!/^\| \[\d{4}\]/u.test(row)) {
    continue;
  }
  const cells = row.split('|').map((cell) => cell.trim());
  const [, number, , , status = ''] = cells;
  const narrative = cells.slice(5).join('|');
  if (!builtNothingClaim.test(narrative)) {
    continue;
  }
  statusClaimsChecked += 1;
  if (!mayClaimNothingBuilt.has(status)) {
    errors.push(
      `${matrixPath}: ADR ${number.slice(1, 5)} says nothing is built and its status column says `
      + `\`${status}\`. One of the two is out of date, and a reader who skims the first sentence `
      + 'of a cell never reaches the notes that correct it. Past tense ("was not built when this '
      + 'row was written") keeps the history without claiming the present.',
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
  + `${rowed.size} with a row and ${withoutRow.size} deliberately without one, `
  + `${matrixPathsChecked} named files under a root directory, each real; `
  + `${claimsChecked} present-tense absence claims and `
  + `${statusClaimsChecked} nothing-is-built claims, each still true).`,
);
