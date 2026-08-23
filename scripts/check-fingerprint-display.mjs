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
/**
 * What this check cannot do, measured rather than guessed (2026-08-21).
 *
 * It catches a rendering that either names a fingerprint or admits with an
 * ellipsis that something was left out. It does **not** catch a bare prefix of
 * a value it cannot recognise - `value.slice(0, 12)` on a parameter called
 * `value`, returned without an ellipsis - because at that point nothing
 * distinguishes it from the ordinary truncation any string may need, and a
 * rule that fired on every `.slice(0, N)` would be a rule people learn to work
 * around.
 *
 * That is the shape worth knowing about, because a prefix with no ellipsis is
 * also the *worst* rendering of a key: it hides that anything was cut, and the
 * cut end is the end an attacker grinds. What guards it is the review that
 * asks where the string came from, and the twelve-character prefix in the
 * Vault daemon is the reminder that the review can miss it for months.
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
])

/**
 * One file shortens with an ellipsis and is right to.
 *
 * `fitText` in the Recovery Card's PDF cuts a *label* - a Pico's name, a
 * Home's name - to the width of the column it is drawn in, and says so with an
 * ellipsis. That is typography answering a measured width, not a decision
 * about how a key is shown: it takes no fingerprint, and the same label at a
 * larger size is not cut at all.
 */
const shortensForTypography = new Map([
  ['apps/vault-daemon/src/recovery-card-pdf.ts',
    'fitText - a label cut to the width of the column it is drawn in'],
]);

const fingerprintSlice = /(\w*[Ff]ingerprintHex)\s*(?:\}\s*)?\.(?:slice|substring|substr)\s*\(/g;

/**
 * And the same rule wearing a function's name instead of a field's.
 *
 * The rule above keys on the *field* being cut, which is why it missed a
 * fifth copy on the first day it shipped: `presentation-adapter.ts` had a
 * private `shortFingerprint(value: string)`, and inside it the parameter is
 * called `value`. It rendered `8…8` and so agreed with the product rule on
 * every sixty-four character input - and disagreed on short ones, because it
 * had no guard: `shortFingerprint('abcdefgh')` returns
 * `abcdefgh…abcdefgh`, the whole string twice with an ellipsis claiming
 * something was left out.
 *
 * That is the more dangerous shape of this defect, not the less: a copy that
 * matches today hides until an input changes. So the second rule keys on what
 * the act *looks like* rather than what the value is called - a slice next to
 * an ellipsis is somebody shortening something for a person to read.
 */
/**
 * The backstop, and the reason it exists.
 *
 * Both rules above key on something a copy can rename away from. The field
 * rule needs the value to be called `...FingerprintHex`; the rule below it
 * needs the ellipsis to sit next to the slice as a literal. Probed on
 * 2026-08-21, both miss `const gap = '…'` with a parameter called `value` -
 * which is not an exotic way to write it.
 *
 * So the last rule keys on the two things a shortening-for-a-person cannot do
 * without: it takes part of a string, and it says so with an ellipsis. Two
 * files in the tree do both, and one of them is this rule's owner.
 *
 * Comments are stripped first, and finding that out cost a false positive on
 * the first run: half the files that argue about this defect quote it, and
 * `a1b2c3d4…7f8e9d0c` in a doc comment is a file explaining the rule rather
 * than inventing one. A check that fires on its own explanation teaches people
 * to write exemptions, which is the one thing it must not do.
 */
const shortensSomething = /\.(?:slice|substring|substr)\s*\(/;
const printsAnEllipsis = /…|\\u2026/;

function withoutComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const ellipsisSlice =
  /\$\{[^{}]*\.(?:slice|substring|substr)\s*\([^{}]*\}\s*…|…\s*\$\{[^{}]*\.(?:slice|substring|substr)\s*\(/g;

let scanned = 0;
/**
 * **`tools/` kam am 2026-08-22 dazu, und der Anlass war ein Feld mit einem
 * falschen Namen.**
 *
 * Das Sponsor-Labor druckte `Home 976f4b4fcdf1 founded` und die Sonde meldete
 * `keyFingerprintHex: <zwölf Zeichen>` - ein Name, der Hex verspricht, und ein
 * Wert, der keines mehr ist. Beides sind Kopf-Präfixe, und ein Kopf-Präfix
 * kann zwei Schlüssel mit gleichem Anfang nicht unterscheiden. Genau dafür
 * wählte ADR 0079 I5 Kopf-und-Schwanz: die Frage an einen angezeigten
 * Fingerabdruck ist immer "ist das der, den ich meine", und ein Präfix
 * beantwortet sie mit "vielleicht".
 *
 * Dass es ein Labor ist, macht es nicht harmloser - es macht es leiser. Wer
 * eine Laborzeile gegen einen Produktbildschirm hält, vergleicht zwei
 * verschiedene Zuschnitte desselben Schlüssels und merkt es nicht.
 *
 * **Was hier nicht mitgeprüft wird**, damit die grüne Zeile gelesen wird, was
 * sie behauptet: Java. Die Android-Fläche zeigt heute keinen Fingerabdruck -
 * gemessen, nicht angenommen -, und ein Prüfer für eine Sprache ohne
 * Fundstelle wäre eine Zeile, die nur so aussieht, als hielte sie etwas.
 */
for (const file of [
  ...sourceFiles(join(repoRoot, 'apps'), join(repoRoot, 'packages')),
  ...scriptFiles(join(repoRoot, 'tools')),
]) {
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
  const code = withoutComments(content);
  if (printsAnEllipsis.test(code)
    && shortensSomething.test(code)
    && !shortensForTypography.has(path)) {
    errors.push(`${path}: takes part of a string and prints an ellipsis after it. That is `
      + 'somebody shortening something for a person to read, whatever the value is called and '
      + 'wherever the ellipsis is spelled. `picoDisplayFingerprint` in '
      + '`@pico/protocol/fingerprint-display` is the rule the rest of the product shows. If this '
      + 'is a label cut to a width rather than a key cut for the eye, say so in '
      + '`shortensForTypography` with the reason.');
  }

  for (const _ of content.matchAll(ellipsisSlice)) {
    errors.push(`${path}: shortens a string with a slice beside an ellipsis. That is a rendering `
      + 'for a person, whatever the value is called here - `picoDisplayFingerprint` in '
      + '`@pico/protocol/fingerprint-display` is the one the rest of the product shows. A private '
      + 'copy that agrees on sixty-four hex characters is the dangerous kind: it hides until an '
      + 'input is shorter than it expected.');
  }
  for (const [, symbol] of content.matchAll(fingerprintSlice)) {
    errors.push(rendererReachableFiles.has(path)
      ? `${path}: shortens \`${symbol}\` in the window. This file runs in the renderer, where a `
        + 'bare `@pico/...` import breaks at runtime and passes every test - so it cannot reach '
        + 'the one rule, and it must not invent a second. Send the shortened string across IPC '
        + 'beside the hex, rendered in the main process (ADR 0113 C2).'
      : `${path}: shortens \`${symbol}\` itself. How a key is shown to a person is `
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
  `Fingerprint display check passed (${scanned} source files across apps, packages and tools,`
  + ` ${allowed.size - 1} derivations and ${shortensForTypography.size} width-fit exempt with`
  + ' reasons, one rule for showing a key'
  + ' to a person - the window included).',
);

/**
 * `tools/` hat nicht die Form `paket/src` - dort liegen Skripte, die neben dem
 * Produkt laufen. Also wird der Baum ganz gelaufen, und gezählt werden `.mjs`
 * und `.js`.
 */
function* scriptFiles(root) {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      yield* scriptFiles(path);
    } else if (entry.endsWith('.mjs') || entry.endsWith('.js')) {
      yield path;
    }
  }
}

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
