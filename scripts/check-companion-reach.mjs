import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A companion capability that nothing calls is a capability nobody has.
 *
 * The sibling of `check-store-writers.mjs` and `check-link-reachability.mjs`,
 * one layer further out. Those ask whether a store method and a Link operation
 * have a caller. This asks it of the layer where the answer decides what a
 * *person* can do: the shell-free companion core is the product's capability
 * surface, and an export nothing reaches is a feature that exists in the test
 * suite and nowhere else.
 *
 * **This repository has found that shape by accident five times.**
 * `attachPicoSupplier` had no caller, so the supplier list was empty on every
 * Home; `detachPicoSupplier` had none either; `setPicoSupplierReach` left both
 * defaults the only reachable state in the ADR whose title is that they exist;
 * `put()` on the presence registry left it empty on every real Home;
 * `appendPicoObservations` still has none, and that one is an argued deferral.
 * Four of the five were caught by `store:check` or by somebody noticing. This
 * one is written so the sixth is caught by name.
 *
 * **What it found on the day it was written, 2026-08-24:** fifteen of 134
 * exports, and thirteen of them are one subsystem. The device side of Pico
 * Relay - issue a mailbox, exchange addresses, sweep, admit a push, correlate
 * a reply - is four modules with tests and no product path into any of them.
 * ADR 0149's status says "Both loops run"; the Home's loop runs, and the
 * device's runs in its tests.
 *
 * **Scope, and why it stops at the companion.** `apps/core` is reached
 * through one dispatcher and `packages/*` are libraries whose callers are
 * other packages, so the same rule there would be about module hygiene rather
 * than about what a person can do. Here an unreached export means exactly one
 * thing, and it is worth failing a build over.
 *
 * An argument is not a permission. Each entry below says why a capability has
 * no caller *today*, in a form somebody can disagree with.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const companionRoot = join(repoRoot, 'apps', 'companion', 'src');

/**
 * Modules whose whole surface is unreached, with the argument for it. A module
 * is listed rather than each of its names, because the reason is the same
 * sentence for all of them and repeating it would invite the copies this
 * repository keeps finding.
 */
const argued = [
  {
    module: 'link-mailbox.ts',
    why: 'ADR 0148. The device half of the relay path: a mailbox this device owns, and the '
      + 'exchange that hands its address to the Home. Nothing starts it because nothing '
      + 'starts the sweep below it, and the sweep waits on the same thing',
  },
  {
    module: 'link-relay-sweep.ts',
    why: 'ADR 0149\'s collecting side on the device. Starting it is a product decision that '
      + 'has not been made - when a device begins asking a relay, and what it costs a phone '
      + 'to keep asking - and there is no operated relay to ask. The Home\'s loop runs; this '
      + 'one runs in its tests',
  },
  {
    module: 'link-push-gate.ts',
    why: 'ADR 0150. What a device admits when a push arrives, which is downstream of a sweep '
      + 'that nothing starts',
  },
  {
    module: 'pending-reply.ts',
    why: 'ADR 0149\'s reply correlation, reached only from the sweep above it. Its four '
      + 'unreached exports are the book\'s lifecycle; the sweep uses the other five',
  },
];

/** Single names, where the module around them is reached and one export is not. */
const arguedNames = [
  [
    'createLinuxNotifySendAdapter',
    'ADR 0112 with ADR 0113 C2, and `notify.ts`\'s own comment says it: the Electron shell '
      + 'supplies its own adapter, so this is the notification path of a companion running '
      + 'without a shell. That the shell-free core can do this at all is ADR 0113\'s claim; '
      + 'no product runs it without a shell yet',
  ],
  [
    'clearPicoCompanionRecoveryState',
    'ADR 0112 S3. A completed recovery writes its receipt *over* the pending state instead '
      + 'of deleting the file, so `completed` is the terminal status and the receipt is what '
      + 'the person is shown afterwards. Clearing is an end to that lifecycle which the '
      + 'product does not have',
  ],
  [
    'readPicoCompanionDomainReadership',
    'ADR 0130 E5, built 2026-08-23. Which domains exist and who may read them, over Link. '
      + 'The window has no panel for it yet, and building one is a surface decision rather '
      + 'than a wiring job: it is the first place a person would meet reader custody',
  ],
  [
    'revokePicoCompanionDomainReader',
    'ADR 0130 E5, the other half. Ending a read access needs the same panel, and a control '
      + 'that ends something must sit beside the list that shows it',
  ],
];

const errors = [];
const sources = readdirSync(companionRoot)
  .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
  .sort();

/** Every non-test file in the tree, which is where a caller would be. */
const callerFiles = [];
const collect = (directory) => {
  for (const entry of readdirSync(directory)) {
    /**
     * `scripts/` is excluded because a check is not a caller. This one names
     * `issuePicoCompanionRecoveryCard` in the paragraph above to explain
     * itself, and that sentence made the capability look reached - planting
     * the removal of its only real call passed twice before this line existed.
     * A check that reads its own prose as evidence is the shape this whole
     * file is about.
     */
    if (entry === 'node_modules' || entry === 'dist' || entry === 'out'
      || (directory === repoRoot && entry === 'scripts')) {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      collect(path);
    } else if (/\.(ts|mjs)$/u.test(path) && !/\.test\.(ts|mjs)$/u.test(path)) {
      callerFiles.push(path);
    }
  }
};
collect(repoRoot);
/**
 * A re-export is not a caller, and the first version of this check counted one.
 * `apps/companion/src/index.ts` carries `export { name } from './module.js'`
 * for much of the core, so every re-exported capability looked reached whether
 * or not anybody imported it - the barrel makes the reaching set look complete
 * while nothing walks it. Planting the removal of `main.ts`'s only call to
 * `issuePicoCompanionRecoveryCard` passed, which is how this was found.
 */
const withoutReExports = (text) => text
  .replace(/export\s*(?:type\s*)?\{[^}]*\}\s*from\s*'[^']*';?/gu, '');
/** Prose is not a caller either; a doc comment explains a name, it does not use it. */
const withoutComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/.*$/gmu, '$1');
const callerText = new Map(
  callerFiles.map((path) => [
    path,
    withoutComments(withoutReExports(readFileSync(path, 'utf8'))),
  ]),
);

const arguedModules = new Set(argued.map((entry) => entry.module));
const arguedNameSet = new Map(arguedNames);
let exportsChecked = 0;
let reachedOnlyByItsOwnFile = 0;
const unreached = [];

for (const entry of sources) {
  const path = join(companionRoot, entry);
  const own = readFileSync(path, 'utf8');
  for (const [, name] of own.matchAll(/^export (?:async )?function (\w+)/gmu)) {
    exportsChecked += 1;
    let reached = false;
    for (const [callerPath, text] of callerText) {
      if (callerPath === path) {
        continue;
      }
      if (new RegExp(`\\b${name}\\b`, 'u').test(text)) {
        reached = true;
        break;
      }
    }
    if (reached) {
      continue;
    }
    /**
     * Used by its own file and exported anyway: the test wanted a smaller
     * subject than the export that reaches it. Counted rather than refused -
     * the capability above it is reachable, so nobody is missing anything.
     */
    if ((own.match(new RegExp(`\\b${name}\\b`, 'gu')) ?? []).length > 1) {
      reachedOnlyByItsOwnFile += 1;
      continue;
    }
    if (arguedModules.has(entry) || arguedNameSet.has(name)) {
      continue;
    }
    unreached.push(`${relative(repoRoot, path)}: ${name}`);
  }
}

if (exportsChecked === 0) {
  errors.push(
    'scripts/check-companion-reach.mjs found no companion exports to check, so it passed '
    + 'over nothing. Either the companion core stopped exporting functions or the reading '
    + 'of it broke.',
  );
}
for (const name of unreached) {
  errors.push(
    `${name} is exported by the companion core and named by nothing outside its own file. `
    + 'A capability nobody can reach is a capability nobody has: give it a caller, or put '
    + 'the reason it has none beside the others in this check, in a sentence somebody can '
    + 'disagree with.',
  );
}
/** An argument for a module that has become reachable is a stale exemption. */
for (const entry of argued) {
  if (!sources.includes(entry.module)) {
    errors.push(
      `${entry.module} is argued here as unreached and no longer exists in the companion `
      + 'core. An argument outliving its subject is the same defect this check exists for.',
    );
  }
}

if (errors.length > 0) {
  console.error('Companion reach check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Companion reach check passed (${exportsChecked} exported capabilities, `
  + `${reachedOnlyByItsOwnFile} exported for their own tests, `
  + `${argued.length} modules and ${arguedNames.length} single names argued unreached).`,
);
