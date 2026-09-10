import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error - release scripts are plain ESM beside the workspace. The
// directive has to sit on the line TypeScript blames, which is the module
// specifier - so this import stays on one line rather than wrapping.
import { picoAddons, picoDockerfiles, picoWorkspaceGlobs, picoWorkspaceManifests } from '../../../scripts/workspace-members.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
let root: string;

function write(path: string, contents: string): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), contents);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pico-workspace-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('who belongs to this tree, asked rather than written down', () => {
  it('reads the globs and finds every member under them', () => {
    write('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n  - "modules/*"\n');
    write('apps/core/package.json', '{"version":"1.0.0"}');
    write('apps/web/package.json', '{"version":"1.0.0"}');
    write('modules/calendar/package.json', '{"version":"1.0.0"}');

    expect(picoWorkspaceGlobs(root)).toEqual(['apps/*', 'modules/*']);
    expect(picoWorkspaceManifests(root)).toEqual([
      'apps/core/package.json',
      'apps/web/package.json',
      'modules/calendar/package.json',
    ]);
  });

  it('ignores a directory without a manifest, because pnpm does', () => {
    // Being stricter here would make a scratch directory an error, and this
    // reader has to guard the set pnpm installs rather than a stricter one.
    write('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n');
    write('apps/core/package.json', '{"version":"1.0.0"}');
    mkdirSync(join(root, 'apps/scratch'), { recursive: true });

    expect(picoWorkspaceManifests(root)).toEqual(['apps/core/package.json']);
  });

  it('refuses a glob that finds nothing, because an empty root is a move', () => {
    write('pnpm-workspace.yaml', 'packages:\n  - "apps/*"\n  - "packages/*"\n');
    write('apps/core/package.json', '{"version":"1.0.0"}');
    mkdirSync(join(root, 'packages'), { recursive: true });

    expect(() => picoWorkspaceManifests(root)).toThrow(/no directory under packages/u);
  });

  it('refuses a glob it cannot expand rather than guessing at it', () => {
    // The failure this prevents is silent: a pattern read wrongly narrows the
    // set every version gate guards, and a smaller set reports no error - it
    // reports less.
    for (const glob of ['packages/**', '!**/fixtures/**', 'packages', 'a/b/*']) {
      write('pnpm-workspace.yaml', `packages:\n  - "${glob}"\n`);
      expect(() => picoWorkspaceGlobs(root)).toThrow(/cannot expand/u);
    }
  });

  it('refuses a workspace file with no packages list and one with an empty list', () => {
    write('pnpm-workspace.yaml', 'catalog:\n  vitest: ^3.0.0\n');
    expect(() => picoWorkspaceGlobs(root)).toThrow(/no `packages:` list/u);

    write('pnpm-workspace.yaml', 'packages:\npatchedDependencies: {}\n');
    expect(() => picoWorkspaceGlobs(root)).toThrow(/lists no package globs/u);
  });

  it('stops the list at the next top-level key and keeps comments out', () => {
    write(
      'pnpm-workspace.yaml',
      'packages:\n  # the three roots\n  - "apps/*"\n\nonlyBuiltDependencies:\n  - esbuild\n',
    );
    expect(picoWorkspaceGlobs(root)).toEqual(['apps/*']);
  });

  it('discovers add-ons the way the Supervisor does, by config.yaml with a slug', () => {
    write('pico_home/config.yaml', 'name: Home\nslug: pico_home\nimage: ghcr.io/x/home\n');
    write('pico_relay/config.yaml', 'name: Relay\nslug: pico_relay\nimage: ghcr.io/x/relay\n');
    // A config.yaml that is not an add-on manifest, and a directory that is not one at all.
    write('tools/config.yaml', 'colour: blue\n');
    write('docs/index.md', '# docs\n');

    expect(picoAddons(root)).toEqual([
      { directory: 'pico_home', configPath: 'pico_home/config.yaml', image: 'ghcr.io/x/home' },
      { directory: 'pico_relay', configPath: 'pico_relay/config.yaml', image: 'ghcr.io/x/relay' },
    ]);
  });

  it('reports an add-on that names no image instead of skipping it', () => {
    write('pico_home/config.yaml', 'name: Home\nslug: pico_home\n');
    expect(picoAddons(root)).toEqual([
      { directory: 'pico_home', configPath: 'pico_home/config.yaml', image: undefined },
    ]);
  });

  it('refuses a tree with no add-on and one with no Dockerfile', () => {
    write('docs/index.md', '# docs\n');
    expect(() => picoAddons(root)).toThrow(/no add-on to check/u);

    mkdirSync(join(root, 'docker'), { recursive: true });
    write('docker/README.md', 'not an image\n');
    expect(() => picoDockerfiles(root)).toThrow(/no published image/u);
  });

  it('finds every Dockerfile, including a bare one', () => {
    write('docker/home.Dockerfile', 'FROM node\n');
    write('docker/relay.Dockerfile', 'FROM node\n');
    write('docker/Dockerfile', 'FROM node\n');
    expect(picoDockerfiles(root)).toEqual([
      'docker/Dockerfile',
      'docker/home.Dockerfile',
      'docker/relay.Dockerfile',
    ]);
  });

  it('finds in this repository what the hand-written list left out', () => {
    /**
     * The regression, named. `check-version.mjs` listed twelve manifests until
     * 2026-09-10; the workspace has seventeen, and `pnpm list -r` counts the
     * same seventeen beside the root. The five that were missing could hold a
     * version of their own without any gate saying so.
     */
    const manifests = picoWorkspaceManifests(repoRoot);
    expect(manifests).toHaveLength(17);
    for (const missed of [
      'packages/gesture/package.json',
      'modules/calendar/package.json',
      'modules/depot/package.json',
      'modules/home-assistant/package.json',
      'modules/spatial-recall/package.json',
    ]) {
      expect(manifests).toContain(missed);
    }
    expect(picoAddons(repoRoot).map((addon: { directory: string }) => addon.directory))
      .toEqual(['pico_home', 'pico_relay']);
  });
});
