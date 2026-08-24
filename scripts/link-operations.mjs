import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The closed list of Pico Link operations, read in one place.
 *
 * Two checks need it and each had grown its own reader.
 * `check-surface-classes.mjs` matched any quoted lowercase token in the block;
 * `check-link-reachability.mjs` matched a whole line ending in a comma and
 * spelled the character class `[a-z][a-z0-9_.]*` - **without a hyphen**. One
 * operation carries one: `home.domain.read-grant.submit`. So the check whose
 * whole job is that every operation is named by somebody outside the Home had
 * never looked at that one, and its passing line said "45 operations" beside a
 * sibling's "46" for as long as both have existed.
 *
 * Nothing was broken behind it - `apps/companion/src/domain-read-grant.ts`
 * names it - which is the point: had that caller gone, the check written to
 * say so would have stayed green and kept counting to 45.
 *
 * The fix is not the missing hyphen. Two readers of one list will drift again,
 * and a count printed twice is the cheapest possible warning that they have -
 * this one was on screen every run and nobody read the two numbers together.
 * `progress.md` copied one of them.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Where the closed list lives, for a check that wants to name it in an error. */
export const picoLinkOperationsPath = 'packages/protocol/src/index.ts';

/**
 * Every operation name in declaration order, or an empty list if the block
 * cannot be read. Callers decide what an empty list means for them, and both
 * of today's callers refuse it: a reader that finds nothing has looked at
 * nothing, and a check must not report that as clean.
 */
export function readPicoLinkDirectOperations() {
  const source = readFileSync(join(repoRoot, picoLinkOperationsPath), 'utf8');
  const block = /export const picoLinkDirectOperations = \[([\s\S]*?)\n\] as const;/u
    .exec(source);
  if (block === null) {
    return [];
  }
  // Whole lines only. A quoted token anywhere in the block would also match
  // the apostrophes in the doc comments between the entries, which is how the
  // other reader could have gone wrong in the opposite direction.
  return [...block[1].matchAll(/^\s*'([a-z][a-z0-9_.-]*)',$/gmu)].map(([, name]) => name);
}
