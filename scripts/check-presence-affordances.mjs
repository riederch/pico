import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0126 P2. Two absences, measured.
 *
 * The ADR spends a section on one sentence - *a microphone has no risk class;
 * recording with it has one* - and both halves of it are the kind of thing
 * that holds for exactly as long as nobody is in a hurry.
 *
 * **First absence: an affordance never carries policy.** ADR 0036's capability
 * is evaluated against rules; an affordance is a fact about a runtime. If a
 * `riskClass` or a `requiresConfirmation` ever appears beside an affordance,
 * the two concepts have merged and the merge will be discovered later, in a
 * planner that asked a microphone whether it was allowed.
 *
 * **Second absence: nothing plans on a presence type.** ADR 0126 says the Core
 * plans against declared affordances and never against device classes - "a
 * branch on a device type is the shape this decision exists to prevent". The
 * label exists so a person can recognise their own device; the moment code
 * decides anything from it, affordances have become decoration.
 *
 * The first version of this rule refused the *word* anywhere, and the first
 * honest caller tripped it: a presence declaring its own type in an object
 * literal is how a presence gets a label at all, and it decides nothing. So
 * the rule refuses the *read* - `.presenceType` - and leaves the declaration
 * alone. Sharper than the exemption list it replaces, because a shape cannot
 * be added to by anybody in a hurry.
 *
 * Both are checked against code with comments and string contents stripped, in
 * the idiom `check-relay-boundary.mjs` uses, so the paragraph explaining a rule
 * cannot satisfy the check enforcing it.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const presenceSource = readFileSync(
  join(repoRoot, 'packages', 'protocol', 'src', 'presence.ts'),
  'utf8',
);

// --- The affordance vocabulary is closed and carries no policy -------------

const policyNames = ['riskClass', 'requiresConfirmation', 'approval', 'policy'];
for (const name of policyNames) {
  if (strip(presenceSource).includes(name)) {
    errors.push(
      `packages/protocol/src/presence.ts names \`${name}\` in code. An affordance is a fact `
      + 'about a runtime; policy belongs to the action (ADR 0126, ADR 0036).',
    );
  }
}

/**
 * The vocabulary must be a list of bare strings.
 *
 * An array of objects is where a risk class eventually goes, and it goes there
 * without anybody deciding to - so the shape is refused rather than the field.
 */
const vocabulary = /export const picoPresenceAffordances = \[([\s\S]*?)\] as const;/u
  .exec(presenceSource);
if (vocabulary === null) {
  errors.push('packages/protocol/src/presence.ts declares no closed affordance vocabulary.');
} else if (/[{:]/u.test(strip(vocabulary[1]))) {
  errors.push(
    'packages/protocol/src/presence.ts declares affordances as objects. A bare list has '
    + 'nowhere to put a risk class, and that absence is the gate (ADR 0126).',
  );
}

// --- Affordance names and capability names stay distinct -------------------

const affordances = [...(vocabulary?.[1] ?? '').matchAll(/'([a-z0-9_]+)'/gu)]
  .map((match) => match[1]);
const appearanceSource = readFileSync(
  join(repoRoot, 'packages', 'protocol', 'src', 'appearance.ts'),
  'utf8',
);
const capabilityNames = [
  ...[...appearanceSource.matchAll(/'(pico\.[a-z0-9.-]+)'/gu)].map((match) => match[1]),
  ...[...readFileSync(join(repoRoot, 'packages', 'protocol', 'src', 'index.ts'), 'utf8')
    .matchAll(/'(pico\.[a-z0-9._-]+)':\s*true/gu)].map((match) => match[1]),
];
for (const affordance of affordances) {
  if (capabilityNames.includes(affordance)) {
    errors.push(`\`${affordance}\` is both an affordance and a capability name.`);
  }
}
if (affordances.length === 0) {
  errors.push('packages/protocol/src/presence.ts declares an empty affordance vocabulary.');
}

// --- Nothing plans on a presence type --------------------------------------

/**
 * Where the label is allowed to be read: the protocol that defines it, the
 * store that keeps it, and a surface that shows it to a person. Everywhere
 * else, reading it is the branch ADR 0126 forbids.
 *
 * Enumerated rather than pattern-matched, so every exemption is visible here
 * instead of being an accident of a glob.
 */
const mayReadPresenceType = new Set([
  // Defines the vocabulary and parses an announcement into it.
  'packages/protocol/src/presence.ts',
  // Persists the label and reads it back for the row it hands to a surface.
  'apps/core/src/presence-registry.ts',
  // Turns the label into a word a person recognises their own device by, and
  // nothing else: the switch there produces a string and decides nothing. A
  // person choosing between two rows has to know which machine each one is.
  'apps/companion-shell/src/contract.ts',
]);

for (const file of sourceFiles(join(repoRoot, 'apps'), join(repoRoot, 'packages'))) {
  const path = relative(repoRoot, file);
  if (mayReadPresenceType.has(path) || /\.test\.[cm]?tsx?$/u.test(path)) {
    continue;
  }
  const code = strip(readFileSync(file, 'utf8'));
  // A read, not a declaration. `presenceType: 'desktop_companion'` states a
  // fact about oneself; `x.presenceType` is where a branch on a device class
  // begins, and the branch is what ADR 0126 forbids.
  if (/\.presenceType\b|\['presenceType'\]|\bpresenceType\s*===/u.test(code)) {
    errors.push(
      `${path} reads \`presenceType\`. The Core plans against declared affordances and `
      + 'never against device classes (ADR 0126); declaring your own type is fine, '
      + 'deciding from somebody else\'s is the branch this refuses.',
    );
  }
}

function sourceFiles(...roots) {
  const files = [];
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') {
          continue;
        }
        files.push(...sourceFiles(path));
        continue;
      }
      if (statSync(path).isFile() && /\.[cm]?tsx?$/u.test(entry.name)) {
        files.push(path);
      }
    }
  }
  return files;
}

/** Comments and string contents removed, so prose cannot satisfy a check. */
function strip(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/\/\/[^\n]*/gu, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/gu, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/gu, '""')
    .replace(/`(?:[^`\\]|\\.)*`/gu, '``');
}

if (errors.length > 0) {
  console.error('Presence affordance check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Presence affordance check passed (${affordances.length} affordances, `
  + 'none carrying policy, none planned against by device class).',
);
