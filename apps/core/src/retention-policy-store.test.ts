import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import type { RetentionPolicyStore } from './retention-policy-store.js';

const tempDirs: string[] = [];
const stores: EventStore[] = [];

function openPolicies(): RetentionPolicyStore {
  const dir = mkdtempSync(join(tmpdir(), 'pico-retention-policy-test-'));
  tempDirs.push(dir);
  const store = new EventStore(join(dir, 'pico.sqlite'));
  stores.push(store);
  return store.retentionPolicies();
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('RetentionPolicyStore', () => {
  it('creates, reads, lists, edits and revokes policies', () => {
    const policies = openPolicies();

    const keep = policies.create({ retentionPolicyId: 'keep', displayName: 'Keep forever', mode: 'keep_until_deleted' });
    expect(keep).toMatchObject({ retentionPolicyId: 'keep', mode: 'keep_until_deleted' });
    expect(keep.maxAgeDays).toBeUndefined();

    const expire = policies.create({ retentionPolicyId: 'ninety', displayName: '90 days', mode: 'delete_after_max_age', maxAgeDays: 90 });
    expect(expire.maxAgeDays).toBe(90);

    expect(policies.get('ninety')?.maxAgeDays).toBe(90);
    expect(policies.list().map((policy) => policy.retentionPolicyId)).toEqual(['keep', 'ninety']);

    const edited = policies.update('ninety', { maxAgeDays: 30 });
    expect(edited.maxAgeDays).toBe(30);

    // Switching to keep_until_deleted drops the max age.
    const switched = policies.update('ninety', { mode: 'keep_until_deleted' });
    expect(switched.mode).toBe('keep_until_deleted');
    expect(switched.maxAgeDays).toBeUndefined();

    expect(policies.delete('keep')).toBe('deleted');
    expect(policies.delete('keep')).toBe('not_found');
    expect(policies.list().map((policy) => policy.retentionPolicyId)).toEqual(['ninety']);
  });

  it('validates mode and max age', () => {
    const policies = openPolicies();

    expect(() => policies.create({ retentionPolicyId: 'x', displayName: 'x', mode: 'delete_after_max_age' }))
      .toThrow('requires maxAgeDays');
    expect(() => policies.create({ retentionPolicyId: 'x', displayName: 'x', mode: 'delete_after_max_age', maxAgeDays: 0 }))
      .toThrow('positive whole number');
    expect(() => policies.create({ retentionPolicyId: 'x', displayName: 'x', mode: 'delete_after_max_age', maxAgeDays: 1.5 }))
      .toThrow('positive whole number');
    expect(() => policies.create({ retentionPolicyId: 'x', displayName: 'x', mode: 'keep_until_deleted', maxAgeDays: 5 }))
      .toThrow('must not set maxAgeDays');
    expect(() => policies.create({ retentionPolicyId: '', displayName: 'x', mode: 'keep_until_deleted' }))
      .toThrow('id must be a non-empty string');

    policies.create({ retentionPolicyId: 'dup', displayName: 'x', mode: 'keep_until_deleted' });
    expect(() => policies.create({ retentionPolicyId: 'dup', displayName: 'y', mode: 'keep_until_deleted' }))
      .toThrow('already exists');
    expect(() => policies.update('missing', { displayName: 'y' })).toThrow('not found');
  });
});
