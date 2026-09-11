import { hexOfBytesPattern, isHexOfBytes } from './canonical-bytes.js';
import { picoLinkMailboxPattern } from './link-packet.js';

/**
 * ADR 0149 - the surface a caller reaches a relay over.
 *
 * **Every operation is a POST and the mailbox travels in the body**, which is
 * not a REST preference. ADR 0148 EX4 says a mailbox address must not become
 * part of a URL, because a URL lands in proxy logs, browser history and
 * referer headers, none of which anybody chose. The obvious design -
 * `GET /mailbox/:mailbox` - would put a capability in all three, so the
 * obvious design is out.
 *
 * Four operations and no more. `deliver` takes no credential and the other
 * three take an account, which is ADR 0149 RS2/RS3 expressed as a route table:
 * there is nothing on a packet to authenticate, and everything else is
 * somebody's mailbox.
 */
export const picoLinkRelayRoutes = Object.freeze({
  /** Take a mailbox for this account. */
  register: '/relay/register',
  /** Put a packet in one. No credential - ADR 0147 RY1 left nothing to check. */
  deliver: '/relay/deliver',
  /** Read what is waiting, removing nothing (ADR 0149 RS5). */
  collect: '/relay/collect',
  /** Remove what has been taken durably. */
  acknowledge: '/relay/acknowledge',
  /** End a mailbox, leaving the tombstone ADR 0147 RY4 needs. */
  deregister: '/relay/deregister',
} as const);

export type PicoLinkRelayRoute = typeof picoLinkRelayRoutes[keyof typeof picoLinkRelayRoutes];

/**
 * ADR 0149 RS2. The header an account credential arrives in.
 *
 * A bearer credential, and **the credential is the account identifier**. That
 * is only safe because the pattern below forces it to be unguessable: an
 * operator issuing `customer-7` would be issuing a password of `customer-7`.
 * Requiring the entropy in the shape is the same move ADR 0147 RY2 makes for a
 * mailbox, and for the same reason - a value that is handed around as a name
 * must not be one somebody can arrive at by counting.
 */
export const picoLinkRelayAccountHeader = 'x-pico-relay-account' as const;

/** 128 bits, lowercase hex. See the note above on why the shape carries this. */
export const picoLinkRelayAccountPattern = hexOfBytesPattern(16);

/**
 * Bounded so a carrier edge stays finite. The packet payload ceiling is 64 KiB
 * (ADR 0147 RY6), which is about 88 KB of base64, and the rest of an envelope
 * is small - so 128 KiB leaves room without leaving a hole.
 */
export const MAX_PICO_LINK_RELAY_BODY_BYTES = 128 * 1024;

/** How many packets one collect may answer with, so a reply stays boundable. */
export const MAX_PICO_LINK_RELAY_COLLECT_PACKETS = 64;

/** How many tags one acknowledgement may name. */
export const MAX_PICO_LINK_RELAY_ACKNOWLEDGE_TAGS = MAX_PICO_LINK_RELAY_COLLECT_PACKETS;

export interface PicoLinkRelayRegisterRequest {
  mailbox: string;
  capacity: number;
}

export interface PicoLinkRelayMailboxRequest {
  mailbox: string;
}

export interface PicoLinkRelayAcknowledgeRequest {
  mailbox: string;
  tags: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_link_relay_request');
  }
  return value as Record<string, unknown>;
}

function exactly(record: Record<string, unknown>, known: readonly string[]): void {
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    throw new Error(`pico_link_relay_request_carries_no:${unexpected}`);
  }
  const missing = known.find((key) => !(key in record));
  if (missing !== undefined) {
    throw new Error(`missing_pico_link_relay_field:${missing}`);
  }
}

function mailboxOf(value: unknown): string {
  if (typeof value !== 'string' || !picoLinkMailboxPattern.test(value)) {
    throw new Error('invalid_pico_link_mailbox');
  }
  return value;
}

export function assertPicoLinkRelayAccount(value: unknown): string {
  if (typeof value !== 'string' || !picoLinkRelayAccountPattern.test(value)) {
    throw new Error('invalid_pico_link_relay_account');
  }
  return value;
}

export function parsePicoLinkRelayRegisterRequest(
  value: unknown,
): PicoLinkRelayRegisterRequest {
  const record = asRecord(value);
  exactly(record, ['mailbox', 'capacity']);
  if (typeof record.capacity !== 'number'
    || !Number.isInteger(record.capacity)
    || record.capacity <= 0) {
    throw new Error('invalid_pico_link_relay_capacity');
  }
  return Object.freeze({ mailbox: mailboxOf(record.mailbox), capacity: record.capacity });
}

export function parsePicoLinkRelayMailboxRequest(
  value: unknown,
): PicoLinkRelayMailboxRequest {
  const record = asRecord(value);
  exactly(record, ['mailbox']);
  return Object.freeze({ mailbox: mailboxOf(record.mailbox) });
}

export function parsePicoLinkRelayAcknowledgeRequest(
  value: unknown,
): PicoLinkRelayAcknowledgeRequest {
  const record = asRecord(value);
  exactly(record, ['mailbox', 'tags']);
  if (!Array.isArray(record.tags)
    || record.tags.length > MAX_PICO_LINK_RELAY_ACKNOWLEDGE_TAGS
    || record.tags.some((tag) => typeof tag !== 'string' || !isHexOfBytes(tag, 16))) {
    throw new Error('invalid_pico_link_relay_tags');
  }
  return Object.freeze({
    mailbox: mailboxOf(record.mailbox),
    tags: Object.freeze([...record.tags as string[]]),
  });
}
