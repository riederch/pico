import { isHexOfBytes } from '@pico/protocol/canonical-bytes';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * ADR 0149's collecting side, on the device - and the one place a relay makes
 * a device keep something it would rather not.
 *
 * A response under ADR 0107 is sealed to a **fresh key per request**, which
 * the device generates when it asks. Over the direct channel that key lives
 * for the length of one HTTP call and dies with it. Over a relay it cannot:
 * the whole reason a relay exists is that the two ends are not online
 * together, so the answer arrives after the asking process is gone. A key that
 * died with the process would make every relayed reply permanently unreadable,
 * and the packet would sit in the mailbox until it expired.
 *
 * **So the reply key is written down, and that is a real exposure stated
 * rather than argued away.** What it decrypts is exactly one response, for at
 * most that request's own lifetime, and it is deleted the moment the reply is
 * opened or the request expires - whichever comes first. It is not a
 * person-role key (ADR 0081) and must never be treated as one: nothing signs
 * with it, no ceremony consults it, and losing every one of them costs a
 * person a round of retries.
 *
 * **Matching is by trial and not by lookup**, because ADR 0107's response
 * envelope carries nothing outside the seal but a schema. That is not a
 * shortcoming to route around; it is the same property the relay envelope has,
 * and it means a carrier holding a reply learns nothing about which request it
 * answers. The key that opens it is the match.
 */
export const picoCompanionPendingReplySchema =
  'pico.companion.pending-reply.v1' as const;

/**
 * How many requests may be outstanding at once.
 *
 * Bounded because each one is a stored decryption key, and an unbounded list
 * is an unbounded pile of them. Sixteen is generous for a device that asks and
 * waits; a device with seventeen outstanding is one whose answers are not
 * arriving, and issuing an eighteenth key would not help it.
 */
export const maxPicoCompanionPendingReplies = 16;

export interface PicoCompanionPendingReply {
  /** The request this answers, for the caller once the reply is open. */
  requestId: string;
  /** ADR 0107's per-request reply key, as sent. */
  replyPublicKeyHex: string;
  /** Its secret half. Deleted on settle or expiry; see the note above. */
  replySecretKeyHex: string;
  createdAt: string;
  /** The request's own expiry. Past it, no answer is worth opening. */
  expiresAt: string;
}

export interface PicoCompanionPendingReplyBook {
  schema: typeof picoCompanionPendingReplySchema;
  pending: readonly PicoCompanionPendingReply[];
}

export interface PicoCompanionReplySodium {
  crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_box_seal_open(
    ciphertext: Uint8Array,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array;
}

export function defaultPicoCompanionPendingReplyPath(profilePath: string): string {
  return join(dirname(profilePath), 'pending-replies.json');
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * Mints a reply key for one request. The caller sends the public half in the
 * ADR 0107 request and records the whole thing before the request leaves.
 *
 * Before, never after: a request that went out while its key was only in
 * memory is one whose answer a crash makes unreadable, and the answer would
 * still be delivered.
 */
export function issuePicoCompanionPendingReply(input: {
  sodium: PicoCompanionReplySodium;
  requestId: string;
  createdAt: string;
  expiresAt: string;
}): PicoCompanionPendingReply {
  if (typeof input.requestId !== 'string' || input.requestId === '') {
    throw new Error('invalid_companion_pending_reply');
  }
  const pair = input.sodium.crypto_box_keypair();
  return Object.freeze({
    requestId: input.requestId,
    replyPublicKeyHex: hex(pair.publicKey),
    replySecretKeyHex: hex(pair.privateKey),
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
}

export function parsePicoCompanionPendingReplyBook(
  value: unknown,
): PicoCompanionPendingReplyBook {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_companion_pending_reply_book');
  }
  const record = value as Record<string, unknown>;
  const known = ['schema', 'pending'];
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    throw new Error(`companion_pending_reply_book_carries_no:${unexpected}`);
  }
  if (record.schema !== picoCompanionPendingReplySchema) {
    throw new Error('invalid_companion_pending_reply_schema');
  }
  if (!Array.isArray(record.pending) || record.pending.length > maxPicoCompanionPendingReplies) {
    throw new Error('invalid_companion_pending_reply_book');
  }
  const pending = record.pending.map(parsePendingReply);
  if (new Set(pending.map((entry) => entry.requestId)).size !== pending.length) {
    // Two keys under one request id would make settling ambiguous, and the
    // ambiguity would be resolved by deleting the wrong one.
    throw new Error('companion_pending_reply_listed_twice');
  }
  return Object.freeze({ schema: picoCompanionPendingReplySchema, pending: Object.freeze(pending) });
}

function parsePendingReply(value: unknown): PicoCompanionPendingReply {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_companion_pending_reply');
  }
  const record = value as Record<string, unknown>;
  const known = ['requestId', 'replyPublicKeyHex', 'replySecretKeyHex', 'createdAt', 'expiresAt'];
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    throw new Error(`companion_pending_reply_carries_no:${unexpected}`);
  }
  for (const field of known) {
    if (typeof record[field] !== 'string' || record[field] === '') {
      throw new Error('invalid_companion_pending_reply');
    }
  }
  for (const field of ['replyPublicKeyHex', 'replySecretKeyHex'] as const) {
    const held = record[field] as string;
    if (!isHexOfBytes(held, 32)) {
      throw new Error('invalid_companion_pending_reply_key');
    }
  }
  return Object.freeze({
    requestId: record.requestId as string,
    replyPublicKeyHex: record.replyPublicKeyHex as string,
    replySecretKeyHex: record.replySecretKeyHex as string,
    createdAt: record.createdAt as string,
    expiresAt: record.expiresAt as string,
  });
}

export const emptyPicoCompanionPendingReplyBook: PicoCompanionPendingReplyBook = Object.freeze({
  schema: picoCompanionPendingReplySchema,
  pending: Object.freeze([]),
});

/** ADR 0119 Q5's posture: a full book refuses and never drops an outstanding key. */
export function addPicoCompanionPendingReply(
  book: PicoCompanionPendingReplyBook,
  reply: PicoCompanionPendingReply,
  nowMs: number,
): PicoCompanionPendingReplyBook {
  const live = prunePicoCompanionPendingReplies(book, nowMs).pending;
  if (live.some((entry) => entry.requestId === reply.requestId)) {
    throw new Error('companion_pending_reply_listed_twice');
  }
  if (live.length >= maxPicoCompanionPendingReplies) {
    // Refused rather than making room. Dropping an outstanding key to fit a
    // new one loses an answer that is already on its way, and the caller who
    // would notice is not the one asking now.
    throw new Error('companion_pending_reply_book_full');
  }
  return parsePicoCompanionPendingReplyBook({
    schema: picoCompanionPendingReplySchema,
    pending: [...live, reply],
  });
}

/**
 * Drops what can no longer be answered usefully.
 *
 * Expiry deletes the **key**, not merely the bookkeeping: a pending reply past
 * its request's expiry is one whose answer nothing will accept, so keeping its
 * key would be keeping a decryption capability for nothing.
 */
export function prunePicoCompanionPendingReplies(
  book: PicoCompanionPendingReplyBook,
  nowMs: number,
): PicoCompanionPendingReplyBook {
  return Object.freeze({
    schema: picoCompanionPendingReplySchema,
    pending: Object.freeze(book.pending.filter((entry) => Date.parse(entry.expiresAt) > nowMs)),
  });
}

export function settlePicoCompanionPendingReply(
  book: PicoCompanionPendingReplyBook,
  requestId: string,
): PicoCompanionPendingReplyBook {
  return Object.freeze({
    schema: picoCompanionPendingReplySchema,
    pending: Object.freeze(book.pending.filter((entry) => entry.requestId !== requestId)),
  });
}

export interface PicoCompanionOpenedReply {
  requestId: string;
  /** The ADR 0107 sealed-response bytes, for the machinery that verifies them. */
  opened: Uint8Array;
}

/**
 * ADR 0149. Finds which outstanding request a collected reply answers, by
 * being the only key that opens it.
 *
 * **Trial rather than lookup**, because ADR 0107's response envelope carries
 * nothing outside the seal but a schema - and that absence is worth keeping.
 * A correlator on the outside would tell a carrier which reply belongs to
 * which request, and one that survived a restart would tell it across
 * sessions. The cost is one seal-open per outstanding request, which is
 * bounded above at sixteen.
 *
 * `undefined` for a reply nothing opens. That is the ordinary duplicate: the
 * relay is at-least-once by design (ADR 0149 RS5), so a reply already settled
 * arrives again and finds no key. It is not an error and the caller
 * acknowledges it.
 */
export function openPicoCompanionPendingReply(input: {
  sodium: PicoCompanionReplySodium;
  book: PicoCompanionPendingReplyBook;
  sealed: Uint8Array;
  nowMs: number;
}): PicoCompanionOpenedReply | undefined {
  for (const entry of prunePicoCompanionPendingReplies(input.book, input.nowMs).pending) {
    try {
      const opened = input.sodium.crypto_box_seal_open(
        input.sealed,
        bytes(entry.replyPublicKeyHex),
        bytes(entry.replySecretKeyHex),
      );
      return Object.freeze({ requestId: entry.requestId, opened });
    } catch {
      // Not this one. A failed open says nothing about the packet and nothing
      // about the key; only the one that succeeds says anything at all.
      continue;
    }
  }
  return undefined;
}

export function readPicoCompanionPendingReplyBook(
  path: string,
): PicoCompanionPendingReplyBook {
  if (!existsSync(path)) {
    return emptyPicoCompanionPendingReplyBook;
  }
  try {
    return parsePicoCompanionPendingReplyBook(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    throw new Error(`unreadable_companion_pending_reply_book:${(error as Error).message}`);
  }
}

export function writePicoCompanionPendingReplyBook(
  path: string,
  book: PicoCompanionPendingReplyBook,
): void {
  const parsed = parsePicoCompanionPendingReplyBook(book);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  fsyncPath(temporaryPath, 'r+');
  renameSync(temporaryPath, path);
  fsyncPath(dirname(path), 'r');
}

/** Nothing outstanding is nothing to keep: the file goes rather than emptying. */
export function clearPicoCompanionPendingReplyBook(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  unlinkSync(path);
  fsyncPath(dirname(path), 'r');
}

function fsyncPath(path: string, flags: 'r' | 'r+'): void {
  const handle = openSync(path, flags);
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}
