import { parsePicoModuleManifest } from '@pico/protocol/module';
import { describe, expect, it } from 'vitest';
import { picoDepotModuleManifest } from './manifest.js';
import {
  picoDepotFetchIntent,
  picoDepotState,
  picoDepotStates,
  type PicoDepotView,
} from './depot.js';

const remote = 'https://git.example.invalid/rch/pico-bridges.git';
const commit = 'a'.repeat(40);

function depot(over: Partial<PicoDepotView> = {}): PicoDepotView {
  return {
    pin: { remote, commit },
    acceptedAt: '2026-08-11T09:00:00.000Z',
    mayFetch: false,
    mayFetchUnasked: false,
    // The ordinary case for a depot that has run: the files are there. Tests
    // about the other case say so, rather than every unrelated test having to.
    materialised: true,
    ...over,
  };
}

describe('ADR 0127 M5 - depot management as a module', () => {
  it('parses through the protocol parser the product uses', () => {
    // Not a second parser written for the test: a manifest the check accepts
    // and the product refuses, or the reverse, would be two contracts.
    expect(parsePicoModuleManifest(picoDepotModuleManifest).identifier).toBe('depot');
  });

  it('declares one effect, and it is external_write', () => {
    // ADR 0010's six classes unchanged, and this is the honest one: a fetch
    // contacts a system Pico does not run, tells it this Pico is pulling, and
    // brings back code that will execute. Under ADR 0140's floor that also
    // means it does not resolve to `allow` from the risk class alone - the
    // correct default for the only effect in the tree that installs code.
    expect(picoDepotModuleManifest.effects).toHaveLength(1);
    expect(picoDepotModuleManifest.effects[0]).toMatchObject({
      name: 'depot.fetch',
      risk: 'external_write',
    });
  });

  it('says what a person is agreeing to, in their terms', () => {
    // ADR 0139 AC4 pins name, description and risk at the moment someone read
    // them, so the description is the sentence they consented to.
    const description = picoDepotModuleManifest.effects[0]!.description;
    expect(description).toContain('commit you accepted');
    expect(description).toContain('this Pico is pulling');
  });

  it('depends on nothing and publishes two subpaths', () => {
    expect(picoDepotModuleManifest.dependencies).toEqual([]);
    expect([...picoDepotModuleManifest.publishedSubpaths].sort())
      .toEqual(['./depot', './manifest']);
  });
});

describe('ADR 0143 DP8 - whether a fetch is worth requesting', () => {
  it('skips when nothing was permitted, and names which switch is missing', () => {
    // A requester that submitted an action for a fetch it may not make would
    // produce a request, a decision and a refusal on every scheduler tick -
    // three facts about something that was never going to happen, carried
    // forever by the ADR 0121 chain.
    expect(picoDepotFetchIntent({ depot: depot(), asked: true })).toEqual({
      intent: 'skip',
      reason: { status: 'refused', reason: 'fetch_not_permitted' },
    });
  });

  it('skips a scheduled sweep that only asked permission covers', () => {
    expect(picoDepotFetchIntent({ depot: depot({ mayFetch: true }), asked: false }))
      .toEqual({
        intent: 'skip',
        reason: { status: 'refused', reason: 'unasked_fetch_not_permitted' },
      });
  });

  it('requests when the permission covers it', () => {
    expect(picoDepotFetchIntent({ depot: depot({ mayFetch: true }), asked: true }))
      .toEqual({ intent: 'request', asked: true });
    expect(picoDepotFetchIntent({
      depot: depot({ mayFetch: true, mayFetchUnasked: true }),
      asked: false,
    })).toEqual({ intent: 'request', asked: false });
  });

  it('never fetches anything itself', () => {
    // The module decides whether to *ask*. ADR 0139's requester is never
    // trusted, so this being wrong costs a refused request rather than an
    // unwanted fetch - and the core refuses an unpermitted one regardless.
    expect(Object.keys(picoDepotFetchIntent({ depot: depot({ mayFetch: true }), asked: true })))
      .toEqual(['intent', 'asked']);
  });
});

describe('ADR 0143 DP1 - what a surface says about a depot', () => {
  it('holds five states and no sentence', () => {
    expect([...picoDepotStates])
      .toEqual(['running', 'offered', 'unreachable', 'not_materialised', 'never_fetched']);
  });

  it('separates a waiting offer from a depot that changed', () => {
    // `offered` is a state of the person's decision, not of the depot: it is
    // running what it was told to run either way. Naming it separately keeps
    // "there is something new" from reading as "something changed underneath
    // you".
    expect(picoDepotState(depot({ mayFetch: true }))).toBe('running');
    expect(picoDepotState(depot({ mayFetch: true, offeredCommit: 'b'.repeat(40) })))
      .toBe('offered');
  });

  it('reports the missing permission ahead of an offer', () => {
    // A depot nobody permitted to fetch cannot have seen an offer, and if a
    // caller hands over both the missing permission is the more useful thing.
    expect(picoDepotState(depot({ offeredCommit: 'b'.repeat(40) }))).toBe('never_fetched');
  });

  it('says nothing is on this device rather than that it is running', () => {
    // The state this list was missing. `running` claims the depot is running
    // what it was told to run, and a depot with no working copy is running
    // nothing - which is the surface saying the opposite of the truth.
    expect(picoDepotState(depot({ mayFetch: true, materialised: false })))
      .toBe('not_materialised');
  });

  it('reports an unreachable remote ahead of a waiting offer', () => {
    // Accepting an offer while the remote is unreachable schedules a fetch
    // that cannot succeed, so showing the offer would invite exactly the
    // action that is going to fail.
    expect(picoDepotState(depot({
      mayFetch: true,
      lastFetchCondition: 'unreachable',
      offeredCommit: 'b'.repeat(40),
    }))).toBe('unreachable');
  });

  it('reports the reason ahead of the consequence', () => {
    // Both mean the depot provides nothing. Only one tells the person what to
    // do about it.
    expect(picoDepotState(depot({
      mayFetch: true,
      materialised: false,
      lastFetchCondition: 'unreachable',
    }))).toBe('unreachable');
  });

  it('keeps the missing permission ahead of both new states', () => {
    expect(picoDepotState(depot({
      mayFetch: false,
      materialised: false,
      lastFetchCondition: 'unreachable',
    }))).toBe('never_fetched');
  });

  it('returns to running once a fetch succeeds and clears the condition', () => {
    // The condition is cleared by a successful fetch, which is what makes it
    // safe to read as a state of the present rather than of the past.
    expect(picoDepotState(depot({ mayFetch: true }))).toBe('running');
  });
});
