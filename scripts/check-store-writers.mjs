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
 *
 * **What this cannot see is a caller who is themself uncalled.** A store
 * method reached only from a function nobody calls passes here, because the
 * question asked is one link deep. `recordPicoConnectorObservations` is the
 * live example: ADR 0128 H4's connector intake writes to the store, its
 * writers therefore look wired, and nothing in the tree calls the intake
 * because nothing talks to a Home Assistant.
 *
 * Measured before it was left open: ten exported functions in `apps/core/src`
 * have no product caller, and eight are mechanisms waiting for a producer that
 * is deliberately absent - the observation buffer with no capture adapter
 * (its "no mobile runtime" reason expired on 2026-08-22; see ADR 0129), the
 * supplier content intake with no bridge supplier shipped, the migration
 * backup with no destructive migration in the chain. A check over them would
 * need eight argued exemptions on its first day, which is a debt list wearing
 * a gate's clothes. The two that overstate themselves were corrected in ADR
 * 0128 instead, which is where a reader meets the claim.
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
    'setPicoSupplierCredential',
    'ADR 0138 CO1, and the reason is a consumer rather than a decision - '
    + 'corrected 2026-08-25, because the first version of this entry said it '
    + 'waits on where the secret lives, and that was settled long ago: a '
    + 'supplier credential lives in the domain its supplier attached into, '
    + 'wrapped by that domain\'s KEK, so a domain shred takes it. '
    + '`SupplierCredentialCrypto` is built and tested against its three '
    + 'refusals. What is missing is anybody to hand a credential to: the only '
    + 'supplier that exists is a local git working copy whose own header says '
    + 'it needs none, and wiring this would also need a slot in ADR 0136 BR2\'s '
    + 'closed supplier transport for handing one over for one use. The ADR '
    + 'states it as a decision - building it now adds a second unused mechanism '
    + 'beside the one it already reports. So **a person cannot record a '
    + 'supplier credential today** and no supplier is asking for one. Recorded '
    + '2026-08-25 as Roadmap finding B22.',
  ],
  [
    'deletePicoObservations',
    'ADR 0129 SR2. Drops exactly the readings a condensation pass consumed, '
    + 'and there is no condensation pass because there are no readings - the '
    + 'same absent producer, one step downstream.',
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

/**
 * **Ein Prüfer ist kein Speicher** (2026-08-24). Diese Datei erkennt einen
 * Speicher daran, dass er `private readonly db` hält - und schreibt genau
 * diese Zeichenkette selbst, in der Zeile darunter. Sie zählte sich also mit:
 * gemeldet waren elf Speicher, echte gibt es zehn. Schreibmethoden hat sie
 * keine, die Zahl daneben stimmte; falsch war nur die, die vollständig klang.
 *
 * Dieselbe Selbstbezüglichkeit wie in `check-capability-reach.mjs`, wo der
 * eigene Kopfkommentar eine Fähigkeit erreicht aussehen ließ - dort verdeckte
 * sie einen Befund, hier bläht sie eine Zahl.
 */
const storeFiles = sources.filter((path) =>
  !isTestOnly(path)
  && !path.startsWith('scripts/')
  && /private readonly db\s*[:,]/u.test(text.get(path)));

if (storeFiles.length === 0) {
  errors.push('No store found. This check reads a class holding `private readonly db`.');
}

/**
 * Where a method's body starts and ends, by counting brackets.
 *
 * **Read by lines, this check saw 47 of 82 writing methods** (found
 * 2026-08-25). It took every line up to the first `}` at two spaces as the
 * body - and a method whose parameter is a multi-line object type closes that
 * type on exactly such a line:
 *
 * ```ts
 *   public forgetRecall(input: {
 *     jobId: string;
 *   }): 'forgotten' | 'not_yours' {   // <- the scan stopped here
 * ```
 *
 * So every writer written in that shape had an empty body, no `UPDATE` in it,
 * and never existed for this check: 31 in `event-store.ts` alone, plus
 * `enqueue`, `markKept` and `forgetRecall` on the job queue. The passing line
 * said "47 writing methods, each reachable" - true of the 47 it could see,
 * and read as a statement about the store. A dead writer with a multi-line
 * parameter would never have been reported.
 *
 * Counting brackets is exact and no longer than the guess it replaces: skip
 * the parameter list by paren depth, then take the body by brace depth.
 */
const methodBody = (source, from) => {
  let depth = 0;
  let cursor = from;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === '(') {
      depth += 1;
    } else if (source[cursor] === ')') {
      depth -= 1;
      if (depth === 0) {
        cursor += 1;
        break;
      }
    }
  }
  const opens = source.indexOf('{', cursor);
  if (opens === -1) {
    return '';
  }
  depth = 0;
  for (let scan = opens; scan < source.length; scan += 1) {
    if (source[scan] === '{') {
      depth += 1;
    } else if (source[scan] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(opens, scan);
      }
    }
  }
  return source.slice(opens);
};

/** Public methods whose body changes what is stored. */
const writers = [];
for (const file of storeFiles) {
  const source = text.get(file);
  const lines = source.split('\n');
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const declared = /^ {2}public\s+([a-zA-Z][a-zA-Z0-9]*)\s*[(<]/u.exec(lines[index]);
    if (declared !== null && declared[1] !== 'constructor') {
      const body = methodBody(source, offset + lines[index].indexOf('('));
      if (/\b(?:INSERT|UPDATE|DELETE)\b/iu.test(body)) {
        writers.push({ file, name: declared[1] });
      }
    }
    offset += lines[index].length + 1;
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
