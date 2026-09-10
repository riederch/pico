import { describe, expect, it } from 'vitest';
// @ts-expect-error - release scripts are plain ESM beside the workspace.
import { decidePicoReleaseAssets } from '../../../scripts/check-release-asset-absent.mjs';

describe('ADR 0153 PK6 a release asset is attached once', () => {
  it('admits a package against a release with nothing attached', () => {
    expect(decidePicoReleaseAssets({
      existing: [],
      candidates: ['pico-companion_0.2.1_amd64.deb', 'pico-companion_0.2.1_amd64.deb.sha256'],
    })).toEqual({ ok: true, attaching: 2 });
  });

  it('admits a package beside assets of other names', () => {
    expect(decidePicoReleaseAssets({
      existing: ['pico-companion_0.2.1_arm64.deb'],
      candidates: ['pico-companion_0.2.1_amd64.deb'],
    })).toEqual({ ok: true, attaching: 1 });
  });

  it('refuses when any candidate is already attached', () => {
    // A re-run and an attempt to change what a version means look identical
    // from here, and the safe reading of an ambiguous one is the hostile one.
    // Until 2026-09-10 this was `--clobber`, and the checksum would have been
    // replaced together with the package it vouched for.
    const decision = decidePicoReleaseAssets({
      existing: ['pico-companion_0.2.1_amd64.deb', 'pico-companion_0.2.1_amd64.deb.sha256'],
      candidates: ['pico-companion_0.2.1_amd64.deb', 'pico-companion_0.2.1_amd64.deb.sha256'],
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('asset_exists');
    expect(decision.detail).toContain('pico-companion_0.2.1_amd64.deb');
  });

  it('refuses a partial collision too, because half a release is no release', () => {
    const decision = decidePicoReleaseAssets({
      existing: ['pico-companion_0.2.1_amd64.deb.sha256'],
      candidates: ['pico-companion_0.2.1_amd64.deb', 'pico-companion_0.2.1_amd64.deb.sha256'],
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('asset_exists');
  });

  it('refuses to run with nothing to attach', () => {
    const decision = decidePicoReleaseAssets({ existing: [], candidates: [] });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('no_candidates');
  });
});
