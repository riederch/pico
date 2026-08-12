import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PicoDepotWorkspace } from './depot-workspace.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function workspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-depot-workspace-'));
  tempDirs.push(dir);
  return join(dir, 'depots');
}

describe('ADR 0143 DP8 depot workspace', () => {
  it('defaults beside the database, in the idiom the other four use', () => {
    expect(PicoDepotWorkspace.defaultRoot('/var/lib/pico/pico.db'))
      .toBe('/var/lib/pico/depots');
  });

  it('names a directory by hashing the remote, so a URL cannot pick a path', () => {
    // The whole point: a remote contains slashes by definition. Sanitising it
    // would mean inventing an escaping scheme whose bugs are directories in
    // the wrong place.
    const remote = 'https://example.invalid/some/deep/path.git';
    const workspace = new PicoDepotWorkspace('/srv/depots');
    const name = PicoDepotWorkspace.directoryName(remote);

    expect(name).toBe(createHash('sha256').update(remote, 'utf8').digest('hex'));
    expect(name).toMatch(/^[0-9a-f]{64}$/u);
    expect(workspace.pathFor(remote)).toBe(join('/srv/depots', name));
  });

  it('cannot be escaped by a remote that looks like a path', () => {
    const workspace = new PicoDepotWorkspace('/srv/depots');
    for (const remote of ['../../etc', 'file:///../../etc', '/etc/passwd']) {
      expect(workspace.pathFor(remote).startsWith('/srv/depots/')).toBe(true);
    }
  });

  it('refuses an empty root and an empty remote rather than defaulting one', () => {
    expect(() => new PicoDepotWorkspace('   '))
      .toThrow('invalid_pico_depot_workspace_root');
    expect(() => PicoDepotWorkspace.directoryName(''))
      .toThrow('invalid_pico_depot_remote');
  });

  it('creates on demand and removes what it created', () => {
    const workspace = new PicoDepotWorkspace(workspaceRoot());
    const remote = 'https://example.invalid/depot.git';

    const path = workspace.ensure(remote);
    expect(existsSync(path)).toBe(true);
    writeFileSync(join(path, 'entry.js'), 'export default 1;\n');

    workspace.detach(remote);
    expect(existsSync(path)).toBe(false);
  });

  it('detaching something never created is not an error', () => {
    // A detach that crashed after removing the files still has a row to
    // reconcile, so this runs against a directory that is already gone.
    const workspace = new PicoDepotWorkspace(workspaceRoot());
    expect(() => workspace.detach('https://example.invalid/never.git')).not.toThrow();
  });

  it('brings the filesystem back to the attachment rows', () => {
    // The failure worth designing against: a detach interrupted between the
    // row and the files leaves executable code on disk that no attachment
    // stands behind - and it is what a supplier process would be pointed at.
    const root = workspaceRoot();
    const workspace = new PicoDepotWorkspace(root);
    const kept = 'https://example.invalid/kept.git';
    const dropped = 'https://example.invalid/dropped.git';
    workspace.ensure(kept);
    workspace.ensure(dropped);

    const removed = workspace.removeOrphans([kept]);

    expect(removed).toEqual([PicoDepotWorkspace.directoryName(dropped)]);
    expect(existsSync(workspace.pathFor(kept))).toBe(true);
    expect(existsSync(workspace.pathFor(dropped))).toBe(false);
  });

  it('removes a directory nothing here could have created', () => {
    // Its presence means something else wrote into the root, and leaving it
    // makes the root a place where unaccounted code accumulates.
    const root = workspaceRoot();
    const workspace = new PicoDepotWorkspace(root);
    mkdirSync(join(root, 'not-a-hash'), { recursive: true });

    expect(workspace.removeOrphans([])).toEqual(['not-a-hash']);
    expect(existsSync(join(root, 'not-a-hash'))).toBe(false);
  });

  it('reconciles a root that does not exist yet without creating one', () => {
    const root = workspaceRoot();
    const workspace = new PicoDepotWorkspace(root);

    expect(workspace.removeOrphans([])).toEqual([]);
    expect(existsSync(root)).toBe(false);
  });
});
