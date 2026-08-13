import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0150 PU3. One number, two places, and a check rather than a hope.
 *
 * A Home mints a push and a device decides whether to honour it, and each has
 * to know the same ceiling: without it the seen-set is defeated, and with two
 * different ones a Home would send pushes that are dead on arrival while
 * every side looked correct.
 *
 * Neither may import the other - a Home shipping device code, or the reverse -
 * so the constant is declared twice and this is what keeps the two honest.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const sources = [
  ['apps/core/src/link-push-lifetime.ts', 'the Home, which mints them'],
  ['apps/companion/src/link-push-gate.ts', 'the device, which honours them'],
];

const pattern = /export const maxPicoLinkPushLifetimeMs = ([^;]+);/u;
const found = [];
for (const [path, who] of sources) {
  const match = pattern.exec(readFileSync(join(repoRoot, path), 'utf8'));
  if (match === null) {
    console.error(`Push lifetime check failed: ${path} no longer declares maxPicoLinkPushLifetimeMs.`);
    process.exit(1);
  }
  found.push({ path, who, value: match[1].trim() });
}

const [first, second] = found;
if (first.value !== second.value) {
  console.error('Push lifetime check failed:');
  console.error(
    `- ${first.path} (${first.who}) says ${first.value}, `
    + `${second.path} (${second.who}) says ${second.value} (ADR 0150 PU3). `
    + 'A Home minting pushes longer than a device will honour sends ones that are dead on arrival.',
  );
  process.exit(1);
}

console.log(`Push lifetime check passed (${first.value}, agreed by both ends).`);
