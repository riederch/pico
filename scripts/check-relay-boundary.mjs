import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0149 RS1/RS2. The relay is somebody else's machine, and this is what
 * that means mechanically.
 *
 * RS1: it reaches nothing of the person's. No core, no vault, no identity, no
 * companion - a relay that could import a store would be one somebody could
 * later teach to read one, and the boundary that keeps an operator
 * untrustworthy-by-design is the one that has to be checked rather than
 * intended.
 *
 * RS2: **it never learns a Pico.** ADR 0031 forbids relay account identity
 * being equivalent to Pico identity, and the way this holds is that no code
 * path could learn one: nothing here parses, verifies or stores an identity, a
 * delegation, a membership or a signature. A signature check would have been
 * the reflex - it answers "who", and the relay's only question is "is this
 * within somebody's quota".
 *
 * Written as a check because both properties are absences, and an absence
 * nobody measures is a comment.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const relayRoot = join(repoRoot, 'apps', 'relay');
const errors = [];

/** Packages a relay must not reach. `@pico/protocol` is the one it may. */
const forbiddenPackages = [
  '@pico/core',
  '@pico/vault',
  '@pico/vault-daemon',
  '@pico/companion',
  '@pico/identity',
  '@pico/sync',
  '@pico/module-',
];

/**
 * Vocabulary that would mean the relay had learned a Pico. Matched outside
 * comments, so a comment explaining the absence does not trip the check that
 * enforces it - `store.ts` says the word `delegation` while listing what a
 * relay does not keep.
 *
 * **String literals count.** They were stripped alongside comments until
 * 2026-08-21, and the doc comment here argued only for the comments: reading
 * `packet['picoIdentityFingerprintHex']` walked straight past a check whose
 * summary claims the relay "names no identity". Measured before tightening -
 * no forbidden name appears in a relay string today - and a relay that comes
 * to have one in an error message is a relay talking about memberships, which
 * is the thing being checked rather than a false positive.
 */
const forbiddenIdentityNames = [
  'picoIdentity',
  'PicoIdentity',
  'delegation',
  'Delegation',
  'crypto_sign',
  'crypto_box',
  'verifyPico',
  'membership',
  'Membership',
  'signatureHex',
];

const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

function listSourceFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      files.push(...listSourceFiles(path));
      continue;
    }
    if (statSync(path).isFile() && /\.[cm]?ts$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

/** Blanks comments and string contents, so prose about a rule is not the rule. */
function outsideComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

if (!existsSync(relayRoot)) {
  console.error('Relay boundary check failed: apps/relay does not exist.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(relayRoot, 'package.json'), 'utf8'));
for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
  for (const name of Object.keys(manifest[section] ?? {})) {
    if (forbiddenPackages.some((forbidden) => name.startsWith(forbidden))) {
      errors.push(`apps/relay/package.json ${section} must not depend on ${name} (ADR 0149 RS1).`);
    }
  }
}

let scanned = 0;
for (const file of listSourceFiles(join(relayRoot, 'src'))) {
  scanned += 1;
  const source = readFileSync(file, 'utf8');
  const code = outsideComments(source);

  for (const match of source.matchAll(importPattern)) {
    if (forbiddenPackages.some((forbidden) => match[1].startsWith(forbidden))) {
      errors.push(
        `${relative(repoRoot, file)}: the relay must not import ${match[1]} (ADR 0149 RS1); `
        + 'it is somebody else\'s machine and holds nothing of a person\'s.',
      );
    }
  }

  for (const name of forbiddenIdentityNames) {
    if (code.includes(name)) {
      errors.push(
        `${relative(repoRoot, file)}: the relay must not name ${name} (ADR 0149 RS2); `
        + 'a relay account is not a Pico identity, and the way that holds is that no code path could learn one.',
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Relay boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Relay boundary check passed (${scanned} files; the relay reaches no Pico store and names no identity).`,
);
