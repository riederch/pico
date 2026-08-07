import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digest } from './session-store.js';

/**
 * Operator bootstrap and local reset (ADR 0076).
 *
 * While no operator exists, the first one is established by presenting an
 * Operator Bootstrap Code that only the host's local channel reveals — the
 * process log here, the ADR 0027 protected-display-channel pattern generally.
 *
 * A code is required rather than trusting the first caller, because under
 * `trusted-proxy` the first caller is not necessarily the operator: anything
 * the proxy serves on its shared origin can reach the path - every App page on
 * a Home Assistant install, for instance. Reading the host's log requires the
 * local control that ADR 0027 demands, on every platform, with no
 * platform-specific display path.
 *
 * The code lives for the process only: a restart mints a new one, which is
 * itself proof of local control and keeps bootstrap state out of the database
 * and its backups (the same reasoning as ADR 0039 tickets and sessions).
 *
 * This is not a Move-In Code. It bootstraps Foundation administration, not the
 * claim of an Empty Pico Home (ADR 0024/0027); it is not a master key, not a
 * recovery secret and not a durable admin credential (ADR 0075 A11).
 */

const BOOTSTRAP_CODE_BYTES = 24;

/** Marker file whose presence clears the operator on the next start. */
export const OPERATOR_RESET_MARKER_FILENAME = 'operator-reset';

export class OperatorBootstrapCode {
  private codeDigest: string | undefined;

  private value: string | undefined;

  /** Mints the per-process code. Called only while no operator exists. */
  public mint(): string {
    const value = randomBytes(BOOTSTRAP_CODE_BYTES).toString('base64url');

    this.value = value;
    this.codeDigest = digest(value);

    return value;
  }

  public isPending(): boolean {
    return this.codeDigest !== undefined;
  }

  /**
   * Consumes the code. Single use: a successful match clears it, so a leaked
   * log line cannot be replayed after the first bootstrap.
   */
  public consume(candidate: unknown): boolean {
    if (this.codeDigest === undefined || typeof candidate !== 'string' || candidate.length === 0) {
      return false;
    }

    const expected = Buffer.from(this.codeDigest, 'utf8');
    const actual = Buffer.from(digest(candidate), 'utf8');

    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return false;
    }

    this.clear();

    return true;
  }

  /** Drops the code, e.g. once an operator exists. */
  public clear(): void {
    this.codeDigest = undefined;
    this.value = undefined;
  }

  /** The raw code, for the one log line that surfaces it on the local channel. */
  public current(): string | undefined {
    return this.value;
  }
}

export function operatorResetMarkerPath(databasePath: string): string {
  return join(dirname(databasePath), OPERATOR_RESET_MARKER_FILENAME);
}

/**
 * Consumes a pending local reset marker, if present.
 *
 * Recovery for a forgotten passphrase is an explicit local act, never a remote
 * endpoint and never a backdoor: creating this file requires filesystem control
 * of the host. It is consumed on read so a reset happens once rather than on
 * every restart.
 *
 * Honest limit: whoever controls the host filesystem or console defeats
 * operator authentication. That is not a defect — host control already implies
 * process control and key access (ADR 0071/0072 scope). Operator auth defends
 * the network surface, not the host.
 */
export function consumeOperatorResetMarker(databasePath: string): boolean {
  const markerPath = operatorResetMarkerPath(databasePath);

  if (!existsSync(markerPath)) {
    return false;
  }

  rmSync(markerPath, { force: true });

  return true;
}
