import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0104 S5, enforced rather than written down once.
 *
 * That gate said "the twelve `PICO_*` environment variables are not separated
 * anywhere into deployment parameters and settings". There are twenty-two.
 * Nobody miscounted: ten were added afterwards, each by somebody who had no
 * reason to open this ADR, and the number rotted quietly for months.
 *
 * **A list a document keeps and nothing reads is a list that drifts**, and
 * this one drifting is not cosmetic: S2 makes introducing a person-facing
 * setting as an environment variable a defect, and the only way anybody
 * notices is if every variable has to be classified before it can ship.
 *
 * So this reads both sides. Every `PICO_*` the config parser knows must appear
 * in the ADR's S5 tables, and every entry in those tables must still exist in
 * the parser - the second direction because a stale row is a classification of
 * something that is gone, which reads as knowledge and is furniture.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const config = readFileSync(join(repoRoot, 'apps/core/src/config.ts'), 'utf8');
const adr = readFileSync(
  join(repoRoot, 'docs/architecture/0104-settings-belong-to-pico-not-to-host-configuration.md'),
  'utf8',
);

/** Everything the parser reads from the environment. */
const inConfig = new Set([...config.matchAll(/\bPICO_[A-Z0-9_]+\b/gu)].map(([name]) => name));

/**
 * Everything S5 classifies. Read from the gate's own section rather than the
 * whole file, so a variable mentioned in passing somewhere else does not count
 * as classified - being talked about and being sorted are different.
 */
const s5Start = adr.indexOf('- **S5 - Deployment parameters documented as such');
const s5End = s5Start === -1 ? -1 : adr.indexOf('\n## ', s5Start);
if (s5Start === -1) {
  errors.push(
    'ADR 0104 has no S5 gate to read. The classification is the gate, so a '
    + 'missing section is a missing rule rather than a formatting change.',
  );
}
const s5 = s5Start === -1 ? '' : adr.slice(s5Start, s5End === -1 ? undefined : s5End);
const inAdr = new Set([...s5.matchAll(/`(PICO_[A-Z0-9_]+)`/gu)].map(([, name]) => name));

for (const name of [...inConfig].sort()) {
  if (!inAdr.has(name)) {
    errors.push(
      `${name} is read by the config parser and classified nowhere in ADR 0104 S5. `
      + 'Every environment entry is a deployment parameter or a setting, and S2 '
      + 'makes the second one a defect - which nobody can notice while the entry '
      + 'is unclassified.',
    );
  }
}
for (const name of [...inAdr].sort()) {
  if (!inConfig.has(name)) {
    errors.push(
      `${name} is classified in ADR 0104 S5 and no longer read by the config `
      + 'parser. A stale row is a classification of something that is gone; it '
      + 'reads as knowledge and is furniture.',
    );
  }
}

if (errors.length > 0) {
  console.error('Settings boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Settings boundary check passed: ${inConfig.size} environment entries, each `
  + 'classified in ADR 0104 S5.',
);
