import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Which workspace packages a shipped app actually needs.
 *
 * **This was a hand-kept list of six, and it was wrong.** `@pico/companion`
 * took a dependency on `@pico/link-relay-client` when ADR 0149's relay
 * arrived, and nothing added it to the packaging list - so pnpm made the
 * symlink and the packaging never copied the target. The built `.deb` carried
 * `apps/companion/node_modules/@pico/link-relay-client` pointing at nothing,
 * and `relay-operator.ts` imports it: the relay surface would have failed the
 * moment a person opened it, on an installed package and nowhere else.
 *
 * `verify:linux` had been reporting the dangling link for days. It was written
 * off as an environment problem - "needs sudo" - and the sudo part is true of
 * one *measurement mode*, not of the run: the root-owned package probe is
 * opt-in through an environment variable, and everything before it runs
 * without privileges.
 *
 * Derived rather than corrected, because correcting a list leaves a list and
 * the next production dependency goes the same way. The closure over
 * `dependencies` is exactly what a runtime resolves.
 *
 * **`devDependencies` are deliberately not followed.** A test-only package
 * inside a shipped image is the surface the packaging exists to keep small,
 * and following them would quietly undo that - `electron` itself is one.
 *
 * Extracted from `package-linux.mjs` so it can be tested: that file imports
 * `electron` at load, which a plain test run has no business doing. Same
 * reason `chromium-sandbox-probe.mjs` sits beside it.
 */

/** Where a workspace package lives, by its declared name. */
export function readPicoWorkspacePackages(repoRoot, areas = ['apps', 'packages', 'modules']) {
  const byName = new Map();
  for (const area of areas) {
    const areaRoot = join(repoRoot, area);
    if (!existsSync(areaRoot)) {
      continue;
    }
    for (const entry of readdirSync(areaRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const manifestPath = join(areaRoot, entry.name, 'package.json');
      if (!existsSync(manifestPath)) {
        continue;
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      byName.set(manifest.name, {
        path: `${area}/${entry.name}`,
        dependencies: Object.keys(manifest.dependencies ?? {}),
      });
    }
  }
  return byName;
}

/**
 * Every workspace path reachable from one package through `dependencies`.
 *
 * The root is included: it is the thing being shipped. Sorted, so a package
 * built twice from the same tree copies the same directories in the same
 * order and two artefacts can be compared byte for byte.
 */
export function picoProductionWorkspaceClosure(rootName, byName) {
  if (!byName.has(rootName)) {
    throw new Error(`unknown_pico_workspace_package:${rootName}`);
  }
  const reached = new Set();
  const visit = (name) => {
    const found = byName.get(name);
    // A dependency outside the workspace is npm's to install, not ours to copy.
    if (found === undefined || reached.has(name)) {
      return;
    }
    reached.add(name);
    for (const dependency of found.dependencies) {
      visit(dependency);
    }
  };
  visit(rootName);
  return [...reached].map((name) => byName.get(name).path).sort();
}
