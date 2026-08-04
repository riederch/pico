import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hasPicoExposureWindowElapsed } from '@pico/protocol';

/**
 * Operator sessions (ADR 0075 A5, ADR 0076).
 *
 * Sessions are opaque, high-entropy and server-side. There are deliberately no
 * signed self-contained tokens: a signature scheme would pull ADR 0034
 * canonicalization into the authentication trust path before it exists, while
 * an opaque identifier needs nothing but a CSPRNG and a hash.
 *
 * Sessions are held in memory and are **never** written to SQLite. That is the
 * point, not an omission: no backup can hold a session, so no restore can
 * resurrect a revoked one (ADR 0076). The cost is honest — a process restart
 * ends every session and the operator logs in again.
 *
 * Only digests are stored, compared in constant time, so a memory disclosure of
 * this map does not yield usable session credentials.
 */

const SESSION_BYTES = 32;

export interface SessionStoreOptions {
  /** Sliding inactivity window; each successful use extends it. */
  idleTimeoutMs?: number;
  /** Hard ceiling regardless of activity. */
  absoluteTimeoutMs?: number;
  /** Cap on concurrent sessions; the oldest is evicted first. */
  maxSessions?: number;
  now?: () => number;
  /** ADR 0120 N1. The second clock; defaults to the process monotonic one. */
  monotonicNow?: () => number;
}

export interface IssuedSession {
  /** The raw credential. Returned once, never stored, never logged. */
  value: string;
  expiresAtMs: number;
}

export type SessionPrincipal =
  | {
    readonly kind: 'operator';
    readonly homeBinding?: {
      readonly homeId: string;
      readonly foundingId: string;
      readonly hostSigningKeyFingerprintHex: string;
    };
  }
  | {
    readonly kind: 'pico_identity';
    readonly picoIdentityFingerprintHex: string;
    readonly deviceSigningKeyFingerprintHex: string;
    readonly deviceKeyAgreementKeyFingerprintHex: string;
    readonly delegationId: string;
  };

interface SessionRecord {
  idleExpiresAtMs: number;
  absoluteExpiresAtMs: number;
  createdAtMs: number;
  /**
   * ADR 0120 N1. Sessions are exposure windows: the person is protected by
   * the end, so the earliest clock wins. These are the monotonic readings the
   * wall-clock expiries above were derived from, kept so a wall clock wound
   * backward cannot hand a session more life than it had.
   */
  idleStartedAtMonotonicMs: number;
  absoluteStartedAtMonotonicMs: number;
  principal: SessionPrincipal;
}

export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const DEFAULT_SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 32;

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  private readonly idleTimeoutMs: number;

  private readonly absoluteTimeoutMs: number;

  private readonly maxSessions: number;

  private readonly now: () => number;

  private readonly monotonicNow: () => number;

  public constructor(options: SessionStoreOptions = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
    this.absoluteTimeoutMs = options.absoluteTimeoutMs ?? DEFAULT_SESSION_ABSOLUTE_TIMEOUT_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.now = options.now ?? Date.now;
    this.monotonicNow = options.monotonicNow ?? (() => performance.now());
  }

  public issue(principal: SessionPrincipal = { kind: 'operator' }): IssuedSession {
    this.purgeExpired();

    if (this.sessions.size >= this.maxSessions) {
      this.evictOldest();
    }

    const value = randomBytes(SESSION_BYTES).toString('base64url');
    const nowMs = this.now();
    const absoluteExpiresAtMs = nowMs + this.absoluteTimeoutMs;
    const idleExpiresAtMs = Math.min(nowMs + this.idleTimeoutMs, absoluteExpiresAtMs);

    const monotonicMs = this.monotonicNow();
    this.sessions.set(digest(value), {
      idleExpiresAtMs,
      absoluteExpiresAtMs,
      createdAtMs: nowMs,
      idleStartedAtMonotonicMs: monotonicMs,
      absoluteStartedAtMonotonicMs: monotonicMs,
      principal: clonePrincipal(principal),
    });

    return { value, expiresAtMs: idleExpiresAtMs };
  }

  /**
   * Validates a session and extends its idle window. Returns the effective
   * expiry, or undefined when the session is unknown or expired.
   */
  public touch(value: string | undefined): { expiresAtMs: number; principal: SessionPrincipal } | undefined {
    const key = this.lookup(value);

    if (key === undefined) {
      return undefined;
    }

    const record = this.sessions.get(key);

    if (record === undefined) {
      return undefined;
    }

    const nowMs = this.now();

    if (this.hasExpired(record, nowMs)) {
      this.sessions.delete(key);
      return undefined;
    }

    record.idleExpiresAtMs = Math.min(nowMs + this.idleTimeoutMs, record.absoluteExpiresAtMs);
    record.idleStartedAtMonotonicMs = this.monotonicNow();

    return { expiresAtMs: record.idleExpiresAtMs, principal: clonePrincipal(record.principal) };
  }

  /** Digest of a live session, used to scope derived credentials such as tickets. */
  public digestOf(value: string | undefined): string | undefined {
    return this.lookup(value);
  }

  public revoke(value: string | undefined): boolean {
    const key = this.lookup(value);

    if (key === undefined) {
      return false;
    }

    return this.sessions.delete(key);
  }

  /** Revokes every session, including the caller's. Returns how many were live. */
  public revokeAll(): number {
    this.purgeExpired();

    const revoked = this.sessions.size;
    this.sessions.clear();

    return revoked;
  }

  public size(): number {
    this.purgeExpired();

    return this.sessions.size;
  }

  private lookup(value: string | undefined): string | undefined {
    if (value === undefined || value.length === 0) {
      return undefined;
    }

    const candidate = digest(value);

    // Constant-time comparison against each live digest: a lookup by map key
    // would compare the digest byte-wise in a way we do not control.
    for (const key of this.sessions.keys()) {
      if (equalsConstantTime(key, candidate)) {
        return key;
      }
    }

    return undefined;
  }

  private purgeExpired(): void {
    const nowMs = this.now();

    for (const [key, record] of this.sessions) {
      if (this.hasExpired(record, nowMs)) {
        this.sessions.delete(key);
      }
    }
  }

  /**
   * ADR 0120 N1. Both halves are exposure windows, so each expires at the
   * earliest instant either clock allows.
   */
  private hasExpired(record: SessionRecord, nowMs: number): boolean {
    const monotonicNowMs = this.monotonicNow();
    return hasPicoExposureWindowElapsed({
      endsAtMs: record.idleExpiresAtMs,
      nowMs,
      monotonic: {
        startedAtMs: record.idleStartedAtMonotonicMs,
        nowMs: monotonicNowMs,
        durationMs: this.idleTimeoutMs,
      },
    }) || hasPicoExposureWindowElapsed({
      endsAtMs: record.absoluteExpiresAtMs,
      nowMs,
      monotonic: {
        startedAtMs: record.absoluteStartedAtMonotonicMs,
        nowMs: monotonicNowMs,
        durationMs: this.absoluteTimeoutMs,
      },
    });
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestCreatedAtMs = Number.POSITIVE_INFINITY;

    for (const [key, record] of this.sessions) {
      if (record.createdAtMs < oldestCreatedAtMs) {
        oldestCreatedAtMs = record.createdAtMs;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.sessions.delete(oldestKey);
    }
  }
}

function clonePrincipal(principal: SessionPrincipal): SessionPrincipal {
  if (principal.kind === 'operator') {
    return {
      kind: 'operator',
      ...(principal.homeBinding === undefined ? {} : { homeBinding: { ...principal.homeBinding } }),
    };
  }

  return {
    kind: 'pico_identity',
    picoIdentityFingerprintHex: principal.picoIdentityFingerprintHex,
    deviceSigningKeyFingerprintHex: principal.deviceSigningKeyFingerprintHex,
    deviceKeyAgreementKeyFingerprintHex: principal.deviceKeyAgreementKeyFingerprintHex,
    delegationId: principal.delegationId,
  };
}

export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function equalsConstantTime(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}
