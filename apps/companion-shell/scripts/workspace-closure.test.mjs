import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  picoProductionWorkspaceClosure,
  readPicoWorkspacePackages,
} from './workspace-closure.mjs';

/**
 * ADR 0113 C3 - what goes into the shipped package, and why it is not a list.
 *
 * A hand-kept list of six workspace paths missed `@pico/link-relay-client`
 * when ADR 0149's relay arrived. pnpm still made the symlink inside
 * `apps/companion/node_modules`, so the `.deb` shipped a link pointing at
 * nothing - and `relay-operator.ts` imports it, so the relay surface would
 * have failed on an installed package and nowhere else.
 */
const repoRoot = join(fileURLToPath(new URL('../../..', import.meta.url)));

const packages = (entries) => new Map(entries.map(([name, path, dependencies]) =>
  [name, { path, dependencies }]));

describe('the shipped closure is derived, not listed', () => {
  it('follows a dependency of a dependency, which is what the list missed', () => {
    const closure = picoProductionWorkspaceClosure('@pico/shell', packages([
      ['@pico/shell', 'apps/shell', ['@pico/core']],
      ['@pico/core', 'apps/core', ['@pico/deep']],
      ['@pico/deep', 'packages/deep', []],
    ]));
    expect(closure).toEqual(['apps/core', 'apps/shell', 'packages/deep']);
  });

  it('ships the root itself, because the root is the thing being shipped', () => {
    expect(picoProductionWorkspaceClosure('@pico/shell', packages([
      ['@pico/shell', 'apps/shell', []],
    ]))).toEqual(['apps/shell']);
  });

  it('leaves a dependency outside the workspace to npm', () => {
    // Copying one would be this packaging deciding how a registry package is
    // installed, which is not its question.
    expect(picoProductionWorkspaceClosure('@pico/shell', packages([
      ['@pico/shell', 'apps/shell', ['electron', 'libsodium-wrappers-sumo']],
    ]))).toEqual(['apps/shell']);
  });

  it('terminates on a cycle rather than following it forever', () => {
    expect(picoProductionWorkspaceClosure('@pico/a', packages([
      ['@pico/a', 'packages/a', ['@pico/b']],
      ['@pico/b', 'packages/b', ['@pico/a']],
    ]))).toEqual(['packages/a', 'packages/b']);
  });

  it('refuses a root nothing declares, rather than shipping an empty app', () => {
    expect(() => picoProductionWorkspaceClosure('@pico/absent', packages([])))
      .toThrow('unknown_pico_workspace_package:@pico/absent');
  });

  it('is sorted, so two builds of one tree copy the same order', () => {
    const closure = picoProductionWorkspaceClosure('@pico/shell', packages([
      ['@pico/shell', 'apps/shell', ['@pico/z', '@pico/a']],
      ['@pico/z', 'packages/z', []],
      ['@pico/a', 'packages/a', []],
    ]));
    expect(closure).toEqual([...closure].sort());
  });
});

describe('against this repository', () => {
  it('carries the relay client the hand-kept list had missed', () => {
    /**
     * The defect itself, held to the tree rather than to a fixture: it must
     * arrive through `@pico/companion`, which is the transitive step a list
     * written from the shell alone would not have seen.
     */
    const byName = readPicoWorkspacePackages(repoRoot);
    const closure = picoProductionWorkspaceClosure('@pico/companion-shell', byName);
    expect(closure).toContain('packages/link-relay-client');
    expect(byName.get('@pico/companion-shell')?.dependencies)
      .not.toContain('@pico/link-relay-client');
    expect(byName.get('@pico/companion')?.dependencies)
      .toContain('@pico/link-relay-client');
  });

  it('ships nothing a test needs and the product does not', () => {
    // `devDependencies` are not followed, and `electron` is the reason it
    // matters: following them would quietly undo what the packaging is for.
    const closure = picoProductionWorkspaceClosure(
      '@pico/companion-shell',
      readPicoWorkspacePackages(repoRoot),
    );
    expect(closure).not.toContain('apps/core');
    expect(closure).not.toContain('apps/relay');
    expect(closure).not.toContain('apps/web');
  });
});
