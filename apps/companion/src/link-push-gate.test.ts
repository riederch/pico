import { describe, expect, it } from 'vitest';
import type { PicoLinkPushSignatureInput } from '@pico/protocol';
import {
  createPicoCompanionPushGate,
  maxPicoLinkPushLifetimeMs,
  maxPicoLinkPushSeenIds,
  receivePicoCompanionPush,
} from './link-push-gate.js';

/**
 * ADR 0150 PU3/PU4. A push is worth one read, once, and reaches nothing else.
 */
const device = 'b'.repeat(64);
const host = 'a'.repeat(64);
const createdAt = '2026-08-13T10:00:00.000Z';
const expiresAt = '2026-08-13T10:10:00.000Z';
const nowMs = Date.parse('2026-08-13T10:05:00.000Z');

const push = (over: Partial<PicoLinkPushSignatureInput> = {}): PicoLinkPushSignatureInput => ({
  suite: 'pico.suite.id.v1',
  pushId: 'push_0001',
  hostSigningKeyFingerprintHex: host,
  deviceSigningKeyFingerprintHex: device,
  createdAt,
  expiresAt,
  ...over,
});

const gate = () => createPicoCompanionPushGate({
  deviceSigningKeyFingerprintHex: device,
  hostSigningKeyFingerprintHex: host,
});

describe('ADR 0150 PU3 - bounded replay', () => {
  it('accepts a fresh push once and calls it replayed after', () => {
    const admit = gate();
    expect(admit.admit({ push: push(), nowMs })).toBe('accepted');
    expect(admit.admit({ push: push(), nowMs })).toBe('replayed');
    expect(admit.admit({ push: push(), nowMs })).toBe('replayed');
  });

  it('accepts a different push inside the same window', () => {
    const admit = gate();
    expect(admit.admit({ push: push(), nowMs })).toBe('accepted');
    expect(admit.admit({ push: push({ pushId: 'push_0002' }), nowMs })).toBe('accepted');
  });

  it('refuses one past its own expiry, and one from too far ahead', () => {
    const admit = gate();
    expect(admit.admit({ push: push(), nowMs: Date.parse('2026-08-13T10:11:00.000Z') }))
      .toBe('expired');
    expect(admit.admit({ push: push(), nowMs: Date.parse('2026-08-13T09:00:00.000Z') }))
      .toBe('expired');
  });

  it('refuses a lifetime longer than one may be', () => {
    // Without this the seen-set is defeated by construction: no bounded memory
    // covers a push minted valid for a year.
    const admit = gate();
    const long = push({ expiresAt: new Date(Date.parse(createdAt) + maxPicoLinkPushLifetimeMs + 1_000).toISOString() });
    expect(admit.admit({ push: long, nowMs })).toBe('expired');
  });

  it('forgets what can no longer be replayed', () => {
    const admit = gate();
    admit.admit({ push: push(), nowMs });
    expect(admit.size()).toBe(1);
    // One window later nothing it holds could be accepted anyway.
    admit.admit({ push: push({ pushId: 'push_0002', createdAt: '2026-08-13T10:20:00.000Z', expiresAt: '2026-08-13T10:30:00.000Z' }), nowMs: Date.parse('2026-08-13T10:25:00.000Z') });
    expect(admit.size()).toBe(1);
  });

  it('evicts oldest first when it fills, and stays bounded', () => {
    const admit = gate();
    for (let index = 0; index <= maxPicoLinkPushSeenIds; index += 1) {
      expect(admit.admit({ push: push({ pushId: `push_${index}` }), nowMs })).toBe('accepted');
    }
    expect(admit.size()).toBe(maxPicoLinkPushSeenIds);
    // The oldest fell out and can be replayed once - the bounded residual ADR
    // 0107 already names, and here it costs exactly one read.
    expect(admit.admit({ push: push({ pushId: 'push_0' }), nowMs })).toBe('accepted');
  });

  it('refuses a push for another device or another Home by name', () => {
    // Not verdicts: neither is a stale push, and answering `expired` would be
    // answering the wrong question.
    const admit = gate();
    expect(() => admit.admit({ push: push({ deviceSigningKeyFingerprintHex: 'c'.repeat(64) }), nowMs }))
      .toThrow('pico_link_push_addressed_another_device');
    expect(() => admit.admit({ push: push({ hostSigningKeyFingerprintHex: 'd'.repeat(64) }), nowMs }))
      .toThrow('pico_link_push_from_another_home');
  });
});

describe('ADR 0150 PU4 - it causes a read and nothing else', () => {
  it('reads once for an accepted push', async () => {
    let reads = 0;
    const admit = gate();
    const verdict = await receivePicoCompanionPush({
      gate: admit,
      push: push(),
      nowMs,
      read: async () => {
        reads += 1;
      },
    });
    expect(verdict).toBe('accepted');
    expect(reads).toBe(1);
  });

  it('reads nothing for a replay or an expiry', async () => {
    let reads = 0;
    const admit = gate();
    const read = async () => {
      reads += 1;
    };
    await receivePicoCompanionPush({ gate: admit, push: push(), nowMs, read });
    await receivePicoCompanionPush({ gate: admit, push: push(), nowMs, read });
    await receivePicoCompanionPush({
      gate: admit, push: push({ pushId: 'push_0002' }), nowMs: Date.parse('2026-08-13T11:00:00.000Z'), read,
    });
    expect(reads).toBe(1);
  });

  it('lets a failed read surface rather than swallowing it', async () => {
    // The push was valid and is remembered; whether the read got through is
    // the ADR 0112 carrier's business, and it counts its own failures.
    const admit = gate();
    await expect(receivePicoCompanionPush({
      gate: admit,
      push: push(),
      nowMs,
      read: async () => {
        throw new Error('read_failed');
      },
    })).rejects.toThrow('read_failed');
    expect(admit.admit({ push: push(), nowMs })).toBe('replayed');
  });
});
