import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  addPicoCompanionPendingReply,
  clearPicoCompanionPendingReplyBook,
  defaultPicoCompanionPendingReplyPath,
  emptyPicoCompanionPendingReplyBook,
  issuePicoCompanionPendingReply,
  maxPicoCompanionPendingReplies,
  openPicoCompanionPendingReply,
  parsePicoCompanionPendingReplyBook,
  prunePicoCompanionPendingReplies,
  readPicoCompanionPendingReplyBook,
  settlePicoCompanionPendingReply,
  writePicoCompanionPendingReplyBook,
} from './pending-reply.js';

/**
 * ADR 0149 on the device. Real libsodium, because what is under test is that a
 * stored key opens a real seal and the wrong one does not - a fake would only
 * prove that my idea of sealing agrees with itself.
 */
const tempDirs: string[] = [];
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
  const dir = mkdtempSync(join(tmpdir(), 'pico-pending-reply-'));
  tempDirs.push(dir);
  return defaultPicoCompanionPendingReplyPath(join(dir, 'profile.json'));
}

const issue = (requestId: string, over: { expiresAt?: string } = {}) =>
  issuePicoCompanionPendingReply({
    sodium,
    requestId,
    createdAt: at,
    expiresAt: over.expiresAt ?? expiresAt,
  });

const sealTo = (publicKeyHex: string, message: string) => sodium.crypto_box_seal(
  new TextEncoder().encode(message),
  Uint8Array.from(publicKeyHex.match(/../g)!.map((pair) => Number.parseInt(pair, 16))),
);

describe('ADR 0149 - the reply key a relay makes a device keep', () => {
  it('mints a fresh key per request', () => {
    const first = issue('req-1');
    const second = issue('req-2');
    expect(first.replyPublicKeyHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.replyPublicKeyHex).not.toBe(second.replyPublicKeyHex);
    expect(first.replySecretKeyHex).not.toBe(second.replySecretKeyHex);
  });

  it('opens a reply with the key that answers it, and only that one', () => {
    // The whole correlation mechanism: ADR 0107's response envelope carries
    // nothing outside the seal, so the key that opens it is the match.
    const wanted = issue('req-1');
    const other = issue('req-2');
    const book = addPicoCompanionPendingReply(
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, other, nowMs),
      wanted,
      nowMs,
    );

    const opened = openPicoCompanionPendingReply({
      sodium,
      book,
      sealed: sealTo(wanted.replyPublicKeyHex, 'the answer'),
      nowMs,
    });

    expect(opened?.requestId).toBe('req-1');
    expect(new TextDecoder().decode(opened!.opened)).toBe('the answer');
  });

  it('answers undefined for a reply nothing opens, which is the ordinary duplicate', () => {
    // ADR 0149 RS5 makes the relay at-least-once, so a reply already settled
    // arrives again and finds no key. Not an error; the caller acknowledges it.
    const settled = issue('req-1');
    const book = settlePicoCompanionPendingReply(
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, settled, nowMs),
      'req-1',
    );
    expect(openPicoCompanionPendingReply({
      sodium,
      book,
      sealed: sealTo(settled.replyPublicKeyHex, 'the answer'),
      nowMs,
    })).toBeUndefined();
  });

  it('will not open a reply whose request has expired', () => {
    // Expiry deletes the key, not merely the bookkeeping: keeping it would be
    // keeping a decryption capability for an answer nothing will accept.
    const stale = issue('req-1', { expiresAt: '2026-08-12T10:00:00.000Z' });
    const book = parsePicoCompanionPendingReplyBook({
      schema: 'pico.companion.pending-reply.v1',
      pending: [stale],
    });
    expect(openPicoCompanionPendingReply({
      sodium,
      book,
      sealed: sealTo(stale.replyPublicKeyHex, 'too late'),
      nowMs,
    })).toBeUndefined();
    expect(prunePicoCompanionPendingReplies(book, nowMs).pending).toEqual([]);
  });

  it('refuses a full book rather than dropping an outstanding key', () => {
    // Dropping one to fit a new request loses an answer already on its way,
    // and the caller who would notice is not the one asking now.
    let book = emptyPicoCompanionPendingReplyBook;
    for (let index = 0; index < maxPicoCompanionPendingReplies; index += 1) {
      book = addPicoCompanionPendingReply(book, issue(`req-${index}`), nowMs);
    }
    expect(() => addPicoCompanionPendingReply(book, issue('one-too-many'), nowMs))
      .toThrow('companion_pending_reply_book_full');
    expect(book.pending).toHaveLength(maxPicoCompanionPendingReplies);
  });

  it('makes room by expiry rather than by eviction', () => {
    let book = emptyPicoCompanionPendingReplyBook;
    for (let index = 0; index < maxPicoCompanionPendingReplies; index += 1) {
      book = addPicoCompanionPendingReply(book, issue(`req-${index}`, {
        expiresAt: '2026-08-12T10:00:00.000Z',
      }), Date.parse('2026-08-12T09:00:00.000Z'));
    }
    // Every one of them is past its expiry now, so the new request fits.
    expect(addPicoCompanionPendingReply(book, issue('fresh'), nowMs).pending).toHaveLength(1);
  });

  it('refuses two keys under one request id', () => {
    // Settling would be ambiguous, and the ambiguity would be resolved by
    // deleting the wrong one.
    const book = addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, issue('req-1'), nowMs);
    expect(() => addPicoCompanionPendingReply(book, issue('req-1'), nowMs))
      .toThrow('companion_pending_reply_listed_twice');
    expect(() => parsePicoCompanionPendingReplyBook({
      schema: 'pico.companion.pending-reply.v1',
      pending: [issue('req-1'), issue('req-1')],
    })).toThrow('companion_pending_reply_listed_twice');
  });
});

describe('ADR 0149 - the book on disk', () => {
  it('round-trips through an atomic 0600 write', () => {
    const path = bookPath();
    const book = addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, issue('req-1'), nowMs);
    writePicoCompanionPendingReplyBook(path, book);
    expect(readPicoCompanionPendingReplyBook(path)).toEqual(book);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(existsSync(`${path}.tmp`)).toBe(false);
  });

  it('survives a restart, which is the only reason the key is written at all', () => {
    // A key that died with the process would make every relayed reply
    // unreadable after a sleep - and a relay exists precisely because the two
    // ends are not online together.
    const path = bookPath();
    const pending = issue('req-1');
    writePicoCompanionPendingReplyBook(
      path,
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, pending, nowMs),
    );

    const reopened = readPicoCompanionPendingReplyBook(path);
    const opened = openPicoCompanionPendingReply({
      sodium,
      book: reopened,
      sealed: sealTo(pending.replyPublicKeyHex, 'answered while asleep'),
      nowMs,
    });
    expect(new TextDecoder().decode(opened!.opened)).toBe('answered while asleep');
  });

  it('reads an absent book as nothing outstanding, and clears to the same', () => {
    const path = bookPath();
    expect(readPicoCompanionPendingReplyBook(path)).toEqual(emptyPicoCompanionPendingReplyBook);
    writePicoCompanionPendingReplyBook(
      path,
      addPicoCompanionPendingReply(emptyPicoCompanionPendingReplyBook, issue('req-1'), nowMs),
    );
    clearPicoCompanionPendingReplyBook(path);
    expect(existsSync(path)).toBe(false);
    expect(() => clearPicoCompanionPendingReplyBook(path)).not.toThrow();
  });

  it('names an unreadable book rather than reading it as empty', () => {
    // Empty means "nothing outstanding". A corrupt file read as empty would
    // silently discard every key for answers already on their way.
    const path = bookPath();
    writeFileSync(path, '{ not json');
    expect(() => readPicoCompanionPendingReplyBook(path))
      .toThrow('unreadable_companion_pending_reply_book');
  });

  it('refuses an unknown key and a key of the wrong length', () => {
    expect(() => parsePicoCompanionPendingReplyBook({
      schema: 'pico.companion.pending-reply.v1',
      pending: [],
      operator: 'relay.example.invalid',
    })).toThrow('companion_pending_reply_book_carries_no:operator');

    expect(() => parsePicoCompanionPendingReplyBook({
      schema: 'pico.companion.pending-reply.v1',
      pending: [{ ...issue('req-1'), replySecretKeyHex: 'ab' }],
    })).toThrow('invalid_companion_pending_reply_key');
  });

  it('refuses a book past the ceiling on the way in', () => {
    expect(() => parsePicoCompanionPendingReplyBook({
      schema: 'pico.companion.pending-reply.v1',
      pending: Array.from(
        { length: maxPicoCompanionPendingReplies + 1 },
        (_value, index) => issue(`req-${index}`),
      ),
    })).toThrow('invalid_companion_pending_reply_book');
  });
});
