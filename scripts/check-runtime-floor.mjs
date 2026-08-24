import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The shell-free core runs where there is no ICU.
 *
 * ADR 0131 A2 chose nodejs-mobile for Android, and its build has no ICU at
 * all: `Intl` is absent, and `new TextDecoder('utf-8', { fatal: true })`
 * throws `ERR_NO_ICU`. On 2026-08-19 that made every enrolment code and
 * every Recovery Card unreadable on a phone - and the refusal named the
 * code's body, so the codes looked malformed rather than the reader
 * incapable. It cost a day to find with a camera, a stack trace and two
 * checksums.
 *
 * What this forbids is only what *disappears or throws* without ICU, in the
 * packages that have to run there. It has no exemptions, because it needs
 * none: after the fix there were no uses left, and the next one should be a
 * named error at commit time rather than a phone that refuses everything.
 *
 * What it deliberately does not forbid: `localeCompare`. Nine calls sit in
 * `@pico/identity` and `@pico/sync`, and they were audited on 2026-08-20
 * rather than banned. In identity every one is a tie-break the lifecycle
 * index makes unreachable - it refuses two statements sharing an order - and
 * in sync the ordering is a catalogue listing rather than signed bytes.
 * `localeCompare` also *works* without ICU; it just compares differently,
 * which is a hazard where an answer travels and harmless where it does not.
 * Banning it outright would be a rule this check cannot justify.
 *
 * **Its passing line counted the wrong thing until 2026-08-24.** It reported
 * `roots.length` - the length of the hand-written list above, a constant -
 * rather than anything it had read, so over a tree holding the six
 * directories and no files in them it printed "6 packages carry no ICU
 * dependency" and exited zero. Six packages it had never opened.
 * `check-vacuous-gates.mjs` found it on its first run. The count is now per
 * root and a zero refuses, because one root emptying while the others stay
 * full is the case a total would still hide.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Where the embedded runtime actually loads code from. */
const roots = [
  'packages/protocol/src',
  'packages/vault/src',
  'packages/identity/src',
  'packages/sync/src',
  'apps/companion/src',
  'apps/vault-daemon/src',
];

const forbidden = [
  {
    pattern: /new TextDecoder\s*\([^)]*,/u,
    what: 'a TextDecoder with options',
    instead: 'decodeCanonicalText, which is strict by re-encoding rather than by ICU',
  },
  {
    pattern: /\bIntl\.[A-Z]/u,
    what: 'an Intl formatter',
    instead: 'a fixed rendering, or the shell, which runs where Intl exists',
  },
  {
    pattern: /\.toLocale(?:String|DateString|TimeString)\s*\(/u,
    what: 'locale formatting',
    instead: 'ISO text, or the shell',
  },
];

const errors = [];

/**
 * Comments are prose, and prose describes the thing it warns about. The
 * doc comment over `decodeCanonicalText` spells out the exact call this
 * check forbids - as it should, since that is what it is explaining.
 */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1');
}

const scannedPerRoot = new Map(roots.map((root) => [root, 0]));
for (const root of roots) {
  for (const file of sourceFiles(join(repoRoot, root))) {
    if (file.endsWith('.test.ts')) {
      continue;
    }
    scannedPerRoot.set(root, scannedPerRoot.get(root) + 1);
    const source = withoutComments(readFileSync(file, 'utf8'));
    source.split('\n').forEach((line, index) => {
      for (const rule of forbidden) {
        if (rule.pattern.test(line)) {
          errors.push(
            `${relative(repoRoot, file)}:${index + 1}: ${rule.what} needs ICU, and the `
            + 'runtime this code runs on for Android has none. Use '
            + `${rule.instead}.`,
          );
        }
      }
    });
  }
}

for (const [root, count] of scannedPerRoot) {
  if (count === 0) {
    errors.push(
      `${root} contributed no source files, so the sentence this check prints would be `
      + 'true of nothing. A named root that stops answering is a move, not a clean result.',
    );
  }
}

if (errors.length > 0) {
  console.error('Runtime floor check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Runtime floor check passed (${[...scannedPerRoot.values()].reduce((a, b) => a + b, 0)} `
  + `files across ${roots.length} embedded-runtime roots, each of which answered, `
  + 'carry no ICU dependency).',
);

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}
