import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Store methods that write, checked for somebody outside a test who calls them.
 *
 * **Written after finding the same defect five times in one week.** Each time
 * the shape was identical: a store method whose only author was its own tests,
 * so a feature was complete, covered, documented - and unreachable by any
 * person. Reading never showed it, because a test calling the method is
 * indistinguishable from a caller until you ask *who*.
 *
 * The five: ADR 0139 AC4's effect consent, written only on an off-to-on
 * transition that a default-on module never makes, so no depot could be
 * fetched and no appointment announced; ADR 0141 RN4's held approval, produced
 * and dropped; `attachPicoSupplier`, so a fetched depot's library was offered
 * to nobody; `PicoModelProviderRegistry.put()`, so the registry was empty and
 * everything that wants a model refused; and the shipped supplier's entry
 * point resolved from `process.cwd()`.
 *
 * Finding the sixth by hand was not the plan. This is the rule instead.
 *
 * **What counts as a store is derived, not listed.** A class holding a
 * `private readonly db: Database` is one, which is a property anybody can
 * check and a list is not. What counts as a *write* is a public method whose
 * body contains an INSERT, UPDATE or DELETE - the thing that changes what a
 * Home holds.
 *
 * **What counts as a test is a rule too**, and the repository already had the
 * convention: a `*.test.ts` spec, or a helper named `test-`. One file was
 * renamed to fit it rather than being added to a list here.
 *
 * A method reaching its own file's other methods counts as called - a writer
 * invoked from `EventStore.open()` is wired, and excluding its own file
 * reported that as a gap on the first run.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Writers with no product caller, and why that is not a defect today.
 *
 * A list here rather than a rule, because each entry is a judgement about one
 * method rather than a property anybody can derive - the same distinction
 * `check-docs-structure` draws between its dot-directory rule and its "this
 * ADR is deliberately without a row" table. **What this cannot do is judge the
 * reason.** What it buys is that an absence is argued in a place reviewers
 * read, instead of being a method nobody noticed was dead.
 */
const withoutAProductCaller = [
  [
    'appendPicoObservations',
    'ADR 0129 SR2. Location and motion come from a phone, and the ADR is '
    + 'explicit that the mobile capture runtime is out of scope: "the '
    + 'derivation is testable today, against synthetic sample sequences, with '
    + 'no phone". The one path into the buffer is waiting for a producer that '
    + 'was deliberately not built.',
  ],
  [
    'deletePicoObservations',
    'ADR 0129 SR2. Drops exactly the readings a condensation pass consumed, '
    + 'and there is no condensation pass because there are no readings - the '
    + 'same absent producer, one step downstream.',
  ],
  [
    'deleteInDomain',
    'ADR 0071. A person deleting one memory item has no surface to do it '
    + 'from: nothing in the companion lists their memory. Retention deletes '
    + 'by policy and a domain shred takes everything, so the two ends exist '
    + 'and the middle does not. Recorded in TODO.md; the missing piece is a '
    + 'surface, not this method.',
  ],
];

const errors = [];
const sources = [];
const walk = (directory) => {
  for (const entry of readdirSync(join(repoRoot, directory), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(path);
    } else if (/\.(ts|mts|cts|mjs)$/u.test(entry.name)) {
      sources.push(path);
    }
  }
};
for (const directory of ['apps', 'packages', 'modules', 'scripts']) {
  walk(directory);
}
const text = new Map(sources.map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')]));

/** A spec, or a helper the repository already names `test-`. */
const isTestOnly = (path) => /\.test\.ts$/u.test(path) || /\/test-[^/]+$/u.test(path);

const storeFiles = sources.filter((path) =>
  !isTestOnly(path) && /private readonly db\s*[:,]/u.test(text.get(path)));

if (storeFiles.length === 0) {
  errors.push('No store found. This check reads a class holding `private readonly db`.');
}

/** Public methods whose body changes what is stored. */
const writers = [];
for (const file of storeFiles) {
  const lines = text.get(file).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const declared = /^ {2}public\s+([a-zA-Z][a-zA-Z0-9]*)\s*[(<]/u.exec(lines[index]);
    if (declared === null || declared[1] === 'constructor') {
      continue;
    }
    let body = '';
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^ {2}\}/u.test(lines[cursor])) {
        break;
      }
      body += `${lines[cursor]}\n`;
    }
    if (/\b(?:INSERT|UPDATE|DELETE)\b/iu.test(body)) {
      writers.push({ file, name: declared[1] });
    }
  }
}

const product = sources.filter((path) => !isTestOnly(path));
const exempt = new Map(withoutAProductCaller);
const unwired = [];

for (const writer of writers) {
  const called = new RegExp(`\\.${writer.name}\\s*\\(`, 'u');
  const hasCaller = product.some((path) => {
    if (path !== writer.file) {
      return called.test(text.get(path));
    }
    // Its own file counts - a writer invoked from `open()` is wired - but its
    // own declaration does not.
    const declaration = new RegExp(`public\\s+${writer.name}\\s*[(<]`, 'u');
    return called.test(text.get(path).split('\n')
      .filter((line) => !declaration.test(line))
      .join('\n'));
  });
  if (!hasCaller) {
    unwired.push(writer);
  }
}

for (const writer of unwired) {
  if (exempt.has(writer.name)) {
    continue;
  }
  errors.push(
    `${writer.file}: \`${writer.name}\` writes to the store and nothing outside a test `
    + 'calls it. Either a person cannot reach the feature it belongs to, or the reason it '
    + 'has no caller belongs in `withoutAProductCaller` with a sentence somebody can judge.',
  );
}

for (const [name] of withoutAProductCaller) {
  if (!unwired.some((writer) => writer.name === name)) {
    errors.push(
      `\`${name}\` is listed as having no product caller and now has one, or is no longer a `
      + 'store writer. An exemption that outlives its reason is the drift this check exists '
      + 'to catch, one level up.',
    );
  }
}

if (errors.length > 0) {
  console.error('Store-writer check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Store-writer check passed (${storeFiles.length} stores, ${writers.length} writing methods, `
  + `each reachable from outside a test except ${withoutAProductCaller.length} argued here).`,
);
