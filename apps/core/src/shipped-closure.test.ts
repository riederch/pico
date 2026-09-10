import { describe, expect, it } from 'vitest';
// @ts-expect-error - release scripts are plain ESM beside the workspace.
import { picoArtifactPackages, picoShippedAdvisories } from '../../../scripts/check-shipped-closure.mjs';

/**
 * ADR 0122 Y1 with the external review of 2026-09-09, §5. What the package
 * carries, against what is known to be broken.
 *
 * `pnpm audit --prod` reads the workspace's production graph. The package
 * carries the Electron runtime, and `electron` is a devDependency - so the
 * one thing the artifact adds beyond that graph is exactly the one the graph
 * cannot see.
 */

const listing = [
  '-rw-r--r-- root/root  0 ./opt/pico-companion/resources/app/node_modules/.pnpm/pako@1.0.11/node_modules/pako/index.js',
  '-rw-r--r-- root/root  0 ./opt/pico-companion/resources/app/node_modules/.pnpm/@noble+hashes@2.2.0/node_modules/@noble/hashes/sha2.js',
  '-rw-r--r-- root/root  0 ./opt/pico-companion/resources/app/node_modules/.pnpm/node_modules/tslib/tslib.js',
  '-rw-r--r-- root/root  0 ./opt/pico-companion/resources/app/node_modules/.pnpm/vite@5.4.21_@types+node@22.0.0/node_modules/vite/index.js',
  '-rw-r--r-- root/root  0 ./opt/pico-companion/pico-companion-bin',
].join('\n');

function advisory(module: string, severity: string, versions: readonly string[]): unknown {
  return {
    module_name: module,
    severity,
    title: `${module} is broken`,
    url: `https://example.invalid/${module}`,
    findings: versions.map((version) => ({ version, paths: [`. > ${module}@${version}`] })),
  };
}

describe('what the package carries, read from the package', () => {
  it('reads name and version out of the pnpm directory names', () => {
    const packages = picoArtifactPackages(listing);
    expect([...packages.keys()].sort()).toEqual(['@noble/hashes', 'pako', 'vite']);
    expect([...packages.get('pako')]).toEqual(['1.0.11']);
    // A scope is encoded with `+`, and a peer resolution is appended with `_`.
    expect([...packages.get('@noble/hashes')]).toEqual(['2.2.0']);
    expect([...packages.get('vite')]).toEqual(['5.4.21']);
  });

  it('skips the private hoist directory, which is not a package', () => {
    // `.pnpm/node_modules` is pnpm's own hoist folder. Reading it as a package
    // would put a name in the inventory that no advisory could ever match, and
    // an inventory that quietly holds a non-package is one nobody rereads.
    expect(picoArtifactPackages(listing).has('node_modules')).toBe(false);
  });

  it('holds two versions of one name apart', () => {
    const packages = picoArtifactPackages([
      './x/node_modules/.pnpm/tslib@1.14.1/node_modules/tslib/a.js',
      './x/node_modules/.pnpm/tslib@2.6.0/node_modules/tslib/a.js',
    ].join('\n'));
    expect([...packages.get('tslib')].sort()).toEqual(['1.14.1', '2.6.0']);
  });

  it('answers with nothing for a listing that names no package', () => {
    // The caller turns this into a refusal: an empty inventory would let every
    // advisory pass as "not carried".
    expect(picoArtifactPackages('./opt/pico-companion/pico-companion-bin').size).toBe(0);
  });
});

describe('which advisories name something the package carries', () => {
  const packages = picoArtifactPackages(listing);

  it('carries an advisory whose finding version is in the package', () => {
    const { shipped, elsewhere } = picoShippedAdvisories({
      packages,
      audit: { advisories: { 1: advisory('pako', 'high', ['1.0.11']) } },
    });
    expect(elsewhere).toHaveLength(0);
    expect(shipped).toEqual([{
      module: 'pako',
      severity: 'high',
      title: 'pako is broken',
      url: 'https://example.invalid/pako',
      versions: ['1.0.11'],
    }]);
  });

  it('does not carry an advisory against another version of the same name', () => {
    /**
     * The precision that matters. A tool can sit in the tree in a vulnerable
     * version and in the package in a safe one; matching on the name alone
     * would report the package for something it does not have, and a check
     * that cries wolf is one somebody switches off.
     */
    const { shipped, elsewhere } = picoShippedAdvisories({
      packages,
      audit: { advisories: { 1: advisory('pako', 'critical', ['0.2.9']) } },
    });
    expect(shipped).toHaveLength(0);
    expect(elsewhere.map((entry: { module: string }) => entry.module)).toEqual(['pako']);
  });

  it('leaves an advisory about something the package never had', () => {
    const { shipped, elsewhere } = picoShippedAdvisories({
      packages,
      audit: { advisories: { 1: advisory('vitest', 'critical', ['2.1.9']) } },
    });
    expect(shipped).toHaveLength(0);
    expect(elsewhere).toHaveLength(1);
  });

  it('keeps only the carried versions when one advisory names several', () => {
    const { shipped } = picoShippedAdvisories({
      packages,
      audit: { advisories: { 1: advisory('vite', 'moderate', ['5.4.21', '6.0.0']) } },
    });
    expect(shipped[0].versions).toEqual(['5.4.21']);
  });

  it('reads an audit with no advisories as nothing carried and nothing elsewhere', () => {
    expect(picoShippedAdvisories({ packages, audit: {} }))
      .toEqual({ shipped: [], elsewhere: [] });
  });
});
