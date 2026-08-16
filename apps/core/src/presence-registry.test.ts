import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  maxPicoPresencesPerIdentity,
  picoPresenceLeaseMs,
  picoPresenceSchema,
} from '@pico/protocol/presence';
import { EventStore } from './event-store.js';

/**
 * ADR 0126 P2. The registry half, and the two things it refuses to be: a
 * store of connection states, and a place a device class can be planned on.
 */
const dirs: string[] = [];
const stores: EventStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close();
  }
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function registry() {
  const dir = mkdtempSync(join(tmpdir(), 'pico-presence-'));
  dirs.push(dir);
  const store = await EventStore.open(join(dir, 'pico.sqlite'), {});
  stores.push(store);
  return store.picoPresenceRegistry();
}

const identity = 'a'.repeat(64);
const announcement = (over: Record<string, unknown> = {}) => ({
  schema: picoPresenceSchema,
  presenceId: 'desktop-01',
  presenceType: 'desktop_companion',
  affordances: ['display', 'notification'],
  ...over,
});

describe('ADR 0126 P2 - a presence announces itself', () => {
  it('registers and refreshes with one statement', async () => {
    // Two operations would make a runtime decide which it was after a
    // restart, and one that guessed wrong would either fail to register or
    // reset its own history.
    const presences = await registry();
    const first = presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement(),
      at: '2026-08-16T12:00:00.000Z',
    });
    expect(first.ok && first.presence.registeredAt).toBe('2026-08-16T12:00:00.000Z');

    const again = presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement(),
      at: '2026-08-16T12:01:00.000Z',
    });
    // Since when this device has been the person's survives every restart it
    // makes; only the sighting moves.
    expect(again.ok && again.presence.registeredAt).toBe('2026-08-16T12:00:00.000Z');
    expect(again.ok && again.presence.lastSeenAt).toBe('2026-08-16T12:01:00.000Z');
    expect(presences.forIdentity(identity, Date.parse('2026-08-16T12:01:00.000Z')))
      .toHaveLength(1);
  });

  it('replaces the affordances rather than merging them', async () => {
    // A presence that lost its camera is making a true statement about now,
    // and a registry that unioned the old list would keep planning against a
    // fact that stopped being one.
    const presences = await registry();
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({ affordances: ['display', 'camera'] }),
      at: '2026-08-16T12:00:00.000Z',
    });
    const narrowed = presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({ affordances: ['display'] }),
      at: '2026-08-16T12:00:30.000Z',
    });
    expect(narrowed.ok && narrowed.presence.affordances).toEqual(['display']);
    // Read back rather than trusted from the answer: the answer could be
    // right while the column kept the wider list, and it is the column a
    // later plan reads.
    expect(presences.forIdentity(identity, Date.parse('2026-08-16T12:00:31.000Z'))[0]?.affordances)
      .toEqual(['display']);
    expect(presences.offering({
      picoIdentityFingerprintHex: identity,
      affordances: ['camera'],
      nowMs: Date.parse('2026-08-16T12:00:31.000Z'),
    })).toEqual([]);
  });

  it('refuses an affordance nobody defined', async () => {
    // An unknown capability is somebody else's connector and may be ignored.
    // An unknown affordance is a fact the Core would have to plan against
    // without knowing what it means.
    const presences = await registry();
    expect(() => presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({ affordances: ['telepathy'] }),
      at: '2026-08-16T12:00:00.000Z',
    })).toThrow('invalid_pico_presence_affordance');
  });

  it('refuses an announcement that carries a risk class', async () => {
    // The field this refusal is really for. A microphone has no risk class;
    // recording with it has one (ADR 0126), and silently dropping the field
    // would let the mistake spread before anybody saw it.
    const presences = await registry();
    expect(() => presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({ riskClass: 'high' }),
      at: '2026-08-16T12:00:00.000Z',
    })).toThrow('pico_presence_announcement_carries_no:riskClass');
  });

  it('refuses more presences than one identity may hold', async () => {
    const presences = await registry();
    for (let index = 0; index < maxPicoPresencesPerIdentity; index += 1) {
      expect(presences.announce({
        picoIdentityFingerprintHex: identity,
        announcement: announcement({ presenceId: `device-${String(index).padStart(2, '0')}` }),
        at: '2026-08-16T12:00:00.000Z',
      }).ok).toBe(true);
    }
    // ADR 0119 Q5. A ceiling refuses; it never makes room by forgetting a
    // device somebody still owns.
    expect(presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({ presenceId: 'one-too-many' }),
      at: '2026-08-16T12:00:00.000Z',
    })).toEqual({ ok: false, refusal: 'presence_quota_reached' });

    // And refreshing an existing one still works at the ceiling, because a
    // quota on how many devices you have must not stop the ones you have from
    // saying they are still there.
    expect(presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({ presenceId: 'device-00' }),
      at: '2026-08-16T12:02:00.000Z',
    }).ok).toBe(true);
  });
});

describe('ADR 0126 P2 with ADR 0118 O2 - connectedness is computed', () => {
  it('goes quiet on its own, with nobody reporting it', async () => {
    // A presence that lost power cannot write `disconnected`, so a stored
    // status is a claim that outlives its subject.
    const presences = await registry();
    const at = '2026-08-16T12:00:00.000Z';
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement(),
      at,
    });
    const nowMs = Date.parse(at);
    expect(presences.forIdentity(identity, nowMs + 1_000)[0]?.connected).toBe(true);
    expect(presences.forIdentity(identity, nowMs + picoPresenceLeaseMs)[0]?.connected)
      .toBe(false);
  });

  it('keeps a quiet presence in the list', async () => {
    // A device that is off is still one of the person's devices. Dropping it
    // would turn "my laptop is asleep" into "my laptop is gone".
    const presences = await registry();
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement(),
      at: '2026-08-16T12:00:00.000Z',
    });
    const listed = presences.forIdentity(identity, Date.parse('2026-08-17T12:00:00.000Z'));
    expect(listed).toHaveLength(1);
    expect(listed[0]?.connected).toBe(false);
  });

  it('gives a clock that ran ahead no extra credit', async () => {
    /**
     * ADR 0120. A wrong clock costs a presence that looks absent, never one
     * that looks present after it stopped.
     *
     * **Skewed by less than the lease**, which the first version of this test
     * was not: an hour ahead is outside the window either way, so it passed
     * against a check that treated the skew as a distance rather than a
     * direction. Thirty seconds ahead is the case that tells them apart.
     */
    const presences = await registry();
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement(),
      at: '2026-08-16T12:00:30.000Z',
    });
    expect(presences.forIdentity(identity, Date.parse('2026-08-16T12:00:00.000Z'))[0]?.connected)
      .toBe(false);
  });
});

describe('ADR 0126 - planning asks what a runtime can do, never what it is', () => {
  it('offers only presences that are there and can do the thing', async () => {
    const presences = await registry();
    const at = '2026-08-16T12:00:00.000Z';
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({ presenceId: 'desktop-01', affordances: ['display', 'printer'] }),
      at,
    });
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement({
        presenceId: 'phone-01',
        presenceType: 'mobile_companion',
        affordances: ['display', 'camera'],
      }),
      at,
    });
    const nowMs = Date.parse(at) + 1_000;

    expect(presences.offering({
      picoIdentityFingerprintHex: identity,
      affordances: ['printer'],
      nowMs,
    }).map((presence) => presence.presenceId)).toEqual(['desktop-01']);

    // Two required facts, and only a runtime offering both answers.
    expect(presences.offering({
      picoIdentityFingerprintHex: identity,
      affordances: ['display', 'camera'],
      nowMs,
    }).map((presence) => presence.presenceId)).toEqual(['phone-01']);

    // Quiet presences are not offered, however capable.
    expect(presences.offering({
      picoIdentityFingerprintHex: identity,
      affordances: ['display'],
      nowMs: Date.parse(at) + picoPresenceLeaseMs,
    })).toEqual([]);
  });

  it('lets a person forget a device of their own', async () => {
    // Not a tombstone, unlike a mailbox (ADR 0147 RY4): a mailbox's tombstone
    // answers a stranger who still holds the address, and there is no
    // stranger here.
    const presences = await registry();
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement(),
      at: '2026-08-16T12:00:00.000Z',
    });
    expect(presences.forget({ picoIdentityFingerprintHex: identity, presenceId: 'desktop-01' }))
      .toBe(true);
    expect(presences.forIdentity(identity, Date.now())).toEqual([]);
    expect(presences.forget({ picoIdentityFingerprintHex: identity, presenceId: 'desktop-01' }))
      .toBe(false);
  });

  it('keeps one identity\'s devices out of another\'s list', async () => {
    const presences = await registry();
    presences.announce({
      picoIdentityFingerprintHex: identity,
      announcement: announcement(),
      at: '2026-08-16T12:00:00.000Z',
    });
    expect(presences.forIdentity('b'.repeat(64), Date.now())).toEqual([]);
  });
});
