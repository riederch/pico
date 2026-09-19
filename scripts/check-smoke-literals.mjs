import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every string the release job expects to find in the product is one the
 * product still says.
 *
 * **The occasion** (2026-09-19, finding B218). The container smoke tests are
 * the only place anything drives the built images, and they decide what they
 * saw by searching their output for literals: a dashboard title, a service
 * name, three boot-log events. Each of those is a truth written twice - once
 * in `.github/workflows/ci.yml`, once in a source file - and nothing has ever
 * held the two together.
 *
 * It has already gone wrong once, and the workflow says so in its own comment:
 * a line the job grepped for moved to a later boot, "which is a check that
 * could not pass and read as a broken image for two days".
 *
 * **And since 2026-09-18 it is worse, by my own change.** The job no longer
 * runs on every push - it runs on a release tag and on a button. A literal
 * that drifted used to fail on the next push, when whoever renamed it was
 * still looking; now it fails at the tag, on the one job nobody re-runs
 * cheaply.
 *
 * **The literals are extracted, not listed.** A list here would be the third
 * copy of the same truth. What the workflow greps for is read out of the
 * workflow, and **a grep this reader cannot parse fails the check** rather
 * than being skipped: a vocabulary that grows silently stops being one.
 *
 * What this cannot do is know whether the product says a word *in the place
 * the job looks*. It can know that the word still exists in a shipped source
 * at all - and that is the failure that has actually happened here.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Comment lines are prose about greps, not greps. */
const isComment = (line) => line.trimStart().startsWith('#');

/**
 * The shapes the smoke tests search with.
 *
 * `said` is the workflow's own helper - it retries `grep -q "$1"` against the
 * container log - so its argument is a literal like any other, and the helper's
 * own `grep` carries the parameter rather than a word.
 */
const searches = [
  /\bgrep\s+-[a-zA-Z]*\s+"([^"$]+)"/u,
  /\bgrep\s+-[a-zA-Z]*\s+'([^']+)'/u,
  /\bgrep\s+-[a-zA-Z]*\s+([A-Za-z_][A-Za-z0-9_]*)\s/u,
  /^said\s+'([^']+)'/u,
  /^said\s+"([^"$]+)"/u,
  /^said\s+([A-Za-z_][A-Za-z0-9_]*)\s*\\?$/u,
];

/** A parameter rather than a literal: the helper, not a search of its own. */
const carriesParameter = (line) => /\bgrep\s+-[a-zA-Z]*\s+"\$/u.test(line);

/** Words long enough to be a name somebody could rename. */
const wordsOf = (literal) => [...new Set(
  (literal.match(/[A-Za-z][A-Za-z0-9_.-]{3,}/gu) ?? []).filter((word) => !/^\[/u.test(word)),
)];

function tracked(pattern) {
  return execFileSync('git', ['ls-files', pattern], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '');
}

/**
 * What ships: sources of the apps, the protocol and the modules, plus the
 * dashboard's own HTML - the title the job reads lives there and nowhere else.
 * Tests are out on purpose: a literal that only a test still says is a literal
 * the product stopped saying.
 */
const shipped = ['apps', 'packages', 'modules']
  .flatMap((root) => tracked(`${root}/`))
  .filter((path) => /\.(ts|html|mjs|java)$/u.test(path))
  .filter((path) => !path.includes('.test.') && !path.includes('/dist/'));

const corpus = shipped.map((path) => readFileSync(join(repoRoot, path), 'utf8')).join('\n');

/**
 * A path the smoke tests call **so that it answers like nothing**, and the
 * product must therefore not serve.
 *
 * Verified rather than trusted: the path has to be genuinely absent from every
 * shipped source, so the day somebody adds a route by that name, the check
 * that proves the public port carries no map of itself stops proving it - and
 * fails here instead of passing there.
 */
const mustStayUnknown = [
  {
    path: '/nothing-here',
    why: 'ADR 0153 PK3. The relay answers an unknown route exactly as it answers '
      + '/health, so the public port enumerates nothing. The smoke test compares the '
      + 'two bodies, which only means something while this path is unserved',
  },
];

const failures = [];
const matched = [];
let verbatim = 0;

if (shipped.length === 0) {
  failures.push('no shipped source was found, so this check has nothing to compare against');
}

const workflows = tracked('.github/workflows').filter((path) => path.endsWith('.yml'));
let found = 0;
for (const path of workflows) {
  const lines = readFileSync(join(repoRoot, path), 'utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    const where = `${path}:${index + 1}`;
    if (isComment(line)) continue;
    // `said` only where the line *is* the call. The workflow's prose says the
    // word too ("a relay nobody has claimed said nothing about it"), and a
    // reader that took that for a search would demand the product say a
    // sentence of English.
    const searching = /\bgrep\b/u.test(line) || /^said\s/u.test(line.trimStart());
    if (!searching) continue;
    if (carriesParameter(line)) continue;

    const literal = searches
      .map((shape) => shape.exec(line.trimStart())?.[1])
      .find((one) => one !== undefined);
    if (literal === undefined) {
      failures.push(
        `${where} searches product output and this reader cannot say for what. Teach it the `
        + 'shape, or the release job is checking something nothing here holds together.',
      );
      continue;
    }
    found += 1;

    if (corpus.includes(literal)) {
      verbatim += 1;
      matched.push(`${where}: "${literal}" verbatim`);
      continue;
    }
    const words = wordsOf(literal);
    if (words.length === 0) {
      failures.push(`${where} searches for "${literal}", which holds no word this check can follow`);
      continue;
    }
    const missing = words.filter((word) => !corpus.includes(word));
    if (missing.length > 0) {
      failures.push(
        `${where} expects the product to say "${literal}" and no shipped source says `
        + `${missing.map((word) => `\`${word}\``).join(', ')}. The release job would fail at the `
        + 'tag, which is the worst moment to learn it.',
      );
      continue;
    }
    matched.push(`${where}: "${literal}" by its words (${words.join(', ')})`);
  }
}

/**
 * And the addresses the job actually calls.
 *
 * A grep proves the product still says a word; a URL proves it still answers
 * at an address. The second is the half a renamed route breaks, and the
 * relay's operator routes live in the protocol rather than beside the listener
 * - so looking only in the apps would not have shown it either.
 */
let addresses = 0;
for (const path of workflows) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  for (const [index, line] of text.split('\n').entries()) {
    if (isComment(line)) continue;
    for (const match of line.matchAll(/http:\/\/[^/\s'"]+(\/[^\s'")\\;,]*)/gu)) {
      const route = match[1];
      if (route === '/' || route === '') continue;
      const where = `${path}:${index + 1}`;
      const unknown = mustStayUnknown.find((entry) => entry.path === route);
      if (unknown !== undefined) {
        if (corpus.includes(route)) {
          failures.push(
            `${where} calls ${route} to get the answer an unserved route gives, and a shipped `
            + 'source now names it. Either it is served - then the check below it proves nothing '
            + '- or the argument stopped being about this path.',
          );
        } else {
          matched.push(`${where}: ${route} argued unserved - ${unknown.why}`);
          addresses += 1;
        }
        continue;
      }
      if (!corpus.includes(route)) {
        failures.push(
          `${where} calls ${route} and no shipped source names it. The release job would call a `
          + 'route the product stopped serving, at the tag.',
        );
        continue;
      }
      matched.push(`${where}: ${route} is a route a shipped source names`);
      addresses += 1;
    }
  }
}

if (addresses === 0) {
  failures.push('no workflow calls the product at any address, so half this check has no subject');
}

if (found === 0) {
  failures.push(
    'no workflow searches product output for anything. Either the smoke tests stopped checking '
    + 'what they see, or this reader stopped finding how they do it - and a check with no '
    + 'subject passes by having nothing to say.',
  );
}

if (failures.length > 0) {
  console.error('Smoke literal check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Smoke literal check passed (${found} strings the release job expects to find in what the `
    + `product says, across ${workflows.length} workflow(s); ${verbatim} still occur verbatim in `
    + `${shipped.length} shipped sources, ${found - verbatim} by every word they name; `
    + `${addresses} addresses it calls, each a route a shipped source names or is argued to `
    + 'have stopped naming - and a search this reader cannot parse fails rather than being '
    + 'skipped).',
  );
  for (const line of matched) console.log(`  ${relative('.', line)}`);
}
