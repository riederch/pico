import type {
  PicoHomeContinuityReasonCategory,
  PicoHomeMembershipLifecycleReasonCategory,
  PicoHomeMembershipScope,
  PicoHomeMembershipStatus,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from '@pico/vault-daemon/client';
import {
  endPicoHomeMembership,
  issuePicoHomeMembership,
  rotatePicoHomeHostKeys,
} from '@pico/vault-daemon/home-authority-ceremony';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';
import { readPicoCompanionHomeId } from './domain-read-grant.js';
import { repinPicoCompanionHostKeys } from './host-repin.js';
import type { PicoCompanionProfile } from './profile.js';

/**
 * ADR 0130 E4. The two things the Home Host Pico decides about the Home
 * itself: which keys it is known by, and who else may live in it.
 *
 * Both were reachable only through sixteen flags, and both belong to moments
 * a person is already in - a key they no longer trust, and somebody moving
 * in. The ceremonies moved to `@pico/vault-daemon/home-authority-ceremony`
 * unchanged; what is here is the part the tool did with flags: reading what
 * the Home is called, pinning the defaults a person has no way to have an
 * opinion about, and re-pinning this device afterwards.
 */

/**
 * ADR 0114's three, and all three are offered.
 *
 * Unlike the revocation categories, none of these belongs to machinery: new
 * keys, a Home that moved to another machine, and a Home restored from a
 * backup are three situations a person knows they are in, and the Home
 * records which one it was.
 */
export const picoCompanionHostRotationReasons = [
  'host_key_rotated',
  'host_migrated',
  'host_restored',
] as const satisfies readonly PicoHomeContinuityReasonCategory[];

export type PicoCompanionHostRotationReason =
  typeof picoCompanionHostRotationReasons[number];

/**
 * ADR 0080. What a membership issued from the Client carries.
 *
 * `home_member` is the only role that can be issued at all - the host role is
 * the founding record and is not re-issued as a credential - so it is not a
 * question. `host.use` is the tool's own default and the one scope that means
 * "this Pico may live here"; the rest are exchange-shaped and belong to
 * decisions ADR 0130 E5 has not made yet.
 */
export const picoCompanionMembershipScopes =
  ['host.use'] as const satisfies readonly PicoHomeMembershipScope[];

export interface PicoCompanionHostRotation {
  reason: PicoCompanionHostRotationReason;
  /**
   * The key this device answers to now, read back from the verified chain
   * rather than from the submission's own answer.
   */
  hostSigningKeyFingerprintHex: string;
  /** What it was, so a person can tell the two apart in one sentence. */
  retiredHostSigningKeyFingerprintHex: string;
  /**
   * Whether this device re-pinned itself. `false` is not a failed rotation -
   * the Home has rotated either way - it is a device that could not prove the
   * chain from where it stands, which is a different thing to do next.
   */
  repinned: boolean;
}

export async function rotatePicoCompanionHostKeys(input: {
  profile: PicoCompanionProfile;
  profilePath: string;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  reason: PicoCompanionHostRotationReason;
  fetch?: typeof fetch;
}): Promise<PicoCompanionHostRotation> {
  if (!(picoCompanionHostRotationReasons as readonly string[]).includes(input.reason)) {
    throw new Error('invalid_pico_companion_rotation_reason');
  }
  const retired = input.profile.host.signingKeyFingerprintHex;

  await rotatePicoHomeHostKeys({
    client: input.daemonClient,
    linkClient: input.livingDeviceLinkClient,
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    pinnedHostSigningKeyFingerprintHex: retired,
    reasonCategory: input.reason,
  });

  /**
   * ADR 0115 U4, immediately rather than at the next alarm. The device that
   * asked for the rotation is standing right here, and leaving it pinned to a
   * key its Home has retired would make the next ordinary read look like an
   * attack.
   *
   * The new fingerprint comes from this walk and not from the submission's
   * answer: the chain is what proves a rotation, and a device that believed
   * the reply it just received would be trusting the endpoint to describe its
   * own rotation.
   */
  const repin = await repinPicoCompanionHostKeys({
    sodium: input.sodium,
    profilePath: input.profilePath,
    profile: input.profile,
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  });

  return Object.freeze({
    reason: input.reason,
    retiredHostSigningKeyFingerprintHex: retired,
    hostSigningKeyFingerprintHex: repin.status === 'repinned'
      ? repin.profile.host.signingKeyFingerprintHex
      : retired,
    repinned: repin.status === 'repinned',
  });
}

export interface PicoCompanionHomeMember {
  membershipId: string;
  /**
   * The credential this row was projected from, and the id a statement that
   * ends it has to name. The row id is the Home's; this one is the record's.
   */
  credentialId: string | null;
  picoIdentityFingerprintHex: string;
  role: string;
  status: string;
  /**
   * `null` for the Home Host Pico, and that is a fact rather than a gap: that
   * membership is the founding record, and a Home whose owner's own place in
   * it expired would be a Home nobody could get back into.
   */
  validUntil: string | null;
  /** True for the Home Host Pico, whose membership is the founding record. */
  isThisIdentity: boolean;
}

/**
 * ADR 0130 E4. Who lives in this Home, to the identity that decides it.
 *
 * Over Link this was write-only until now: a Home Host Pico could admit
 * somebody from their own device and then had no way to see who was in, which
 * is a surface that cannot check its own work. The Home holds the read to the
 * same test as the write - the current Home Host Pico and nobody else.
 */
export async function readPicoCompanionHomeMembers(input: {
  profile: PicoCompanionProfile;
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<readonly PicoCompanionHomeMember[]> {
  const read = await input.livingDeviceLinkClient.request('home.authority.list', {
    resource: 'memberships',
  });
  if (read.outcome !== 'ok') {
    throw new Error(`home_members_read_rejected:${read.outcome}`);
  }
  const rows = (read.result as { memberships?: unknown }).memberships;
  if (!Array.isArray(rows)) {
    throw new Error('invalid_pico_companion_home_members');
  }
  return Object.freeze(rows.map((entry) => {
    const row = entry as Record<string, unknown>;
    if (typeof row.membershipId !== 'string'
      || (row.sourceRef !== null && typeof row.sourceRef !== 'string')
      || typeof row.picoIdentityFingerprintHex !== 'string'
      || typeof row.role !== 'string'
      || typeof row.status !== 'string'
      || (row.validUntil !== null && typeof row.validUntil !== 'string')) {
      throw new Error('invalid_pico_companion_home_members');
    }
    return Object.freeze({
      membershipId: row.membershipId,
      /**
       * `null` for the founder, whose row comes from the founding record and
       * not from a credential - which is also why there is nothing to end.
       */
      credentialId: row.source === 'membership_credential'
        ? row.sourceRef as string
        : null,
      picoIdentityFingerprintHex: row.picoIdentityFingerprintHex,
      role: row.role,
      status: row.status,
      validUntil: row.validUntil as string | null,
      isThisIdentity:
        row.picoIdentityFingerprintHex === input.profile.identity.keyFingerprintHex,
    });
  }));
}

export interface PicoCompanionMembership {
  credentialId: string;
  subjectPicoIdentityFingerprintHex: string;
  validUntil: string;
}

/**
 * ADR 0080. Admits another person's Pico to this Home.
 *
 * **The subject signs nothing**, which is the whole shape of it: a membership
 * is given by the Home's authority rather than claimed by its holder. So all
 * that has to travel from them is a fingerprint, and this device's identity
 * root signs the statement under ADR 0099 approval.
 *
 * What the Home is called is read from the Home rather than kept in the
 * profile: the profile pins who the Home answers as, and a second copy of its
 * name would be one more thing to be stale.
 */
/**
 * What a Pico may be admitted by: its identity fingerprint, whole.
 *
 * Exported so the field a person pastes into can ask the same question. It
 * had its own copy of this expression until 2026-08-20 - the same expression,
 * which is the point: the field and the ceremony agreeing by coincidence is
 * not the same as their agreeing by construction, and ADR 0131 A5 puts a
 * second client next to this one.
 *
 * Not a *fingerprint* predicate in general. Eight other places in the tree
 * test the same shape for content hashes, model digests and peer keys, and
 * they are different facts that happen to look alike; one shared constant
 * would tie a Home's membership to a library pin.
 */
export function isPicoCompanionMembershipSubject(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

export async function issuePicoCompanionMembership(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  subjectPicoIdentityFingerprintHex: string;
  validUntil: string;
  now?: () => Date;
}): Promise<PicoCompanionMembership> {
  if (!isPicoCompanionMembershipSubject(input.subjectPicoIdentityFingerprintHex)) {
    throw new Error('invalid_pico_companion_membership_subject');
  }
  if (input.subjectPicoIdentityFingerprintHex
    === input.profile.identity.keyFingerprintHex) {
    /**
     * The Home Host Pico's own membership is the founding record, and the
     * Home refuses to re-issue it. Said here as itself, because "you are
     * already the person whose Home this is" is a different thing to read
     * than a rejected credential.
     */
    throw new Error('pico_companion_membership_subject_is_this_identity');
  }

  const now = (input.now ?? (() => new Date()))();
  const issued = await issuePicoHomeMembership({
    client: input.daemonClient,
    sodium: input.sodium,
    coreUrl: input.profile.coreUrl,
    linkClient: input.livingDeviceLinkClient,
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    homeId: await readPicoCompanionHomeId({
      livingDeviceLinkClient: input.livingDeviceLinkClient,
    }),
    subjectPicoIdentityFingerprintHex: input.subjectPicoIdentityFingerprintHex,
    hostSigningKeyFingerprintHex: input.profile.host.signingKeyFingerprintHex,
    role: 'home_member',
    scopes: [...picoCompanionMembershipScopes],
    validFrom: now.toISOString(),
    validUntil: input.validUntil,
    // Each credential carries its own lifecycle line, and this is its first
    // entry; ending or replacing one writes a higher order against the same
    // credential rather than against the Home.
    lifecycleOrder: 'seq:0000000000000001',
  }) as unknown as {
    issuerStatement: { membership: { credentialId: string } };
  };

  return Object.freeze({
    credentialId: issued.issuerStatement.membership.credentialId,
    subjectPicoIdentityFingerprintHex: input.subjectPicoIdentityFingerprintHex,
    validUntil: input.validUntil,
  });
}

/**
 * ADR 0080 with ADR 0130 E5's finding. Ends a membership this Home issued.
 *
 * **Two reasons, and they are not the same act.** Removing somebody is a
 * decision about who lives here; a security review is a decision about a key
 * that may be in the wrong hands, and the Home records which one it was. The
 * other four categories in the vocabulary belong to the machinery - an invite
 * accepted or expired, a host reset, a re-issue - and none of them is a
 * sentence a person says.
 *
 * Nothing is deleted: the Home keeps every statement and projects the latest
 * one, so a member who was removed can be told apart from one who was never
 * admitted.
 */
export const picoCompanionMembershipEndings = Object.freeze({
  removed: { status: 'revoked', reason: 'member_removed' },
  security: { status: 'evicted', reason: 'security_review' },
} as const satisfies Readonly<Record<string, {
  status: PicoHomeMembershipStatus;
  reason: PicoHomeMembershipLifecycleReasonCategory;
}>>);

export type PicoCompanionMembershipEnding = keyof typeof picoCompanionMembershipEndings;

export async function endPicoCompanionMembership(input: {
  profile: PicoCompanionProfile;
  daemonClient: PicoVaultDaemonClient;
  livingDeviceLinkClient: PicoLinkDirectClient;
  sodium: VaultSodium;
  credentialId: string;
  subjectPicoIdentityFingerprintHex: string;
  ending: PicoCompanionMembershipEnding;
  now?: () => Date;
}): Promise<{ credentialId: string; status: PicoHomeMembershipStatus }> {
  const ending = picoCompanionMembershipEndings[input.ending];
  if (ending === undefined) {
    throw new Error('invalid_pico_companion_membership_ending');
  }
  if (input.subjectPicoIdentityFingerprintHex
    === input.profile.identity.keyFingerprintHex) {
    // The founder's row is the founding record; there is no credential to end,
    // and a Home whose owner removed themselves would answer to nobody.
    throw new Error('pico_companion_membership_subject_is_this_identity');
  }

  const now = (input.now ?? (() => new Date()))();
  await endPicoHomeMembership({
    client: input.daemonClient,
    sodium: input.sodium,
    coreUrl: input.profile.coreUrl,
    linkClient: input.livingDeviceLinkClient,
    signerKeyFingerprintHex: input.profile.identity.keyFingerprintHex,
    homeId: await readPicoCompanionHomeId({
      livingDeviceLinkClient: input.livingDeviceLinkClient,
    }),
    credentialId: input.credentialId,
    subjectPicoIdentityFingerprintHex: input.subjectPicoIdentityFingerprintHex,
    status: ending.status,
    reasonCategory: ending.reason,
    changedAt: now.toISOString(),
    /**
     * ADR 0082's trick, for ADR 0080's records: milliseconds as the order.
     *
     * **What the order decides is which of two statements about the same
     * credential the Home projects** - it does not have to outrank the
     * credential, which lives in another table and is not compared with it.
     * A first statement wins by being the only one; a later correction has to
     * rise above it, and a device that kept its own counter would be keeping
     * a second record of something the clock already orders.
     */
    lifecycleOrder: `seq:${String(now.getTime()).padStart(16, '0')}`,
  });

  return Object.freeze({
    credentialId: input.credentialId,
    status: ending.status,
  });
}
