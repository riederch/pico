import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererReachableFiles } from './companion-window.mjs';

/**
 * One answer about instants, across the product: which ones exist, and how one
 * is said to a person.
 *
 * The two halves are one subject because they fail the same way. An instant
 * Pico accepts and an instant Pico shows are both statements this product
 * makes about time, and both were made in several places at once - which is
 * how each of them came to be made differently in one of those places.
 *
 * Four defects, one subject, and they were found in this order:
 *
 * **The cut**, because it looks right. `'2027-01-01T23:30:00.000Z'.slice(0, 10)`
 * is the *UTC* calendar date wearing no label, which is the wrong day for
 * every reader east of UTC after their evening - two hours in twenty-four for
 * Vienna, a day and a half out on Kiritimati. The companion window did it in
 * six places.
 *
 * **The arithmetic behind it**, because it was wrong in the same direction.
 * The expiry warning divided by twenty-four hours, so at 23:00 in Vienna an
 * authority ending at 00:30 the next night was nought days away and the row
 * printed "That is today" directly under "It can act as you until
 * 2027-01-02". Days a person counts are midnights, and Vienna has one of
 * twenty-three hours every March.
 *
 * **The raw form**, because it looks harmless - and it was the one that had
 * spread furthest. `until 2027-08-01T10:00:00.000Z` in a sentence somebody is
 * being asked to approve is a timezone, a precision and a punctuation style
 * nobody asked for, sitting in the one string they are supposed to check.
 * Eleven of them: five in the Vault daemon's approval statements, one in the
 * daemon itself, four in the Electron presentation adapter, one in the shell.
 *
 * All three were the companion's check until 2026-08-20, which is why the
 * eleven were invisible to it: `check-companion-boundary.mjs` reads two roots,
 * and the Vault daemon renders the sentence a person actually approves (ADR
 * 0106) right beside what the companion shows them. The rule moved to
 * `@pico/protocol/when-display` for that reason - the same move, the same day,
 * as `fingerprint-display.ts` - and its check moved with it.
 *
 * **And then the other half, which decides rather than shows.** "Is this a
 * canonical instant" existed **nine** times: in `@pico/vault`, in four
 * Foundation modules and in four of the protocol's own parsers, beside the
 * correct one in the same package. Every copy checked only that the value
 * round-tripped through `toISOString`, and the extended-year form does -
 * `+275760-09-13T00:00:00.000Z` is a real Date that re-serializes to itself.
 * `+` is 0x2B, below every digit, so the farthest future a Date can hold sorts
 * *before* every ordinary year, and every consumer of one of these compares it
 * as a string. A sealed batch opened after expiry; a freshness checkpoint
 * carried a window longer than the policy allows. The rule is
 * `@pico/protocol/instant` now, and this check refuses the tenth copy.
 */
/**
 * What this check cannot do, measured rather than guessed (2026-08-21).
 *
 * Three of its five rules key on a *name*: an instant-shaped field is one
 * ending in `At`, or `validUntil`, or `validFrom`. A deadline called `when`,
 * `deadline` or `expiry` is invisible to all three, and so is a UTC day cut
 * from it. The names were chosen from what this tree actually calls these
 * fields rather than from what a field could be called, which is why the rule
 * is worth stating: the day somebody names one differently, this check has
 * nothing to say about it.
 *
 * The fifth rule keys on `toISOString() === value`, the shape every one of the
 * nine hand-written instant rules happened to share. A tenth written as a
 * length plus `Date.parse` would pass, and would be wrong in the same way.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/**
 * What may stand between an instant and a person, and why each one may.
 *
 * Enumerated rather than globbed, because "some function wraps it" is not the
 * property being checked - the property is that the value was *rendered by a
 * rule somebody decided*, and each of these is a decision with an argument
 * behind it.
 */
const renderers = new Map([
  ['picoDisplayDate', "the product rule: the calendar date the reader is on"],
  ['picoDisplayInstant', 'the product rule: date and minute, for a deadline'],
  ['picoCalendarDaysUntil', 'consumes an instant and answers a number - midnights, not blocks'],
  ['formatDateTime', "the Home's web UI, which runs in a browser that has ICU and answers in "
    + "the reader's own locale as well as their own zone - a better answer where it is available, "
    + 'and a different reader on a different device'],
  ['toSafeTimestamp', 'apps/core/src/sqlite-backup.ts builds a filename, not a sentence'],
]);
const rendered = new RegExp(`\\b(?:${[...renderers.keys()].join('|')})\\s*\\(`);

/** The two modules that own the two halves. */
const owners = new Set([
  'packages/protocol/src/when-display.ts',
  'packages/protocol/src/instant.ts',
]);

/**
 * A canonical-instant rule written by hand.
 *
 * Keyed on the re-serialization because that is the part every copy shared and
 * the part that looks sufficient: it is an exact calendar check, and it reads
 * like the whole rule. The fixed-width pattern beside it is what the string
 * comparisons actually need, and it is the half that kept being dropped.
 *
 * **Und es sah acht Jahre lang nur seine eigene Gestalt** (2026-09-02, Befund
 * B52). Bis hierher stand `===\s*\w+` - genau die Form, aus der die Regel am
 * 2026-08-20 herausgeloest worden war: ein *Praedikat*, das wahr zurueckgibt.
 * Jede verbliebene Kopie war aber eine *Wache*: `!==`, die wirft. Neun standen
 * an dem Tag noch im Baum, und dieses Tor meldete zu jedem Lauf, es gebe
 * keine - fuenf davon ohne die Breitenhaelfte, darunter das `dueAt` eines
 * faelligen Eintrags und der Ablauf einer opaken Referenz.
 *
 * **Ein Tor, das nur die Gestalt kennt, aus der es entstanden ist, prueft
 * seinen eigenen Anlass und nicht seine Klasse.** Jetzt beide Vergleiche und
 * beide Seiten: ein Bezeichner oder ein Zugriff wie `record.value`.
 */
const handWrittenInstantRule = /toISOString\(\)\s*(?:===|!==)\s*[\w.[\]]+/g;

/**
 * An instant-shaped field, named the way this tree names them.
 *
 * `validFrom` is listed and `From` is not, because `derivedFrom` is a supplier
 * and matched on the first run - the useful kind of false positive, caught by
 * measuring before writing rather than by a person reading a failure later.
 */
const instantInterpolation = /\$\{([^{}]*\b(?:\w+At|validUntil|validFrom)\b[^{}]*)\}/g;
const instantSlice =
  /(\w*(?:At|Until))\s*(?:\}\s*)?\.(?:slice|substring|substr)\s*\(0,\s*10\)/g;
/**
 * Only the window is asked about day arithmetic: a day-length constant in a
 * main process or a core is ordinary - `first-run.ts` builds a year from one -
 * and it is the *rendering* side that has been wrong about calendars twice.
 */
const dayArithmetic = /(?:24\s*\*\s*60\s*\*\s*60|86_?400_?000)/g;

/**
 * And the fourth shape, which is about how long rather than when.
 *
 * It lives here rather than in a script of its own because it is the same
 * subject from a reader's side - what a person is told about time - and
 * splitting "when it happens" from "how long it lasts" into two files would
 * serve no reader of either.
 *
 * Two sentences said `48-hour veto delay` as a literal until 2026-08-20, in
 * the same app as the code that refuses a recovery claim whose
 * `effectiveAt - acceptedAt` is not exactly
 * `picoHomeDeviceRecoveryTiming.vetoDelayMs`. That constant's own doc comment
 * asks for this in so many words - clients should "enforce the same fixed
 * bounds without copying magic numbers" - and an approval statement is the
 * last place a copy belongs: ADR 0106's whole point is that the sentence is
 * rendered from what the record says, so a number inside it that no record
 * supplies is the one part nobody would think to check.
 *
 * Measured before it was written: two occurrences in the tree, both defects.
 */
const literalDuration = /`(?:[^`\\]|\\.)*`/gs;
const spokenDuration = /\b\d+[- ](?:hour|minute|second|day|week|month)s?\b/i;

/**
 * **`modules/` kam am 2026-08-24 dazu, und es kostete nichts.** Ein Modul
 * spricht mit einer Person - der Kalender sagt, was fällig ist -, kann also
 * einen Zeitpunkt roh zeigen oder auf einen UTC-Tag schneiden. Dass keines es
 * tut, war nie geprüft, weil die Wurzel fehlte.
 *
 * Counted per root rather than in one total, because a total cannot tell a
 * clean product from an absent one. Run over a tree whose `apps` and
 * `packages` hold nothing, this printed "0 source files across apps and
 * packages, no instant reaching a person raw" and exited zero on 2026-08-24 -
 * a sentence about the whole product, true of nothing. One root emptying while
 * the other stays full is the case a total would still hide.
 */
const scanRoots = ['apps', 'packages', 'modules'];
const scannedPerRoot = new Map(scanRoots.map((root) => [root, 0]));

let scanned = 0;
for (const file of sourceFiles(...scanRoots.map((root) => join(repoRoot, root)))) {
  const path = relative(repoRoot, file);
  // Tests are left alone for the reason they are next door: pinning the rule
  // means naming the form it must *not* produce, and `not.toContain(raw)` is
  // the assertion doing the guarding.
  if (path.endsWith('.test.ts') || owners.has(path)) {
    continue;
  }
  scanned += 1;
  const root = path.split(/[\\/]/u)[0];
  if (scannedPerRoot.has(root)) {
    scannedPerRoot.set(root, scannedPerRoot.get(root) + 1);
  }
  const content = readFileSync(file, 'utf8');

  for (const _ of content.matchAll(handWrittenInstantRule)) {
    errors.push(`${path}: decides what a canonical instant is with a rule of its own. `
      + '`isPicoInstant` in `@pico/protocol/instant` is the product\'s answer, and it pins the '
      + 'fixed width as well as the calendar - which is what the string comparisons these values '
      + 'go into actually need. A round-trip check alone admits the extended-year form, and that '
      + 'form sorts before every ordinary year.');
  }

  for (const [, expression] of content.matchAll(instantInterpolation)) {
    if (rendered.test(expression)) {
      continue;
    }
    errors.push(`${path}: puts \`${expression.trim()}\` into a string raw. An ISO instant is a `
      + 'timezone, a precision and a punctuation style nobody asked for, in a sentence a person '
      + 'is being asked to act on. `picoDisplayInstant` and `picoDisplayDate` in '
      + '`@pico/protocol/when-display` answer in the reader\'s own day, without ICU. If this '
      + 'string is not read by a person, the value should not be named like a deadline.');
  }

  for (const [, symbol] of content.matchAll(instantSlice)) {
    errors.push(`${path}: cuts \`${symbol}\` to ten characters. That is the UTC calendar day with `
      + 'nothing saying so, and it is the wrong day for a reader whose evening is past midnight '
      + `in UTC. \`picoDisplayDate\` answers in the reader's own day${rendererReachableFiles.has(path)
        ? ', and this file runs in the window - so the main process has to render it and send it '
          + 'across (ADR 0113 C2).'
        : '.'}`);
  }

  for (const template of content.matchAll(literalDuration)) {
    const spoken = spokenDuration.exec(template[0]);
    if (spoken === null) {
      continue;
    }
    errors.push(`${path}: says "${spoken[0]}" as a literal in a sentence. If something enforces `
      + 'that length, the sentence has to read it from there - a statement carrying a number no '
      + 'record supplies is the part of it nobody thinks to check, and it goes on reading well '
      + 'after the rule beneath it has changed. If nothing enforces it, the sentence is asserting '
      + 'a duration on its own authority, which is the same problem said differently.');
  }

  if (rendererReachableFiles.has(path)) {
    for (const _ of content.matchAll(dayArithmetic)) {
      errors.push(`${path}: counts days from a length in milliseconds, in the window. Days a `
        + 'person counts are midnights - a day is twenty-three hours once a year - and this is '
        + 'how "That is today" came to sit under a date that said tomorrow. '
        + '`picoCalendarDaysUntil` counts them, in the main process, and the number crosses with '
        + 'the row.');
    }
  }
}

for (const [root, count] of scannedPerRoot) {
  if (count === 0) {
    errors.push(
      `${root} contributed no source files, so the sentence this check prints would be `
      + 'true of nothing. A root that stops answering is a move, not a clean result.',
    );
  }
}

if (errors.length > 0) {
  console.error('Instant rules check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Instant rules check passed (${scanned} source files across `
  + `${[...scannedPerRoot.keys()].join(' and ')}, each of which answered,`
  + ` ${renderers.size} renderings named with reasons, no instant reaching a person raw,`
  + ' cut to a UTC day, counted in blocks, spoken as a literal duration,'
  + ' or judged canonical by a rule of its own - the window included).',
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
