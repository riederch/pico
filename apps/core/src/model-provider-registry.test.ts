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
    entryId: 'a-measured-host',
    providerClass: 'declared_own_host',
    reach: 'http://provider.invalid:11434',
    model: { identifier: 'a-model:measured', digestHex: 'b'.repeat(64) },
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
      store.narrow('a-measured-host', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');

      const record = store.get('a-measured-host');
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
      expect(() => store.narrow('a-measured-host', { contextTokens: 65536 }, '2026-08-13T18:01:00.000Z'))
        .toThrow('context_wider_than_measured');
      // Nothing was written.
      expect(store.get('a-measured-host')?.narrowing.contextTokens).toBeUndefined();
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
      store.narrow('a-measured-host', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');
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

      const record = store.get('a-measured-host');
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
      store.narrow('a-measured-host', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');
      store.put(entry(), '2026-08-13T18:02:00.000Z');
      expect(store.get('a-measured-host')?.narrowing.contextTokens).toBe(12288);
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
      expect(consent.entryFor('a-measured-host', alice)).toBeUndefined();
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
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-13T18:01:00.000Z',
      });
      consent.decide({
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: bob,
        providerClass: 'pico_endpoint',
        carries: 'live_turn',
        at: '2026-08-13T18:02:00.000Z',
      });

      expect(consent.entryFor('a-measured-host', alice)?.providerClass).toBe('declared_own_host');
      expect(consent.entryFor('a-measured-host', bob)?.providerClass).toBe('pico_endpoint');
      // One finding underneath both.
      expect(consent.entryFor('a-measured-host', alice)?.model.digestHex)
        .toBe(consent.entryFor('a-measured-host', bob)?.model.digestHex);
    } finally {
      close();
    }
  });

  it('refuses a class outside ADR 0048\'s list', async () => {
    // The list is closed, and a decision naming something else is not a typo
    // to be corrected - it is a class nobody decided existed.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      expect(() => consent.decide({
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: alice,
        providerClass: 'somebody_elses_basement' as never,
        carries: 'live_turn',
        at: '2026-08-13T18:01:00.000Z',
      })).toThrow('invalid_pico_model_provider_class');
    } finally {
      close();
    }
  });

  it('gives no entry when the finding it was decided about is gone', async () => {
    // A decision outlives the measurement it was made against, and that is not
    // a reason to invent one: an entry is what a person's decisions make of a
    // finding, so without the finding there is nothing for them to have made.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      consent.decide({
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-13T18:01:00.000Z',
      });
      expect(consent.entryFor('a-measured-host', alice)).toBeDefined();

      store.remove('a-measured-host');
      expect(consent.entryFor('a-measured-host', alice)).toBeUndefined();
      expect(consent.listFor(alice)).toHaveLength(0);
    } finally {
      close();
    }
  });

  it('refuses a decision that could not produce an entry, where it is made', async () => {
    // ADR 0151 PV4. The wider allowance without a credential does not parse,
    // and the refusal belongs at the moment of deciding rather than on read.
    // Said about a class with another end: `declared_own_host` has none, and
    // carries it without a credential since 2026-09-01.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      expect(() => consent.decide({
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: alice,
        providerClass: 'pico_endpoint',
        carries: 'live_turn_and_retrieved_memory',
        at: '2026-08-13T18:01:00.000Z',
      })).toThrow('pico_model_provider_allowance_without_credential');
      expect(consent.entryFor('a-measured-host', alice)).toBeUndefined();
    } finally {
      close();
    }
  });

  it('carries the narrowing into every person\'s entry', async () => {
    // SE4 is about the finding, so it applies to everyone who uses it.
    const { registry: store, consent, close } = await registry();
    try {
      store.put(entry(), '2026-08-13T18:00:00.000Z');
      store.narrow('a-measured-host', { contextTokens: 12288 }, '2026-08-13T18:01:00.000Z');
      consent.decide({
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-13T18:02:00.000Z',
      });
      expect(consent.entryFor('a-measured-host', alice)?.measurement.capacity.contextTokens)
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
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-13T18:01:00.000Z',
      });
      expect(consent.entryFor('a-measured-host', alice)).toBeDefined();

      consent.revoke('a-measured-host', alice, '2026-08-14T09:00:00.000Z');
      expect(consent.entryFor('a-measured-host', alice)).toBeUndefined();

      // And deciding again brings it back rather than being blocked by the row.
      consent.decide({
        entryId: 'a-measured-host',
        picoIdentityFingerprintHex: alice,
        providerClass: 'declared_own_host',
        carries: 'live_turn',
        at: '2026-08-14T10:00:00.000Z',
      });
      expect(consent.entryFor('a-measured-host', alice)).toBeDefined();
    } finally {
      close();
    }
  });
});

describe('ADR 0104 S3 - an inherited value never overwrites a decided one', () => {
  it('keeps a person\'s answer when a later boot reads the host option', async () => {
    // Reading a host option is Pico noticing what it was booted with. A person
    // answering is a person answering, and letting the first replace the
    // second would put the add-on option back in charge through the door this
    // table exists to close.
    const dir = mkdtempSync(join(tmpdir(), 'pico-encryption-'));
    dirs.push(dir);
    const store = await EventStore.open(join(dir, 'pico.sqlite'), {});
    try {
      store.decidePicoMemoryEncryption({
        enabled: true,
        at: '2026-08-14T10:00:00.000Z',
        inheritedFromHost: false,
      });
      store.decidePicoMemoryEncryption({
        enabled: false,
        at: '2026-08-14T11:00:00.000Z',
        inheritedFromHost: true,
      });
      expect(store.picoMemoryEncryptionDecision()).toEqual({
        enabled: true,
        decidedAt: '2026-08-14T10:00:00.000Z',
        inheritedFromHost: false,
      });
    } finally {
      store.close();
    }
  });

  it('lets a person change an inherited value, and a later answer change that', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-encryption-2-'));
    dirs.push(dir);
    const store = await EventStore.open(join(dir, 'pico.sqlite'), {});
    try {
      store.decidePicoMemoryEncryption({
        enabled: false,
        at: '2026-08-14T10:00:00.000Z',
        inheritedFromHost: true,
      });
      store.decidePicoMemoryEncryption({
        enabled: true,
        at: '2026-08-14T11:00:00.000Z',
        inheritedFromHost: false,
      });
      expect(store.picoMemoryEncryptionDecision()?.enabled).toBe(true);
      expect(store.picoMemoryEncryptionDecision()?.inheritedFromHost).toBe(false);
    } finally {
      store.close();
    }
  });
});
