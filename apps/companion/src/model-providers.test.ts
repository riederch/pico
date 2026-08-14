import { describe, expect, it, vi } from 'vitest';
import {
  decidePicoCompanionModelProvider,
  keepPicoCompanionAnsweredRead,
  readPicoCompanionAnsweredReads,
  readPicoCompanionModelProviders,
  readPicoCompanionModelReachability,
  revokePicoCompanionModelProvider,
} from './model-providers.js';

/**
 * ADR 0152 on the device side of the wire, where the words are not chosen and
 * the rules still are. The companion-shell tests hold the sentences; these
 * hold what may cross the channel at all.
 */
function linkClient(response: unknown) {
  return { request: vi.fn(async () => response) };
}

const provider = {
  entryId: 'a-measured-host',
  model: 'a-model:measured',
  contextTokens: 40960,
  measuredAt: '2026-08-13T17:43:04.923Z',
  decided: true,
  sees: 'this conversation only',
  needsCredentialToSeeMore: true,
};

describe('ADR 0107 - the reply is parsed rather than believed', () => {
  it('asks with no arguments and returns what it verified', async () => {
    const client = linkClient({ outcome: 'ok', result: { providers: [provider] } });

    expect(await readPicoCompanionModelProviders({
      livingDeviceLinkClient: client as never,
    })).toEqual([provider]);
    expect(client.request).toHaveBeenCalledWith('home.model.providers.read', {});
  });

  it('refuses a list whose entries are not the declared shape', async () => {
    // A companion that trusted the shape would be a companion whose window
    // says whatever arrives.
    for (const providers of [
      'not a list',
      [{ ...provider, contextTokens: '40960' }],
      [{ ...provider, decided: 'yes' }],
      [{ ...provider, sees: undefined }],
    ]) {
      await expect(readPicoCompanionModelProviders({
        livingDeviceLinkClient: linkClient({ outcome: 'ok', result: { providers } }) as never,
      })).rejects.toThrow(/invalid_pico_model_provider/u);
    }
  });

  it('names a refused read rather than showing an empty list', async () => {
    // An empty list from a refused read would tell the person nothing computes
    // for them when nobody actually looked.
    await expect(readPicoCompanionModelProviders({
      livingDeviceLinkClient: linkClient({
        outcome: 'sender_is_not_authorized',
        result: {},
      }) as never,
    })).rejects.toThrow(/model_providers_read_rejected:sender_is_not_authorized/u);
  });
});

describe('ADR 0151 PV4 - the refusal travels as itself', () => {
  it('carries what the decision needed instead of "something went wrong"', async () => {
    // The wider allowance is stated together with what earns it. A person told
    // only that it failed would have to guess that a credential was missing.
    await expect(decidePicoCompanionModelProvider({
      livingDeviceLinkClient: linkClient({
        outcome: 'invalid_arguments',
        result: { refusal: 'pico_model_provider_allowance_without_credential' },
      }) as never,
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn_and_retrieved_memory',
    })).rejects.toThrow(/pico_model_provider_allowance_without_credential/u);
  });

  it('falls back to the outcome when no refusal was named', async () => {
    await expect(decidePicoCompanionModelProvider({
      livingDeviceLinkClient: linkClient({ outcome: 'unavailable', result: {} }) as never,
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn',
    })).rejects.toThrow(/model_provider_decision_rejected:unavailable/u);
  });

  it('sends no credential field when there is none, rather than an empty one', async () => {
    // ADR 0117 X1's construction on the wire: an absent credential is an
    // absent field, and an empty string would be a credential reference that
    // refers to nothing.
    const client = linkClient({ outcome: 'ok', result: {} });

    await decidePicoCompanionModelProvider({
      livingDeviceLinkClient: client as never,
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn',
    });

    expect(client.request).toHaveBeenCalledWith('home.model.provider.decision.submit', {
      entryId: 'a-measured-host',
      providerClass: 'declared_own_host',
      carries: 'live_turn',
    });
  });

  it('names a refused revoke instead of reporting a withdrawal that did not happen', async () => {
    await expect(revokePicoCompanionModelProvider({
      livingDeviceLinkClient: linkClient({ outcome: 'unavailable', result: {} }) as never,
      entryId: 'a-measured-host',
    })).rejects.toThrow(/model_provider_revoke_rejected:unavailable/u);
  });
});

describe('ADR 0116 W5 - what is waiting, without what it found', () => {
  it('carries no value that arrived anyway', async () => {
    // A device that rendered one would be persisting derived output onto a
    // screen, which is the same rule in a different medium.
    const [read] = await readPicoCompanionAnsweredReads({
      livingDeviceLinkClient: linkClient({
        outcome: 'ok',
        result: {
          reads: [{
            jobId: 'job_1',
            supplier: 'a-library',
            revision: 'dddddddddddd',
            answeredAt: '2026-08-14T12:00:00.000Z',
            values: { topic: 'the thing the answer said' },
          }],
        },
      }) as never,
    });

    expect(read).toEqual({
      jobId: 'job_1',
      supplier: 'a-library',
      revision: 'dddddddddddd',
      answeredAt: '2026-08-14T12:00:00.000Z',
    });
    expect(Object.keys(read ?? {})).not.toContain('values');
  });

  it('refuses a read whose entries are not the declared shape', async () => {
    await expect(readPicoCompanionAnsweredReads({
      livingDeviceLinkClient: linkClient({
        outcome: 'ok',
        result: { reads: [{ jobId: 'job_1', supplier: 'a-library' }] },
      }) as never,
    })).rejects.toThrow(/invalid_pico_model_read_result/u);
  });

  it('returns the memory item the keep created, and names a refused keep', async () => {
    expect(await keepPicoCompanionAnsweredRead({
      livingDeviceLinkClient: linkClient({
        outcome: 'ok',
        result: { memoryItemId: 'mem_1' },
      }) as never,
      jobId: 'job_1',
    })).toBe('mem_1');

    await expect(keepPicoCompanionAnsweredRead({
      livingDeviceLinkClient: linkClient({
        outcome: 'invalid_arguments',
        result: { refusal: 'pico_model_job_has_no_answer' },
      }) as never,
      jobId: 'job_1',
    })).rejects.toThrow(/pico_model_job_has_no_answer/u);
  });
});

describe('ADR 0118 O4 - only a provider this person decided on can be absent', () => {
  it('ignores a measured machine nobody chose', async () => {
    // Letting an undecided entry raise `no_model` would put a standing absence
    // on a Home that is working exactly as its owner set it up.
    expect(await readPicoCompanionModelReachability({
      livingDeviceLinkClient: linkClient({
        outcome: 'ok',
        result: {
          providers: [
            { ...provider, entryId: 'undecided', decided: false, state: 'did_not_answer' },
          ],
        },
      }) as never,
    })).toBeUndefined();
  });

  it('reports absence when the decided provider is the one that failed', async () => {
    expect(await readPicoCompanionModelReachability({
      livingDeviceLinkClient: linkClient({
        outcome: 'ok',
        result: {
          providers: [
            { ...provider, entryId: 'undecided', decided: false, state: 'answered' },
            { ...provider, decided: true, state: 'did_not_answer' },
          ],
        },
      }) as never,
    })).toBe(false);
  });

  it('is not knowable against a Home that reports no state', async () => {
    // ADR 0118 O4: an unset field states nothing, and an older Home is not a
    // broken one.
    expect(await readPicoCompanionModelReachability({
      livingDeviceLinkClient: linkClient({
        outcome: 'ok',
        result: { providers: [provider] },
      }) as never,
    })).toBeUndefined();
  });
});
