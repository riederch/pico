import { describe, expect, it } from 'vitest';
// @ts-expect-error - release scripts are plain ESM beside the workspace.
import { comparePicoVersions, decidePicoRelease } from '../../../scripts/check-release-monotonic.mjs';

describe('ADR 0122 Y4 no re-tag, no silent downgrade', () => {
  it('admits the first release when nothing is published', () => {
    expect(decidePicoRelease({ candidate: '0.1.9', published: [] }))
      .toEqual({ ok: true, newest: null });
  });

  it('admits a version above the newest published', () => {
    expect(decidePicoRelease({ candidate: '0.2.0', published: ['0.1.8', '0.1.9'] }))
      .toEqual({ ok: true, newest: '0.1.9' });
  });

  it('refuses a version that already exists', () => {
    // An accidental re-run and an attempt to change what a version means look
    // identical from here, and the safe reading of an ambiguous one is the
    // hostile one.
    const decision = decidePicoRelease({ candidate: '0.1.9', published: ['0.1.9'] });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('already_published');
  });

  it('refuses a version below the newest published', () => {
    // A downgrade arriving through the normal channel is indistinguishable
    // from a rollback attack; rolling back is a deliberate act elsewhere.
    const decision = decidePicoRelease({ candidate: '0.1.7', published: ['0.1.8', '0.1.9'] });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe('downgrade');
  });

  it('ignores tags that are not versions', () => {
    // The registry also carries branch and sha tags; they say nothing about
    // which release is newest.
    expect(decidePicoRelease({
      candidate: '0.2.0',
      published: ['main', 'sha-abc1234', '0.1.9', 'latest'],
    })).toEqual({ ok: true, newest: '0.1.9' });
  });

  it('orders versions numerically, not as text', () => {
    // '0.1.10' sorts before '0.1.9' as a string, which would let a real
    // downgrade pass and block a real upgrade.
    expect(comparePicoVersions('0.1.10', '0.1.9')).toBe(1);
    expect(decidePicoRelease({ candidate: '0.1.9', published: ['0.1.10'] }).reason)
      .toBe('downgrade');
  });

  it('refuses a candidate it cannot compare', () => {
    expect(() => comparePicoVersions('0.1', '0.1.9')).toThrow(/unparseable_pico_version/u);
  });
});
