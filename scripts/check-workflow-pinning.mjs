import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0122 Y1: the commit determines the build.
 *
 * Every mutable reference in a build is a place where the bytes that run can
 * change without the repository changing. A tag says what someone called a
 * commit; it does not say which commit, and it can be moved. The same holds
 * for a base image tag and for a package manager pinned by version alone.
 *
 * This check exists because pinning is the kind of thing that is done once and
 * quietly undone by the next person adding a step, and the cost of noticing
 * late is a build nobody can reproduce.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

// --- Workflows: every action pinned to a full commit SHA --------------------

const workflowDir = join(repoRoot, '.github', 'workflows');
for (const entry of readdirSync(workflowDir)) {
  if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) {
    continue;
  }
  const path = join(workflowDir, entry);
  const content = readFileSync(path, 'utf8');
  for (const match of content.matchAll(/uses:\s*([^\s#]+)/gu)) {
    const reference = match[1];
    // A local or reusable-workflow path has no registry to move under it.
    if (reference.startsWith('./') || reference.startsWith('docker://')) {
      continue;
    }
    const at = reference.lastIndexOf('@');
    const version = at < 0 ? '' : reference.slice(at + 1);
    if (!/^[0-9a-f]{40}$/u.test(version)) {
      errors.push(
        `${relative(repoRoot, path)}: ${reference} is not pinned to a commit SHA. `
        + 'A tag can be moved; keep the version as a trailing comment.',
      );
    }
  }
}

// --- Base images: pinned by digest ------------------------------------------

const dockerDir = join(repoRoot, 'docker');
for (const entry of readdirSync(dockerDir)) {
  if (!entry.endsWith('.Dockerfile') && entry !== 'Dockerfile') {
    continue;
  }
  const path = join(dockerDir, entry);
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^FROM\s+(\S+)/u.exec(line.trim());
    if (match === null) {
      continue;
    }
    const image = match[1];
    // A stage referring to an earlier stage in the same file carries no
    // registry reference to pin.
    if (!image.includes('/') && !image.includes(':')) {
      continue;
    }
    if (!image.includes('@sha256:')) {
      errors.push(
        `${relative(repoRoot, path)}: base image ${image} is not pinned by digest.`,
      );
    }
  }
}

// --- Package manager: pinned with an integrity hash -------------------------

const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const packageManager = packageJson.packageManager;
if (typeof packageManager !== 'string' || !/\+sha(?:224|256|384|512)\.[0-9a-f]+$/u.test(packageManager)) {
  errors.push(
    'package.json: packageManager must carry an integrity hash, '
    + 'so corepack verifies what it downloaded rather than trusting the version alone.',
  );
}

// --- The install-script exception stays recorded ----------------------------

const ciWorkflow = readFileSync(join(workflowDir, 'ci.yml'), 'utf8');
if (!/install scripts?/iu.test(ciWorkflow)) {
  // ADR 0122 Y1 keeps install scripts enabled because native modules need
  // them, and requires the exception to be written down where it applies
  // rather than remembered.
  errors.push(
    '.github/workflows/ci.yml: the enabled-install-scripts exception is not recorded.',
  );
}

if (errors.length > 0) {
  console.error('Workflow pinning check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Workflow pinning check passed.');
