import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererReachableFiles } from './companion-window.mjs';

/**
 * One rule for how a key fingerprint is shown to a person, across the product.
 *
 * **This check was the companion's until 2026-08-20, and that is exactly why
 * it missed the case that matters.** It found three spellings inside one
 * client - the shell-free core shortening head-and-tail, a byte-identical
 * private copy in the Electron main process, a bare twelve-character prefix in
 * the renderer contract - and it could see none of them anywhere else, because
 * its two roots were `apps/companion` and `apps/companion-shell`.
 *
 * A fourth spelling sat in the Vault daemon, which renders the sentence a
 * person actually approves (ADR 0106). The two met:
 *
 *     Admit 9f8e7d6c5b4a… to Home … as member (…) until 2027-01-02.
 *     Signing key a1b2c3d4…7f8e9d0c; exact request digest ….
 *
 * One string, one dialogue, two apps, two alphabets. So the rule moved to
 * `@pico/protocol/fingerprint-display` - the one package both already depend
 * on, and the only direction available, since `@pico/companion` depends on
 * `@pico/vault-daemon` - and the check that guards it had to stop being named
 * after one of the surfaces it guards.
 *
 * ADR 0079 I5 leaves the display form to "the surfaces that show them". Read
 * the preposition: *with* the surfaces, not separately by each of them. A
 * person shown one key twice is one reader, however many processes did the
 * showing, and ADR 0131 A5 is about to add a fourth.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/**
 * The module that owns the rule, and the two files that shorten a fingerprint
 * and are right to.
 *
 * An id derived from a fingerprint is not a fingerprint shown to a person: it
 * is a key in a record, never read aloud, never compared by eye, and changing
 * its length would rename every row that already exists. Both are one
 * derivation with one caller each, argued in their own doc comments, and the
 * check found the second of them on its first run - the useful kind of false
 * positive, because it made the distinction explicit instead of leaving it in
 * somebody's head. A third appearing here should be argued the same way rather
 * than appended.
 */
const allowed = new Map([
  ['packages/protocol/src/fingerprint-display.ts', 'the rule itself'],
  ['apps/companion/src/presence.ts', 'picoPresenceIdForDeviceSigningKey - the row a device is joined on'],
  ['apps/companion/src/domain-read-grant.ts', 'the grant id a privacy domain is recorded under'],
]);

const fingerprintSlice = /(\w*[Ff]ingerprintHex)\s*(?:\}\s*)?\.slice\s*\(/g;

let scanned = 0;
for (const file of sourceFiles(join(repoRoot, 'apps'), join(repoRoot, 'packages'))) {
  const path = relative(repoRoot, file);
  /**
   * Tests are left alone on purpose: pinning the rule means naming the form it
   * must *not* produce, so `expect(shown).not.toContain(hex.slice(0, 12))` is
   * the assertion doing the guarding, not a second rendering.
   */
  if (path.endsWith('.test.ts') || allowed.has(path)) {
    continue;
  }
  scanned += 1;
  const content = readFileSync(file, 'utf8');
  for (const [, symbol] of content.matchAll(fingerprintSlice)) {
    errors.push(rendererReachableFiles.has(path)
      ? `${path}: shortens \`${symbol}\` in the window. This file runs in the renderer, where a `
        + 'bare `@pico/...` import breaks at runtime and passes every test - so it cannot reach '
        + 'the one rule, and it must not invent a second. Send the shortened string across IPC '
        + 'beside the hex, rendered in the main process (ADR 0113 C2).'
      : `${path}: shortens \`${symbol}\` with its own slice. How a key is shown to a person is `
        + 'one decision for the whole product - `picoDisplayFingerprint` in '
        + '`@pico/protocol/fingerprint-display` - because a second spelling means one key reaches '
        + 'one person under two names, which is how this check came to exist. If this is an '
        + 'identifier derived from a fingerprint rather than a fingerprint shown to somebody, say '
        + 'so in `allowed` with the reason.');
  }
}

if (errors.length > 0) {
  console.error('Fingerprint display check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Fingerprint display check passed (${scanned} source files across apps and packages,`
  + ` ${allowed.size - 1} derivations exempt with reasons, one rule for showing a key`
  + ' to a person - the window included).',
);

function* sourceFiles(...roots) {
  for (const root of roots) {
    for (const entry of readdirSync(root)) {
      const path = join(root, entry);
      if (!statSync(path).isDirectory()) {
        continue;
      }
      const src = join(path, 'src');
      let stats;
      try {
        stats = statSync(src);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        yield* walk(src);
      }
    }
  }
}

function* walk(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (entry.endsWith('.ts')) {
      yield path;
    }
  }
}
