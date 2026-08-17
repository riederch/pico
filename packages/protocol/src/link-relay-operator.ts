/**
 * ADR 0154 - the surface a relay's operator administers it over, and the one
 * thing it has in common with the mailbox surface: it never learns a Pico.
 *
 * **A second listener, not five more routes.** ADR 0153 PK3 keeps the mailbox
 * port at exactly five routes that answer an unknown route the way they answer
 * a wrong method, so the surface carries no map of itself. Administration
 * lives on its own port for that reason and for a second one - "expose the
 * relay" and "expose its administration" become two deliberate acts instead of
 * one.
 *
 * Everything here is a bearer credential and a number. No identity, no
 * delegation, no signature: ADR 0149 RS2 is a property of the whole process,
 * not of one file, and administration is exactly where it would have been
 * convenient to break it.
 */

/** 128 bits, lowercase hex - the same shape an account credential has. */
export const picoRelayOperatorCredentialPattern = /^[0-9a-f]{32}$/u;

/**
 * The claim code, base64url. Wider than a credential because it is read off a
 * screen and typed once, and because it is spent on first use - the cost of a
 * few extra characters is one paste.
 */
export const picoRelayClaimCodePattern = /^[A-Za-z0-9_-]{32,128}$/u;

/** ADR 0154 RO1. The header an operator credential arrives in. */
export const picoRelayOperatorHeader = 'x-pico-relay-operator' as const;

/**
 * Four operations, and the first one is the only one that takes no operator
 * credential - because before it there is none to take.
 *
 * A fifth, `describe`, was written and removed on 2026-08-17 before anything
 * called it: `claim` already returns the operator name and `accounts/list`
 * already fails when a relay is unreachable, so it answered nothing a caller
 * could not already learn. A route with no consumer is a surface somebody has
 * to keep working forever for nobody.
 */
export const picoRelayOperatorRoutes = Object.freeze({
  /** Trade the claim code for the operator credential. Once. */
  claim: '/operator/claim',
  /** Issue an account. The relay generates the credential (RO3). */
  accountCreate: '/operator/accounts/create',
  /** End one. The credential stops working; the row stays (RO5). */
  accountRevoke: '/operator/accounts/revoke',
  /** What this relay holds, without the credentials it no longer keeps. */
  accountList: '/operator/accounts/list',
} as const);

export type PicoRelayOperatorRoute =
  typeof picoRelayOperatorRoutes[keyof typeof picoRelayOperatorRoutes];

export interface PicoRelayAccountSummary {
  /**
   * A short, non-secret handle for one account.
   *
   * **Not the credential and not derived from it in a reversible way** - it is
   * the first bytes of the digest the relay keeps (RO4), which is what an
   * operator needs in order to point at a row and revoke it. Naming an account
   * by its credential would have meant a list route that hands every key back.
   */
  accountRef: string;
  status: 'active' | 'revoked';
  mailboxQuota: number;
  maxCapacity: number;
  /** How many mailboxes this account currently holds open. */
  openMailboxes: number;
  createdAt: string;
  revokedAt?: string;
}

/**
 * ADR 0154 RO5. What ending an account actually ended.
 *
 * Carried rather than implied: revoking is the one destructive thing an
 * operator does here, and the only reader of a dropped queue is the account
 * that just stopped existing - so if these numbers do not travel, nothing can
 * observe what happened, including the person who pressed the button.
 */
export interface PicoRelayRevocation {
  accountRef: string;
  mailboxesEnded: number;
  packetsDropped: number;
}

export const maxPicoRelayMailboxQuota = 1_000;
export const maxPicoRelayAccountCapacity = 10_000;
/** ADR 0154 RO4. Enough of the digest to point at one row and no more. */
export const picoRelayAccountRefLength = 12;

export interface PicoRelayClaimRequest {
  claimCode: string;
}

/**
 * ADR 0154 RO6. What an account is bounded by, on both axes.
 *
 * `mailboxQuota` was always the operator's. `maxCapacity` was not: packets per
 * mailbox came from the caller's register request and was stored unchecked, so
 * an account with a quota of one could ask for a mailbox holding a million.
 */
export interface PicoRelayAccountCreateRequest {
  mailboxQuota: number;
  maxCapacity: number;
}

export interface PicoRelayAccountRevokeRequest {
  accountRef: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_pico_relay_operator_request');
  }
  return value as Record<string, unknown>;
}

function exactly(record: Record<string, unknown>, known: readonly string[]): void {
  const unexpected = Object.keys(record).find((key) => !known.includes(key));
  if (unexpected !== undefined) {
    throw new Error(`pico_relay_operator_request_carries_no:${unexpected}`);
  }
  const missing = known.find((key) => !(key in record));
  if (missing !== undefined) {
    throw new Error(`missing_pico_relay_operator_field:${missing}`);
  }
}

function boundedInteger(value: unknown, name: string, ceiling: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > ceiling) {
    throw new Error(`invalid_pico_relay_${name}`);
  }
  return value;
}

export function parsePicoRelayClaimRequest(value: unknown): PicoRelayClaimRequest {
  const record = asRecord(value);
  exactly(record, ['claimCode']);
  if (typeof record.claimCode !== 'string'
    || !picoRelayClaimCodePattern.test(record.claimCode)) {
    throw new Error('invalid_pico_relay_claim_code');
  }
  return Object.freeze({ claimCode: record.claimCode });
}

export function parsePicoRelayAccountCreateRequest(
  value: unknown,
): PicoRelayAccountCreateRequest {
  const record = asRecord(value);
  exactly(record, ['mailboxQuota', 'maxCapacity']);
  return Object.freeze({
    mailboxQuota: boundedInteger(record.mailboxQuota, 'mailbox_quota', maxPicoRelayMailboxQuota),
    maxCapacity: boundedInteger(record.maxCapacity, 'account_capacity', maxPicoRelayAccountCapacity),
  });
}

export function parsePicoRelayAccountRevokeRequest(
  value: unknown,
): PicoRelayAccountRevokeRequest {
  const record = asRecord(value);
  exactly(record, ['accountRef']);
  if (typeof record.accountRef !== 'string'
    || !new RegExp(`^[0-9a-f]{${picoRelayAccountRefLength}}$`, 'u').test(record.accountRef)) {
    throw new Error('invalid_pico_relay_account_ref');
  }
  return Object.freeze({ accountRef: record.accountRef });
}

export function assertPicoRelayOperatorCredential(value: unknown): string {
  if (typeof value !== 'string' || !picoRelayOperatorCredentialPattern.test(value)) {
    throw new Error('invalid_pico_relay_operator_credential');
  }
  return value;
}

/**
 * ADR 0154. What an administration call is told when it is refused.
 *
 * `already_claimed` and `invalid_claim_code` are told apart on purpose: the
 * first is a state an operator can see from the log, the second is a typo, and
 * folding them together would send somebody looking for a lost code that is
 * sitting spent. Neither reveals anything a caller reaching this port does not
 * already know by reaching it.
 */
export const picoRelayOperatorRefusals = [
  'already_claimed',
  'invalid_claim_code',
  'not_claimed',
  'unknown_account',
  'account_already_revoked',
] as const;

export type PicoRelayOperatorRefusal = typeof picoRelayOperatorRefusals[number];
