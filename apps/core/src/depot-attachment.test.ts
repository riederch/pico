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
    expect(columns).toEqual(['remote', 'running_commit', 'accepted_at']);
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
