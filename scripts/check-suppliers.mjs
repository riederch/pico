import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePicoDepotManifest } from '../packages/protocol/dist/depot-manifest.js';
import { picoSupplierSlots } from '../packages/protocol/dist/supplier.js';
import {
  picoSupplierRequestFamilyForSlot,
  picoSupplierSlotsWithoutFamily,
} from '../packages/protocol/dist/supplier-transport.js';

/**
 * ADR 0136 BR2 and ADR 0143 DP4 - one boundary, checked from both sides.
 *
 * These are two statements about the same line and they are opposites, which is
 * why they live in one script and why supplier code could never be checked by
 * `module:check`. That check asserts a module reaches *nothing* it should not: a
 * module never opens a socket, never spawns, never calls `fetch`. A bridge does
 * all three by definition - reaching one outside system is its whole job - so it
 * would either fail `module:check` forever, which turns a check into noise, or
 * force that check to be weakened until it stopped holding for the modules that
 * need it.
 *
 * So:
 *
 * - **BR2, from the core's side:** no supplier code is reachable from the
 *   core's static import hull, and no supplier package can even be named,
 *   because `bridges/` is outside the pnpm workspace. The only route to a
 *   supplier is the ADR 0097-shaped socket whose families
 *   `supplier-transport.ts` closes.
 * - **DP4, from the depot's side:** outward reach is permitted and three things
 *   are not - core internals, a second runtime, and another supplier's
 *   material.
 *
 * The negative probes at the bottom run the real scanner over a virtual tree on
 * every gate run, in the shape `check-offline-floor.mjs` already uses. They are
 * what makes this check worth anything before a real supplier exists: an
 * assertion over an empty `bridges/` proves nothing, and a scanner nobody has
 * seen fail is a scanner nobody knows works.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const bridgesRoot = join(repoRoot, 'bridges');
const errors = [];

/**
 * Comments and string literals are stripped before imports are matched, for the
 * reason `check-offline-floor.mjs` records: prose containing `from "..."` reads
 * as an import, and a scanner that produces noise is one people learn to
 * override. It matters more here than anywhere - a bridge's doc comment will
 * name the very specifiers this check refuses, because explaining the rule
 * means writing it down.
 */
function stripCommentsAndStrings(source) {
  let out = '';
  let index = 0;
  let state = 'code';
  let quote = '';
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (state === 'code') {
      if (two === '//') { state = 'line'; index += 2; continue; }
      if (two === '/*') { state = 'block'; index += 2; continue; }
      if (source[index] === '"' || source[index] === "'" || source[index] === '`') {
        quote = source[index];
        state = 'string';
        out += source[index];
        index += 1;
        continue;
      }
      out += source[index];
      index += 1;
      continue;
    }
    if (state === 'line') {
      if (source[index] === '\n') { state = 'code'; out += '\n'; }
      index += 1;
      continue;
    }
    if (state === 'block') {
      if (two === '*/') { state = 'code'; index += 2; continue; }
      if (source[index] === '\n') { out += '\n'; }
      index += 1;
      continue;
    }
    if (source[index] === '\\') { out += source.slice(index, index + 2); index += 2; continue; }
    out += source[index];
    if (source[index] === quote) { state = 'code'; }
    index += 1;
  }
  return out;
}

const importPattern = /(?:^|[^\w$])(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
const typeOnlyPattern = /(?:^|[^\w$])(?:import|export)\s+type\s[^'"]*$/u;

function importsOf(source) {
  const stripped = stripCommentsAndStrings(source);
  const specifiers = [];
  for (const match of stripped.matchAll(importPattern)) {
    const preceding = stripped.slice(0, match.index + match[0].length - match[1].length - 2);
    if (typeOnlyPattern.test(preceding)) {
      // Erased before emission, so it creates no runtime edge. Flagging one
      // would push an author towards duplicating a shape by hand, which is how
      // a contract stops being one contract.
      continue;
    }
    specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * ADR 0143 DP4. **The slot contract, and nothing else.**
 *
 * A supplier speaks the shapes ADR 0136 BR1 closed and the transport that
 * carries them. Everything else in `@pico/protocol` is core business - the
 * decision input, the action request, identity, recovery - and a supplier that
 * could construct one of those would be arguing about its own permission
 * rather than answering a question.
 *
 * The barrel is refused deliberately and is the entry most likely to be
 * reached for, because `@pico/protocol` looks like the polite way to depend on
 * the protocol. It re-exports the whole surface, so allowing it would make
 * every subpath rule below decorative.
 */
const supplierProtocolSubpaths = new Set([
  '@pico/protocol/supplier',
  '@pico/protocol/supplier-transport',
  '@pico/protocol/supplier-condition',
  '@pico/protocol/supplier-answer',
  '@pico/protocol/confidence',
]);

/**
 * ADR 0143 DP3, enforced. The manifest cannot name a command, so a supplier
 * cannot be *given* a second runtime; these are how it would take one anyway.
 *
 * Without this, DP3 is a rule about a manifest field that any bridge could walk
 * around in four lines - and the walk-around is the interesting case, because a
 * bridge that spawns `python3` has exactly the property DP3 exists to prevent
 * while passing every manifest check.
 *
 * `node:vm` and `node:worker_threads` are here for the same reason as
 * `node:child_process`: all three end with code running that Pico did not start
 * and cannot see.
 */
const secondRuntimeImports = new Map([
  ['node:child_process', 'spawns a process'],
  ['node:worker_threads', 'starts a worker'],
  ['node:vm', 'evaluates code in a new context'],
  ['node:module', 'loads code through the module machinery'],
  ['node:inspector', 'opens the inspector'],
]);

const secondRuntimeGlobals = [
  { pattern: /(?:^|[^\w$.])eval\s*\(/u, what: 'evaluates a string as code' },
  { pattern: /new\s+Function\s*\(/u, what: 'builds a function from a string' },
];

/**
 * ADR 0143 DP4. Core internals a supplier must not reach by name.
 *
 * Read from the tree rather than listed here, so a runtime added later is
 * covered without anybody remembering to add it - the failure mode of an
 * enumerated list is that it is correct on the day it is written.
 */
function workspacePackageNames() {
  const names = new Map();
  for (const group of ['apps', 'packages', 'modules']) {
    const root = join(repoRoot, group);
    if (!existsSync(root)) {
      continue;
    }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = join(root, entry.name, 'package.json');
      if (!existsSync(manifestPath)) {
        continue;
      }
      names.set(JSON.parse(readFileSync(manifestPath, 'utf8')).name, group);
    }
  }
  return names;
}

const workspacePackages = workspacePackageNames();

function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * ADR 0143 DP4 and ADR 0136 BR2. Walks one supplier's closure and returns every
 * violation.
 *
 * `io` is injected so the negative probes run the real scanner over a virtual
 * tree instead of writing files into the repository.
 */
export function scanSupplierClosure(entryFiles, io, options) {
  const { readFile, exists } = io;
  const supplierRoot = options?.supplierRoot;
  const siblingRoots = options?.siblingRoots ?? [];
  if (typeof supplierRoot !== 'string' || supplierRoot === '') {
    // Required rather than defaulted. Without it the cross-supplier rule would
    // silently pass for everything, which is the quiet failure this check
    // exists to avoid.
    throw new Error('scanSupplierClosure needs the root of the supplier it walks');
  }
  const violations = [];
  const seen = new Set();
  const queue = [...entryFiles];

  const within = (file, root) => file === root || file.startsWith(root.endsWith('/') ? root : `${root}/`);

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFile(file);
    const stripped = stripCommentsAndStrings(source);

    for (const global of secondRuntimeGlobals) {
      if (global.pattern.test(stripped)) {
        violations.push({ file, kind: 'second_runtime', detail: global.what });
      }
    }

    for (const specifier of importsOf(source)) {
      if (specifier.startsWith('.')) {
        // Both extensions, because the two sides of this check are written in
        // different ones. Core and module source is `.ts`; a depot vendors
        // built code and its entry point is `.js` under ADR 0143 DP3, so a
        // walker that only followed `.ts` would stop at a bridge's first
        // relative import and report a clean hull for an unscanned tree.
        const base = resolve(dirname(file), specifier).replace(/\.js$/u, '');
        let resolved = null;
        for (const candidate of [
          `${base}.ts`,
          join(base, 'index.ts'),
          `${base}.js`,
          `${base}.mjs`,
          join(base, 'index.js'),
          join(base, 'index.mjs'),
        ]) {
          if (exists(candidate)) {
            resolved = candidate;
            break;
          }
        }
        if (resolved === null) {
          continue;
        }
        if (!within(resolved, supplierRoot)) {
          const sibling = siblingRoots.find((root) => within(resolved, root));
          violations.push({
            file,
            kind: sibling === undefined ? 'leaves_supplier' : 'cross_supplier',
            detail: specifier,
          });
          // Reported and not followed, for `check-modules.mjs`'s reason: walking
          // on would judge the other tree by this supplier's rules and bury the
          // one real finding under every consequence of it.
          continue;
        }
        queue.push(resolved);
        continue;
      }

      if (secondRuntimeImports.has(specifier)) {
        violations.push({
          file,
          kind: 'second_runtime',
          detail: `${specifier} ${secondRuntimeImports.get(specifier)}`,
        });
        continue;
      }
      if (specifier.startsWith('node:')) {
        // Everything else in the node namespace is permitted, and that is the
        // whole inverse statement: `node:https`, `node:net`, `node:tls`,
        // `node:fs` are a bridge's and a library extractor's actual job.
        continue;
      }

      const target = packageOf(specifier);
      if (target === '@pico/protocol') {
        if (!supplierProtocolSubpaths.has(specifier)) {
          violations.push({ file, kind: 'core_internals', detail: specifier });
        }
        continue;
      }
      if (workspacePackages.has(target)) {
        violations.push({ file, kind: 'core_internals', detail: specifier });
      }
      // An unrecognised bare specifier is a vendored third-party dependency
      // (ADR 0143 DP2), which is what a bridge is expected to have. DP2 checks
      // that it is actually vendored; this check is about reach.
    }
  }

  return { violations, files: seen };
}

const violationReasons = {
  core_internals:
    'ADR 0143 DP4: a supplier speaks the ADR 0136 BR1 slot contract and nothing '
    + 'else. Reaching a core package - or the protocol barrel, which re-exports '
    + 'the whole surface - is reaching past the slot into decisions that are not '
    + 'a supplier\'s.',
  second_runtime:
    'ADR 0143 DP3/DP4: a bridge runs in the runtime Pico brings. The manifest has '
    + 'no field for a second one, and taking one anyway is the walk-around that '
    + 'field exists to prevent.',
  cross_supplier:
    'ADR 0143 DP5: suppliers compose by declaration inside one depot, not by '
    + 'reaching into each other\'s files. What the lower one provides arrives '
    + 'through the stack, not through a path.',
  leaves_supplier:
    'ADR 0143 DP4: a relative import leaving the supplier reaches material '
    + 'nobody declared. A supplier reaches other packages by name.',
};

function sourceFiles(directory, exists = existsSync) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
          walk(path);
        }
      } else if (/\.(?:ts|js|mjs|cjs)$/u.test(entry.name)) {
        // `.js` and `.cjs` matter on the depot side: DP2 vendors what runs, so
        // a bridge ships built JavaScript, and a scanner that only read source
        // extensions would pass every real depot without looking at it.
        found.push(path);
      }
    }
  };
  if (exists(directory)) {
    walk(directory);
  }
  return found;
}

// --- BR2: the core cannot reach supplier code -------------------------------

/**
 * The structural half, and the strongest one. `bridges/` is deliberately not a
 * pnpm workspace member, so a supplier package has no name the core could
 * resolve even if somebody wrote the import. ADR 0143 DP2 needs this too: a
 * workspace member would be installed by the package manager, which is the one
 * thing vendoring exists to avoid.
 */
const workspaceConfig = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
for (const line of workspaceConfig.split('\n')) {
  if (/^\s*-\s*["']?bridges/u.test(line)) {
    errors.push(
      'pnpm-workspace.yaml lists bridges/. ADR 0136 BR2: supplier code is not '
      + 'linkable from the core, and ADR 0143 DP2: what runs is vendored rather '
      + 'than installed. A workspace member is both linkable and installed.',
    );
  }
}

if (!existsSync(bridgesRoot) || !statSync(bridgesRoot).isDirectory()) {
  errors.push(
    'bridges/ does not exist. ADR 0143 DP4 needs a root that is checked by '
    + 'different rules than modules/, and its absence would make this check pass '
    + 'by having nothing to look at.',
  );
}

/**
 * The reach half. Nothing the product ships may name a path into `bridges/`,
 * whichever direction the author thought they were going.
 */
const bridgesReach = [
  { pattern: /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"][^'"]*(?:^|\/|\.\.\/)bridges\//u, what: 'an import into bridges/' },
];
for (const group of ['apps', 'packages', 'modules']) {
  for (const file of sourceFiles(join(repoRoot, group))) {
    if (file.endsWith('.test.ts')) {
      continue;
    }
    const stripped = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    for (const reach of bridgesReach) {
      if (reach.pattern.test(stripped)) {
        errors.push(
          `${relative(repoRoot, file)}: contains ${reach.what}. ADR 0136 BR2: `
          + 'supplier code runs outside the core process and is reached over the '
          + 'socket, never linked. An import is the one route that makes the '
          + 'process boundary a comment.',
        );
      }
    }
  }
}

/**
 * ADR 0136 BR1/BR2. Every slot has exactly one family, so "the core reaches a
 * supplier" has exactly one route. A slot without one would mean the core
 * reaches that supplier some other way, and the other way is the one nothing
 * here can see.
 */
const slotsWithoutFamily = picoSupplierSlotsWithoutFamily();
if (slotsWithoutFamily.length > 0) {
  errors.push(
    `Slots with no transport family: ${slotsWithoutFamily.join(', ')}. ADR 0136 `
    + 'BR2: a slot reachable some other way is a slot reachable a way this check '
    + 'cannot see.',
  );
}
const familyPerSlot = new Set(picoSupplierSlots.map((slot) => picoSupplierRequestFamilyForSlot(slot)));
if (familyPerSlot.size !== picoSupplierSlots.length) {
  errors.push(
    'Two slots share one transport family. ADR 0136 BR1 keeps the shapes '
    + 'distinct, and a shared family would let a supplier answer one question '
    + 'with another question\'s shape.',
  );
}

// --- DP3: the shipped depot's manifest, through the product's own parser -----

/**
 * ADR 0143 DP3 and DP6. The `bridges/` depot is a depot like any other, so its
 * manifest is held to the parser the product uses rather than to a second one
 * written here - `check-modules.mjs`'s rule, for its reason: a check that
 * accepted manifests the product refuses, or the reverse, would be enforcing a
 * different contract than the one that ships.
 *
 * Absent is not an error today. Nothing attaches the shipped depot yet, and a
 * manifest for a depot with no suppliers would have to declare none, which
 * DP3 refuses on purpose.
 */
const depotManifestPath = join(bridgesRoot, 'pico-depot.json');
let depotManifest = null;
if (existsSync(depotManifestPath)) {
  try {
    depotManifest = parsePicoDepotManifest(JSON.parse(readFileSync(depotManifestPath, 'utf8')));
  } catch (error) {
    errors.push(
      `bridges/pico-depot.json: refused by the protocol parser (${error.message}). `
      + 'ADR 0143 DP6: the shipped depot is a depot like any other, so it meets '
      + 'the same manifest contract an external one does.',
    );
  }
}
if (depotManifest !== null) {
  for (const supplier of depotManifest.suppliers) {
    const entry = join(bridgesRoot, supplier.entryPoint);
    if (!existsSync(entry) || !statSync(entry).isFile()) {
      errors.push(
        `bridges/pico-depot.json: ${supplier.identifier} names the entry point `
        + `${supplier.entryPoint}, which is not a file in this depot. ADR 0143 `
        + 'DP3: Pico calls the named file with its own runtime, so a name that '
        + 'points at nothing is a supplier that cannot start.',
      );
    }
  }
}

// --- DP2: what runs is vendored ---------------------------------------------

/**
 * ADR 0143 DP2 - the user's decision, checked rather than trusted.
 *
 * A depot vendors its dependencies. There is no package-manager step, no
 * registry and no network at attachment beyond the `git` fetch itself, because
 * `rchkb` already arrives by `git` and a second fetch path would give an
 * installation two integrity stories and two ways to be offline.
 *
 * Three shapes say a depot expects to resolve something, and each is refused
 * for its own reason:
 *
 * - **a lockfile**, which is an instruction to resolve. Vendoring means there
 *   is nothing to resolve, so a lockfile is either dead weight or a plan;
 * - **an undeclared-but-unvendored dependency**, where `package.json` names a
 *   package that is not in the tree. That depot runs on whatever a registry
 *   hands it on the day it is attached, on a machine that may be offline;
 * - **an install script**, which is arbitrary code executing at a moment when
 *   nobody has decided anything yet - before the process boundary, before
 *   consent, before the person has seen what they attached.
 */
const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json'];
const installScriptNames = ['preinstall', 'install', 'postinstall', 'prepare', 'prepack'];

function checkVendoring(root, label) {
  for (const lockfile of lockfiles) {
    if (existsSync(join(root, lockfile))) {
      errors.push(
        `${label}/${lockfile}: ADR 0143 DP2 vendors what runs, so there is `
        + 'nothing to resolve and a lockfile is either dead weight or a plan to '
        + 'fetch. `git` is the one fetch path.',
      );
    }
  }
  const packageJsonPath = join(root, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return;
  }
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    errors.push(`${label}/package.json: unreadable (${error.message}).`);
    return;
  }
  for (const name of installScriptNames) {
    if (packageJson.scripts?.[name] !== undefined) {
      errors.push(
        `${label}/package.json: declares a ${name} script. ADR 0143 DP2: `
        + 'installing runs no code. An install hook executes before the process '
        + 'boundary, before consent and before the person has seen what they '
        + 'attached.',
      );
    }
  }
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(packageJson[section] ?? {})) {
      if (!existsSync(join(root, 'node_modules', name))) {
        errors.push(
          `${label}/package.json: ${section} names ${name}, which is not vendored `
          + 'in this depot. ADR 0143 DP2: what runs is in the repository, so the '
          + 'commit means what it appears to mean and a reviewer who read it has '
          + 'read the code.',
        );
      }
    }
  }
}

if (existsSync(bridgesRoot) && statSync(bridgesRoot).isDirectory()) {
  checkVendoring(bridgesRoot, 'bridges');
}

// --- DP4: supplier code cannot reach the core -------------------------------

const suppliers = [];
if (existsSync(bridgesRoot) && statSync(bridgesRoot).isDirectory()) {
  // **The manifest decides what a supplier is, not the directory layout.**
  // An earlier version read the top-level folders, which reported
  // `bridges/suppliers` as one supplier for a depot that keeps its suppliers
  // in a subdirectory - and then DP5's cross-supplier rule compared siblings
  // that were not siblings. A depot declares its suppliers under DP3; using
  // that declaration is the only way this check and the product agree on what
  // they are looking at.
  const supplierRoots = depotManifest === null
    ? readdirSync(bridgesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
      .map((entry) => join(bridgesRoot, entry.name))
    : [...new Set(depotManifest.suppliers.map(
      (supplier) => dirname(join(bridgesRoot, supplier.entryPoint)),
    ))];

  for (const supplierRoot of supplierRoots) {
    const files = sourceFiles(supplierRoot);
    if (files.length === 0) {
      continue;
    }
    const { violations } = scanSupplierClosure(files, {
      readFile: (file) => readFileSync(file, 'utf8'),
      exists: (file) => existsSync(file) && statSync(file).isFile(),
    }, {
      supplierRoot,
      siblingRoots: supplierRoots.filter((other) => other !== supplierRoot),
    });
    for (const violation of violations) {
      errors.push(
        `${relative(repoRoot, violation.file)}: ${violation.detail}. `
        + violationReasons[violation.kind],
      );
    }
    suppliers.push(relative(repoRoot, supplierRoot).split(sep).join('/'));
  }
}

// --- Negative probes: both scanners have to be able to fail ------------------

const probes = [
  {
    name: 'a bridge importing the core runtime',
    files: { '/probe/s/entry.ts': "import { app } from '@pico/core';\nexport const x = app;\n" },
  },
  {
    name: 'a bridge importing the protocol barrel',
    files: { '/probe/s/entry.ts': "import { picoSupplierSlots } from '@pico/protocol';\nexport const x = picoSupplierSlots;\n" },
  },
  {
    name: 'a bridge importing the decision contract',
    files: { '/probe/s/entry.ts': "import { picoRulesFloorOutcome } from '@pico/protocol/pico-rules';\nexport const x = picoRulesFloorOutcome;\n" },
  },
  {
    name: 'a bridge spawning a second runtime',
    files: { '/probe/s/entry.ts': "import { spawn } from 'node:child_process';\nexport const x = spawn;\n" },
  },
  {
    name: 'a bridge building a function from a string',
    files: { '/probe/s/entry.ts': 'export const x = new Function("return 1");\n' },
  },
  {
    name: 'a core reach three files deep',
    files: {
      '/probe/s/entry.ts': "import { b } from './b.js';\nexport const x = b;\n",
      '/probe/s/b.ts': "import { c } from './c.js';\nexport const b = c;\n",
      '/probe/s/c.ts': "import { store } from '@pico/vault';\nexport const c = store;\n",
    },
  },
  {
    name: 'a supplier reaching into a sibling supplier',
    files: {
      '/probe/s/entry.ts': "import { helper } from '../other/helper.js';\nexport const x = helper;\n",
      '/probe/other/helper.ts': 'export const helper = 1;\n',
    },
    siblingRoots: ['/probe/other'],
  },
  {
    name: 'a supplier reaching material outside every supplier',
    files: {
      '/probe/s/entry.ts': "import { thing } from '../elsewhere/thing.js';\nexport const x = thing;\n",
      '/probe/elsewhere/thing.ts': 'export const thing = 1;\n',
    },
  },
];

for (const probe of probes) {
  const io = {
    readFile: (file) => {
      if (!(file in probe.files)) {
        throw new Error(`probe read outside its tree: ${file}`);
      }
      return probe.files[file];
    },
    exists: (file) => file in probe.files,
  };
  const { violations } = scanSupplierClosure(['/probe/s/entry.ts'], io, {
    supplierRoot: '/probe/s',
    siblingRoots: probe.siblingRoots ?? [],
  });
  if (violations.length === 0) {
    errors.push(`Supplier scanner failed its negative probe: ${probe.name} was not caught.`);
  }
}

/**
 * ADR 0143 DP4's whole point, and the half a stricter-looking check would get
 * wrong. A bridge that opens a socket, calls `fetch` and reads a file is doing
 * its job. If this probe ever fails, the check has drifted into being
 * `module:check` with a different name, and every bridge in the tree is now
 * failing for being a bridge.
 */
const outwardProbe = {
  '/probe/s/entry.ts':
    "import { request } from 'node:https';\n"
    + "import { readFileSync } from 'node:fs';\n"
    + "import { connect } from 'node:net';\n"
    + "import { parsePicoSupplierManifest } from '@pico/protocol/supplier';\n"
    + "import { helper } from './helper.js';\n"
    + 'export async function go() {\n'
    + '  await fetch("https://example.invalid");\n'
    + '  return [request, readFileSync, connect, parsePicoSupplierManifest, helper];\n'
    + '}\n',
  '/probe/s/helper.ts': "export const helper = 1;\n",
};
const outwardResult = scanSupplierClosure(['/probe/s/entry.ts'], {
  readFile: (file) => outwardProbe[file],
  exists: (file) => file in outwardProbe,
}, { supplierRoot: '/probe/s' });
if (outwardResult.violations.length > 0) {
  errors.push(
    'Supplier scanner refused permitted outward reach: '
    + outwardResult.violations.map((violation) => `${violation.kind}:${violation.detail}`).join(', ')
    + '. ADR 0143 DP4 permits reaching outside - that is the inverse statement '
    + 'to module:check, and a check that forbids it has become the wrong check.',
  );
}

/**
 * The doc-comment case, which is not hypothetical: this script's own comments
 * name every specifier it refuses, and so will a bridge's.
 */
const proseProbe = {
  '/probe/s/entry.ts':
    '// A bridge must not import node:child_process or @pico/core.\n'
    + "/* Nor may it reach '@pico/protocol/pico-rules'. */\n"
    + "export const note = 'node:child_process';\n",
};
const proseResult = scanSupplierClosure(['/probe/s/entry.ts'], {
  readFile: (file) => proseProbe[file],
  exists: (file) => file in proseProbe,
}, { supplierRoot: '/probe/s' });
if (proseResult.violations.length > 0) {
  errors.push(
    'Supplier scanner flagged prose rather than code: '
    + proseResult.violations.map((violation) => `${violation.kind}:${violation.detail}`).join(', '),
  );
}

if (errors.length > 0) {
  console.error('Supplier boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Supplier boundary check passed: ${picoSupplierSlots.length} slots each reached `
  + `over one named family, bridges/ outside the workspace, ${suppliers.length} `
  + `supplier${suppliers.length === 1 ? '' : 's'} checked`
  + `${suppliers.length === 0 ? '' : ` (${suppliers.join(', ')})`}`
  + `${depotManifest === null ? ', no depot manifest' : `, depot manifest declares ${depotManifest.suppliers.length}`}.`,
);
if (suppliers.length === 0) {
  // Printed on success on purpose, for the reason check-offline-floor.mjs
  // prints its unimplemented families: a boundary with nothing on the far side
  // of it must not read as a boundary that has been exercised. What holds today
  // is the structural half plus the probes.
  console.log(
    'No supplier is attached yet, so DP4\'s reach rules ran against the negative '
    + 'probes only. ADR 0136 BR2\'s structural half - bridges/ outside the '
    + 'workspace, no import into it, one family per slot - holds regardless.',
  );
}
