import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A test that starts a neighbouring package names something this repository
 * has, and the coupling is written down somewhere.
 *
 * **The occasion** (2026-09-20, finding B234). Asked whether the vault daemon
 * had ever met a real Home, I grepped for `buildApp` and for `@pico/core`,
 * found nothing, and wrote B233 around it. Both greps were true and both were
 * the wrong question: this house runs a neighbour by **spawning its built
 * entry point by path**, so neither an import nor a package name appears.
 * `apps/vault-daemon/src/claim-ceremony.test.ts` is 2,459 lines of exactly
 * that, and it has been driving a real Home all along.
 *
 * Measured properly: **six couplings over a path**, in three packages. Four
 * are backed by a declared workspace dependency. Two are not -
 * `apps/companion-shell` starts the relay's `main.js` without naming
 * `@pico/relay`, and `apps/web` starts the core's `index.js` without naming
 * `@pico/core`. Nothing says those pairs are related, and a renamed entry
 * point would surface as "cannot find module" in a package whose manifest
 * never mentioned the other.
 *
 * **What is checked.** Every spawned path resolves to a source this repository
 * has - the same rule `check-addon-config.mjs` applies to a container's `CMD`,
 * moved to where tests do the same thing. And every coupling is either
 * declared or argued here, with the argument verified against the chain rather
 * than believed: it rests on `build` standing before `test` in
 * `release:verify`, which is read out of `package.json`.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '');

/** Every workspace package, by directory and by name. */
const packages = new Map();
for (const path of tracked) {
  if (!/^(apps|packages|modules)\/[^/]+\/package\.json$/u.test(path)) continue;
  const directory = path.replace(/\/package\.json$/u, '');
  packages.set(directory, JSON.parse(readFileSync(join(repoRoot, path), 'utf8')));
}

/**
 * A coupling that is deliberately not a declared dependency, and why.
 *
 * `requires` is read out of `package.json`: the argument is that the chain
 * builds everything before it tests anything, so it is checked there rather
 * than asserted here.
 */
const argued = [
  {
    from: 'apps/companion-shell',
    source: 'apps/relay/src/main.ts',
    why: 'the shell spawns a relay only to watch a companion reach one. Declaring @pico/relay '
      + 'would add a dependency nothing imports - the shell has one of those already - and the '
      + 'guarantee that the relay is built comes from the chain, not from the manifest',
  },
  {
    from: 'apps/web',
    source: 'apps/core/src/index.ts',
    why: 'the dashboard\'s process test starts a Home to be a dashboard of something. The same '
      + 'reasoning: a declared dependency here would be decoration, and the build that makes '
      + '`core/dist` exist runs before any test does',
  },
];

/** The argument's subject: the chain builds before it tests. */
const chain = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts;
const gates = chain['verify:gates'] ?? '';
const passes = chain['verify:passes'] ?? '';
const release = chain['release:verify'] ?? '';
const buildsBeforeTests = gates.includes('pnpm build')
  && release.indexOf('verify:gates') < release.indexOf('verify:passes')
  && passes.trimStart().startsWith('pnpm test');

const sources = tracked.filter((path) => /^(apps|packages|modules)\/.*\.(ts|mjs)$/u.test(path));
const couplings = new Map();
for (const path of sources) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  if (!text.includes("'dist'")) continue;
  const from = path.split('/').slice(0, 2).join('/');
  for (const match of text.matchAll(
    /join\(import\.meta\.dirname,\s*'\.\.',\s*'\.\.',\s*'([^']+)',\s*'dist',\s*'([^']+)'/gu,
  )) {
    const target = `${from.split('/')[0]}/${match[1]}`;
    const source = `${target}/src/${match[2].replace(/\.js$/u, '.ts')}`;
    couplings.set(`${from}\n${source}`, { from, target, source, entry: match[2], at: path });
  }
}

if (couplings.size === 0) {
  errors.push(
    'no test starts a neighbouring package by path, which is how this house runs one for real. '
    + 'Either it stopped or this reader stopped finding it, and a check with no subject passes '
    + 'by having nothing to say.',
  );
}

let declared = 0;
const excused = [];
const used = new Set();
for (const coupling of couplings.values()) {
  if (!existsSync(join(repoRoot, coupling.source))) {
    errors.push(
      `${coupling.at} spawns ${coupling.target}/dist/${coupling.entry} and ${coupling.source} `
      + 'does not exist. A stale dist keeps a removed entry working locally; a clean checkout '
      + 'does not.',
    );
    continue;
  }
  const mine = packages.get(coupling.from);
  const theirs = packages.get(coupling.target);
  const names = mine === undefined
    ? []
    : [...Object.keys(mine.dependencies ?? {}), ...Object.keys(mine.devDependencies ?? {})];
  if (theirs !== undefined && names.includes(theirs.name)) {
    declared += 1;
    continue;
  }
  const entry = argued.find((one) => one.from === coupling.from && one.source === coupling.source);
  if (entry === undefined) {
    errors.push(
      `${coupling.at} starts ${coupling.target} and ${coupling.from}'s manifest never mentions `
      + 'it. Declare the dependency or argue the coupling, so the next person renaming an entry '
      + 'point can see who else it belongs to.',
    );
    continue;
  }
  used.add(`${entry.from}\n${entry.source}`);
  if (!buildsBeforeTests) {
    errors.push(
      `${coupling.from} is argued because the chain builds before it tests, and package.json no `
      + 'longer says so. The argument rested on that order.',
    );
    continue;
  }
  excused.push(`${coupling.at} -> ${coupling.source}: ${entry.why}`);
}
for (const entry of argued) {
  if (!used.has(`${entry.from}\n${entry.source}`)) {
    errors.push(`${entry.from} is argued for ${entry.source} and starts no such neighbour any more`);
  }
}

if (errors.length > 0) {
  console.error('Spawned neighbour check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Spawned neighbour check passed (${couplings.size} couplings where a test starts another `
  + `package's built entry point; every path resolves to a source this repository has; `
  + `${declared} are declared workspace dependencies and ${excused.length} are argued against the `
  + 'chain building before it tests).',
);
for (const line of excused) console.log(`  argued: ${line}`);
