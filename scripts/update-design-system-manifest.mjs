import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const designRoot = join(repoRoot, 'docs/design-system');
const manifestPath = join(designRoot, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

manifest.files = listFiles(designRoot)
  .map((path) => ({ path, relativePath: relative(designRoot, path) }))
  .filter(({ relativePath }) => relativePath !== 'manifest.json')
  .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  .map(({ path, relativePath }) => {
    const content = readFileSync(path);
    return {
      path: relativePath,
      bytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  });

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated design system manifest with ${manifest.files.length} files.`);

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
