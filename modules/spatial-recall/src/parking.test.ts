import { readFileSync } from 'node:fs';
import { parsePicoModuleManifest } from '@pico/protocol/module';
import {
  parsePicoParkingCandidate,
  type PicoLocationFix,
  type PicoMobilityKind,
  type PicoMobilitySample,
  type PicoParkingCandidate,
  type PicoSpatialConfidence,
} from '@pico/protocol/spatial-recall';
import { describe, expect, it } from 'vitest';
import { picoSpatialRecallModuleManifest } from './manifest.js';
import { picoMobilityTransitions } from './mobility.js';
import {
  defaultPicoParkingThresholds,
  picoDeriveParkingCandidate,
  picoParkingAnswer,
} from './parking.js';

/**
 * The reference sequence from issue #3, as synthetic samples: a drive, a stop,
 * a walk away. No sensor, no phone, no permission prompt - which is exactly
 * what ADR 0129's port decision buys.
 */
const base = Date.parse('2026-08-07T08:00:00.000Z');
const at = (minutes: number): string => new Date(base + minutes * 60_000).toISOString();

function sample(
  minutes: number,
  mobility: PicoMobilityKind,
  confidence: PicoSpatialConfidence = 'high',
): PicoMobilitySample {
  return { at: at(minutes), mobility, confidence };
}

/** Metres north of a fixed origin, so distances in a test read as distances. */
function fix(minutes: number, metresNorth: number, accuracyM = 10): PicoLocationFix {
  return {
    at: at(minutes),
    latitudeDeg: 48.2 + metresNorth / 111_320,
    longitudeDeg: 16.37,
    accuracyM,
  };
}

/** The issue's own example: car at 08:12, stationary 08:36, walking 08:38. */
const drive = {
  mobilitySamples: [
    sample(12, 'car'),
    sample(36, 'stationary'),
    sample(38, 'walking'),
    sample(41, 'walking'),
  ],
  locationFixes: [
    fix(12, 0),
    fix(35, 4_000),
    fix(36, 4_010),
    fix(38, 4_060),
    fix(41, 4_190),
  ],
};

describe('ADR 0129 the module declares itself', () => {
  it('ships a manifest the protocol accepts, causing nothing', () => {
    const parsed = parsePicoModuleManifest(picoSpatialRecallModuleManifest);
    expect(parsed.identifier).toBe('spatial-recall');
    expect(parsed.kind).toBe('product');
    // Deriving where a car was left changes a record, not the world.
    expect(parsed.effects).toEqual([]);
  });

  it('publishes every subpath it names and no barrel', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(manifest.exports).sort())
      .toEqual([...picoSpatialRecallModuleManifest.publishedSubpaths].sort());
    expect(Object.keys(manifest.exports)).not.toContain('.');
  });
});

describe('ADR 0129 SR1 transitions', () => {
  it('reports each change once, at the instant it was observed', () => {
    const transitions = picoMobilityTransitions(drive.mobilitySamples);
    expect(transitions.map((t) => `${t.from}->${t.to}@${t.at}`)).toEqual([
      `car->stationary@${at(36)}`,
      `stationary->walking@${at(38)}`,
    ]);
  });

  it('sorts before comparing, so a merged array is not a fact about the array', () => {
    const shuffled = [drive.mobilitySamples[2], drive.mobilitySamples[0], drive.mobilitySamples[1]]
      .filter((entry): entry is PicoMobilitySample => entry !== undefined);
    expect(picoMobilityTransitions(shuffled).map((t) => `${t.from}->${t.to}`))
      .toEqual(['car->stationary', 'stationary->walking']);
  });

  it('is only as sure as its ends', () => {
    const transitions = picoMobilityTransitions([
      sample(0, 'car', 'high'),
      sample(1, 'walking', 'medium'),
    ]);
    expect(transitions[0]?.confidence).toBe('medium');
  });

  it('caps anything touching a gap at low', () => {
    // `unknown` is a hole in the record, and a hole cannot support a confident
    // claim about what happened across it.
    const transitions = picoMobilityTransitions([
      sample(0, 'car', 'high'),
      sample(1, 'unknown', 'high'),
    ]);
    expect(transitions[0]?.confidence).toBe('low');
  });
});

describe('ADR 0129 SR1 deriving where the car was left', () => {
  it('answers the reference sequence with the vehicle position, not the walking one', () => {
    const candidate = picoDeriveParkingCandidate(drive);
    expect(candidate).toBeDefined();
    // 08:36, the stop - not 08:38 when walking was noticed.
    expect(candidate?.parkedAt).toBe(at(36));
    // The last fix while still in the car, not where the person now stands.
    expect(candidate?.latitudeDeg).toBeCloseTo(fix(36, 4_010).latitudeDeg, 10);
    expect(candidate?.confidence).toBe('high');
    expect(candidate?.status).toBe('candidate');
    // Whatever it builds must be something the protocol accepts.
    expect(() => parsePicoParkingCandidate(candidate)).not.toThrow();
  });

  it('says nothing rather than guessing when no car was involved', () => {
    expect(picoDeriveParkingCandidate({
      mobilitySamples: [sample(0, 'walking'), sample(10, 'stationary'), sample(20, 'walking')],
      locationFixes: [fix(0, 0), fix(20, 500)],
    })).toBeUndefined();
  });

  it('says nothing when the transitions are there and no position is', () => {
    // "Somewhere" helps nobody, and an answer with no place is worse than none.
    expect(picoDeriveParkingCandidate({
      mobilitySamples: drive.mobilitySamples,
      locationFixes: [],
    })).toBeUndefined();
  });

  it('takes the most recent parking, not the first one recorded', () => {
    const candidate = picoDeriveParkingCandidate({
      mobilitySamples: [
        sample(0, 'car'), sample(10, 'stationary'), sample(12, 'walking'),
        sample(60, 'car'), sample(90, 'stationary'), sample(92, 'walking'), sample(95, 'walking'),
      ],
      locationFixes: [
        fix(0, 0), fix(10, 1_000), fix(90, 9_000), fix(95, 9_200),
      ],
    });
    expect(candidate?.parkedAt).toBe(at(90));
  });

  it('handles a classifier that never emitted the stationary step', () => {
    // Usual, but not required: someone who got straight out was still parking.
    const candidate = picoDeriveParkingCandidate({
      mobilitySamples: [sample(0, 'car'), sample(30, 'walking'), sample(35, 'walking')],
      locationFixes: [fix(0, 0), fix(30, 5_000), fix(35, 5_150)],
    });
    expect(candidate?.parkedAt).toBe(at(30));
  });

  it('counts cycling away as leaving the car', () => {
    // Treating only walking as leaving would lose exactly the person who most
    // needs to be told where the car is.
    const candidate = picoDeriveParkingCandidate({
      mobilitySamples: [sample(0, 'car'), sample(30, 'stationary'), sample(32, 'cycling'), sample(40, 'cycling')],
      locationFixes: [fix(0, 0), fix(30, 5_000), fix(40, 6_000)],
    });
    expect(candidate?.parkedAt).toBe(at(30));
  });
});

describe('ADR 0129 SR4 confidence is earned, and every demotion has a reason', () => {
  const derive = (overrides: Partial<typeof drive>) =>
    picoDeriveParkingCandidate({ ...drive, ...overrides });

  it('demotes a position that was already stale when the car stopped', () => {
    // A fix from before the last stretch of the drive is a place the car drove
    // through, not where it came to rest.
    const candidate = derive({
      locationFixes: [fix(12, 0), fix(20, 3_000), fix(38, 4_060), fix(41, 4_190)],
    });
    expect(Date.parse(at(36)) - Date.parse(at(20)))
      .toBeGreaterThan(defaultPicoParkingThresholds.maxFixAgeMs);
    expect(candidate?.confidence).toBe('low');
  });

  it('demotes a position too wide to say which street', () => {
    const candidate = derive({
      locationFixes: [fix(12, 0), fix(36, 4_010, 400), fix(38, 4_060), fix(41, 4_190)],
    });
    expect(candidate?.confidence).toBe('low');
    expect(candidate?.accuracyM).toBe(400);
  });

  it('demotes when the person never actually went anywhere', () => {
    // Below the threshold they may still be at the car, loading it or standing
    // beside it, and calling that parked records the wrong moment.
    const candidate = derive({
      locationFixes: [fix(12, 0), fix(36, 4_010), fix(38, 4_020), fix(41, 4_030)],
    });
    expect(candidate?.confidence).toBe('medium');
  });

  it('demotes when the transitions themselves were unsure', () => {
    const candidate = derive({
      mobilitySamples: [
        sample(12, 'car'), sample(36, 'stationary', 'medium'),
        sample(38, 'walking'), sample(41, 'walking'),
      ],
    });
    expect(candidate?.confidence).toBe('medium');
  });

  it('needs all four to say high, so the counter-proof is one change away', () => {
    expect(derive({})?.confidence).toBe('high');
    for (const weakened of [
      { locationFixes: [fix(12, 0), fix(36, 4_010, 400), fix(41, 4_190)] },
      { locationFixes: [fix(12, 0), fix(36, 4_010), fix(38, 4_020)] },
      { mobilitySamples: [sample(12, 'car'), sample(36, 'stationary'), sample(38, 'walking', 'low'), sample(41, 'walking')] },
    ]) {
      expect(derive(weakened)?.confidence).not.toBe('high');
    }
  });
});

describe('ADR 0129 SR4 an answer carries its certainty', () => {
  const candidate = (
    confidence: PicoSpatialConfidence,
    status: PicoParkingCandidate['status'] = 'candidate',
    sourceMinutes = 36,
  ): PicoParkingCandidate => ({
    parkedAt: at(sourceMinutes),
    latitudeDeg: 48.2,
    longitudeDeg: 16.37,
    accuracyM: 10,
    confidence,
    status,
    sourceTransitionAt: at(sourceMinutes),
  });

  it('never reaches "known" from a derivation, at any confidence', () => {
    // The property this whole gate exists for: there is no code path from a
    // guess to a sentence stated as fact.
    for (const confidence of ['low', 'medium', 'high'] as const) {
      expect(picoParkingAnswer({ derived: candidate(confidence) }).outcome).not.toBe('known');
    }
  });

  it('separates likely from uncertain, and says unknown when it has nothing', () => {
    expect(picoParkingAnswer({ derived: candidate('high') }).outcome).toBe('likely');
    expect(picoParkingAnswer({ derived: candidate('medium') }).outcome).toBe('uncertain');
    expect(picoParkingAnswer({ derived: candidate('low') }).outcome).toBe('uncertain');
    expect(picoParkingAnswer({}).outcome).toBe('unknown');
  });

  it('lets a person\'s confirmation outrank a later re-reading of the same event', () => {
    const answer = picoParkingAnswer({
      derived: candidate('low'),
      recorded: candidate('high', 'confirmed'),
    });
    expect(answer.outcome).toBe('known');
    expect(answer.outcome === 'known' && answer.place.status).toBe('confirmed');
  });

  it('keeps a rejected candidate rejected, however much the derivation likes it', () => {
    expect(picoParkingAnswer({
      derived: candidate('high'),
      recorded: candidate('high', 'rejected'),
    }).outcome).toBe('unknown');
  });

  it('does not let yesterday\'s answer speak for a different, later parking', () => {
    // A person rejecting yesterday's guess has said nothing about today's, and
    // a confirmation from yesterday must not stand in front of today's car.
    expect(picoParkingAnswer({
      derived: candidate('high', 'candidate', 600),
      recorded: candidate('high', 'rejected', 36),
    }).outcome).toBe('likely');
    expect(picoParkingAnswer({
      derived: candidate('high', 'candidate', 600),
      recorded: candidate('high', 'confirmed', 36),
    }).outcome).toBe('likely');
  });
});
