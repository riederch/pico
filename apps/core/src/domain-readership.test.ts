import { describe, expect, it } from 'vitest';
import { HomeMembershipReadership, SoleResidentReadership } from './domain-readership.js';

describe('SoleResidentReadership', () => {
  it('grants the sole principal every domain, because a single-principal instance owns them all', () => {
    const readership = new SoleResidentReadership();

    expect(readership.mayRead({ sessionDigest: 'digest-a' }, 'domain-private')).toBe(true);
    expect(readership.mayRead({ sessionDigest: 'digest-a' }, 'domain-work')).toBe(true);
  });

  it('answers from the seam, not the operator role or the stored owner (ADR 0077 C1/C2)', () => {
    // This is the whole point of the seam existing while it looks like a no-op:
    // the evaluation is a function of (principal, domain), so a membership-backed
    // replacement narrows what a principal reads without touching the operator
    // check — and it never consults an item's unverified owner/controller.
    const readership = new SoleResidentReadership();

    // Different principals, same trivial answer today; the signature is what a
    // second principal plugs into.
    expect(readership.mayRead({ sessionDigest: 'digest-b' }, 'domain-private')).toBe(true);
  });
});

describe('HomeMembershipReadership', () => {
  it('requires a verified Pico identity binding before consulting membership', () => {
    const readership = new HomeMembershipReadership(
      { hasActivePicoHomeMembership: () => true },
      { mayReadDomain: () => true },
    );

    expect(readership.mayRead({ sessionDigest: 'digest-a' }, 'domain-private')).toBe(false);
  });

  it('treats active Home membership as necessary but not sufficient for domain content', () => {
    const member = 'a'.repeat(64);
    const memberships = {
      hasActivePicoHomeMembership: (identity: string) => identity === member,
    };
    const domainReadGrants = {
      mayReadDomain: (identity: string, privacyDomain: string) => identity === member && privacyDomain === 'domain-readable',
    };
    const readership = new HomeMembershipReadership(memberships, domainReadGrants);

    expect(readership.mayRead({
      sessionDigest: 'digest-a',
      picoIdentityFingerprintHex: member,
    }, 'domain-readable')).toBe(true);
    expect(readership.mayRead({
      sessionDigest: 'digest-a',
      picoIdentityFingerprintHex: member,
    }, 'domain-forbidden')).toBe(false);
    expect(readership.mayRead({
      sessionDigest: 'digest-a',
      picoIdentityFingerprintHex: 'b'.repeat(64),
    }, 'domain-readable')).toBe(false);
  });
});
