import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const designRoot = join(repoRoot, 'docs/design-system');
const errors = [];
const manifest = readJson('docs/design-system/manifest.json');
const registry = readJson(
  'docs/design-system/07_Governance/approved-character-assets.json',
);
const tokens = readJson(
  'docs/design-system/01_Foundations/tokens/pico.tokens.json',
);
const version = read('docs/design-system/VERSION.txt');
const source = read('docs/design-system/SOURCE.md');

const expectedVersion = '1.0.1';
const characterStandard = 'PICO Character Design v3.2.1';
const sourceArchive = 'PICO_Product_Design_System_v1.0.zip';
const sourceArchiveSha =
  '6229e3374856960790f384bf99fbcc7282ea2de29bfc8a38896534ec679e4146';

assertEqual(manifest.name, 'PICO Product Design System', 'manifest name');
assertEqual(manifest.version, expectedVersion, 'manifest version');
assertEqual(
  manifest.characterDependency,
  characterStandard,
  'manifest character dependency',
);
assertEqual(manifest.sourceArchive?.name, sourceArchive, 'manifest source archive');
assertEqual(
  manifest.sourceArchive?.sha256,
  sourceArchiveSha,
  'manifest source archive hash',
);

if (!version.includes(`PICO Product Design System v${expectedVersion}`)) {
  errors.push('docs/design-system/VERSION.txt has the wrong product-system version.');
}
if (!version.includes(`Character dependency: ${characterStandard}`)) {
  errors.push('docs/design-system/VERSION.txt has the wrong character dependency.');
}

const tokenMetadata = tokens.$extensions?.['org.pico.design-system'];
assertEqual(tokenMetadata?.version, expectedVersion, 'token metadata version');
assertEqual(
  tokenMetadata?.characterStandard,
  characterStandard,
  'token character dependency',
);

assertEqual(registry.characterStandard, characterStandard, 'asset registry character standard');
assertEqual(registry.sourceArchive?.name, sourceArchive, 'asset registry source archive');
assertEqual(
  registry.sourceArchive?.sha256,
  sourceArchiveSha,
  'asset registry source archive hash',
);
if (!source.includes(sourceArchive) || !source.includes(sourceArchiveSha)) {
  errors.push('docs/design-system/SOURCE.md does not pin the source archive and hash.');
}

for (const asset of registry.assets ?? []) {
  const path = join(designRoot, asset.path ?? '');
  if (!isFile(path)) {
    errors.push(`Character asset registry path is missing: ${asset.path}.`);
    continue;
  }
  const actual = sha256(readFileSync(path));
  if (actual !== asset.sha256) {
    errors.push(`Character asset changed without registry approval: ${asset.path}.`);
  }
  if (!Array.isArray(asset.productionUses)) {
    errors.push(`Character asset lacks a productionUses array: ${asset.path}.`);
  }
}

const actualFiles = listFiles(designRoot)
  .map((path) => relative(designRoot, path))
  .filter((path) => path !== 'manifest.json')
  .sort((left, right) => left.localeCompare(right));
const manifestFiles = Array.isArray(manifest.files) ? manifest.files : [];
const manifestPaths = manifestFiles.map((entry) => entry.path);

if (JSON.stringify(manifestPaths) !== JSON.stringify(actualFiles)) {
  errors.push(
    'docs/design-system/manifest.json file list is stale; run '
    + '`pnpm design-system:manifest`.',
  );
}

for (const entry of manifestFiles) {
  const path = join(designRoot, entry.path ?? '');
  if (!isFile(path)) {
    continue;
  }
  const content = readFileSync(path);
  if (content.length !== entry.bytes || sha256(content) !== entry.sha256) {
    errors.push(
      `docs/design-system/manifest.json hash is stale for ${entry.path}; `
      + 'run `pnpm design-system:manifest`.',
    );
  }
}

const starterImport = read(
  'docs/design-system/08_Starter_Kit/styles/pico-tokens.css',
);
if (
  !starterImport.includes(
    '@import "../../01_Foundations/tokens/pico.tokens.css";',
  )
) {
  errors.push('Starter Kit must import the canonical generated CSS tokens.');
}

const dashboard = stripGeneratedDashboardTokens(read('apps/web/index.html'));
if (/#[0-9a-f]{3,8}\b/iu.test(dashboard)) {
  errors.push('apps/web/index.html contains a copied color literal outside the generated token block.');
}
const recoveryPdf = read('apps/vault-daemon/src/recovery-card-pdf.ts');
if (/rgb\(\s*(?:[0-9]|\.)/u.test(recoveryPdf)) {
  errors.push('Recovery Card PDF contains a copied numeric RGB literal.');
}
if (!recoveryPdf.includes("from './pico-design-tokens.generated.js'")) {
  errors.push('Recovery Card PDF does not import generated PICO design tokens.');
}

if (errors.length > 0) {
  console.error('Design system consistency check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Design system consistency check passed for ${expectedVersion} / Character 3.2.1.`,
);

function stripGeneratedDashboardTokens(html) {
  return html.replace(
    /\/\* pico-design-tokens:start \*\/[\s\S]*?\/\* pico-design-tokens:end \*\//u,
    '',
  );
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    errors.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}
