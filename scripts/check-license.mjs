import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const requiredFiles = [
  'LICENSE',
  'NOTICE',
  'COMMERCIAL.md',
  'LICENSE-FAQ.md',
  'TRADEMARK.md',
  'CONTRIBUTING.md',
];
/**
 * Every workspace member, discovered rather than listed.
 *
 * It was a list of ten until 2026-08-21, and the workspace had grown to
 * seventeen: `apps/relay` - which ships as a published container and a Home
 * Assistant add-on - four modules, and three packages including one written
 * the same week. All eight declared the right licence, so nothing was wrong;
 * what was wrong is that nothing would have said so. Changing one of them to
 * `MIT` passed this check, which is how the gap was found.
 *
 * The globs come from `pnpm-workspace.yaml`, the file the package manager
 * already reads, so a new member is covered the moment it is a member and a
 * stray `package.json` in a build directory never is. `bridges/` is
 * deliberately not a workspace member (ADR 0136 BR2), and `check-suppliers`
 * fails if it becomes one.
 */
function workspacePackageFiles() {
  const config = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const globs = [...config.matchAll(/^\s*-\s*["']?([^"'\s]+)["']?\s*$/gmu)]
    .map((match) => match[1])
    .filter((glob) => glob.endsWith('/*'));
  const files = ['package.json'];
  for (const glob of globs) {
    const parent = join(repoRoot, glob.slice(0, -2));
    let entries;
    try {
      entries = readdirSync(parent);
    } catch {
      errors.push(`pnpm-workspace.yaml lists ${glob}, which does not exist.`);
      continue;
    }
    for (const entry of entries) {
      const file = join(parent, entry, 'package.json');
      if (existsSync(file)) {
        files.push(relative(repoRoot, file));
      }
    }
  }
  return files.sort();
}
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'coverage', '.turbo']);
const ignoredFiles = new Set([
  'scripts/check-license.mjs',
  'package-lock.json',
  'pnpm-lock.yaml',
]);
const textExtensions = new Set(['.md', '.json', '.ts', '.tsx', '.js', '.mjs', '.yml', '.yaml', '.html', '.txt']);
const forbiddenPatterns = [
  {
    pattern: /"license"\s*:\s*"Apache-2\.0"/,
    message: 'Package metadata must not claim Apache-2.0.',
  },
  {
    pattern: /Apache License/i,
    message: 'Apache License text must not remain in project files.',
  },
  {
    pattern: /\bPico is (?:intended to be )?open[- ]source\b/i,
    message: 'Pico must not be described as open source; use source-available for private and non-commercial use.',
  },
];

const errors = [];

for (const file of requiredFiles) {
  try {
    statSync(join(repoRoot, file));
  } catch {
    errors.push(`Missing required governance file: ${file}`);
  }
}

const packageFiles = workspacePackageFiles();
if (packageFiles.length < 2) {
  // A discovery that finds nothing must not read as a licence that is right
  // everywhere, which is precisely how the list this replaced went stale.
  errors.push('No workspace package.json files were discovered; the check looked at nothing.');
}
for (const file of packageFiles) {
  const parsed = JSON.parse(readFileSync(join(repoRoot, file), 'utf8'));
  if (parsed.license !== 'SEE LICENSE IN LICENSE') {
    errors.push(`${file} must use "license": "SEE LICENSE IN LICENSE".`);
  }
}

for (const file of listTextFiles(repoRoot)) {
  const relativePath = relative(repoRoot, file);
  const content = readFileSync(file, 'utf8');

  for (const forbidden of forbiddenPatterns) {
    if (forbidden.pattern.test(content)) {
      errors.push(`${relativePath}: ${forbidden.message}`);
    }
  }
}

if (errors.length > 0) {
  console.error('License consistency check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `License consistency check passed (${packageFiles.length} workspace manifests,`
  + ` ${requiredFiles.length} governance files, ${forbiddenPatterns.length} refused phrasings).`,
);

function listTextFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }

    const path = join(directory, entry);
    const stat = statSync(path);
    const relativePath = relative(repoRoot, path);

    if (stat.isDirectory()) {
      files.push(...listTextFiles(path));
      continue;
    }

    if (stat.isFile() && isTextFile(path) && !ignoredFiles.has(relativePath)) {
      files.push(path);
    }
  }
  return files;
}

function isTextFile(path) {
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex === -1) {
    return false;
  }
  return textExtensions.has(path.slice(dotIndex));
}
