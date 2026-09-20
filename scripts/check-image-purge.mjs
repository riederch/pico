import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { picoDockerfiles } from './workspace-members.mjs';

/**
 * A published image drops its build tools, and the grip that drops them is a
 * shape rather than a list.
 *
 * **The occasion** (2026-09-20, finding B226). Both Dockerfiles build the whole
 * workspace, then reinstall production dependencies only before the runtime
 * stage copies `/app`, because "the TypeScript compiler, vitest and tsx are
 * build tools and must not ship in a published image". Six lines above that,
 * the same file warns about hand-written lists of workspace packages - *"that
 * list silently drifts whenever a workspace package is added, which is exactly
 * how packages/identity and packages/vault once went missing from the image"*.
 *
 * And then it wrote one: the purge named `apps` and `packages` by hand and
 * stopped there. `pnpm-workspace.yaml` declares **three** roots, and the third
 * one, `modules`, was not swept - so four package module directories survived
 * the purge and travelled into the image. Nothing leaked: those four have no
 * dev dependencies today, so it was 32 KB of workspace links. That is the
 * whole point - the rule held because nobody had added one yet.
 *
 * **What is checked.** Every root `pnpm-workspace.yaml` declares must be swept
 * by every Dockerfile that builds a published image, the sweep must be
 * followed by a production-only install, and both must stand before the
 * runtime stage copies. A wildcard that covers a root counts as covering it -
 * the point is the shape, not a spelling.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/** The roots the workspace declares, as `<name>/*` patterns. */
const workspace = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
const roots = [...workspace.matchAll(/^\s*-\s*"([^"]+)"\s*$/gmu)].map(([, pattern]) => pattern);
if (roots.length === 0) {
  errors.push(
    'pnpm-workspace.yaml declares no package root that this check could read. Either the '
    + 'workspace changed shape or this reader did, and a check with no subject passes by '
    + 'having nothing to say.',
  );
}

// Whether a purge argument sweeps a workspace root.
//
// The root `apps/*` is swept by an argument naming it, and equally by one that
// puts a star where the root's name stands - every segment may be the literal
// or a star, and the lengths must match. Anything narrower is a list again.
// (Written in line comments rather than a block: the patterns this reasons
// about contain the sequence that ends a block comment.)
function sweeps(argument, root) {
  const wanted = `${root}/node_modules`.replace(/^\.\//u, '');
  const given = argument.replace(/^\.\//u, '');
  const wantedParts = wanted.split('/');
  const givenParts = given.split('/');
  if (wantedParts.length !== givenParts.length) return false;
  return wantedParts.every((part, index) => givenParts[index] === part || givenParts[index] === '*');
}

const dockerfiles = picoDockerfiles(repoRoot);
if (dockerfiles.length === 0) {
  errors.push('no published Dockerfile was found, so this check has nothing to read');
}

let swept = 0;
for (const path of dockerfiles) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  const purge = /^RUN rm -rf ([^\n\\]+)/mu.exec(text);
  if (purge === null) {
    errors.push(
      `${path} never removes the modules the build installed, so the compiler and the test `
      + 'runner travel into the published image. The file says elsewhere that they must not.',
    );
    continue;
  }
  const argumentsGiven = purge[1].trim().split(/\s+/u);
  for (const root of roots) {
    if (!argumentsGiven.some((argument) => sweeps(argument, root))) {
      errors.push(
        `${path} sweeps ${argumentsGiven.join(' ')} and pnpm-workspace.yaml declares ${root}, `
        + 'which none of those covers. A hand-written list of workspace roots drifts the day '
        + 'somebody adds one - which is what the file itself warns about.',
      );
    } else {
      swept += 1;
    }
  }

  const purgeAt = purge.index;
  const prodAt = text.indexOf('--prod', purgeAt);
  if (prodAt === -1) {
    errors.push(`${path} removes the modules and never reinstalls production dependencies`);
    continue;
  }
  const runtimeAt = text.indexOf('COPY --from=build', purgeAt);
  if (runtimeAt !== -1 && runtimeAt < prodAt) {
    errors.push(
      `${path} copies the build stage before the production reinstall, so the image gets the `
      + 'emptied modules rather than the pruned ones.',
    );
  }
}

if (errors.length > 0) {
  console.error('Image purge check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Image purge check passed (${dockerfiles.length} published image(s); ${roots.length} workspace `
  + `roots declared in pnpm-workspace.yaml, ${swept} root-and-image pairs swept before a `
  + 'production-only reinstall, and each sweep read as a shape rather than compared as a '
  + 'spelling).',
);
