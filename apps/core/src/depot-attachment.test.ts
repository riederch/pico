import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore } from './event-store.js';

/**
 * ADR 0143 DP1. A depot runs at a commit a person accepted, and a newer commit
 * on the same remote changes nothing until someone decides again.
 *
 * The claim these tests carry is a negative one, which is why the branch-head
 * case is the important one: it is not that Pico updates carefully, it is that
 * there is no mechanism by which a remote can change what runs.
 */
const tempDirs: string[] = [];
const stores: EventStore[] = [];

const remote = 'https://git.example.invalid/rch/pico-bridges.git';
const accepted = 'a'.repeat(40);
const newer = 'b'.repeat(40);

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // Already closed by the test that opened it.
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openStore(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `pico-depot-${label}-`));
  tempDirs.push(dir);
  const store = new EventStore(join(dir, 'pico.sqlite'));
  stores.push(store);
  return { store, databasePath: join(dir, 'pico.sqlite') };
}

describe('ADR 0143 DP1 - a depot is attached at a commit', () => {
  it('records the remote and the commit it runs at', () => {
    const { store } = openStore('attach');
    expect(store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    })).toEqual({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
      mayFetch: false,
      mayFetchUnasked: false,
    });
    expect(store.picoDepotAttachments().map((a) => a.pin.remote)).toEqual([remote]);
    store.close();
  });

  it('refuses a pin that asks to follow a ref, at the store boundary too', () => {
    // A schema with no branch column and a parser with no branch field are two
    // places saying the same thing, rather than one saying it and one hoping.
    const { store } = openStore('branch');
    expect(() => store.attachPicoDepot({
      pin: { remote, commit: accepted, branch: 'main' },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    })).toThrow('pico_depot_cannot_follow_a_ref');
    expect(store.picoDepotAttachments()).toEqual([]);
    store.close();
  });

  it('holds no privacy domain, because a depot produces nothing', () => {
    // ADR 0143 DP6, as a property of the schema rather than a promise. A column
    // here would have made "two instances from one depot in two spaces"
    // impossible to express, and would have put a delivery vehicle inside a
    // person's privacy boundary.
    const { store, databasePath } = openStore('domain');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    store.close();

    const raw = new Database(databasePath, { readonly: true });
    const columns = raw.prepare('PRAGMA table_info(pico_depot_attachment)')
      .all()
      .map((row) => (row as { name: string }).name);
    raw.close();
    // ADR 0143 DP6 unchanged: still no privacy domain. The two reach columns
    // are ADR 0138 CO3/CO4 and say nothing about where a depot lives, the
    // three fetch-outcome columns are what a fetch *learned* rather than
    // anywhere it lives, and the accepting identity is who decided rather than
    // where anything is - added when something finally needed somebody to
    // attribute a read of this material to.
    expect(columns).toEqual([
      'remote', 'running_commit', 'accepted_at', 'may_fetch', 'may_fetch_unasked',
      'offered_commit', 'last_fetch_condition', 'last_fetch_at',
      'accepted_by_pico_identity_fingerprint_hex',
    ]);
  });
});

describe('ADR 0143 DP1 - a newer commit is an offer', () => {
  it('leaves a running attachment untouched when the branch head moves', () => {
    // The gate's own sentence. Reading what the remote holds is not an update,
    // and a caller that never accepts leaves the depot exactly where it was.
    const { store } = openStore('offer');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });

    const offer = store.picoDepotOffer({ remote, seenCommit: newer });
    expect(offer).toEqual({ remote, running: accepted, offered: newer });

    expect(store.picoDepotAttachment(remote)).toEqual({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
      mayFetch: false,
      mayFetchUnasked: false,
    });
    store.close();
  });

  it('reports nothing when the remote has not moved', () => {
    const { store } = openStore('same');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(store.picoDepotOffer({ remote, seenCommit: accepted })).toBeNull();
    store.close();
  });

  it('refuses to speak about a depot nobody attached', () => {
    const { store } = openStore('unattached');
    expect(() => store.picoDepotOffer({ remote, seenCommit: newer }))
      .toThrow('pico_depot_not_attached');
    store.close();
  });
});

describe('ADR 0143 DP1 - accepting is a decision about a named commit', () => {
  it('moves the depot only when someone accepts', () => {
    const { store } = openStore('accept');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    const offer = store.picoDepotOffer({ remote, seenCommit: newer })!;

    expect(store.acceptPicoDepotOffer({
      offer,
      acceptedCommit: newer,
      acceptedAt: '2026-08-11T10:00:00.000Z',
    })).toEqual({
      pin: { remote, commit: newer },
      acceptedAt: '2026-08-11T10:00:00.000Z',
      mayFetch: false,
      mayFetchUnasked: false,
    });
    store.close();
  });

  it('refuses an acceptance naming a different commit than the one offered', () => {
    // The difference between agreeing to run this code and agreeing to run
    // whatever was newest at the moment of the click.
    const { store } = openStore('mismatch');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    const offer = store.picoDepotOffer({ remote, seenCommit: newer })!;

    expect(() => store.acceptPicoDepotOffer({
      offer,
      acceptedCommit: 'c'.repeat(40),
      acceptedAt: '2026-08-11T10:00:00.000Z',
    })).toThrow('pico_depot_acceptance_mismatch');
    expect(store.picoDepotAttachment(remote)?.pin.commit).toBe(accepted);
    store.close();
  });

  it('refuses an offer computed against a row that has since moved', () => {
    // An acceptance built on a stale reading would move the depot from
    // somewhere the person was not looking at.
    const { store } = openStore('stale');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    const offer = store.picoDepotOffer({ remote, seenCommit: newer })!;

    store.acceptPicoDepotOffer({
      offer,
      acceptedCommit: newer,
      acceptedAt: '2026-08-11T10:00:00.000Z',
    });

    expect(() => store.acceptPicoDepotOffer({
      offer,
      acceptedCommit: newer,
      acceptedAt: '2026-08-11T11:00:00.000Z',
    })).toThrow('pico_depot_offer_is_stale');
    store.close();
  });
});

describe('ADR 0143 DP1 with ADR 0119 Q5 - the depot ceiling', () => {
  it('refuses a new depot at the ceiling and leaves the rest standing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pico-depot-ceiling-'));
    tempDirs.push(dir);
    const store = await EventStore.open(join(dir, 'pico.sqlite'), {
      storeCeilingRows: { depot_attachment: 1 },
    });
    stores.push(store);

    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(() => store.attachPicoDepot({
      pin: { remote: 'https://git.example.invalid/rch/other.git', commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    })).toThrow('pico_depot_attachment_ceiling_reached');

    // Accepting a newer commit on an already-attached depot is not a new row,
    // so a full table never blocks a person from moving one they already have.
    const offer = store.picoDepotOffer({ remote, seenCommit: newer })!;
    expect(() => store.acceptPicoDepotOffer({
      offer,
      acceptedCommit: newer,
      acceptedAt: '2026-08-11T10:00:00.000Z',
    })).not.toThrow();
    store.close();
  });
});

describe('ADR 0143 DP6 - a depot lives in no space; its suppliers do', () => {
  const fromOneDepot = (identifier: string, privacyDomain: string) => ({
    identifier,
    kind: 'library' as const,
    slots: ['memory_item' as const],
    coverage: ['knowledge_base'],
    privacyDomain,
  });

  it('lets two suppliers from one depot land in two different spaces', () => {
    // The property the missing domain column exists for. A depot produces
    // nothing, so it has nothing to place, and where its suppliers land is a
    // person's judgement per instance (ADR 0137 IN5).
    const { store } = openStore('spaces');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    store.attachPicoSupplier({
      manifest: fromOneDepot('rchkb', 'privat'),
      attachedAt: '2026-08-11T09:00:00.000Z',
    });
    store.attachPicoSupplier({
      manifest: fromOneDepot('wwgkb', 'arbeit'),
      attachedAt: '2026-08-11T09:00:00.000Z',
    });

    expect(store.picoSupplierAttachment('rchkb')?.privacyDomain).toBe('privat');
    expect(store.picoSupplierAttachment('wwgkb')?.privacyDomain).toBe('arbeit');
    store.close();
  });

  it('detaching one leaves the other and the depot standing', () => {
    const { store } = openStore('independent');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    store.attachPicoSupplier({
      manifest: fromOneDepot('rchkb', 'privat'),
      attachedAt: '2026-08-11T09:00:00.000Z',
    });
    store.attachPicoSupplier({
      manifest: fromOneDepot('wwgkb', 'arbeit'),
      attachedAt: '2026-08-11T09:00:00.000Z',
    });

    store.detachPicoSupplier('rchkb');

    expect(store.picoSupplierAttachment('rchkb')).toBeUndefined();
    expect(store.picoSupplierAttachment('wwgkb')?.privacyDomain).toBe('arbeit');
    expect(store.picoDepotAttachment(remote)).toBeDefined();
    store.close();
  });

  it('detaching the depot leaves supplier decisions where they were', () => {
    // A depot is a delivery vehicle. Removing it removes the record of where
    // code came from, and nothing about what a person decided.
    const { store } = openStore('depot-detach');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    store.attachPicoSupplier({
      manifest: fromOneDepot('rchkb', 'privat'),
      attachedAt: '2026-08-11T09:00:00.000Z',
    });

    store.detachPicoDepot(remote);

    expect(store.picoDepotAttachment(remote)).toBeUndefined();
    expect(store.picoSupplierAttachment('rchkb')?.privacyDomain).toBe('privat');
    store.close();
  });
});

describe('ADR 0138 CO3/CO4 - attaching a depot grants no fetching', () => {
  it('attaches with both decisions off', () => {
    // ADR 0138 CO1 says it about the neighbouring case in so many words: a git
    // fetch reaches outside and discloses that this Pico is pulling. Attaching
    // a depot says it exists; it does not say Pico may go and get it.
    const { store } = openStore('reach-default');
    expect(store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    })).toMatchObject({ mayFetch: false, mayFetchUnasked: false });
    store.close();
  });

  it('cannot grant unasked fetching without fetching', () => {
    // They fail differently, which is why they are two: a fetch someone asked
    // for is visible to the person who asked, and a background pull is visible
    // to nobody.
    const { store } = openStore('reach-order');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(() => store.setPicoDepotReach({
      remote,
      mayFetch: false,
      mayFetchUnasked: true,
    })).toThrow('pico_depot_unasked_requires_fetch');
    expect(store.picoDepotAttachment(remote))
      .toMatchObject({ mayFetch: false, mayFetchUnasked: false });
    store.close();
  });

  it('records both when both are granted', () => {
    const { store } = openStore('reach-grant');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    store.setPicoDepotReach({ remote, mayFetch: true, mayFetchUnasked: true });
    expect(store.picoDepotAttachment(remote))
      .toMatchObject({ mayFetch: true, mayFetchUnasked: true });
    store.close();
  });

  it('keeps the grant when a newer commit is accepted', () => {
    // Accepting a commit is not re-attaching. A person who permitted fetching
    // and then accepted an offer has not withdrawn anything, and asking again
    // per commit would train them to click through it.
    const { store } = openStore('reach-accept');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    store.setPicoDepotReach({ remote, mayFetch: true, mayFetchUnasked: false });
    const offer = store.picoDepotOffer({ remote, seenCommit: newer })!;
    store.acceptPicoDepotOffer({
      offer,
      acceptedCommit: newer,
      acceptedAt: '2026-08-11T10:00:00.000Z',
    });
    expect(store.picoDepotAttachment(remote))
      .toMatchObject({ pin: { commit: newer }, mayFetch: true, mayFetchUnasked: false });
    store.close();
  });

  it('does not silently keep a grant it never re-asked for', () => {
    // Detaching removes the row, so re-attaching starts from the defaults -
    // the same property `attachPicoSupplier` has, for the same reason.
    const { store } = openStore('reach-reattach');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    store.setPicoDepotReach({ remote, mayFetch: true, mayFetchUnasked: true });
    store.detachPicoDepot(remote);
    expect(store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T11:00:00.000Z',
    })).toMatchObject({ mayFetch: false, mayFetchUnasked: false });
    store.close();
  });

  it('refuses to speak about a depot nobody attached', () => {
    const { store } = openStore('reach-unattached');
    expect(() => store.setPicoDepotReach({
      remote,
      mayFetch: true,
      mayFetchUnasked: false,
    })).toThrow('pico_depot_not_attached');
    store.close();
  });
});

describe('ADR 0138 CO3/CO4 - the store answers whether a fetch may happen', () => {
  it('reads the decision from the attachment, not from a caller belief', () => {
    const { store } = openStore('permission');
    store.attachPicoDepot({
      pin: { remote, commit: accepted },
      acceptedAt: '2026-08-11T09:00:00.000Z',
    });
    expect(store.picoDepotFetchPermission({ remote, asked: true }))
      .toEqual({ status: 'refused', reason: 'fetch_not_permitted' });

    store.setPicoDepotReach({ remote, mayFetch: true, mayFetchUnasked: false });
    expect(store.picoDepotFetchPermission({ remote, asked: true }))
      .toEqual({ status: 'permitted' });
    expect(store.picoDepotFetchPermission({ remote, asked: false }))
      .toEqual({ status: 'refused', reason: 'unasked_fetch_not_permitted' });
    store.close();
  });

  it('refuses a depot nobody attached rather than reporting it missing', () => {
    // From the fetcher's side the two are one answer, and naming the absence
    // separately would invite a caller to treat "not attached" as a reason to
    // attach one.
    const { store } = openStore('permission-unattached');
    expect(store.picoDepotFetchPermission({ remote, asked: true }))
      .toEqual({ status: 'refused', reason: 'fetch_not_permitted' });
    store.close();
  });
});

describe('ADR 0143 DP1/DP8 - what a fetch learned, on the row', () => {
  function attached(label: string) {
    const { store } = openStore(label);
    store.attachPicoDepot({ pin: { remote, commit: accepted }, acceptedAt: '2026-08-11T09:00:00.000Z' });
    return store;
  }

  it('records a condition with when it happened', () => {
    // ADR 0138 CO2 wants a condition to be a state a surface renders. Until
    // this column existed it had nowhere to be one.
    const store = attached('condition');
    const after = store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T10:00:00.000Z',
      condition: 'unreachable',
    });
    expect(after.lastFetchCondition).toBe('unreachable');
    expect(after.lastFetchAt).toBe('2026-08-12T10:00:00.000Z');
    store.close();
  });

  it('clears the condition when an attempt succeeds', () => {
    // The whole reason this is safe to read as a state of the present. Left
    // set, it would mean "something failed once" and a person would be told to
    // check a network that came back days ago.
    const store = attached('cleared');
    store.recordPicoDepotFetchOutcome({ remote, at: '2026-08-12T10:00:00.000Z', condition: 'unreachable' });
    const after = store.recordPicoDepotFetchOutcome({ remote, at: '2026-08-12T10:05:00.000Z' });
    expect(after.lastFetchCondition).toBeUndefined();
    expect(after.lastFetchAt).toBe('2026-08-12T10:05:00.000Z');
    store.close();
  });

  it('makes the offer reachable, which it was not before', () => {
    // `offered` was declared, read by `picoDepotState` and produced by
    // nothing: a fetch that saw a newer commit had no place to put it.
    const store = attached('offer');
    const after = store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T10:00:00.000Z',
      offeredCommit: newer,
    });
    expect(after.offeredCommit).toBe(newer);
    // And the pin is untouched: an offer changes nothing about what runs.
    expect(after.pin.commit).toBe(accepted);
    store.close();
  });

  it('keeps a standing offer through a failed attempt', () => {
    // A newer commit seen last week is still there, and a fetch that could not
    // reach the remote learned nothing about it either way. Dropping it would
    // turn a network outage into a decision quietly disappearing.
    const store = attached('offer-survives');
    store.recordPicoDepotFetchOutcome({ remote, at: '2026-08-12T10:00:00.000Z', offeredCommit: newer });
    const after = store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T11:00:00.000Z',
      condition: 'unreachable',
    });
    expect(after.offeredCommit).toBe(newer);
    expect(after.lastFetchCondition).toBe('unreachable');
    store.close();
  });

  it('withdraws an offer only when a fetch says so', () => {
    // Absent and null are different sentences: "this fetch says nothing about
    // the offer" and "there is no longer one".
    const store = attached('withdraw');
    store.recordPicoDepotFetchOutcome({ remote, at: '2026-08-12T10:00:00.000Z', offeredCommit: newer });
    const after = store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T11:00:00.000Z',
      offeredCommit: null,
    });
    expect(after.offeredCommit).toBeUndefined();
    store.close();
  });

  it('refuses an offer that is not a commit, because it came off a remote', () => {
    const store = attached('bad-offer');
    expect(() => store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T10:00:00.000Z',
      offeredCommit: 'refs/heads/main',
    })).toThrow('invalid_pico_depot_offered_commit');
    store.close();
  });

  it('refuses an offer that matches the pin', () => {
    // The remote agreeing with the pin is the ordinary case. Recording it as
    // something waiting would put a decision with no other side in front of a
    // person.
    const store = attached('offer-is-pin');
    expect(() => store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T10:00:00.000Z',
      offeredCommit: accepted,
    })).toThrow('pico_depot_offer_matches_pin');
    store.close();
  });

  it('refuses a condition a depot fetch cannot produce', () => {
    // The narrower list is asserted rather than assumed. A hosted remote
    // answering 429 makes `rate_limited` real, and this refuses instead of
    // labelling it `unreachable` - which would tell a person to check a
    // network about a limit that lifts on its own.
    const store = attached('bad-condition');
    expect(() => store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T10:00:00.000Z',
      condition: 'rate_limited',
    })).toThrow('unknown_pico_depot_fetch_condition');
    store.close();
  });

  it('refuses to record against a depot nobody attached', () => {
    const { store } = openStore('unattached');
    expect(() => store.recordPicoDepotFetchOutcome({
      remote,
      at: '2026-08-12T10:00:00.000Z',
    })).toThrow('pico_depot_not_attached');
    store.close();
  });
});
