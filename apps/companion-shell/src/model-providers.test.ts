import { describe, expect, it } from 'vitest';
import {
  parsePicoCompanionAnsweredReads,
  picoCompanionAnsweredReadLines,
  parsePicoCompanionModelProviders,
  picoCompanionModelProviderLines,
  type PicoCompanionModelProvider,
} from './contract.js';

/**
 * ADR 0152 SE1 on the device, tested where the words are chosen.
 *
 * The renderer prints these strings and decides nothing, which is the only
 * arrangement in which a rule about wording can be held to anything.
 */
function provider(overrides: Partial<PicoCompanionModelProvider> = {}): PicoCompanionModelProvider {
  return {
    entryId: 'a-measured-host',
    model: 'a-model:measured',
    contextTokens: 40960,
    measuredAt: '2026-08-13T17:43:04.923Z',
    decided: false,
    sees: 'nothing yet - you have not decided about this one',
    needsCredentialToSeeMore: true,
    ...overrides,
  };
}

describe('ADR 0152 SE1 - three states, and never two', () => {
  it('says an undecided provider is undecided, not off', () => {
    // ADR 0138: reaching outside is off until somebody says so. "Off" is an
    // answer somebody gave, and nobody gave one - a person should be able to
    // tell "not yet asked" from "answered no".
    const [line] = picoCompanionModelProviderLines([provider()]);
    expect(line?.headline).toBe('a-model:measured is available and you have not decided about it');
    expect(line?.detail).toBe('Pico will not send anything here until you say so.');
    expect(line?.action).toBe('decide');
  });

  it('names the quiet outcome where the choice is, not in a help page', () => {
    // ADR 0151 recorded it as a negative consequence and left open where it
    // would be said: a person who never adds a credential gets a Pico whose
    // model never sees their memory, and nothing else will tell them.
    const [line] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: true }),
    ]);
    expect(line?.headline).toBe('a-model:measured sees this conversation');
    expect(line?.detail).toContain('does not see what Pico remembers');
    expect(line?.detail).toContain('prove who it is');
    expect(line?.action).toBe('widen');
  });

  it('offers exactly one thing to do per provider', () => {
    const actions = picoCompanionModelProviderLines([
      provider(),
      provider({ entryId: 'a', decided: true, needsCredentialToSeeMore: true }),
      provider({ entryId: 'b', decided: true, needsCredentialToSeeMore: false }),
    ]).map((line) => line.action);
    expect(actions).toEqual(['decide', 'widen', 'revoke']);
  });

  it('says the wider allowance can be withdrawn, because ADR 0048 makes it standing', () => {
    const [line] = picoCompanionModelProviderLines([
      provider({ decided: true, needsCredentialToSeeMore: false }),
    ]);
    expect(line?.headline).toBe('a-model:measured sees this conversation and what Pico remembers');
    expect(line?.detail).toBe('You can withdraw this at any time.');
  });
});

describe('ADR 0152 - what arrives from a Home is parsed, not trusted', () => {
  it('accepts the ADR 0107 reply shape', () => {
    expect(parsePicoCompanionModelProviders([provider()])).toHaveLength(1);
    expect(parsePicoCompanionModelProviders([])).toHaveLength(0);
  });

  it('refuses anything else, because this arrives over a wire', () => {
    expect(() => parsePicoCompanionModelProviders({})).toThrow('invalid_pico_companion_model_providers');
    expect(() => parsePicoCompanionModelProviders([null]))
      .toThrow('invalid_pico_companion_model_provider');
    for (const field of ['entryId', 'model', 'contextTokens', 'decided', 'sees'] as const) {
      const broken = { ...provider(), [field]: undefined };
      expect(() => parsePicoCompanionModelProviders([broken]))
        .toThrow('invalid_pico_companion_model_provider');
    }
  });
});

describe('ADR 0116 W5 - a waiting read says that it waits, not what it found', () => {
  const read = {
    jobId: 'job_library_abc',
    supplier: 'a-library',
    revision: 'c'.repeat(12),
    answeredAt: '2026-08-14T12:00:00.000Z',
  };

  it('never renders the answer, because the keep is what releases it', () => {
    // A headline that summarised the answer would be the answer, shown - and
    // the whole point of the keep is that the person decides before derived
    // output goes anywhere it stays.
    const [line] = picoCompanionAnsweredReadLines([read]);
    expect(line?.headline).toBe('Pico read something from a-library');
    expect(line?.detail).toContain('Keep it');
    expect(line?.detail).toContain('nothing is stored');
    expect(JSON.stringify(line)).not.toContain('march');
  });

  it('shows the revision, because that is the correction point', () => {
    // ADR 0133: if the answer turns out wrong, this says which version of the
    // material it was wrong about.
    const [line] = picoCompanionAnsweredReadLines([read]);
    expect(line?.detail).toContain(read.revision);
  });

  it('drops a value that arrived anyway rather than rendering it', () => {
    // This window has no place for one, and a field nobody declared is a field
    // nobody checked.
    const [parsed] = parsePicoCompanionAnsweredReads([
      { ...read, values: [{ name: 'month', value: 'march' }] },
    ]);
    expect(JSON.stringify(parsed)).not.toContain('march');
    expect(Object.keys(parsed!).sort())
      .toEqual(['answeredAt', 'jobId', 'revision', 'supplier']);
  });

  it('refuses what did not arrive in the declared shape', () => {
    expect(() => parsePicoCompanionAnsweredReads({}))
      .toThrow('invalid_pico_companion_answered_reads');
    for (const field of ['jobId', 'supplier', 'revision', 'answeredAt'] as const) {
      expect(() => parsePicoCompanionAnsweredReads([{ ...read, [field]: undefined }]))
        .toThrow('invalid_pico_companion_answered_read');
    }
  });
});
