import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  sweepPicoCompanionLinkRelay,
  startPicoCompanionLinkRelaySweep,
  type PicoCompanionRelayReader,
} from './link-relay-sweep.js';
import {
  addPicoCompanionPendingReply,
  defaultPicoCompanionPendingReplyPath,
  emptyPicoCompanionPendingReplyBook,
  issuePicoCompanionPendingReply,
  readPicoCompanionPendingReplyBook,
  writePicoCompanionPendingReplyBook,
} from './pending-reply.js';

/**
 * ADR 0149 on the device. Real libsodium, because the whole mechanism is that
 * a stored key opens a real seal and no other key does.
 */
const tempDirs: string[] = [];
const mailbox = '1'.repeat(32);
const at = '2026-08-12T11:00:00.000Z';
const expiresAt = '2026-08-12T12:00:00.000Z';
const nowMs = Date.parse(at);

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function bookPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pico-relay-sweep-'));
  tempDirs.push(dir);
  return defaultPicoCompanionPendingReplyPath(join(dir, 'profile.json'));
}

const issue = (requestId: string) => issuePicoCompanionPendingReply({
  sodium, requestId, createdAt: at, expiresAt,
});

function sealTo(publicKeyHex: string, message: string): string {
  return Buffer.from(sodium.crypto_box_seal(
    new TextEncoder().encode(message),
    Uint8Array.from(publicKeyHex.match(/../g)!.map((pair) => Number.parseInt(pair, 16))),
  )).toString('base64');
}

function reader(packets: Array<{ tag: string; payload: string }>) {
  const held = [...packets];
  const api: PicoCompanionRelayReader & { held: typeof held } = {
    held,
    collect: async () => Object.freeze([...held]),
    acknowledge: async ({ tags }) => {
      for (const tag of tags) {
        const index = held.findIndex((packet) => packet.tag === tag);
        if (index >= 0) {
          held.splice(index, 1);
        }
      }
    },
  };
  return api;
}

describe('ADR 0149 - the device sweep', () => {
  it('opens a reply, hands it over and settles the key it used', async () => {
    const path = bookPath();
    const pending = issue('req-1');
    writePicoCompanionPendingReplyBook(
      path,
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, pending, nowMs),
    );
    const store = reader([{ tag: 't1', payload: sealTo(pending.replyPublicKeyHex, 'the answer') }]);
    const seen: string[] = [];

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async ({ requestId, opened }) => {
        seen.push(`${requestId}:${new TextDecoder().decode(opened)}`);
        return { verified: true };
      },
    });

    expect(result).toEqual({ handled: 1, pushed: 0, refused: 0, deferred: 0 });
    expect(seen).toEqual(['req-1:the answer']);
    expect(readPicoCompanionPendingReplyBook(path).pending).toEqual([]);
    expect(store.held).toEqual([]);
  });

  it('acknowledges a reply nothing opens, because nothing later will', async () => {
    // Provable rather than assumed: the pending set only shrinks for a given
    // packet, and a response matches no key but its own request's - which was
    // written before the request left.
    const path = bookPath();
    const stranger = issue('never-asked');
    const store = reader([{ tag: 't1', payload: sealTo(stranger.replyPublicKeyHex, 'not ours') }]);
    const refusals: string[] = [];

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async () => ({ verified: true }),
      onRefused: ({ refusal }) => refusals.push(refusal),
    });

    expect(result).toEqual({ handled: 0, pushed: 0, refused: 1, deferred: 0 });
    expect(refusals).toEqual(['unmatched']);
    expect(store.held).toEqual([]);
  });

  it('acknowledges a reply that opened and did not hold', async () => {
    const path = bookPath();
    const pending = issue('req-1');
    writePicoCompanionPendingReplyBook(
      path,
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, pending, nowMs),
    );
    const store = reader([{ tag: 't1', payload: sealTo(pending.replyPublicKeyHex, 'bad signature') }]);
    const refusals: string[] = [];

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async () => ({ verified: false }),
      onRefused: ({ refusal }) => refusals.push(refusal),
    });

    expect(result).toEqual({ handled: 0, pushed: 0, refused: 1, deferred: 0 });
    expect(refusals).toEqual(['unverified']);
    // Settled too: it will never verify, so the key has nothing left to open.
    expect(readPicoCompanionPendingReplyBook(path).pending).toEqual([]);
    expect(store.held).toEqual([]);
  });

  it('leaves the packet and its key when handling failed', async () => {
    // Settling before handing over would lose the answer to a crash between:
    // the key gone, the packet still at the relay, nothing able to read it.
    const path = bookPath();
    const pending = issue('req-1');
    writePicoCompanionPendingReplyBook(
      path,
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, pending, nowMs),
    );
    const store = reader([{ tag: 't1', payload: sealTo(pending.replyPublicKeyHex, 'the answer') }]);

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async () => {
        throw new Error('surface_busy');
      },
    });

    expect(result).toEqual({ handled: 0, pushed: 0, refused: 0, deferred: 1 });
    expect(readPicoCompanionPendingReplyBook(path).pending.map((entry) => entry.requestId))
      .toEqual(['req-1']);
    expect(store.held).toHaveLength(1);
  });

  it('drops keys whose requests expired, without collecting for them', async () => {
    const path = bookPath();
    const stale = issue('req-1');
    writePicoCompanionPendingReplyBook(
      path,
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, stale, nowMs),
    );
    const store = reader([]);

    await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date('2026-08-12T13:00:00.000Z'),
      handle: async () => ({ verified: true }),
    });

    expect(readPicoCompanionPendingReplyBook(path).pending).toEqual([]);
  });

  it('handles several replies without one holding up the rest', async () => {
    const path = bookPath();
    const first = issue('req-1');
    const second = issue('req-2');
    let book = addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, first, nowMs);
    book = addPicoCompanionPendingReply(book, second, nowMs);
    writePicoCompanionPendingReplyBook(path, book);

    const store = reader([
      { tag: 't1', payload: sealTo(first.replyPublicKeyHex, 'one') },
      { tag: 't2', payload: 'bm90LWEtc2VhbA==' },
      { tag: 't3', payload: sealTo(second.replyPublicKeyHex, 'two') },
    ]);
    const seen: string[] = [];

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async ({ opened }) => {
        seen.push(new TextDecoder().decode(opened));
        return { verified: true };
      },
    });

    expect(result).toEqual({ handled: 2, pushed: 0, refused: 1, deferred: 0 });
    expect(seen).toEqual(['one', 'two']);
    expect(store.held).toEqual([]);
  });
});

describe('ADR 0149 - the device cadence', () => {
  const inert = {
    setTimer: () => ({ unref: () => {} }) as never,
    clearTimer: () => {},
  };

  it('sweeps on demand, which is what the shell calls on wake', async () => {
    let sweeps = 0;
    const runner = startPicoCompanionLinkRelaySweep({
      sweep: async () => {
        sweeps += 1;
        return { handled: 1, pushed: 0, refused: 0, deferred: 0 };
      },
      intervalMs: 120_000,
      ...inert,
    });
    expect(await runner.checkNow()).toEqual({ handled: 1, pushed: 0, refused: 0, deferred: 0 });
    expect(sweeps).toBe(1);
    runner.stop();
  });

  it('does not run two sweeps at once', async () => {
    // A wake and a timer landing together would collect the same packets and
    // hand them over twice for no reason the first pass had not covered.
    let inFlight = 0;
    let maxInFlight = 0;
    const held: { release?: () => void } = {};
    const runner = startPicoCompanionLinkRelaySweep({
      sweep: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => {
          held.release = resolve;
        });
        inFlight -= 1;
        return { handled: 0, pushed: 0, refused: 0, deferred: 0 };
      },
      intervalMs: 120_000,
      ...inert,
    });

    const first = runner.checkNow();
    expect(await runner.checkNow()).toEqual({ handled: 0, pushed: 0, refused: 0, deferred: 0 });
    expect(maxInFlight).toBe(1);
    held.release?.();
    await first;
    runner.stop();
  });

  it('counts a failed sweep and keeps going', async () => {
    // An operator that cannot be reached is the world failing. Nothing was
    // acknowledged, so the next pass tries again.
    let attempts = 0;
    const runner = startPicoCompanionLinkRelaySweep({
      sweep: async () => {
        attempts += 1;
        throw new Error('relay_unreachable');
      },
      intervalMs: 120_000,
      ...inert,
    });
    await runner.checkNow();
    await runner.checkNow();
    expect(attempts).toBe(2);
    expect(runner.failures()).toBe(2);
    runner.stop();
  });

  it('sweeps nothing once stopped', async () => {
    let sweeps = 0;
    const runner = startPicoCompanionLinkRelaySweep({
      sweep: async () => {
        sweeps += 1;
        return { handled: 0, pushed: 0, refused: 0, deferred: 0 };
      },
      intervalMs: 120_000,
      ...inert,
    });
    runner.stop();
    await runner.checkNow();
    expect(sweeps).toBe(0);
  });
});

describe('ADR 0150 - a push is not rubbish', () => {
  it('tries a packet as a push before calling it unmatched', async () => {
    // **The quiet bug this exists to prevent.** A push is sealed to the
    // device key-agreement key, so no pending reply key opens it. Declaring
    // unmatched first would delete every push on arrival, and a Home would
    // push, a relay would accept, a device would collect and delete, and
    // every side would look correct.
    const path = bookPath();
    const store = reader([{ tag: 't1', payload: 'bm90LWEtcmVwbHk=' }]);
    const tried: number[] = [];

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async () => ({ verified: true }),
      handlePush: async (sealed) => {
        tried.push(sealed.byteLength);
        return 'handled';
      },
    });

    expect(result).toEqual({ handled: 0, pushed: 1, refused: 0, deferred: 0 });
    expect(tried).toHaveLength(1);
    expect(store.held).toEqual([]);
  });

  it('still calls it unmatched when it is not a push either', async () => {
    const path = bookPath();
    const store = reader([{ tag: 't1', payload: 'bm90LWEtcmVwbHk=' }]);
    const refusals: string[] = [];

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async () => ({ verified: true }),
      handlePush: async () => 'not_a_push',
      onRefused: ({ refusal }) => refusals.push(refusal),
    });

    expect(result).toEqual({ handled: 0, pushed: 0, refused: 1, deferred: 0 });
    expect(refusals).toEqual(['unmatched']);
    expect(store.held).toEqual([]);
  });

  it('defers a push it could not handle now rather than deleting it', async () => {
    // A locked vault is exactly when a push matters, and deleting one because
    // the device happened to be locked is what this branch prevents.
    const path = bookPath();
    const store = reader([{ tag: 't1', payload: 'bm90LWEtcmVwbHk=' }]);

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async () => ({ verified: true }),
      handlePush: async () => {
        throw new Error('vault_locked');
      },
    });

    expect(result).toEqual({ handled: 0, pushed: 0, refused: 0, deferred: 1 });
    expect(store.held).toHaveLength(1);
  });

  it('reads every push as rubbish when no push handling is wired', async () => {
    // The honest state before this is wired, asserted so nobody mistakes it
    // for a working default.
    const path = bookPath();
    const store = reader([{ tag: 't1', payload: 'bm90LWEtcmVwbHk=' }]);

    const result = await sweepPicoCompanionLinkRelay({
      reader: store,
      sodium,
      pendingReplyPath: path,
      mailbox,
      now: () => new Date(at),
      handle: async () => ({ verified: true }),
    });

    expect(result).toEqual({ handled: 0, pushed: 0, refused: 1, deferred: 0 });
  });
});
