import { describe, expect, it } from 'vitest';
import {
  picoModelIsReachable,
  picoModelProviderState,
} from './model-provider-state.js';

/**
 * ADR 0152 SE5 with ADR 0118 O2/O4. A provider's state is derived from what
 * the queue already knows, and the derivation has to keep three things apart
 * that a simpler one would collapse.
 */
describe('ADR 0152 SE5 - working and gone are different absences', () => {
  it('says working while a job is with the provider', () => {
    // One ends by itself and the other needs somebody. A single "unavailable"
    // would send a person to restart a machine that is loading a model.
    expect(picoModelProviderState({ jobInFlight: true })).toBe('working');
    expect(picoModelProviderState({ jobInFlight: true, lastOutcome: 'provider_unreachable' }))
      .toBe('working');
  });

  it('says gone for an unreachable provider and for one that ran out of time', () => {
    // ADR 0118 O2: a provider that answers too slowly is unavailable, not
    // slow - and the deadline it exceeded was built from its own measurement.
    for (const outcome of ['provider_unreachable', 'provider_did_not_answer_in_time']) {
      expect(picoModelProviderState({ jobInFlight: false, lastOutcome: outcome }))
        .toBe('did_not_answer');
    }
  });

  it('gives a changed model its own state rather than filing it under failure', () => {
    // ADR 0142 PE6. The remedy is a person's decision to re-pin, which no
    // retry reaches, and SE5 says it appears as a sentence rather than as a
    // warning somebody can wave away.
    expect(picoModelProviderState({
      jobInFlight: false,
      lastOutcome: 'model_is_not_the_measured_one',
    })).toBe('different_model');
  });
});

describe('ADR 0152 SE5 - a job\'s own refusal is not the provider\'s state', () => {
  it('leaves the provider unjudged when the job was refused for what it was', () => {
    // A role that may not run on this class, an entry that may not carry these
    // words, an answer in the wrong shape: all facts about that job. Rendering
    // them as a broken machine would send somebody to fix what is working.
    for (const outcome of [
      'role_outside_trust_boundary',
      'entry_may_not_carry_these_words',
      'answer_was_not_the_declared_shape',
    ]) {
      expect(picoModelProviderState({ jobInFlight: false, lastOutcome: outcome }))
        .toBe('not_used_yet');
    }
  });

  it('treats an outcome nobody classified as no evidence at all', () => {
    // A closed list rather than a default in either direction: an outcome
    // added later must not silently become proof that a machine is down.
    expect(picoModelProviderState({ jobInFlight: false, lastOutcome: 'something_new' }))
      .toBe('not_used_yet');
  });

  it('says nothing has been asked when nothing has settled', () => {
    expect(picoModelProviderState({ jobInFlight: false })).toBe('not_used_yet');
  });
});

describe('ADR 0118 O4 - no_model needs a settled failure, not a quiet Home', () => {
  it('is not knowable with no decided provider', () => {
    // A Home with no provider is not a Home whose provider is down, and an
    // unset field states nothing.
    expect(picoModelIsReachable([])).toBeUndefined();
  });

  it('is not knowable when nothing has been asked yet', () => {
    expect(picoModelIsReachable(['not_used_yet', 'not_used_yet'])).toBeUndefined();
  });

  it('is reachable when one answers, whatever the others did', () => {
    // The absence is about whether summaries can happen at all, not about any
    // one machine.
    expect(picoModelIsReachable(['did_not_answer', 'answered'])).toBe(true);
    expect(picoModelIsReachable(['did_not_answer', 'working'])).toBe(true);
  });

  it('is absent when every decided provider failed or changed model', () => {
    expect(picoModelIsReachable(['did_not_answer'])).toBe(false);
    expect(picoModelIsReachable(['different_model', 'did_not_answer'])).toBe(false);
    // A pinned model that is no longer served is a provider Pico will not send
    // to, which is the same consequence for the person as one that is down.
    expect(picoModelIsReachable(['different_model'])).toBe(false);
  });
});
