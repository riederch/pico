import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0113: the companion service core is shell-free, and the boundary is
 * checked, not aspired to. A later Electron shell layer lives outside
 * `apps/companion/src` (or in an explicitly allowlisted `src/shell/`
 * directory once C2 lands); until then no shell dependency and no shell
 * import may appear in the service core at all.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const companionRoot = join(repoRoot, 'apps', 'companion');
const shellModulePattern = /^(electron|@electron\/|electron-)/;
const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

const errors = [];

const packageJson = JSON.parse(readFileSync(join(companionRoot, 'package.json'), 'utf8'));
for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const name of Object.keys(packageJson[section] ?? {})) {
    if (shellModulePattern.test(name)) {
      errors.push(`apps/companion/package.json ${section} must not contain the shell dependency ${name}.`);
    }
  }
}

for (const file of listSourceFiles(join(companionRoot, 'src'))) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(importPattern)) {
    if (shellModulePattern.test(match[1])) {
      errors.push(`${relative(repoRoot, file)}: service core must not import shell module ${match[1]}.`);
    }
  }
}

if (errors.length > 0) {
  console.error('Companion shell-boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Companion shell-boundary check passed.');

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.mjs')) {
      files.push(path);
    }
  }
  return files;
}
