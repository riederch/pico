import { execFileSync } from 'node:child_process';
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

// ADR 0135 D4. VERSION.txt is the authority, and every other place inside the
// design system that states the *current* version has to agree with it. Before
// this check, `00_START_HERE/README.md` and the v1.0 document still announced
// 1.0.1 while VERSION.txt and the manifest said 1.1.0, and nothing noticed.
//
// Two kinds of version statement are deliberately out of scope, because
// forcing them to match would make them false:
//
// - `SOURCE.md` records the imported upstream archive (1.0.0) and the patch
//   state that first corrected it (1.0.1). That is provenance, already pinned
//   by the archive name and hash above, and bumping it would rewrite history.
// - The v1.0 document's title is its identity - it *is* the v1.0 document -
//   and the same holds for its filename.
//
// ADRs are also excluded: they are records, and a version named in one states
// what it was written against (ADR 0128). A stale pointer there is answered
// with a status note, not an edit.
const currentVersionStatements = [
  [
    'docs/design-system/00_START_HERE/README.md',
    `Repository-Patchstand: **${expectedVersion}**.`,
  ],
  [
    'docs/design-system/01_Foundations/PICO_Product_Design_System_v1.0.md',
    `**PICO Product Design System v${expectedVersion}**`,
  ],
];
for (const [path, expected] of currentVersionStatements) {
  if (!read(path).includes(expected)) {
    errors.push(`${path} does not state the current version ${expectedVersion}.`);
  }
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
/**
 * The Android app (2026-10-01). It was the one surface outside this gate, and
 * it showed: its screens were drawn in GitHub's dark palette, written into
 * the Java by hand (`#0d1117`, `#e6edf3`, `#7ee787` ...), with the platform's
 * grey below the last line. The list above is by hand and the app was not on
 * it, so this half reads every tracked file under the app's sources and
 * resources instead - a new screen is covered the day it is written. The two
 * generated colour files are the one place a value may stand.
 */
const androidGenerated = new Set([
  'apps/android/res/values/pico_colors.xml',
  'apps/android/res/values-notnight/pico_colors.xml',
]);
const androidFiles = execFileSync('git', ['ls-files', 'apps/android/src', 'apps/android/res'], {
  cwd: repoRoot, encoding: 'utf8',
}).split('\n').filter((path) => path !== '' && !androidGenerated.has(path));
if (androidFiles.length === 0) {
  errors.push('no tracked file under apps/android/src or apps/android/res - the Android half of this gate reads nothing.');
}
for (const path of androidFiles) {
  const text = read(path);
  if (/#[0-9a-f]{3,8}\b/iu.test(text)) {
    errors.push(`${path} contains a copied color literal; read @color/pico_* or R.color.pico_* instead.`);
  }
  if (/\bparseColor\s*\(|\bColor\.(?:BLACK|WHITE|GRAY|DKGRAY|LTGRAY|RED|GREEN|BLUE|YELLOW|CYAN|MAGENTA)\b/u.test(text)) {
    errors.push(`${path} names a colour of its own; read R.color.pico_* instead.`);
  }
}

if (!read('apps/companion-shell/src/window-options.ts').includes("from './pico-design-tokens.generated.js'")) {
  errors.push('apps/companion-shell/src/window-options.ts does not import generated PICO design tokens.');
}
/**
 * ADR 0132 G2. The card's colours come from the generated tokens, and after
 * the content/design split that is a statement about two files rather than
 * one: `recovery-card-design.ts` holds the palette and imports the tokens,
 * `recovery-card-pdf.ts` draws from the design and holds no colour of its own.
 *
 * Checked as a pair rather than relaxed to "somewhere in the daemon". The
 * original check pointed at the PDF module because that is where the palette
 * used to live; following the split keeps the same claim, and covering both
 * files makes it slightly stronger than it was - neither may carry a literal.
 */
const recoveryCardColourFiles = [
  ['apps/vault-daemon/src/recovery-card-design.ts', 'Recovery Card design'],
  ['apps/vault-daemon/src/recovery-card-pdf.ts', 'Recovery Card PDF'],
];
for (const [path, label] of recoveryCardColourFiles) {
  const source = read(path);
  if (/rgb\(\s*(?:[0-9]|\.)/u.test(source)) {
    errors.push(`${label} contains a copied numeric RGB literal.`);
  }
  if (/#[0-9a-f]{3,8}\b/iu.test(source)) {
    errors.push(`${label} contains a copied color literal; read the generated PICO design tokens instead.`);
  }
}
if (!read('apps/vault-daemon/src/recovery-card-design.ts')
  .includes("from './pico-design-tokens.generated.js'")) {
  errors.push('Recovery Card design does not import generated PICO design tokens.');
}
if (!read('apps/vault-daemon/src/recovery-card-pdf.ts')
  .includes("from './recovery-card-design.js'")) {
  errors.push('Recovery Card PDF does not draw from the Recovery Card design.');
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
