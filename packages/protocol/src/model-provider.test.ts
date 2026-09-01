import { describe, expect, it } from 'vitest';
import {
  assertPicoModelProviderMayCarry,
  parsePicoModelProviderEntry,
  picoModelProviderClassMayCarryRetrievedMemory,
  picoModelProviderDigestMatches,
  picoModelProviderEntrySaysNothingAbout,
  picoModelProviderEntrySchema,
  picoModelProviderMayCarry,
} from './model-provider.js';

/**
 * ADR 0142 and ADR 0151. The entry, and the four things it cannot say.
 *
 * The positive case is the host ADR 0142 was written against, with its own
 * numbers: a 32768-declaring model served at 8192 tokens, one lane, 31 s
 * cold and 8 s warm. Using the real measurements rather than round ones is the
 * point - a fixture of 1000s would pass a parser that had quietly dropped the
 * relationship between two of them.
 */
const measuredHost = {
  schema: picoModelProviderEntrySchema,
  entryId: 'a-measured-host',
  providerClass: 'declared_own_host',
  reach: 'http://provider.invalid:11434',
  model: { identifier: 'a-model:measured', digestHex: 'a'.repeat(64) },
  measurement: {
    measuredAt: '2026-08-10T18:00:00.000Z',
    capacity: {
      contextTokens: 8192,
      generationTokensPerSecond: 17.8,
      promptTokensPerSecond: 1152,
      concurrentJobs: 1,
    },
    residency: { coldLoadMs: 31_000, reloadMs: 8_000, keepAliveMs: 300_000 },
  },
  carries: 'live_turn',
} as const;

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(measuredHost), ...overrides };
}

describe('ADR 0142 - an entry describes one measured deployment', () => {
  it('accepts the host it was written against', () => {
    const parsed = parsePicoModelProviderEntry(entry());
    expect(parsed.measurement.capacity.contextTokens).toBe(8192);
    expect(parsed.measurement.capacity.concurrentJobs).toBe(1);
    expect(parsed.credentialRef).toBeUndefined();
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('has nowhere to write what the model claims about itself', () => {
    // PE2. Not an unknown field with a shrug - the four are refused by name,
    // because writing one is asking for the thing the contract removed.
    for (const field of Object.keys(picoModelProviderEntrySaysNothingAbout)) {
      expect(() => parsePicoModelProviderEntry(entry({ [field]: 32768 })))
        .toThrow(new RegExp(`says_nothing_about_${field}`, 'u'));
    }
  });

  it('cannot state a capacity without the moment it was observed', () => {
    const { measuredAt: _dropped, ...rest } = measuredHost.measurement;
    expect(() => parsePicoModelProviderEntry(entry({ measurement: rest })))
      .toThrow('invalid_pico_model_provider_measurement');
    expect(() => parsePicoModelProviderEntry(entry({
      measurement: { ...structuredClone(measuredHost.measurement), measuredAt: 'someday' },
    }))).toThrow('invalid_pico_model_provider_measured_at');
  });

  it('refuses a reload that costs more than a cold load', () => {
    expect(() => parsePicoModelProviderEntry(entry({
      measurement: {
        ...structuredClone(measuredHost.measurement),
        residency: { coldLoadMs: 8_000, reloadMs: 31_000, keepAliveMs: 300_000 },
      },
    }))).toThrow('pico_model_provider_reload_exceeds_cold_load');
  });

  it('refuses a tag without a digest behind it', () => {
    // PE6. The same port answers unauthenticated pull, so a tag is a name
    // somebody else can move.
    expect(() => parsePicoModelProviderEntry(entry({
      model: { identifier: 'a-model:measured', digestHex: 'not-a-digest' },
    }))).toThrow('invalid_pico_model_provider_model_digest');
  });

  it('answers whether the model running is the model measured', () => {
    const parsed = parsePicoModelProviderEntry(entry());
    expect(picoModelProviderDigestMatches(parsed, 'a'.repeat(64))).toBe(true);
    expect(picoModelProviderDigestMatches(parsed, 'b'.repeat(64))).toBe(false);
    expect(picoModelProviderDigestMatches(parsed, 'A'.repeat(64))).toBe(false);
  });

  it('takes a reach as reachability and never as identity', () => {
    expect(() => parsePicoModelProviderEntry(entry({ reach: 'stdio:///usr/bin/server' })))
      .toThrow('pico_model_provider_reach_is_not_a_network_transport');
    expect(() => parsePicoModelProviderEntry(entry({
      reach: 'https://user:secret@provider.invalid:11434',
    }))).toThrow('pico_model_provider_reach_carries_a_credential');
  });
});

describe('ADR 0151 - the proof buys the memory, not the provider', () => {
  it('lets an unauthenticated entry exist, carrying the live turn', () => {
    // PV1. This is the whole amendment to PE5: narrow rather than ineligible.
    const parsed = parsePicoModelProviderEntry(entry());
    expect(parsed.carries).toBe('live_turn');
  });

  it('cannot write the wider allowance without the thing that earns it', () => {
    // PV4, and the construction matters: this is not a validation message
    // about a missing field, it is that there is no such entry. Said about a
    // class that *has* another end - the exception below is about the one
    // that does not.
    expect(() => parsePicoModelProviderEntry(entry({
      providerClass: 'pico_endpoint',
      carries: 'live_turn_and_retrieved_memory',
    }))).toThrow('pico_model_provider_allowance_without_credential');
  });

  it('lets a machine the person declares is theirs carry it with no credential', () => {
    /**
     * PV4's exception, decided 2026-09-01. A credential answers *who* is on
     * the other end; `declared_own_host` has no other end, so a secret would
     * be one the person holds at both ends and proves to nobody.
     *
     * The plain-HTTP reach is the point rather than an oversight: this is the
     * ordinary self-hosted case, and PV5 would refuse a credential here - which
     * is exactly why demanding one closed the whole memory path (Roadmap B39).
     */
    const parsed = parsePicoModelProviderEntry(entry({
      reach: 'http://127.0.0.1:11434',
      carries: 'live_turn_and_retrieved_memory',
    }));
    expect(parsed.carries).toBe('live_turn_and_retrieved_memory');
    expect(parsed.credentialRef).toBeUndefined();
  });

  it('accepts the wider allowance once a credential stands behind it', () => {
    const parsed = parsePicoModelProviderEntry(entry({
      reach: 'https://provider.invalid:11434',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'lan-inference-token',
    }));
    expect(parsed.carries).toBe('live_turn_and_retrieved_memory');
    expect(parsed.credentialRef).toBe('lan-inference-token');
  });

  it('refuses an allowance nobody declared', () => {
    expect(() => parsePicoModelProviderEntry(entry({ carries: 'everything' })))
      .toThrow('invalid_pico_model_provider_allowance');
  });

  it('refuses a credential reference that is not a name', () => {
    // ADR 0138 CO1 holds the credential; this field holds a name for it, and
    // something that is not a name is not a reference to anything.
    expect(() => parsePicoModelProviderEntry(entry({
      reach: 'https://provider.invalid:11434',
      credentialRef: 'not a name',
    }))).toThrow('invalid_pico_model_provider_credential_ref');
  });

  it('refuses a credential its transport does not protect', () => {
    // PV5. Refused outright rather than narrowed - a token over plain HTTP
    // distinguishes the provider from nobody and only looks as though it does.
    expect(() => parsePicoModelProviderEntry(entry({
      credentialRef: 'lan-inference-token',
    }))).toThrow('pico_model_provider_credential_on_unprotected_transport');
  });

  it('keeps the class out of the allowance, both ways', () => {
    // PV2. A credential proves who answers; it does not make a hosted API into
    // the person's own hardware.
    expect(() => parsePicoModelProviderEntry(entry({
      providerClass: 'cloud_connector',
      reach: 'https://api.example.invalid',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'hosted-api-key',
    }))).toThrow('pico_model_provider_class_may_not_carry_retrieved_memory');

    expect(parsePicoModelProviderEntry(entry({
      providerClass: 'cloud_connector',
      reach: 'https://api.example.invalid',
      credentialRef: 'hosted-api-key',
    })).carries).toBe('live_turn');

    expect(picoModelProviderClassMayCarryRetrievedMemory('cloud_connector')).toBe(false);
    expect(picoModelProviderClassMayCarryRetrievedMemory('declared_own_host')).toBe(true);
    expect(picoModelProviderClassMayCarryRetrievedMemory('same_device')).toBe(true);
  });

  it('asks what the job needs, not what the provider wishes', () => {
    // PV3. The allowance travels with the job; a job does not become sendable
    // by the provider it lands on.
    const narrow = parsePicoModelProviderEntry(entry());
    const wide = parsePicoModelProviderEntry(entry({
      reach: 'https://provider.invalid:11434',
      carries: 'live_turn_and_retrieved_memory',
      credentialRef: 'lan-inference-token',
    }));

    expect(picoModelProviderMayCarry(narrow, 'live_turn')).toBe(true);
    expect(picoModelProviderMayCarry(narrow, 'live_turn_and_retrieved_memory')).toBe(false);
    expect(picoModelProviderMayCarry(wide, 'live_turn')).toBe(true);
    expect(picoModelProviderMayCarry(wide, 'live_turn_and_retrieved_memory')).toBe(true);

    expect(() => assertPicoModelProviderMayCarry(narrow, 'live_turn_and_retrieved_memory'))
      .toThrow('pico_model_provider_may_not_carry_retrieved_memory');
    expect(() => assertPicoModelProviderMayCarry(wide, 'live_turn_and_retrieved_memory'))
      .not.toThrow();
  });
});
