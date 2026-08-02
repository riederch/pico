import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const packageFiles = [
  'apps/companion/package.json',
  'apps/companion-shell/package.json',
  'apps/core/package.json',
  'apps/vault-daemon/package.json',
  'apps/web/package.json',
  'packages/appearance/package.json',
  'packages/identity/package.json',
  'packages/protocol/package.json',
  'packages/sync/package.json',
  'packages/vault/package.json',
];
const errors = [];
const rootPackage = readJson('package.json');
const currentVersion = rootPackage.version;
const protocolVersion = matchRequired(
  'packages/protocol/src/index.ts',
  /export const picoProtocolVersion = '([^']+)' as const;/,
  'protocol version',
);

if (!isSemver(currentVersion)) {
  errors.push(`package.json version must be a semantic version, got ${JSON.stringify(currentVersion)}.`);
}

for (const packageFile of packageFiles) {
  const packageJson = readJson(packageFile);
  assertVersion(packageJson.version, `${packageFile} version`);
}

assertVersion(matchRequired('pico_core/config.yaml', /^version:\s*"([^"]+)"/m, 'Home Assistant add-on version'), 'pico_core/config.yaml version');
assertVersion(matchRequired('apps/core/src/app.ts', /const SERVICE_VERSION = '([^']+)'/, 'service version'), 'apps/core/src/app.ts SERVICE_VERSION');
assertVersion(matchRequired('apps/vault-daemon/src/daemon.ts', /const DAEMON_VERSION = '([^']+)'/, 'vault daemon version'), 'apps/vault-daemon/src/daemon.ts DAEMON_VERSION');
// The protocol version is a separate axis and is deliberately NOT compared to
// the product version. A packaging or documentation release must not advertise
// a wire-contract change that did not happen; ADR 0025 forbids the opposite
// error, and the number only means something if both directions hold. It is
// owned by `packages/protocol`, validated for shape here, and every published
// compatibility claim is checked against it rather than against the release.
assertSemver(protocolVersion, 'packages/protocol/src/index.ts picoProtocolVersion');
assertVersion(currentVersionFence('README.md'), 'README.md current version');
assertVersion(currentVersionFence('ReadmeTech.md'), 'ReadmeTech.md current version');
assertVersion(matchRequired('ReadmeTech.md', /Current tag:\n\n```text\n([0-9]+\.[0-9]+\.[0-9]+)\n```/, 'Home Assistant add-on current tag'), 'ReadmeTech.md current add-on tag');
assertVersion(currentVersionFence('pico_core/README.md'), 'pico_core/README.md current version');
assertVersion(matchRequired('pico_core/CHANGELOG.md', /^## ([0-9]+\.[0-9]+\.[0-9]+)$/m, 'latest changelog heading'), 'pico_core/CHANGELOG.md latest heading');
assertVersion(matchRequired('pico_core/CHANGELOG.md', /ghcr\.io\/riederch\/pico\/core:([0-9]+\.[0-9]+\.[0-9]+)/, 'current add-on image tag'), 'pico_core/CHANGELOG.md current image tag');
assertAllVersions('docs/release/versioning.md', collectSemvers('docs/release/versioning.md'), 'docs/release/versioning.md version references');
assertProtocolVersion(matchRequired('docs/protocol/public-surfaces.md', /claims compatibility with protocol version `([0-9]+\.[0-9]+\.[0-9]+)`/, 'public protocol compatibility claim version'), 'docs/protocol/public-surfaces.md compatibility claim version');
assertProtocolVersion(matchRequired('docs/protocol/public-surfaces.md', /"protocolVersion": "([0-9]+\.[0-9]+\.[0-9]+)"/, 'public protocol claim example version'), 'docs/protocol/public-surfaces.md protocolVersion example');
assertProtocolVersion(matchRequired('docs/protocol/public-surfaces.md', /Compatible with Pico Home Link protocol version ([0-9]+\.[0-9]+\.[0-9]+)\./, 'public protocol wording example version'), 'docs/protocol/public-surfaces.md wording example');
assertProtocolVersion(matchRequired('docs/protocol/compatibility-levels.md', /Experimental L1 foundation event compatibility with Pico protocol ([0-9]+\.[0-9]+\.[0-9]+)\./, 'L1 compatibility example version'), 'docs/protocol/compatibility-levels.md L1 example');
assertProtocolVersion(matchRequired('docs/protocol/compatibility-levels.md', /L3 Pico Home Link compatibility for protocol ([0-9]+\.[0-9]+\.[0-9]+),/, 'L3 compatibility example version'), 'docs/protocol/compatibility-levels.md L3 example');
assertProtocolVersion(matchRequired('docs/architecture/0025-inter-pico-communication-compatibility.md', /"protocolVersion": "([0-9]+\.[0-9]+\.[0-9]+)"/, 'protocol compatibility example version'), 'docs/architecture/0025-inter-pico-communication-compatibility.md protocolVersion example');

if (errors.length > 0) {
  console.error('Version consistency check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Version consistency check passed for ${currentVersion}.`);

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function currentVersionFence(path) {
  return matchRequired(path, /Current version:\n\n```text\n([0-9]+\.[0-9]+\.[0-9]+)\n```/, 'current version block');
}

function matchRequired(path, pattern, label) {
  const match = pattern.exec(read(path));
  if (!match) {
    errors.push(`${path}: missing ${label}.`);
    return undefined;
  }
  return match[1];
}

function collectSemvers(path) {
  return Array.from(read(path).matchAll(/\b[0-9]+\.[0-9]+\.[0-9]+\b/g), (match) => match[0]);
}

function assertAllVersions(path, versions, label) {
  if (versions.length === 0) {
    errors.push(`${path}: missing ${label}.`);
    return;
  }

  for (const version of versions) {
    assertVersion(version, label);
  }
}

/** Compares a published wire-contract claim against the protocol version. */
function assertProtocolVersion(actual, label) {
  if (actual === undefined || protocolVersion === undefined) {
    return;
  }
  if (actual !== protocolVersion) {
    errors.push(`${label} must be ${protocolVersion}, got ${actual}.`);
  }
}

/** Validates shape only, for versions that intentionally move independently. */
function assertSemver(actual, label) {
  if (actual === undefined) {
    return;
  }
  if (!isSemver(actual)) {
    errors.push(`${label} must be a semantic version, got ${JSON.stringify(actual)}.`);
  }
}

function assertVersion(actual, label) {
  if (actual === undefined) {
    return;
  }
  if (!isSemver(actual)) {
    errors.push(`${label} must be a semantic version, got ${JSON.stringify(actual)}.`);
    return;
  }
  if (!isSemver(currentVersion)) {
    return;
  }
  if (actual !== currentVersion) {
    errors.push(`${label} must be ${currentVersion}, got ${actual}.`);
  }
}

function isSemver(value) {
  return typeof value === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(value);
}
