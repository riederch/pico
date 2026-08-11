import { describe, expect, it } from 'vitest';
import {
  acceptPicoDepotOffer,
  defaultPicoDepotApprovalThresholdBytes,
  parsePicoDepotPin,
  parsePicoDepotTask,
  picoDepotOffer,
  picoDepotTransferNeedsApproval,
  type PicoDepotOffer,
} from './depot.js';

const remote = 'https://git.example.invalid/rch/pico-bridges.git';
const running = 'a'.repeat(40);
const newer = 'b'.repeat(40);

describe('ADR 0143 DP1 - a depot is a remote and a commit, and nothing else', () => {
  it('parses a pin and freezes it', () => {
    const pin = parsePicoDepotPin({ remote, commit: running });
    expect(pin).toEqual({ remote, commit: running });
    expect(Object.isFrozen(pin)).toBe(true);
  });

  it('has nowhere to write a branch, and says so by name', () => {
    // The whole gate. A rule against auto-updating needs something to keep
    // obeying it; an absent field needs nothing. Named rather than folded into
    // a shape error, because a caller reaching for `branch` is asking for the
    // thing this exists to prevent rather than making a typo.
    for (const field of ['branch', 'ref', 'tag', 'channel', 'track', 'head']) {
      expect(() => parsePicoDepotPin({ remote, commit: running, [field]: 'main' }))
        .toThrow('pico_depot_cannot_follow_a_ref');
    }
  });

  it('refuses a commit that is not one', () => {
    // A depot pinned to a name is a depot pinned to something that can change
    // under it.
    expect(() => parsePicoDepotPin({ remote, commit: 'main' }))
      .toThrow('invalid_pico_depot_commit');
    expect(() => parsePicoDepotPin({ remote, commit: 'v1.2.0' }))
      .toThrow('invalid_pico_depot_commit');
    expect(() => parsePicoDepotPin({ remote, commit: 'A'.repeat(40) }))
      .toThrow('invalid_pico_depot_commit');
  });

  it('refuses a remote that is not a repository address', () => {
    expect(() => parsePicoDepotPin({ remote: 'pico-bridges', commit: running }))
      .toThrow('invalid_pico_depot_remote');
    expect(() => parsePicoDepotPin({ remote: `https://x/${'y'.repeat(600)}`, commit: running }))
      .toThrow('invalid_pico_depot_remote');
    // ssh and scp-style remotes are how a self-hosted Gitea is usually reached.
    expect(parsePicoDepotPin({ remote: 'git@git.example.invalid:rch/b.git', commit: running }).remote)
      .toBe('git@git.example.invalid:rch/b.git');
  });

  it('keeps the depot identified by its address, unlike a supplier instance', () => {
    // ADR 0137 IN1 makes an instance a person-chosen token *because* a working
    // copy moves. A depot is not a thing in a person's life, it is the place
    // code comes from - and if the place changes it is a different place.
    const pin = parsePicoDepotPin({ remote, commit: running });
    expect(Object.keys(pin).sort()).toEqual(['commit', 'remote']);
  });
});

describe('ADR 0143 DP1 - a newer commit is an offer', () => {
  it('reports nothing when the remote has not moved', () => {
    // An up-to-date depot has no offer, and an empty one would put a decision
    // in front of a person that nobody needs to make.
    expect(picoDepotOffer({ pin: { remote, commit: running }, seenCommit: running }))
      .toBeNull();
  });

  it('carries both ends, so a person sees what they would move from and to', () => {
    expect(picoDepotOffer({ pin: { remote, commit: running }, seenCommit: newer }))
      .toEqual({ remote, running, offered: newer });
  });

  it('is not a state the depot is in', () => {
    // There is no apply, no pending flag and no field on the pin that an offer
    // could set. Seeing a newer commit changes nothing about what runs.
    const pin = parsePicoDepotPin({ remote, commit: running });
    picoDepotOffer({ pin, seenCommit: newer });
    expect(pin.commit).toBe(running);
  });

  it('refuses to compare against something that is not a commit', () => {
    expect(() => picoDepotOffer({ pin: { remote, commit: running }, seenCommit: 'main' }))
      .toThrow('invalid_pico_depot_commit');
  });
});

describe('ADR 0143 DP1 - accepting names the commit', () => {
  it('turns an accepted offer into an ordinary pin', () => {
    const offer = picoDepotOffer({ pin: { remote, commit: running }, seenCommit: newer })!;
    expect(acceptPicoDepotOffer({ offer, acceptedCommit: newer }))
      .toEqual({ remote, commit: newer });
  });

  it('refuses when the offer moved between the question and the answer', () => {
    // The difference between a person having agreed to run this code and a
    // person having agreed to run whatever was newest when they clicked.
    const offer = picoDepotOffer({ pin: { remote, commit: running }, seenCommit: newer })!;
    expect(() => acceptPicoDepotOffer({ offer, acceptedCommit: 'c'.repeat(40) }))
      .toThrow('pico_depot_acceptance_mismatch');
  });

  it('leaves no memory of having been an offer', () => {
    // A depot running at an accepted commit is in exactly the state a freshly
    // attached one is in.
    const offer = picoDepotOffer({ pin: { remote, commit: running }, seenCommit: newer })!;
    const accepted = acceptPicoDepotOffer({ offer, acceptedCommit: newer });
    expect(Object.keys(accepted).sort()).toEqual(['commit', 'remote']);
  });

  it('refuses a hand-built offer that is not one', () => {
    expect(() => acceptPicoDepotOffer({
      offer: { remote, offered: newer } as unknown as PicoDepotOffer,
      acceptedCommit: newer,
    })).toThrow('invalid_pico_depot_offer');
  });
});

describe('ADR 0143 DP8 - a task asks, and never acts', () => {
  it('is an identifier, an interval and a request', () => {
    // The third field is the load-bearing one: scheduled work goes through the
    // action path rather than beside it.
    expect(parsePicoDepotTask({
      identifier: 'rchkb-fetch',
      intervalMs: 3_600_000,
      requestsEffect: 'depot.fetch',
    })).toEqual({
      identifier: 'rchkb-fetch',
      intervalMs: 3_600_000,
      requestsEffect: 'depot.fetch',
    });
  });

  it('has no field through which a task could do something itself', () => {
    const task = parsePicoDepotTask({
      identifier: 'rchkb-fetch',
      intervalMs: 3_600_000,
      requestsEffect: 'depot.fetch',
    });
    expect(Object.keys(task).sort()).toEqual(['identifier', 'intervalMs', 'requestsEffect']);
  });

  it('refuses an interval that turns a task into a poller', () => {
    // ADR 0138 CO4's distinction between answering and sweeping stops meaning
    // anything at a one-second cadence.
    expect(() => parsePicoDepotTask({
      identifier: 'rchkb-fetch',
      intervalMs: 1_000,
      requestsEffect: 'depot.fetch',
    })).toThrow('invalid_pico_depot_task_interval');
  });
});

describe('ADR 0143 DP8 - a large transfer becomes a question', () => {
  it('leaves a routine fetch routine', () => {
    expect(picoDepotTransferNeedsApproval({ estimatedBytes: 4 * 1024 * 1024 })).toBe(false);
  });

  it('asks about a clone the size of a knowledge base', () => {
    expect(picoDepotTransferNeedsApproval({ estimatedBytes: 2 * 1024 * 1024 * 1024 }))
      .toBe(true);
    expect(defaultPicoDepotApprovalThresholdBytes).toBe(500 * 1024 * 1024);
  });

  it('asks when nobody could estimate the size', () => {
    // ADR 0119 Q5's posture: the one case that cannot be measured must not be
    // the one case that is unprotected.
    expect(picoDepotTransferNeedsApproval({})).toBe(true);
    expect(picoDepotTransferNeedsApproval({ estimatedBytes: Number.NaN })).toBe(true);
    expect(picoDepotTransferNeedsApproval({ estimatedBytes: -1 })).toBe(true);
  });
});
