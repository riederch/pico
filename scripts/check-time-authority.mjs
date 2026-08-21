import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0120 N4: time authority never comes from the network, and the boundary
 * is checked rather than aspired to.
 *
 * A Pico that could not decide whether a veto period had passed because NTP
 * was unreachable would be exactly the availability dependency an attacker
 * wants, and ADR 0118 guarantees the offline floor works with no network at
 * all. Network time may be displayed or compared; it may never authorize.
 *
 * The check is deliberately blunt: no correctness-path source may name a time
 * service or an SNTP/NTP client at all. Something that merely informs belongs
 * outside these directories, where this check does not look.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Everything that decides whether a window has passed. */
const correctnessRoots = [
  join(repoRoot, 'apps', 'core', 'src'),
  join(repoRoot, 'apps', 'vault-daemon', 'src'),
  join(repoRoot, 'apps', 'companion', 'src'),
  join(repoRoot, 'packages', 'protocol', 'src'),
  join(repoRoot, 'packages', 'identity', 'src'),
  join(repoRoot, 'packages', 'vault', 'src'),
];

const networkTimeModulePattern =
  /^(ntp|sntp|ntp-client|ntp-time-sync|@destinationstransfers\/ntp|node-ntp|s-ntp|ntpsync|network-time-protocol)/;
const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/**
 * Well-known public time endpoints. A correctness path that reaches one of
 * these is asking the network what time it is, whatever the surrounding code
 * calls itself.
 */
const timeServicePattern =
  /\b(?:pool\.ntp\.org|time\.(?:google|apple|windows|cloudflare|nist)\.com|time\.nist\.gov|worldtimeapi\.org|timeapi\.io)\b/i;

const errors = [];

let scanned = 0;
for (const root of correctnessRoots) {
  for (const file of listSourceFiles(root)) {
    scanned += 1;
    const content = readFileSync(file, 'utf8');
    const where = relative(repoRoot, file);
    for (const match of content.matchAll(importPattern)) {
      if (networkTimeModulePattern.test(match[1])) {
        errors.push(`${where}: correctness paths must not import the network-time module ${match[1]}.`);
      }
    }
    const service = timeServicePattern.exec(content);
    if (service !== null) {
      errors.push(`${where}: correctness paths must not reach the time service ${service[0]}.`);
    }
  }
}

/**
 * The manifests of the same roots, derived rather than listed.
 *
 * It was a list of five beside six scanned roots until 2026-08-21, so
 * `@pico/identity` and `@pico/vault` had their source read and their
 * dependencies not: a network-time package added to either would have been
 * installed into a correctness path with nothing saying so. Two lists of the
 * same thing, and the shorter one was the one nobody re-read.
 */
const correctnessManifests = [
  join(repoRoot, 'package.json'),
  ...correctnessRoots.map((root) => join(dirname(root), 'package.json')),
];

for (const manifest of correctnessManifests) {
  const packageJson = JSON.parse(readFileSync(manifest, 'utf8'));
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const name of Object.keys(packageJson[section] ?? {})) {
      if (networkTimeModulePattern.test(name)) {
        errors.push(`${relative(repoRoot, manifest)} ${section} must not contain the network-time dependency ${name}.`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`${error}\n`);
  }
  process.exit(1);
}

process.stdout.write(
  `Time-authority check passed (${scanned} correctness sources across `
  + `${correctnessRoots.length} roots, ${correctnessManifests.length} manifests, `
  + 'none reaching the network for the time).\n',
);

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (/\.(?:ts|cts|mts|js|mjs|cjs)$/.test(entry) && !/\.test\./.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
