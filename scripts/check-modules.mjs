import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  orderPicoModuleManifests,
  parsePicoModuleManifest,
  picoModuleIdentifiers,
  picoModuleIsEffectBearing,
} from '../packages/protocol/dist/module.js';

/**
 * ADR 0127 M2. The module boundary, enforced rather than reviewed.
 *
 * Five failures, and each is a different way the boundary stops meaning
 * anything:
 *
 * - **an undeclared dependency** - a module reaching another it never named,
 *   which makes the manifest fiction and the activation closure wrong;
 * - **a cycle** - the one thing ADR 0127 prohibits outright, because an
 *   acyclic graph is what keeps the configurations worth testing finite;
 * - **a reach into another module's internals** rather than its published
 *   subpath, which is depending on a decision the other module never made;
 * - **an import of a runtime from a module**, which points the edge the wrong
 *   way and turns two packages into a cycle;
 * - **a module holding storage mechanics** - migrations, SQL, a database
 *   handle. ADR 0127 M5 asks for this to be reported as a boundary error
 *   rather than a style preference, because a module that owns storage has to
 *   be added to the shred cascade, the backup exclusions, the boot
 *   reconciliation, the Q5 ceilings and the Q3 byte-identity proof;
 * - **a module reaching the world directly** - a process, a socket, a
 *   filesystem, `fetch`. ADR 0128 H3: a module declares what it can cause and
 *   the core decides whether to cause it, so reaching out itself takes that
 *   decision and makes the manifest false.
 *
 * The manifest's `effects` list is validated by the protocol's parser rather
 * than here, so "declared no effects" and "declared them badly" are one rule
 * with one implementation.
 *
 * The manifests are read through the protocol's own parser, not a second one
 * written here. A check that accepted manifests the product refuses - or the
 * reverse - would be enforcing a different contract than the one that ships.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const modulesRoot = join(repoRoot, 'modules');
const errors = [];

const importPattern = /(?:^|[^\w$])(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/gu;
const typeOnly = /(?:^|[^\w$])(?:import|export)\s+type\s[^'"]*$/u;

/**
 * Storage mechanics a module must not contain. Deliberately about *doing*
 * rather than *saying*: `better-sqlite3` and a `CREATE TABLE` are the acts,
 * and prose mentioning either is not.
 */
const storageMechanics = [
  { pattern: /\bbetter-sqlite3\b/u, what: 'a database driver' },
  { pattern: /\bCREATE\s+TABLE\b/iu, what: 'a table definition' },
  { pattern: /\bALTER\s+TABLE\b/iu, what: 'a migration' },
  { pattern: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/iu, what: 'an index definition' },
];

/**
 * ADR 0128 H3. Direct routes out of the process, which a module never takes.
 *
 * A module declares what it can cause and the **core** decides whether to
 * cause it. A module that reaches the world itself has taken that decision,
 * and its manifest - the thing a person reads to know what it can do - has
 * become false. So these are refused whether or not the module declared an
 * effect: a declaration is a request for a port, not permission to bypass one.
 *
 * This is also the only static answer to "causing an effect it did not
 * declare". A port is just a function and no scanner can see through one, so
 * the wiring check (`bindPicoModuleEffects`) covers the port route and this
 * covers everything that goes around it.
 */
const worldReachingImports = new Set([
  'node:child_process',
  'node:cluster',
  'node:dgram',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:http2',
  'node:https',
  'node:net',
  'node:os',
  'node:process',
  'node:tls',
  'node:v8',
  'node:vm',
  'node:worker_threads',
]);

const worldReachingGlobals = [
  { pattern: /(?:^|[^\w$.])fetch\s*\(/u, what: 'a network call through fetch()' },
  { pattern: /(?:^|[^\w$.])process\.(?:env|exit|kill)\b/u, what: 'direct process access' },
];

function sourceFiles(directory) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          walk(path);
        }
      } else if (entry.name.endsWith('.ts')) {
        found.push(path);
      }
    }
  };
  walk(directory);
  return found;
}

function valueImportsOf(source) {
  const specifiers = [];
  for (const match of source.matchAll(importPattern)) {
    const preceding = source.slice(0, match.index + match[0].length - match[1].length - 2);
    if (typeOnly.test(preceding)) {
      // A type import is erased before emission: it creates no runtime edge and
      // no cycle. It still has to be declared, so it is recorded as a
      // dependency below - just not as a reason to fail on a runtime rule.
      specifiers.push({ specifier: match[1], typeOnly: true });
      continue;
    }
    specifiers.push({ specifier: match[1], typeOnly: false });
  }
  return specifiers;
}

/** `@pico/module-calendar/calendar` -> `{ package, subpath }`. */
function splitSpecifier(specifier) {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return {
      package: parts.slice(0, 2).join('/'),
      subpath: parts.length > 2 ? `./${parts.slice(2).join('/')}` : '.',
    };
  }
  return {
    package: parts[0],
    subpath: parts.length > 1 ? `./${parts.slice(1).join('/')}` : '.',
  };
}

const runtimePackageNames = new Set(
  readdirSync(join(repoRoot, 'apps'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = join(repoRoot, 'apps', entry.name, 'package.json');
      return existsSync(manifestPath)
        ? JSON.parse(readFileSync(manifestPath, 'utf8')).name
        : null;
    })
    .filter((name) => name !== null),
);

if (!existsSync(modulesRoot) || !statSync(modulesRoot).isDirectory()) {
  console.error(`Module check failed:\n- ${relative(repoRoot, modulesRoot)} does not exist.`);
  process.exit(1);
}

const directories = readdirSync(modulesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(modulesRoot, entry.name));

const modules = [];
for (const directory of directories) {
  const label = relative(repoRoot, directory);
  const packageManifestPath = join(directory, 'package.json');
  if (!existsSync(packageManifestPath)) {
    errors.push(`${label}: no package.json, so nothing here is a workspace package.`);
    continue;
  }
  const packageManifest = JSON.parse(readFileSync(packageManifestPath, 'utf8'));

  // The declaration is the module's own file, imported rather than re-parsed
  // from source, so what the check reads is what the product loads.
  const manifestModule = join(directory, 'dist', 'manifest.js');
  if (!existsSync(manifestModule)) {
    errors.push(
      `${label}: no built manifest at dist/manifest.js. The check reads the `
      + 'declaration the product loads, so this runs after build.',
    );
    continue;
  }
  const exported = Object.values(await import(manifestModule))
    .find((value) => typeof value === 'object' && value !== null && 'identifier' in value);
  if (exported === undefined) {
    errors.push(`${label}: dist/manifest.js exports no module manifest.`);
    continue;
  }

  let manifest;
  try {
    manifest = parsePicoModuleManifest(exported);
  } catch (error) {
    errors.push(`${label}: manifest refused by the protocol parser (${error.message}).`);
    continue;
  }

  if (manifest.packageName !== packageManifest.name) {
    errors.push(
      `${label}: manifest names ${manifest.packageName}, package.json names `
      + `${packageManifest.name}. A declaration about the wrong package is not a `
      + 'declaration.',
    );
  }

  const declaredExports = Object.keys(packageManifest.exports ?? {});
  const missing = manifest.publishedSubpaths
    .filter((subpath) => !declaredExports.includes(subpath));
  const unnamed = declaredExports
    .filter((subpath) => !manifest.publishedSubpaths.includes(subpath));
  if (missing.length > 0) {
    errors.push(`${label}: manifest publishes ${missing.join(', ')}, package.json does not export it.`);
  }
  if (unnamed.length > 0) {
    errors.push(
      `${label}: package.json exports ${unnamed.join(', ')} without the manifest `
      + 'publishing it. Everything not published is internal, and an unnamed '
      + 'export is a boundary another module can cross unnoticed.',
    );
  }

  modules.push({ label, directory, manifest, packageName: packageManifest.name });
}

const byPackageName = new Map(modules.map((module_) => [module_.packageName, module_]));
const shippedIdentifiers = new Set(modules.map((module_) => module_.manifest.identifier));
for (const identifier of picoModuleIdentifiers) {
  if (!shippedIdentifiers.has(identifier)) {
    errors.push(
      `The core lists ${identifier} as a module, but modules/ ships no package `
      + 'declaring it. The closed list is the product\'s statement about what '
      + 'exists; nothing may be listed that does not.',
    );
  }
}

for (const module_ of modules) {
  const reached = new Map();
  const seen = new Set();
  const queue = sourceFiles(module_.directory);
  const owned = new Set(queue);

  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    const fileLabel = relative(repoRoot, file);

    if (!file.endsWith('.test.ts')) {
      for (const mechanic of storageMechanics) {
        if (mechanic.pattern.test(source)) {
          errors.push(
            `${fileLabel}: contains ${mechanic.what}. ADR 0127: a module owns no `
            + 'storage - its data is memory items and events under core custody, '
            + 'and a mechanic it needs is lifted to a core capability (M5).',
          );
        }
      }
      for (const reach of worldReachingGlobals) {
        if (reach.pattern.test(source)) {
          errors.push(
            `${fileLabel}: contains ${reach.what}. ADR 0128 H3: a module declares `
            + 'what it can cause and the core decides whether to cause it, so a '
            + 'module never reaches the world itself - not even one that declared '
            + 'an effect. What it needs arrives as a port.',
          );
        }
      }
    }

    for (const { specifier, typeOnly: isTypeOnly } of valueImportsOf(source)) {
      if (specifier.startsWith('.')) {
        const base = resolve(dirname(file), specifier).replace(/\.js$/u, '');
        for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
          if (existsSync(candidate) && statSync(candidate).isFile()) {
            if (owned.has(candidate)) {
              queue.push(candidate);
            } else {
              // Reported and not followed. Walking on would inspect the other
              // package against this module's rules and bury the one real
              // finding under every consequence of it.
              errors.push(
                `${fileLabel}: relative import of ${specifier} leaves `
                + `${module_.label}. A module reaches other packages by name, not `
                + 'by path.',
              );
            }
            break;
          }
        }
        continue;
      }
      if (specifier.startsWith('node:')) {
        if (worldReachingImports.has(specifier) && !file.endsWith('.test.ts')) {
          errors.push(
            `${fileLabel}: imports ${specifier}, a direct route out of the `
            + 'process. ADR 0128 H3: a module declares what it can cause and the '
            + 'core decides whether to cause it. Reaching the world itself takes '
            + 'that decision and makes the manifest false, so this is refused '
            + 'whether or not an effect was declared - a declaration asks for a '
            + 'port, it does not permit going around one.',
          );
        }
        continue;
      }

      const target = splitSpecifier(specifier);
      if (runtimePackageNames.has(target.package)) {
        errors.push(
          `${fileLabel}: imports the runtime ${target.package}. ADR 0127: a `
          + 'runtime imports a module, never the other way round - the edge has '
          + 'to point one way or the two packages form a cycle. What a module '
          + 'needs from a runtime arrives as a declared port.',
        );
        continue;
      }

      const targetModule = byPackageName.get(target.package);
      if (targetModule === undefined) {
        continue;
      }
      if (!targetModule.manifest.publishedSubpaths.includes(target.subpath)) {
        errors.push(
          `${fileLabel}: imports ${specifier}, which ${targetModule.manifest.identifier} `
          + `does not publish (it publishes ${targetModule.manifest.publishedSubpaths.join(', ')}). `
          + 'A dependency targets a published contract, never another module\'s '
          + 'internals.',
        );
      }
      reached.set(targetModule.manifest.identifier, isTypeOnly ? reached.get(targetModule.manifest.identifier) ?? true : false);
    }
  }

  for (const identifier of reached.keys()) {
    if (identifier === module_.manifest.identifier) {
      continue;
    }
    if (!module_.manifest.dependencies.includes(identifier)) {
      errors.push(
        `${module_.label}: imports ${identifier} without declaring it. `
        + 'Dependencies are declared, never inferred - an undeclared edge makes '
        + 'the manifest fiction and the activation closure wrong.',
      );
    }
  }
  for (const declared of module_.manifest.dependencies) {
    if (!reached.has(declared)) {
      errors.push(
        `${module_.label}: declares a dependency on ${declared} and imports `
        + 'nothing from it. A declaration nobody uses widens the activation '
        + 'closure for no reason.',
      );
    }
  }
}

if (modules.length > 0) {
  try {
    orderPicoModuleManifests(modules.map((module_) => module_.manifest));
  } catch (error) {
    errors.push(
      `modules/: ${error.message}. ADR 0127 permits modules to depend on each `
      + 'other and prohibits only cycles, because a cycle makes the activation '
      + 'story and the set of configurations worth testing meaningless.',
    );
  }
}

/**
 * ADR 0128 H4. A connected-house integration lives in a module, not in a
 * runtime.
 *
 * The gate says no Supervisor client, entity read or service call lands in
 * `apps/core`, and prose is exactly what nobody re-reads. This looks for the
 * shapes such a client has: the Supervisor host a Home Assistant App talks
 * to, its token, and its state and service endpoints.
 *
 * It deliberately does not forbid the *words* "home assistant". ADR 0128 H5
 * leaves exactly one host adapter in the core that must name its host, and
 * banning the name would either break that or teach people to spell it
 * differently. What is forbidden is reaching the API.
 */
const connectorReach = [
  { pattern: /http:\/\/supervisor\b/u, what: 'the Home Assistant Supervisor host' },
  { pattern: /\bSUPERVISOR_TOKEN\b/u, what: 'the Supervisor token' },
  { pattern: /\/core\/api\/(?:states|services)\b/u, what: 'a Home Assistant entity or service endpoint' },
];

for (const file of sourceFiles(join(repoRoot, 'apps', 'core', 'src'))) {
  if (file.endsWith('.test.ts')) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  for (const reach of connectorReach) {
    if (reach.pattern.test(source)) {
      errors.push(
        `${relative(repoRoot, file)}: reaches ${reach.what}. ADR 0128 H4: the `
        + 'connected-house integration is a module and its transport is a '
        + 'capability - a runtime that talked to Home Assistant would put '
        + 'product logic back where ADR 0127 took it from.',
      );
    }
  }
}
if (errors.length > 0) {
  console.error('Module check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const effectBearing = modules.filter((module_) => picoModuleIsEffectBearing(module_.manifest));
console.log(
  `Module check passed: ${modules.length} of ${picoModuleIdentifiers.length} listed modules present, `
  + `${effectBearing.length} effect-bearing`
  + `${effectBearing.length === 0 ? '' : ` (${effectBearing.map((m) => m.manifest.identifier).join(', ')})`}.`,
);
