import { describe, expect, it } from 'vitest';
import {
  maxPicoObservationAgeMs,
  maxPicoObservationPayloadChars,
  parsePicoObservation,
  picoObservationKinds,
} from './observation.js';

const fix = {
  kind: 'location_fix',
  privacyDomain: 'domain-private',
  observedAt: '2026-08-09T12:00:00.000Z',
  payload: JSON.stringify({ latitudeDeg: 48.2, longitudeDeg: 16.37, accuracyM: 10 }),
};

describe('ADR 0129 SR2 the observation vocabulary', () => {
  it('lists the kinds a producer may write', () => {
    expect([...picoObservationKinds]).toEqual(['location_fix', 'mobility_sample']);
  });

  it('holds a window that answers the question it exists for', () => {
    // A car left last night and asked about tomorrow morning is more than
    // twenty-four hours; a week would be a movement profile rather than a
    // working buffer.
    expect(maxPicoObservationAgeMs).toBe(48 * 60 * 60 * 1_000);
    expect(maxPicoObservationAgeMs).toBeGreaterThan(24 * 60 * 60 * 1_000);
    expect(maxPicoObservationAgeMs).toBeLessThan(7 * 24 * 60 * 60 * 1_000);
  });

  it('accepts a well-formed reading and freezes it', () => {
    const parsed = parsePicoObservation(fix);
    expect(parsed.kind).toBe('location_fix');
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ['a kind nobody defined', { ...fix, kind: 'heart_rate' }, 'invalid_pico_observation_kind'],
    ['no domain to shred by', { ...fix, privacyDomain: '   ' }, 'invalid_pico_observation_domain'],
    ['a non-canonical instant', { ...fix, observedAt: '2026-08-09 12:00:00Z' }, 'invalid_pico_observation_observed_at'],
    ['an empty payload', { ...fix, payload: '' }, 'invalid_pico_observation_payload'],
    ['a payload large enough to be content', { ...fix, payload: 'x'.repeat(maxPicoObservationPayloadChars + 1) }, 'invalid_pico_observation_payload'],
    ['a field this shape cannot govern', { ...fix, retentionPolicyRef: 'short' }, 'invalid_pico_observation'],
    ['a missing field', { kind: 'location_fix', privacyDomain: 'd' }, 'invalid_pico_observation'],
  ])('refuses %s', (_name, value, reason) => {
    expect(() => parsePicoObservation(value)).toThrow(reason);
  });

  it('has no room for the things a memory item carries', () => {
    // An observation is never individually governed: no retention policy, no
    // origin class, no readership decision, no deletion state. The exact-key
    // rule is what keeps that true rather than a comment saying so.
    const parsed = parsePicoObservation(fix);
    expect(Object.keys(parsed).sort())
      .toEqual(['kind', 'observedAt', 'payload', 'privacyDomain']);
  });
});
