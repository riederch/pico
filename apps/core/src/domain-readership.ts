/**
 * Domain readership evaluation — the ADR 0075 A7 seam, specified by ADR 0077.
 *
 * Authority for the `domain-content` access class comes from here, and it is a
 * DISTINCT authority from the operator role: `mayRead` must never be answered by
 * "is this principal the operator". In a single-principal instance every domain
 * is the sole principal's own, so this trivially resolves to "reads all" — but
 * it stays a separate evaluation so a second principal (ADR 0029/0045) plugs in
 * here, and the operator never inherits read-all by role. A future Home Host
 * Pico administers the host (`host-admin*`) without thereby reading a resident's
 * content, and a future member reads only its own domains.
 *
 * It also never consults a memory item's stored `owner`/`controller`: those are
 * unverified writer input today (ADR 0077 C2), so authorizing on them would be
 * the ADR 0075 A4 spoofable-context failure applied to stored data.
 */

/** An authenticated principal, as far as domain readership is concerned. */
export interface ReadershipPrincipal {
  /**
   * Opaque digest of the authenticated session (never the raw session value).
   * The foundation-phase policy ignores it; a membership-backed policy keys on
   * the principal it identifies.
   */
  readonly sessionDigest: string;
  /**
   * Verified Pico identity bound to an ADR 0082 identity session. Operator
   * sessions deliberately do not have one, so membership-backed readership
   * fails closed for operators.
   */
  readonly picoIdentityFingerprintHex?: string;
}

export interface DomainReadership {
  mayRead(principal: ReadershipPrincipal, privacyDomain: string): boolean;
}

export interface HomeMembershipDirectory {
  hasActivePicoHomeMembership(picoIdentityFingerprintHex: string): boolean;
}

export interface DomainReadGrantDirectory {
  mayReadDomain(picoIdentityFingerprintHex: string, privacyDomain: string): boolean;
}

/**
 * Unclaimed Foundation readership: one authenticated principal reads every
 * domain because the instance has not established a Home authority root. Not
 * the operator role, and not keyed on stored ownership (ADR 0077 C1/C2).
 * Claimed Homes replace this with the membership-backed policy below.
 */
export class SoleResidentReadership implements DomainReadership {
  public mayRead(_principal: ReadershipPrincipal, _privacyDomain: string): boolean {
    return true;
  }
}

/**
 * Membership-backed readership for the first multi-principal seam. Membership
 * is necessary but deliberately not sufficient: ADR 0080 H6 and ADR 0078 K1
 * keep "may use this Home" separate from "may read this privacy domain".
 */
export class HomeMembershipReadership implements DomainReadership {
  public constructor(
    private readonly memberships: HomeMembershipDirectory,
    private readonly domainReadGrants: DomainReadGrantDirectory,
  ) {}

  public mayRead(principal: ReadershipPrincipal, privacyDomain: string): boolean {
    const identity = principal.picoIdentityFingerprintHex;
    if (identity === undefined) {
      return false;
    }

    return this.memberships.hasActivePicoHomeMembership(identity)
      && this.domainReadGrants.mayReadDomain(identity, privacyDomain);
  }
}
