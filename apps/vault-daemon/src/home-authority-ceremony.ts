import {
  picoHomeContinuityRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoHomeSignatureInputLabels,
  picoIdentitySuite,
  type PicoHomeContinuityReasonCategory,
  type PicoHomeContinuitySignatureInput,
  type PicoHomeMembershipRole,
  type PicoHomeMembershipScope,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import { picoFoundationRequest as foundationRequest } from './claim-home-ceremony.js';
import type { PicoVaultDaemonClient } from './client.js';
import type { PicoLinkDirectClient } from './link-direct-client.js';

/**
 * ADR 0130 E4. What the Home Host Pico signs about the Home itself.
 *
 * **Lifted out of `cli.ts` unchanged, for the reason ADR 0130 gives:** record
 * building and the daemon-signed approval survive the move into a product
 * surface, argument parsing does not. Both of these were written inside the
 * tool, which meant the only way to rotate a host key or admit somebody else's
 * Pico was to type sixteen flags - and the two moments they belong to are a
 * key you no longer trust and a person moving in.
 *
 * The terminal sentences went with the parsing. What a rotation costs -
 * every printed Recovery Card becomes stale - is said by the surface that
 * asks, and by the ADR 0106 statement the daemon renders from the exact
 * bytes; a `process.stderr.write` inside a ceremony would be a third place
 * for that sentence to drift.
 */

function bytesToHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}

export async function rotatePicoHomeHostKeys(input: {
  client: PicoVaultDaemonClient;
  linkClient: PicoLinkDirectClient;
  signerKeyFingerprintHex: string;
  pinnedHostSigningKeyFingerprintHex: string;
  reasonCategory: PicoHomeContinuityReasonCategory;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('continuity_acceptor_not_unlocked');
  }

  const prepared = await input.linkClient.request('home.host.rotation.prepare', {
    reasonCategory: input.reasonCategory,
  });
  if (prepared.outcome !== 'ok') {
    throw new Error(`host_rotation_prepare_rejected:${prepared.outcome}`);
  }
  const proposalKeys = [
    'continuity',
    'outgoingHostSigningKeyRecord',
    'incomingHostSigningKeyRecord',
    'outgoingHostSignatureHex',
    'incomingHostSignatureHex',
  ];
  const resultKeys = Object.keys(prepared.result);
  if (resultKeys.length !== proposalKeys.length
    || proposalKeys.some((key) => !(key in prepared.result))) {
    throw new Error('host_rotation_proposal_malformed');
  }
  const proposal = prepared.result as unknown as {
    continuity: PicoHomeContinuitySignatureInput;
    outgoingHostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
    incomingHostSigningKeyRecord: PicoIdentityKeyRecordSignatureInput;
    outgoingHostSignatureHex: string;
    incomingHostSignatureHex: string;
  };
  // The acceptance about to be approved must be this root's to give, and it
  // must retire exactly the keys this client is pinned to - a proposal that
  // retires anything else is asking the person to approve a rotation of a
  // Home they never trusted under that key.
  if (proposal.continuity.homeHostPicoIdentityFingerprintHex
    !== signer.keyFingerprintHex) {
    throw new Error('host_rotation_acceptor_mismatch');
  }
  if (proposal.continuity.outgoingHostSigningKeyFingerprintHex
    !== input.pinnedHostSigningKeyFingerprintHex) {
    throw new Error('host_rotation_retires_unpinned_key');
  }

  const acceptance = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeSignatureInputLabels.continuity,
    fields: proposal.continuity as unknown as Record<string, unknown>,
  });

  const submitted = await input.linkClient.request('home.host.continuity.submit', {
    record: {
      schema: picoHomeContinuityRecordSchema,
      continuity: proposal.continuity,
      outgoingHostSigningKeyRecord: proposal.outgoingHostSigningKeyRecord,
      incomingHostSigningKeyRecord: proposal.incomingHostSigningKeyRecord,
      homeHostPicoIdentityKeyRecord: {
        suite: picoIdentitySuite,
        keyRole: 'pico_identity',
        publicKeyHex: signer.publicKeyHex,
      },
      outgoingHostSignatureHex: proposal.outgoingHostSignatureHex,
      incomingHostSignatureHex: proposal.incomingHostSignatureHex,
      homeHostPicoSignatureHex: acceptance.signatureHex,
      createdAt: new Date().toISOString(),
    },
  });
  if (submitted.outcome !== 'ok') {
    throw new Error(`host_rotation_submit_rejected:${submitted.outcome}`);
  }

  return submitted.result;
}

export async function issuePicoHomeMembership(input: {
  client: PicoVaultDaemonClient;
  sodium: VaultSodium;
  coreUrl: string;
  session?: string;
  linkClient?: PicoLinkDirectClient;
  signerKeyFingerprintHex: string;
  homeId: string;
  subjectPicoIdentityFingerprintHex: string;
  hostSigningKeyFingerprintHex: string;
  role: PicoHomeMembershipRole;
  scopes: PicoHomeMembershipScope[];
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('membership_issuer_not_unlocked');
  }

  const membership: PicoHomeMembershipSignatureInput = {
    suite: picoIdentitySuite,
    credentialId: `membership_${bytesToHex(input.sodium.randombytes_buf(16))}`,
    homeId: input.homeId,
    issuerPicoIdentityFingerprintHex: signer.keyFingerprintHex,
    subjectPicoIdentityFingerprintHex: input.subjectPicoIdentityFingerprintHex,
    hostSigningKeyFingerprintHex: input.hostSigningKeyFingerprintHex,
    role: input.role,
    scopes: input.scopes,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: input.lifecycleOrder,
  };

  const signature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeSignatureInputLabels.membership,
    fields: membership as unknown as Record<string, unknown>,
  });

  const issuerStatement = {
    schema: picoHomeMembershipCredentialSchema,
    membership,
    issuerIdentityKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: signer.publicKeyHex,
    },
    issuerSignatureHex: signature.signatureHex,
  };

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/memberships',
    issuerStatement,
    input.session,
    input.linkClient,
  ) as Record<string, unknown>;

  return { accepted, issuerStatement };
}

