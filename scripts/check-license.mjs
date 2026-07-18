import { readFileSync, readdirSync, statSync } from 'node:fs';
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
const packageFiles = [
  'package.json',
  'apps/core/package.json',
  'apps/web/package.json',
  'packages/protocol/package.json',
  'packages/sync/package.json',
  'packages/vault/package.json',
];
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

console.log('License consistency check passed.');

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
