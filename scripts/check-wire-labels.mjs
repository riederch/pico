import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A wire label is spelled once, in the protocol.
 *
 * `@pico/protocol` exports the strings that travel: signature-input labels,
 * schema names, the prefixes a person's device reads off another person's
 * screen. Every one of them is exported, and every one of them can be
 * imported. Spelling one out a second time creates a copy that no compiler
 * compares, and this repository has been finding those copies all year.
 *
 * On 2026-08-19 six of them sat in the companion shell's `main.ts`, spelling
 * the three device-enrolment prefixes the protocol already exported - and the
 * cost of that shape had just been demonstrated a few lines away, where the
 * same file demanded `pico-recovery-card-v2:` for a Recovery Card whose
 * transport prefix is v1. Every printed card was refused, and refused
 * silently.
 *
 * **What this check cannot do**, said plainly because a check that is trusted
 * for more than it does is worse than none: it cannot catch that invented
 * spelling. `pico-recovery-card-v2:` matches no constant, and a rule against
 * labels matching no constant was measured before being written - 46 in
 * product code, nearly all of them a package naming its *own* schema, which
 * is exactly right. So this catches the copy, not the invention. The
 * invention is caught by a test that builds a real value and requires the
 * surface to accept it, which is what `recovery-card-entry.test.ts` now does.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const protocolRoot = join(repoRoot, 'packages', 'protocol', 'src');

/**
 * Where a label may be spelled out anyway, and why. Each entry is an argument
 * rather than a permission - the two here are different arguments.
 */
const allowed = [
  {
    file: join(repoRoot, 'apps', 'core', 'src', 'migrations.ts'),
    why: 'a migration describes what a database already holds, so it must *not* follow a '
      + 'renamed constant - the old rows keep the old word',
  },
  {
    file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'protocol.ts'),
    why: 'ADR 0099\'s approval-exempt list must fail closed: importing the constants would '
      + 'carry an exemption onto a renamed label, while a literal turns the rename into '
      + '"ask the person", which is the safe direction',
  },
];

/** A label that looks like it travels: a prefix, a schema, a family name. */
const wireLabel = /(-v\d+:$|\.v\d+$)/u;
const exported = /export const (\w+)\s*=\s*'([^']{6,})'/gu;

const labels = new Map();
for (const file of sourceFiles(protocolRoot)) {
  for (const match of readFileSync(file, 'utf8').matchAll(exported)) {
    const [, name, value] = match;
    if (wireLabel.test(value) && value.startsWith('pico')) {
      labels.set(value, name);
    }
  }
}

const errors = [];
if (labels.size === 0) {
  errors.push('scripts/check-wire-labels.mjs found no protocol labels to protect; the '
    + 'export shape it reads must have changed.');
}

for (const root of ['apps', 'modules', 'packages']) {
  for (const file of sourceFiles(join(repoRoot, root))) {
    if (file.startsWith(protocolRoot)) {
      continue;
    }
    /**
     * Tests may name a value: pinning the exact bytes is what a test is for,
     * and a fixture that follows a rename would stop noticing it.
     */
    if (file.endsWith('.test.ts') || allowed.some((entry) => entry.file === file)) {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    for (const [value, name] of labels) {
      if (source.includes(`'${value}'`)) {
        errors.push(
          `${relative(repoRoot, file)}: spells out the protocol label '${value}'. `
          + `Import ${name} from @pico/protocol instead - a second spelling is a copy `
          + 'nothing compares, and the surfaces that read these values refuse a correct '
          + 'input without saying why.',
        );
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Wire label check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Wire label check passed (${labels.size} protocol labels spelled once, `
  + `${allowed.length} argued exemptions).`,
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
