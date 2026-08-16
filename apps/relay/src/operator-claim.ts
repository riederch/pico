import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * ADR 0154 RO2. The one-time code that turns an unclaimed relay into somebody's.
 *
 * **In memory, never in `/data`.** A claim code written beside the database
 * would be handed to whoever restores a backup, and a relay's backup is the
 * one artifact an operator hands around. It is minted per process while no
 * operator credential exists, cleared on use, and re-minted on restart - so
 * the window a leaked log line opens is one restart wide.
 *
 * A near-copy of the Home's `OperatorBootstrapCode`, and copied rather than
 * imported: ADR 0149 RS1 says the relay reaches nothing of the person's, and
 * `@pico/core` is the first thing on that list. Sixty lines across a boundary
 * that exists on purpose is the cheaper of the two costs.
 */

/** Wide, because it is read off a screen once and then spent. */
const CLAIM_CODE_BYTES = 32;

export class PicoRelayClaimCode {
  private digest: string | undefined;

  /** Mints the per-process code. Called only while no operator exists. */
  public mint(): string {
    const value = randomBytes(CLAIM_CODE_BYTES).toString('base64url');
    this.digest = sha256(value);
    return value;
  }

  public isPending(): boolean {
    return this.digest !== undefined;
  }

  /**
   * Consumes the code. Single use: a successful match clears it, so a leaked
   * log line cannot be replayed after the first claim.
   */
  public consume(candidate: unknown): boolean {
    if (this.digest === undefined || typeof candidate !== 'string' || candidate.length === 0) {
      return false;
    }
    const expected = Buffer.from(this.digest, 'utf8');
    const actual = Buffer.from(sha256(candidate), 'utf8');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return false;
    }
    this.clear();
    return true;
  }

  public clear(): void {
    this.digest = undefined;
  }
}

/**
 * ADR 0154 RO3/RO4. How a credential is made, and what is kept of it.
 *
 * 128 bits from the system generator, hex, matching the shape ADR 0149 fixed
 * for an account - because the credential *is* the identifier and a shape that
 * can be arrived at by counting is a name somebody can guess.
 */
export function mintPicoRelayCredential(): string {
  return randomBytes(16).toString('hex');
}

/**
 * What the relay stores instead of the credential.
 *
 * A plain digest with no salt and no stretching, and that is the right
 * primitive here rather than a lazy one: the input is 128 uniform random bits
 * this process generated, so there is no dictionary to attack and no
 * lower-entropy sibling to slow an attacker down against. Stretching would
 * cost a hash per request and buy nothing a passphrase-shaped input needs.
 */
export function picoRelayCredentialDigest(credential: string): string {
  return sha256(credential);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
