import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0118 O1: the offline floor is mechanically enforced, not aspired to.
 *
 * Sibling of `check-companion-boundary.mjs`. For each declared floor family it
 * resolves the transitive import closure of the declared modules and fails on a
 * forbidden reachable import - so a dependency added three modules deep is
 * caught the same as one added directly.
 *
 * Two things keep the check from passing vacuously, which is the failure mode
 * that matters here. A floor that is only partly built must not report as
 * enforced: every family named in the protocol must appear in the manifest, and
 * one that is not implemented has to say so with a reason, which is printed on
 * success rather than swallowed. And the scanner is itself probed - a checker
 * that cannot catch a violation is worse than none, because it converts an
 * unexamined risk into a false assurance.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(repoRoot, 'offline-floor.json'), 'utf8'));

const errors = [];

/**
 * Comments and string literals are stripped before imports are matched. Without
 * that, prose containing `from "..."` reads as an import - an early draft of
 * this check reported two phantom dependencies from sentences inside comments,
 * and a scanner that produces noise is one people learn to override.
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
        // Kept, because the import specifier itself is a string literal; only
        // the *contents* of comments are dropped.
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
    // string
    if (source[index] === '\\') { out += source.slice(index, index + 2); index += 2; continue; }
    out += source[index];
    if (source[index] === quote) { state = 'code'; }
    index += 1;
  }
  return out;
}

const importPattern = /(?:^|[^\w$])(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * `import type` and `export type` are erased before anything runs, so they are
 * not dependencies at all and must not be walked. Flagging one would be a false
 * positive of the worst kind here: a floor module that only names a shape from
 * a networked package would fail a check about runtime reach, and the fix
 * people would reach for is an exemption.
 */
const typeOnlyPattern = /(?:^|[^\w$])(?:import|export)\s+type\s[^'"]*$/u;

function importsOf(source) {
  const stripped = stripCommentsAndStrings(source);
  const specifiers = [];
  for (const match of stripped.matchAll(importPattern)) {
    // Stops just before the opening quote: including it would leave a quote
    // character at the end, which `[^'"]*$` can never match.
    const preceding = stripped.slice(0, match.index + match[0].length - match[1].length - 2);
    if (typeOnlyPattern.test(preceding)) {
      continue;
    }
    specifiers.push(match[1]);
  }
  return specifiers;
}

const workspaceSourceRoots = new Map();
for (const entry of readdirSync(join(repoRoot, 'packages'))) {
  const packageJsonPath = join(repoRoot, 'packages', entry, 'package.json');
  if (!existsSync(packageJsonPath)) {
    continue;
  }
  const name = JSON.parse(readFileSync(packageJsonPath, 'utf8')).name;
  workspaceSourceRoots.set(name, join(repoRoot, 'packages', entry, 'src'));
}
for (const entry of readdirSync(join(repoRoot, 'apps'))) {
  const packageJsonPath = join(repoRoot, 'apps', entry, 'package.json');
  if (!existsSync(packageJsonPath)) {
    continue;
  }
  const name = JSON.parse(readFileSync(packageJsonPath, 'utf8')).name;
  workspaceSourceRoots.set(name, join(repoRoot, 'apps', entry, 'src'));
}

function resolveSpecifier(specifier, fromFile, exists) {
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(fromFile), specifier).replace(/\.js$/u, '');
    for (const candidate of [`${base}.ts`, join(base, 'index.ts'), `${base}.cts`]) {
      if (exists(candidate)) {
        return candidate;
      }
    }
    return null;
  }
  for (const [name, root] of workspaceSourceRoots) {
    if (specifier === name) {
      const candidate = join(root, 'index.ts');
      return exists(candidate) ? candidate : null;
    }
    if (specifier.startsWith(`${name}/`)) {
      const rest = specifier.slice(name.length + 1).replace(/\.js$/u, '');
      for (const candidate of [join(root, `${rest}.ts`), join(root, rest, 'index.ts')]) {
        if (exists(candidate)) {
          return candidate;
        }
      }
      return null;
    }
  }
  return null;
}

/**
 * ADR 0129 SR5. Some things are forbidden to one family rather than to all.
 *
 * The global set is about reaching *out* - a network, a model - and applies
 * everywhere. A sensor API is different: a mobile runtime that captures
 * location has to call one, and forbidding the name everywhere would make the
 * capture path unimplementable rather than making the derivation pure.
 *
 * So the sensor ban is scoped to `spatial_recall`, whose whole claim is that
 * the rules are pure functions over readings somebody hands them. A module
 * that reached a sensor itself would make the port a suggestion, and would tie
 * the meaning of parking to one operating system's API - the thing issue #3
 * named as the requirement.
 */
function forbiddenSetFor(family) {
  const scoped = manifest.familyForbidden?.[family];
  return {
    specifiers: [
      ...manifest.forbidden.specifiers,
      ...(scoped?.specifiers ?? []),
    ],
    specifierPrefixes: [
      ...manifest.forbidden.specifierPrefixes,
      ...(scoped?.specifierPrefixes ?? []),
    ],
    globalCalls: [
      ...manifest.forbidden.globalCalls,
      ...(scoped?.globalCalls ?? []),
    ],
  };
}

function isForbidden(specifier, forbidden) {
  if (forbidden.specifiers.includes(specifier)) {
    return true;
  }
  return forbidden.specifierPrefixes.some((prefix) => specifier.startsWith(prefix));
}

/**
 * Walks the closure and returns every violation found. `readFile`/`exists` are
 * injected so the negative probes below can run the real scanner over a virtual
 * tree instead of writing files.
 */
export function scanFloorClosure(entryFiles, io, family) {
  const { readFile, exists } = io;
  if (typeof family !== 'string' || family === '') {
    // Required rather than defaulted. A caller that omitted it would get the
    // global set and lose that family's own ban with no sign that anything
    // was missing - the quiet failure this whole check exists to avoid.
    throw new Error('scanFloorClosure needs the family whose closure it walks');
  }
  const forbidden = forbiddenSetFor(family);
  const violations = [];
  const seen = new Set();
  const queue = [...entryFiles];

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFile(file);
    const stripped = stripCommentsAndStrings(source);

    for (const call of forbidden.globalCalls) {
      if (new RegExp(`(?:^|[^\\w$.])${call}\\s*\\(`, 'u').test(stripped)) {
        violations.push({ file, kind: 'global', detail: call });
      }
    }

    for (const specifier of importsOf(source)) {
      if (isForbidden(specifier, forbidden)) {
        violations.push({ file, kind: 'import', detail: specifier });
        continue;
      }
      const resolved = resolveSpecifier(specifier, file, exists);
      if (resolved !== null) {
        queue.push(resolved);
      }
    }
  }

  return { violations, modules: seen };
}

const realIo = {
  readFile: (file) => readFileSync(file, 'utf8'),
  exists: (file) => existsSync(file) && statSync(file).isFile(),
};

// --- The floor itself -------------------------------------------------------

const declaredFamilies = Object.keys(manifest.families);
const unimplemented = [];
// Distinct across families, not summed: families share modules, and adding
// them up would report a number larger than the code it actually covers.
const enforcedModules = new Set();

for (const [family, declaration] of Object.entries(manifest.families)) {
  if (typeof declaration.unimplemented === 'string') {
    if (declaration.unimplemented.trim() === '') {
      errors.push(`offline-floor.json: family ${family} is unimplemented with no reason given.`);
    }
    unimplemented.push(family);
    continue;
  }
  if (!Array.isArray(declaration.modules) || declaration.modules.length === 0) {
    errors.push(`offline-floor.json: family ${family} declares no modules and no reason.`);
    continue;
  }

  const entries = [];
  for (const module of declaration.modules) {
    if (module === 'bridges' || module.startsWith('bridges/')) {
      // ADR 0136 BR6. The asymmetry between the two supplier kinds, at the one
      // place it could be crossed by writing a line in a JSON file.
      //
      // A library may belong to a floor family - `local_recall` already
      // promises finding and reading what is already on the device, and a
      // working copy is on the device. A bridge never can, because it needs
      // the network per query, and the floor promises the *operation* rather
      // than the content: an operation that needs a network on the query after
      // next does not become a floor operation by having succeeded once.
      //
      // `bridges/` holds supplier code of both kinds and nothing distinguishes
      // them from here, so the whole root is refused rather than half of it.
      // A library's read path is core code and lands in the family as core
      // code, which is where the floor can actually see it (ADR 0136 BR2).
      errors.push(
        `offline-floor.json: family ${family} names ${module}. ADR 0136 BR6: a `
        + 'bridge can never be on the floor, and supplier code is reached over '
        + 'the socket rather than imported, so nothing under bridges/ has an '
        + 'import hull this check could walk.',
      );
      continue;
    }
    const path = join(repoRoot, module);
    if (!realIo.exists(path)) {
      errors.push(`offline-floor.json: family ${family} names ${module}, which does not exist.`);
      continue;
    }
    entries.push(path);
  }
  if (entries.length === 0) {
    continue;
  }

  const { violations, modules } = scanFloorClosure(entries, realIo, family);
  for (const module of modules) {
    enforcedModules.add(module);
  }
  for (const violation of violations) {
    errors.push(
      violation.kind === 'import'
        ? `${relative(repoRoot, violation.file)}: floor family ${family} must not reach ${violation.detail}.`
        : `${relative(repoRoot, violation.file)}: floor family ${family} must not call ${violation.detail}().`,
    );
  }
}

// --- The family list may not drift from the protocol ------------------------

const floorSource = readFileSync(
  join(repoRoot, 'packages', 'protocol', 'src', 'offline-floor.ts'),
  'utf8',
);
const listMatch = /picoOfflineFloorFamilies = \[(.*?)\] as const;/su.exec(floorSource);
if (listMatch === null) {
  errors.push('packages/protocol/src/offline-floor.ts: cannot read picoOfflineFloorFamilies.');
} else {
  const protocolFamilies = [...listMatch[1].matchAll(/'([a-z_]+)'/gu)].map((match) => match[1]);
  for (const family of protocolFamilies) {
    if (!declaredFamilies.includes(family)) {
      errors.push(`offline-floor.json: floor family ${family} is not declared.`);
    }
  }
  for (const family of declaredFamilies) {
    if (!protocolFamilies.includes(family)) {
      errors.push(`offline-floor.json: ${family} is not a floor family in the protocol.`);
    }
  }
}

// --- Outward-reaching modules stay out of every floor hull -------------------

/**
 * ADR 0118 O1 with ADR 0143 DP8. A guard for the hole the forbidden list
 * cannot cover.
 *
 * The list bans *specifiers* that reach out - `undici`, `node:tls`, a model
 * provider - and it cannot ban a spawn, because a spawn is not a direction.
 * `platform-anchor.ts` shells out to `tpm2_*` and `reader-access.ts` starts a
 * worker, and five of the six families already reach one or the other: both
 * are local calls with no network in them. Adding `node:child_process` to the
 * forbidden list would fail those five for doing something legitimate, and
 * leaving it out means a floor module could shell out to `git` or `curl` and
 * this check would stay green.
 *
 * So the guard is the other way round. Rather than banning the mechanism, it
 * names the modules that **do** reach out through one and asserts that no
 * floor family's hull contains them. That is narrower, it is checkable, and it
 * fails for the right reason - "this reaches the network" rather than "this
 * spawns something".
 *
 * It also settles a design question that looked like a matter of taste.
 * ADR 0143 DP8 asked for `startPicoTimeBoundScheduler` to be *generalised* to
 * carry a depot fetch. That scheduler is a declared entry of the
 * `time_bound_entry` family, so generalising it would have pulled `git` into a
 * floor hull - and because `node:child_process` is not on the forbidden list,
 * this check would not have said a word. Two scheduling disciplines, one
 * floor obligation, and the wrong merge is the silent one.
 */
const outwardReachingModules = [
  ['apps/core/src/depot-fetch.ts', 'invokes `git`, which reaches a remote'],
  // ADR 0149. The relay transport is the second module in the tree that
  // reaches a machine Pico does not run, and it arrived without being named
  // here - which is exactly how the first one would have slipped through. A
  // floor family that grew a path to it would be a family that phones an
  // operator to answer a question the floor promises to answer alone.
  ['apps/core/src/link-relay-transport.ts', 'calls a relay operator over the network'],
];
for (const [path, why] of outwardReachingModules) {
  const absolute = join(repoRoot, path);
  if (!realIo.exists(absolute)) {
    errors.push(`offline-floor: ${path} is named as outward-reaching and does not exist.`);
    continue;
  }
  for (const [family, declaration] of Object.entries(manifest.families)) {
    if (!Array.isArray(declaration.modules)) {
      continue;
    }
    const entries = declaration.modules
      .map((module) => join(repoRoot, module))
      .filter((entry) => realIo.exists(entry));
    if (entries.length === 0) {
      continue;
    }
    const { modules } = scanFloorClosure(entries, realIo, family);
    if (modules.has(absolute)) {
      errors.push(
        `${path}: reachable from floor family ${family}, and it ${why}. `
        + 'ADR 0118 O1: a floor operation answers with no network. The '
        + 'forbidden list cannot catch this one, because a spawn is not a '
        + 'direction - `platform-anchor.ts` spawns tpm2 and stays on the floor '
        + 'legitimately - so the module is named instead of the mechanism.',
      );
    }
  }
}

// --- Negative probes: the scanner has to be able to fail ---------------------

const probes = [
  {
    name: 'a directly forbidden import',
    files: { '/probe/entry.ts': "import { request } from 'undici';\nexport const x = request;\n" },
  },
  {
    name: 'a forbidden import three modules deep',
    files: {
      '/probe/entry.ts': "import { b } from './b.js';\nexport const x = b;\n",
      '/probe/b.ts': "import { c } from './c.js';\nexport const b = c;\n",
      '/probe/c.ts': "import axios from 'axios';\nexport const c = axios;\n",
    },
  },
  {
    name: 'a global fetch call',
    files: { '/probe/entry.ts': 'export async function go() {\n  return fetch("https://example.invalid");\n}\n' },
  },
  {
    name: 'a forbidden import reached through a workspace package specifier',
    files: {
      '/probe/entry.ts': "import { thing } from '@pico/model-provider';\nexport const x = thing;\n",
    },
  },
  {
    // ADR 0129 SR5. The derivation must not reach an operating-system location
    // API, or the port is a suggestion and the meaning of parking is tied to
    // one platform's plumbing.
    name: 'a sensor API reached from the spatial-recall derivation',
    family: 'spatial_recall',
    files: {
      '/probe/entry.ts': "import { getCurrentPosition } from 'expo-location';\nexport const x = getCurrentPosition;\n",
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
  const { violations } = scanFloorClosure(['/probe/entry.ts'], io, probe.family ?? 'capture');
  if (violations.length === 0) {
    errors.push(`Offline-floor scanner failed its negative probe: ${probe.name} was not caught.`);
  }
}

/**
 * ADR 0129 SR5. The scoping itself, which is the part that could quietly be
 * wrong in the useful direction.
 *
 * A sensor package is forbidden to `spatial_recall` and allowed everywhere
 * else, because a mobile runtime that captures location has to call one.
 * Banning the name globally would make the capture path unimplementable rather
 * than making the derivation pure, and a check that did so would look stricter
 * while being less useful.
 */
const scopedProbe = {
  '/probe/entry.ts': "import { getCurrentPosition } from 'expo-location';\nexport const x = getCurrentPosition;\n",
};
const scopedIo = {
  readFile: (file) => scopedProbe[file],
  exists: (file) => file in scopedProbe,
};
if (scanFloorClosure(['/probe/entry.ts'], scopedIo, 'capture').violations.length > 0) {
  errors.push(
    'Offline-floor scanner applied a spatial_recall ban to another family; '
    + 'a mobile runtime that captures location has to call a sensor API.',
  );
}

// A positive probe too, so the scanner is not merely flagging everything.
const cleanProbe = {
  '/probe/entry.ts': "import { helper } from './helper.js';\n// Mentions fetch( and 'undici' only in prose.\nexport const x = helper;\n",
  '/probe/helper.ts': "export const helper = 1;\n",
};
const cleanResult = scanFloorClosure(['/probe/entry.ts'], {
  readFile: (file) => cleanProbe[file],
  exists: (file) => file in cleanProbe,
}, 'capture');
if (cleanResult.violations.length > 0) {
  errors.push(
    'Offline-floor scanner flagged a clean probe: '
    + cleanResult.violations.map((violation) => `${violation.kind}:${violation.detail}`).join(', '),
  );
}

if (errors.length > 0) {
  console.error('Offline-floor check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Offline-floor check passed: ${declaredFamilies.length - unimplemented.length}`
  + ` of ${declaredFamilies.length} ADR 0118 floor families enforced`
  + ` across ${enforcedModules.size} distinct reachable modules.`,
);
if (unimplemented.length > 0) {
  // Printed on success on purpose. A floor that is only partly built must not
  // be able to read as a finished one just because the check exited zero.
  console.log(`Not yet implemented, so not enforced: ${unimplemented.join(', ')}.`);
  for (const family of unimplemented) {
    console.log(`- ${family}: ${manifest.families[family].unimplemented}`);
  }
}
