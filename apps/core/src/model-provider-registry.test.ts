import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePicoModelProviderEntry } from '@pico/protocol/model-provider';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';
import Database from 'better-sqlite3';
import {
  PicoModelProviderConsent,
  PicoModelProviderNarrowingError,
  PicoModelProviderRegistry,
  assertPicoModelProviderNarrowing,
  picoModelProviderEffectiveEntry,
} from './model-provider-registry.js';

/**
 * ADR 0152 SE4. The gate that keeps an expert panel from undoing the ADRs it
 * sits under, tested where it lives - in the store, so every surface inherits
 * it without knowing it exists.
 */
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function entry(overrides: Record<string, unknown> = {}) {
  return parsePicoModelProviderEntry({
    schema: 'pico.model.provider.entry.v1',
    entryId: 'qwen3-14b',
    providerClass: 'declared_own_host',
    reach: 'http://inference.lan.invalid:11434',
    model: { identifier: 'qwen3:14b', digestHex: 'b'.repeat(64) },
    measurement: {
      measuredAt: '2026-08-13T17:43:04.923Z',
      capacity: {
        contextTokens: 40960,
        generationTokensPerSecond: 26.31,
        promptTokensPerSecond: 1575.94,
        concurrentJobs: 1,
      },
      residency: { coldLoadMs: 4871, reloadMs: 3988, keepAliveMs: 300_000 },
    },
    carries: 'live_turn',
    ...overrides,
  });
}

async function registry(): Promise<{
  registry: PicoModelProviderRegistry;
  consent: PicoModelProviderConsent;
  close: () => void;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'pico-registry-'));
  dirs.push(dir);
  const databasePath = join(dir, 'pico.sqlite');
  (await EventStore.open(databasePath, {})).close();
  const db = new Database(databasePath);
  const store = new PicoModelProviderRegistry(db);
  return {
    registry: store,
    consent: new PicoModelProviderConsent(db, store),
    close: () => { db.close(); },
  };
}

describe('ADR 0152 SE4 - an override narrows and never widens', () => {
  it('honours a narrower context as a preference', () => {
    const measured = entry();
    assertPicoModelProviderNarrowing(measured, { contextTokens: 8192 });
    const effective = picoModelProviderEffectiveEntry({
      entry: measured,
      narrowing: { contextTokens: 8192 },
      addedAt: '2026-08-13T18:00:00.000Z',
      updatedAt: '2026-08-13T18:00:00.000Z',
    });
    expect(effective.measurement.capacity.contextTokens).toBe(8192);
    // The measurement itself is untouched: a finding is not edited.
    expect(measured.measurement.capacity.contextTokens).toBe(40960);
  });

  it('refuses a wider one, and does not clamp it', () => {
    // ADR 0119 Q5's posture. A silently clamped value would let a person
    // believe the larger number took effect and plan around it.
    try {
      assertPicoModelProviderNarrowing(entry(), { contextTokens: 65536 });
      expect.unreachable('widening was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(PicoModelProviderNarrowingError);
      expect((error as PicoModelProviderNarrowingError).refusal).toBe('context_wider_than_measured');
      expect((error as PicoModelProviderNarrowingError).measured).toBe(40960);
    }
  });

  it('applies the same rule to every measured field, not only context', () => {
    // More lanes than measured is a claim; fewer is a preference.
    expect(() => assertPicoModelProviderNarrowing(entry(), { concurrentJobs: 2 }))
      .toThrow('concurrency_wider_than_measured');
    expect(() => assertPicoModelProviderNarrowing(entry(), { concurrentJobs: 1 })).not.toThrow();
    expect(() => assertPicoModelProviderNarrowing(entry(), { contextTokens: 0 }))
      .toThrow('narrowing_below_one');
  });
});

describe('ADR 0152 SE3 - the store keeps the finding and the preference apart', () => {
  it('stores, narrows and reads back through the parser', async () => {
    const { registry: store, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      store.narrow('qwen3-14b', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');

      const record = store.get('qwen3-14b');
      expect(record?.entry.measurement.capacity.contextTokens).toBe(40960);
      expect(record?.narrowing.contextTokens).toBe(12288);
      expect(picoModelProviderEffectiveEntry(record!).measurement.capacity.contextTokens)
        .toBe(12288);
      expect(store.list()).toHaveLength(1);
    } finally {
      close();
    }
  });

  it('refuses to widen through the store, not only through the function', async () => {
    const { registry: store, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      expect(() => store.narrow('qwen3-14b', { contextTokens: 65536 }, '2026-08-13T18:01:00.000Z'))
        .toThrow('context_wider_than_measured');
      // Nothing was written.
      expect(store.get('qwen3-14b')?.narrowing.contextTokens).toBeUndefined();
    } finally {
      close();
    }
  });

  it('drops a narrowing when the host is measured again', async () => {
    // A preference expressed against numbers that no longer describe the host
    // means something else now, and guessing which is not a database's job.
    const { registry: store, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      store.narrow('qwen3-14b', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');
      store.put(entry({
        measurement: {
          measuredAt: '2026-09-01T09:00:00.000Z',
          capacity: {
            contextTokens: 8192,
            generationTokensPerSecond: 20,
            promptTokensPerSecond: 1200,
            concurrentJobs: 1,
          },
          residency: { coldLoadMs: 5000, reloadMs: 4000, keepAliveMs: 300_000 },
        },
      }), '2026-09-01T09:05:00.000Z');

      const record = store.get('qwen3-14b');
      expect(record?.entry.measurement.capacity.contextTokens).toBe(8192);
      expect(record?.narrowing.contextTokens).toBeUndefined();
    } finally {
      close();
    }
  });

  it('keeps a narrowing when the same measurement is written again', async () => {
    const { registry: store, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      store.narrow('qwen3-14b', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');
      store.put(entry(), '2026-08-13T18:02:00.000Z');
      expect(store.get('qwen3-14b')?.narrowing.contextTokens).toBe(12288);
    } finally {
      close();
    }
  });
});

describe('ADR 0152 - a shared finding with per-person decisions attached', () => {
  const alice = 'a'.repeat(64);
  const bob = 'b'.repeat(64);

  it('gives a person with no decision no provider at all', async () => {
    // ADR 0138's title is the rule: reaching outside is off until somebody
    // says so. An absent row is an absent decision, never a quiet yes.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      expect(consent.entryFor('qwen3-14b', alice)).toBeUndefined();
      expect(consent.listFor(alice)).toHaveLength(0);
    } finally {
      close();
    }
  });

  it('lets two residents answer differently about the same box', async () => {
    // ADR 0048: the declaration is a judgement about premises. The housemate's
    // NAS in the hall is mine and not yours, and the finding is the same box.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      consent.decide({
        entryId: 'qwen3-14b',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-13T18:01:00.000Z',
      });
      consent.decide({
        entryId: 'qwen3-14b',
        picoIdentityFingerprintHex: bob,
        providerClass: 'pico_endpoint',
        carries: 'live_turn',
        at: '2026-08-13T18:02:00.000Z',
      });

      expect(consent.entryFor('qwen3-14b', alice)?.providerClass).toBe('declared_own_host');
      expect(consent.entryFor('qwen3-14b', bob)?.providerClass).toBe('pico_endpoint');
      // One finding underneath both.
      expect(consent.entryFor('qwen3-14b', alice)?.model.digestHex)
        .toBe(consent.entryFor('qwen3-14b', bob)?.model.digestHex);
    } finally {
      close();
    }
  });

  it('refuses a decision that could not produce an entry, where it is made', async () => {
    // ADR 0151 PV4. The wider allowance without a credential does not parse,
    // and the refusal belongs at the moment of deciding rather than on read.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      expect(() => consent.decide({
        entryId: 'qwen3-14b',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn_and_retrieved_memory',
        at: '2026-08-13T18:01:00.000Z',
      })).toThrow('pico_model_provider_allowance_without_credential');
      expect(consent.entryFor('qwen3-14b', alice)).toBeUndefined();
    } finally {
      close();
    }
  });

  it('carries the narrowing into every person\'s entry', async () => {
    // SE4 is about the finding, so it applies to everyone who uses it.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      store.narrow('qwen3-14b', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');
      consent.decide({
        entryId: 'qwen3-14b',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-13T18:02:00.000Z',
      });
      expect(consent.entryFor('qwen3-14b', alice)?.measurement.capacity.contextTokens)
        .toBe(12288);
    } finally {
      close();
    }
  });

  it('revokes without forgetting that a decision was once made', async () => {
    // "Withdrew on the 14th" and "was never asked" are different facts, and a
    // surface showing them alike would be inventing one of them.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      consent.decide({
        entryId: 'qwen3-14b',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-13T18:01:00.000Z',
      });
      expect(consent.entryFor('qwen3-14b', alice)).toBeDefined();

      consent.revoke('qwen3-14b', alice, '2026-08-14T09:00:00.000Z');
      expect(consent.entryFor('qwen3-14b', alice)).toBeUndefined();

      // And deciding again brings it back rather than being blocked by the row.
      consent.decide({
        entryId: 'qwen3-14b',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-14T10:00:00.000Z',
      });
      expect(consent.entryFor('qwen3-14b', alice)).toBeDefined();
    } finally {
      close();
    }
  });
});
