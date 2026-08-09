import { describe, expect, it } from 'vitest';
import {
  isPicoSpatialConfidenceAtLeast,
  lowerPicoSpatialConfidence,
  parsePicoLocationFix,
  parsePicoMobilitySample,
  parsePicoParkingCandidate,
  picoDistanceM,
  picoMobilityKinds,
  picoSpatialConfidences,
} from './spatial-recall.js';

const fix = {
  at: '2026-08-07T08:36:00.000Z',
  latitudeDeg: 48.2,
  longitudeDeg: 16.37,
  accuracyM: 12,
};

const candidate = {
  ...fix,
  parkedAt: fix.at,
  confidence: 'high',
  status: 'candidate',
  sourceTransitionAt: fix.at,
} as Record<string, unknown>;
delete candidate.at;

describe('ADR 0129 SR1 the closed vocabularies', () => {
  it('lists the mobility kinds a classifier may report, including the gap', () => {
    // `unknown` is a member rather than an absence: a classifier that cannot
    // tell must be able to say so, and a surface treating silence as
    // `stationary` would invent a fact.
    expect([...picoMobilityKinds]).toEqual([
      'stationary', 'walking', 'cycling', 'car', 'public_transport', 'unknown',
    ]);
  });

  it('offers three certainties rather than a number', () => {
    // Nothing here computes a calibrated probability, and 0.73 would claim one.
    expect([...picoSpatialConfidences]).toEqual(['low', 'medium', 'high']);
  });

  it('takes the lower of two certainties and compares against a floor', () => {
    expect(lowerPicoSpatialConfidence('high', 'low')).toBe('low');
    expect(lowerPicoSpatialConfidence('medium', 'high')).toBe('medium');
    expect(lowerPicoSpatialConfidence('high', 'high')).toBe('high');
    expect(isPicoSpatialConfidenceAtLeast('medium', 'medium')).toBe(true);
    expect(isPicoSpatialConfidenceAtLeast('low', 'medium')).toBe(false);
  });
});

describe('ADR 0129 SR1 a position without its accuracy is unusable', () => {
  it('accepts a well-formed fix and freezes it', () => {
    const parsed = parsePicoLocationFix(fix);
    expect(parsed.accuracyM).toBe(12);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ['no accuracy at all', { at: fix.at, latitudeDeg: 48.2, longitudeDeg: 16.37 }, 'invalid_pico_location_fix'],
    ['a zero accuracy claiming a perfect reading', { ...fix, accuracyM: 0 }, 'invalid_pico_place_accuracy'],
    ['a negative accuracy', { ...fix, accuracyM: -5 }, 'invalid_pico_place_accuracy'],
    ['a latitude off the planet', { ...fix, latitudeDeg: 91 }, 'invalid_pico_place_latitude'],
    ['a longitude off the planet', { ...fix, longitudeDeg: 181 }, 'invalid_pico_place_longitude'],
    ['a NaN coordinate', { ...fix, latitudeDeg: Number.NaN }, 'invalid_pico_place_latitude'],
    ['a non-canonical instant', { ...fix, at: '2026-08-07 08:36:00Z' }, 'invalid_pico_location_fix_at'],
    ['an unrecognised field', { ...fix, speedMps: 3 }, 'invalid_pico_location_fix'],
  ])('refuses %s', (_name, value, reason) => {
    expect(() => parsePicoLocationFix(value)).toThrow(reason);
  });
});

describe('ADR 0129 SR1 mobility samples and parking candidates', () => {
  it('accepts a well-formed sample', () => {
    const parsed = parsePicoMobilitySample({
      at: fix.at, mobility: 'car', confidence: 'high',
    });
    expect(parsed.mobility).toBe('car');
  });

  it.each([
    ['a kind nobody defined', { at: fix.at, mobility: 'scooter', confidence: 'high' }, 'invalid_pico_mobility_sample_kind'],
    ['a numeric confidence', { at: fix.at, mobility: 'car', confidence: 0.9 }, 'invalid_pico_mobility_sample_confidence'],
    ['a missing field', { at: fix.at, mobility: 'car' }, 'invalid_pico_mobility_sample'],
  ])('refuses %s', (_name, value, reason) => {
    expect(() => parsePicoMobilitySample(value)).toThrow(reason);
  });

  it('validates a candidate\'s position through the same code as a fix', () => {
    // One implementation, so the two cannot drift into disagreeing about what
    // a usable position is.
    expect(() => parsePicoParkingCandidate(candidate)).not.toThrow();
    expect(() => parsePicoParkingCandidate({ ...candidate, accuracyM: 0 }))
      .toThrow('invalid_pico_place_accuracy');
  });

  it.each([
    ['a status nobody defined', { ...candidate, status: 'maybe' }, 'invalid_pico_parking_candidate_status'],
    ['a confidence nobody defined', { ...candidate, confidence: 'certain' }, 'invalid_pico_parking_candidate_confidence'],
    ['no source transition', { ...candidate, sourceTransitionAt: undefined }, 'invalid_pico_parking_candidate'],
  ])('refuses %s', (_name, value, reason) => {
    expect(() => parsePicoParkingCandidate(value)).toThrow(reason);
  });
});

describe('ADR 0129 distance', () => {
  it('measures a short walk in metres', () => {
    // One degree of latitude is about 111.32 km, so 0.001 deg is about 111 m.
    expect(picoDistanceM(
      { latitudeDeg: 48.2, longitudeDeg: 16.37 },
      { latitudeDeg: 48.201, longitudeDeg: 16.37 },
    )).toBeCloseTo(111.2, 0);
  });

  it('is zero for a point against itself and symmetric between two', () => {
    const a = { latitudeDeg: 48.2, longitudeDeg: 16.37 };
    const b = { latitudeDeg: 48.25, longitudeDeg: 16.4 };
    expect(picoDistanceM(a, a)).toBe(0);
    expect(picoDistanceM(a, b)).toBeCloseTo(picoDistanceM(b, a), 6);
  });

  it('stays sane across the antimeridian rather than measuring the long way', () => {
    expect(picoDistanceM(
      { latitudeDeg: 0, longitudeDeg: 179.999 },
      { latitudeDeg: 0, longitudeDeg: -179.999 },
    )).toBeLessThan(500);
  });
});
