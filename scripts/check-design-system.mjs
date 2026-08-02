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
const legacyRegistry = readJson(
  'docs/design-system/07_Governance/legacy-character-assets.json',
);
const tokens = readJson(
  'docs/design-system/01_Foundations/tokens/pico.tokens.json',
);
const version = read('docs/design-system/VERSION.txt');
const source = read('docs/design-system/SOURCE.md');

const expectedVersion = '1.1.0';
const characterStandard = 'PICO Character Design v3.2.1';
const sourceArchive = 'PICO_Product_Design_System_v1.0.zip';
const sourceArchiveSha =
  '6229e3374856960790f384bf99fbcc7282ea2de29bfc8a38896534ec679e4146';
const imagePattern = /\.(?:png|jpe?g|webp|gif|svg|ico|avif)$/iu;
// Build output and dependency trees are not shipped repository content; they
// are reproduced from the sources this check already pins.
const ignoredDirectories = new Set([
  'node_modules',
  'dist',
  'out',
  'coverage',
  'data',
]);

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

assertEqual(registry.schema, 'pico.character.assets.v2', 'character asset registry schema');
assertEqual(
  legacyRegistry.schema,
  'pico.character.legacy-assets.v1',
  'legacy asset registry schema',
);

// A production asset lives outside the design system package, so entries now
// carry the base their path is resolved against instead of assuming one.
const approvedAssets = Array.isArray(registry.assets) ? registry.assets : [];
const referenceHashes = new Map();
const registeredOutsideDesignSystem = new Set();
const registeredInsideDesignSystem = new Set();

for (const asset of approvedAssets) {
  const assetPath = asset.path ?? '';
  const base = asset.pathBase;
  if (base !== 'design-system' && base !== 'repository-root') {
    errors.push(`Character asset lacks a valid pathBase: ${assetPath}.`);
    continue;
  }
  if (base === 'design-system') {
    registeredInsideDesignSystem.add(assetPath);
  } else {
    registeredOutsideDesignSystem.add(assetPath);
  }
  const path = base === 'design-system'
    ? join(designRoot, assetPath)
    : join(repoRoot, assetPath);
  if (!isFile(path)) {
    errors.push(`Character asset registry path is missing: ${assetPath}.`);
    continue;
  }
  const actual = sha256(readFileSync(path));
  if (actual !== asset.sha256) {
    errors.push(`Character asset changed without registry approval: ${assetPath}.`);
  }
  if (!Array.isArray(asset.productionUses)) {
    errors.push(`Character asset lacks a productionUses array: ${assetPath}.`);
  }
  if (asset.class !== 'production_asset') {
    referenceHashes.set(assetPath, asset.sha256);
  }
}

// Step 1 of the Character approval process: a production asset's derivation is
// traced back to a registered reference. That stays checkable only while the
// reference it names still has the bytes it was derived from.
for (const asset of approvedAssets) {
  if (asset.class !== 'production_asset') {
    continue;
  }
  const derived = asset.derivedFrom;
  if (!derived || typeof derived.path !== 'string') {
    errors.push(
      `Production asset does not name its derivation source: ${asset.path}.`,
    );
    continue;
  }
  const expected = referenceHashes.get(derived.path);
  if (expected === undefined) {
    errors.push(
      `Production asset ${asset.path} derives from ${derived.path}, which is no `
      + 'registered character reference.',
    );
  } else if (expected !== derived.sha256) {
    errors.push(
      `Production asset ${asset.path} records a derivation hash that no longer `
      + `matches its source ${derived.path}.`,
    );
  }
  for (const field of ['surface', 'state', 'size']) {
    if (typeof asset[field] !== 'string') {
      errors.push(`Production asset must name its ${field}: ${asset.path}.`);
    }
  }
  if (typeof derived.method !== 'string') {
    errors.push(`Production asset must describe its derivation: ${asset.path}.`);
  }
}

// The Character Standard governs what may be shipped, but the registry above
// only reaches the three reference images inside the design system. Everything
// PICO actually ships its face on lives outside it, so a redrawn add-on icon
// used to pass unnoticed. Every shipped image must now be registered, and its
// bytes must match, whether it is approved or a pinned legacy holdover.
assertEqual(
  legacyRegistry.characterStandard,
  characterStandard,
  'legacy asset registry character standard',
);
assertEqual(
  legacyRegistry.pathBase,
  'repository-root',
  'legacy asset registry path base',
);

const legacyAssets = Array.isArray(legacyRegistry.assets)
  ? legacyRegistry.assets
  : [];
for (const asset of legacyAssets) {
  const assetPath = asset.path ?? '';
  if (registeredOutsideDesignSystem.has(assetPath)) {
    errors.push(
      `Asset is registered as both approved and legacy: ${assetPath}.`,
    );
    continue;
  }
  registeredOutsideDesignSystem.add(assetPath);
  if (!isFile(join(repoRoot, assetPath))) {
    errors.push(`Legacy asset registry path is missing: ${assetPath}.`);
    continue;
  }
  if (sha256(readFileSync(join(repoRoot, assetPath))) !== asset.sha256) {
    errors.push(
      `Legacy character asset changed without a registry decision: ${assetPath}. `
      + 'A replacement is a Character migration, not a file swap.',
    );
  }
  if (asset.class !== 'legacy_asset') {
    errors.push(`Legacy asset must carry class "legacy_asset": ${assetPath}.`);
  }
  if (typeof asset.currentUse !== 'string' || typeof asset.openMigration !== 'string') {
    errors.push(
      `Legacy asset must name its current use and open migration: ${assetPath}.`,
    );
  }
  if (assetPath.startsWith('docs/design-system/')) {
    errors.push(
      `Legacy asset belongs outside the design system package: ${assetPath}.`,
    );
  }
}

// A shipped image that no registry names is exactly the case the Character
// Standard forbids: new PICO geometry arriving through product work.
const shippedImages = listFiles(repoRoot, isIgnoredDirectory)
  .map((path) => relative(repoRoot, path))
  .filter((path) => imagePattern.test(path))
  .filter((path) => !path.startsWith('docs/design-system/'))
  .sort((left, right) => left.localeCompare(right));
for (const path of shippedImages) {
  if (!registeredOutsideDesignSystem.has(path)) {
    errors.push(
      `Shipped image is in no character asset registry: ${path}. Register it as `
      + 'an approved production asset or as a pinned legacy asset first.',
    );
  }
}

// Inside the package, the manifest pins every byte, but only this directory is
// the Character Standard's home for character references. Anything new landing
// there needs a role and a production decision, not just a manifest hash.
const characterAssetDirectory = '08_Starter_Kit/assets';
for (const path of listFiles(join(designRoot, characterAssetDirectory))) {
  const designRelative = relative(designRoot, path);
  if (imagePattern.test(designRelative) && !registeredInsideDesignSystem.has(designRelative)) {
    errors.push(
      `Character asset directory holds an unregistered image: ${designRelative}.`,
    );
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

// Every surface that renders PICO colors reads them from the generated
// outputs. A copied literal drifts silently, so the gate rejects one wherever
// a stylesheet or a window option could hold it.
const literalFreeStylesheets = [
  'apps/web/styles.css',
  'apps/companion-shell/src/renderer/styles.css',
];
for (const path of literalFreeStylesheets) {
  if (/#[0-9a-f]{3,8}\b/iu.test(stripGeneratedTokens(read(path)))) {
    errors.push(`${path} contains a copied color literal outside the generated token block.`);
  }
}
const literalFreeMarkupAndCode = [
  ['apps/web/index.html', 'styles belong in styles.css'],
  ['apps/companion-shell/src/renderer/index.html', 'styles belong in styles.css'],
  ['apps/companion-shell/src/window-options.ts', 'read the generated PICO design tokens instead'],
];
for (const [path, remedy] of literalFreeMarkupAndCode) {
  if (/#[0-9a-f]{3,8}\b/iu.test(read(path))) {
    errors.push(`${path} contains a copied color literal; ${remedy}.`);
  }
}
if (!read('apps/companion-shell/src/window-options.ts').includes("from './pico-design-tokens.generated.js'")) {
  errors.push('apps/companion-shell/src/window-options.ts does not import generated PICO design tokens.');
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

function stripGeneratedTokens(html) {
  return html.replace(
    /\/\* pico-design-tokens:start \*\/[\s\S]*?\/\* pico-design-tokens:end \*\//u,
    '',
  );
}

function listFiles(directory, skipDirectory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skipDirectory?.(entry.name)) {
        continue;
      }
      files.push(...listFiles(path, skipDirectory));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function isIgnoredDirectory(name) {
  return name.startsWith('.') || ignoredDirectories.has(name);
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
