import { picoLifecycleOrderFrom } from '@pico/protocol/lifecycle-order';
import {
  buildPicoHomeDomainReadGrantSignatureInput,
  picoHomeDomainReadGrantRecordSchema,
  picoHomeSignatureInputLabels,
  picoIdentitySuite,
} from '@pico/protocol';
import type { PicoVaultDetachedSigner } from '@pico/vault';
import type { PicoLinkDirectClient } from '@pico/vault-daemon/link-direct-client';

/**
 * ADR 0082 with ADR 0087 and ADR 0100 - the device issuing the grant that lets
 * it read.
 *
 * **The signature is the only part nobody else could produce**, and it was the
 * only part the person already had. Until this existed, a Home whose owner
 * wanted to ask about their own memory needed somebody with a Foundation
 * session to relay a grant for them - a stand-in for an authority the person
 * was holding the whole time, in the Vault on the device in their hand.
 *
 * What crosses the wire is a statement, not a request: the Home verifies the
 * signature against its founding record before it records anything, so this
 * module can be wrong, replaced or lying and the worst it achieves is a
 * refusal. That is the same shape every other Home-authority statement has,
 * and the reason a device may hold this power at all.
 *
 * **One signature, one ceremony.** ADR 0100's signer takes a round trip
 * through the ADR 0099 approval gate, so issuing a grant is something the
 * person sees and agrees to rather than something a window does while they
 * are reading it.
 */

export interface PicoCompanionDomainReadGrantInput {
  livingDeviceLinkClient: PicoLinkDirectClient;
  /** ADR 0100. The identity key, held by the Vault and never by this process. */
  signer: PicoVaultDetachedSigner;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  /**
   * The Home Host Pico. Controller and reader at once here, because the
   * founder granting themselves is the case this exists for - a grant to
   * anybody else is the same statement with a different reader, and the Home
   * refuses it unless that reader is a member.
   */
  homeHostPicoIdentityFingerprintHex: string;
  identityPublicKeyHex: string;
  privacyDomain: string;
  validFrom: string;
  validUntil: string;
  nowMs: number;
}

/**
 * ADR 0082. A lifecycle order that advances without a counter to keep.
 *
 * Milliseconds, zero-padded to the width the vocabulary uses. A device that
 * kept its own sequence would be keeping a second record of something the
 * clock already orders - and two devices keeping one would disagree.
 */
export function picoCompanionGrantLifecycleOrder(nowMs: number): string {
  return picoLifecycleOrderFrom(BigInt(nowMs));
}

/**
 * ADR 0080. Which Home this is, asked rather than kept.
 *
 * The profile pins who the Home Host Pico is and which host keys to accept -
 * the things a thief of a disk could otherwise forge - and the Home's own
 * identifier is something the Home answers on a read this device already
 * performs. A second copy in the profile would be a second thing to keep in
 * step for no authority it adds.
 */
export async function readPicoCompanionHomeId(input: {
  livingDeviceLinkClient: PicoLinkDirectClient;
}): Promise<string> {
  const read = await input.livingDeviceLinkClient.request('home.device.lifecycle.read', {});
  if (read.outcome !== 'ok') {
    throw new Error(`home_id_read_rejected:${read.outcome}`);
  }
  const homeId = (read.result as { homeId?: unknown }).homeId;
  if (typeof homeId !== 'string' || homeId === '') {
    throw new Error('invalid_pico_home_id_result');
  }
  return homeId;
}

export async function grantPicoCompanionDomainRead(
  input: PicoCompanionDomainReadGrantInput,
): Promise<{ grantId: string; privacyDomain: string; status: string }> {
  const grant = {
    suite: picoIdentitySuite,
    // Derived from the pair it is about, so re-issuing after a revocation
    // replaces rather than accumulates: one grant per reader per domain is
    // what a person means by "this device may read this".
    grantId: `grant_${input.privacyDomain}_${input.homeHostPicoIdentityFingerprintHex.slice(0, 16)}`,
    homeId: input.homeId,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    privacyDomain: input.privacyDomain,
    controllerPicoIdentityFingerprintHex: input.homeHostPicoIdentityFingerprintHex,
    readerPicoIdentityFingerprintHex: input.homeHostPicoIdentityFingerprintHex,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: picoCompanionGrantLifecycleOrder(input.nowMs),
  };

  /**
   * ADR 0106. The family label and the whole grant, never bytes and a sentence.
   *
   * The daemon rebuilds these bytes from these fields and renders the person's
   * statement from the same ones, so nothing this process says can diverge
   * from what the key signs - and the bytes below are only the loop that
   * closes it from this side.
   *
   * **This call named a sentence where a family belongs until 2026-08-28**,
   * and passed two of the ten fields. It was written on 2026-08-16, eighteen
   * days after the daemon stopped taking bytes, so the control it serves had
   * never worked: every press ended in `unknown_signature_input_label` before
   * a person was ever asked. Befund B36.
   */
  const signatureHex = Buffer.from(input.signer.sign(
    buildPicoHomeDomainReadGrantSignatureInput(grant),
    { label: picoHomeSignatureInputLabels.domainReadGrant, fields: grant },
  )).toString('hex');

  const submitted = await input.livingDeviceLinkClient.request(
    'home.domain.read-grant.submit',
    {
      schema: picoHomeDomainReadGrantRecordSchema,
      grant,
      issuerIdentityKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'pico_identity',
        publicKeyHex: input.identityPublicKeyHex,
      },
      issuerSignatureHex: signatureHex,
    },
  );
  if (submitted.outcome !== 'ok') {
    // Carried out as itself. `issuer_is_not_home_host_pico` means somebody
    // else's Home, `reader_is_not_active_member` means this identity is not in
    // it, and `domain_is_not_host_custody` means the domain does not exist
    // yet - three different things to do next.
    const refusal = (submitted.result as { refusal?: unknown }).refusal;
    throw new Error(
      typeof refusal === 'string'
        ? `domain_read_grant_rejected:${refusal}`
        : `domain_read_grant_rejected:${submitted.outcome}`,
    );
  }
  const record = submitted.result as Record<string, unknown>;
  if (typeof record.grantId !== 'string'
    || typeof record.privacyDomain !== 'string'
    || typeof record.status !== 'string') {
    throw new Error('invalid_pico_domain_read_grant_result');
  }
  return {
    grantId: record.grantId,
    privacyDomain: record.privacyDomain,
    status: record.status,
  };
}
