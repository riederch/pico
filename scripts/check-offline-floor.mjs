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

function isForbidden(specifier) {
  if (manifest.forbidden.specifiers.includes(specifier)) {
    return true;
  }
  return manifest.forbidden.specifierPrefixes.some((prefix) => specifier.startsWith(prefix));
}

/**
 * Walks the closure and returns every violation found. `readFile`/`exists` are
 * injected so the negative probes below can run the real scanner over a virtual
 * tree instead of writing files.
 */
export function scanFloorClosure(entryFiles, io) {
  const { readFile, exists } = io;
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

    for (const call of manifest.forbidden.globalCalls) {
      if (new RegExp(`(?:^|[^\\w$.])${call}\\s*\\(`, 'u').test(stripped)) {
        violations.push({ file, kind: 'global', detail: call });
      }
    }

    for (const specifier of importsOf(source)) {
      if (isForbidden(specifier)) {
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

  const { violations, modules } = scanFloorClosure(entries, realIo);
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
  const { violations } = scanFloorClosure(['/probe/entry.ts'], io);
  if (violations.length === 0) {
    errors.push(`Offline-floor scanner failed its negative probe: ${probe.name} was not caught.`);
  }
}

// A positive probe too, so the scanner is not merely flagging everything.
const cleanProbe = {
  '/probe/entry.ts': "import { helper } from './helper.js';\n// Mentions fetch( and 'undici' only in prose.\nexport const x = helper;\n",
  '/probe/helper.ts': "export const helper = 1;\n",
};
const cleanResult = scanFloorClosure(['/probe/entry.ts'], {
  readFile: (file) => cleanProbe[file],
  exists: (file) => file in cleanProbe,
});
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
