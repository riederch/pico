import { describe, expect, it } from 'vitest';
import { PicoIdentityReaderKeyFreshnessInbox } from './reader-key-freshness-inbox.js';

const signal = new AbortController().signal;

function checkpoint(overrides: Record<string, string> = {}): never {
  return {
    schema: 'pico.id.reader-key-freshness.v1',
    checkpoint: {
      suite: 'pico.suite.id.v1',
      checkpointId: 'checkpoint_0001',
      homeId: 'home_0001',
      issuerIdentityKeyFingerprintHex: '11'.repeat(32),
      deviceSigningKeyFingerprintHex: '22'.repeat(32),
      deviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
      delegationId: 'delegation_0001',
      status: 'current',
      observedThroughLifecycleOrder: 'seq:0000000000000001',
      checkedAt: '2026-07-29T10:00:00.000Z',
      freshUntil: '2026-07-29T10:05:00.000Z',
      ...overrides,
    },
    issuerIdentityKeyRecord: {
      suite: 'pico.suite.id.v1',
      keyRole: 'pico_identity',
      publicKeyHex: '44'.repeat(32),
    },
    issuerSignatureHex: '55'.repeat(64),
  } as never;
}

function query(overrides: Record<string, string> = {}): never {
  return {
    homeId: 'home_0001',
    picoIdentityFingerprintHex: '11'.repeat(32),
    deviceSigningKeyFingerprintHex: '22'.repeat(32),
    deviceKeyAgreementKeyFingerprintHex: '33'.repeat(32),
    delegationId: 'delegation_0001',
    locallyObservedThroughLifecycleOrder: 'seq:0000000000000001',
    evaluatedAt: '2026-07-29T10:01:00.000Z',
    ...overrides,
  } as never;
}

describe('Reader-key freshness inbox (ADR 0089 transport seam)', () => {
  it('returns a published checkpoint for the exact binding it was issued for', async () => {
    const inbox = new PicoIdentityReaderKeyFreshnessInbox();
    inbox.publish(checkpoint());

    const found = await inbox.lookup(query(), { signal });
    expect(found.status).toBe('checkpoint');
    expect(found.status === 'checkpoint' && found.record.checkpoint.checkpointId)
      .toBe('checkpoint_0001');
  });

  it('never answers for a different reader, device key or delegation', async () => {
    const inbox = new PicoIdentityReaderKeyFreshnessInbox();
    inbox.publish(checkpoint());

    // Each of these is a distinct binding: answering any of them with this
    // checkpoint would let one reader's freshness stand in for another's.
    for (const wrong of [
      query({ picoIdentityFingerprintHex: 'aa'.repeat(32) }),
      query({ deviceSigningKeyFingerprintHex: 'bb'.repeat(32) }),
      query({ deviceKeyAgreementKeyFingerprintHex: 'cc'.repeat(32) }),
      query({ delegationId: 'delegation_other' }),
      query({ homeId: 'home_other' }),
    ]) {
      expect((await inbox.lookup(wrong, { signal })).status).toBe('unavailable');
    }
  });

  it('reports unavailable when nothing was published, which is the default state', async () => {
    const inbox = new PicoIdentityReaderKeyFreshnessInbox();
    expect((await inbox.lookup(query(), { signal })).status).toBe('unavailable');
  });

  it('replaces an earlier checkpoint for the same binding', async () => {
    const inbox = new PicoIdentityReaderKeyFreshnessInbox();
    inbox.publish(checkpoint());
    inbox.publish(checkpoint({ checkpointId: 'checkpoint_0002' }));

    const found = await inbox.lookup(query(), { signal });
    expect(found.status === 'checkpoint' && found.record.checkpoint.checkpointId)
      .toBe('checkpoint_0002');
  });

  it('stays bounded, dropping the oldest binding rather than growing', async () => {
    const inbox = new PicoIdentityReaderKeyFreshnessInbox(2);
    inbox.publish(checkpoint({ delegationId: 'delegation_a' }));
    inbox.publish(checkpoint({ delegationId: 'delegation_b' }));
    inbox.publish(checkpoint({ delegationId: 'delegation_c' }));

    expect((await inbox.lookup(query({ delegationId: 'delegation_a' }), { signal })).status)
      .toBe('unavailable');
    expect((await inbox.lookup(query({ delegationId: 'delegation_c' }), { signal })).status)
      .toBe('checkpoint');
  });

  it('refuses a nonsensical bound', () => {
    expect(() => new PicoIdentityReaderKeyFreshnessInbox(0)).toThrow('Invalid freshness inbox bound.');
  });
});
