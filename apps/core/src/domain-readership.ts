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
}

export interface DomainReadership {
  mayRead(principal: ReadershipPrincipal, privacyDomain: string): boolean;
}

/**
 * Foundation-phase readership: one authenticated principal, which reads every
 * domain because the instance is single-principal. Not the operator role, not
 * keyed on stored ownership (ADR 0077 C1/C2). When membership arrives this is
 * replaced by a membership-backed evaluation — the read path's authority source
 * changes here, and the operator-role check is never touched.
 */
export class SoleResidentReadership implements DomainReadership {
  public mayRead(_principal: ReadershipPrincipal, _privacyDomain: string): boolean {
    return true;
  }
}
