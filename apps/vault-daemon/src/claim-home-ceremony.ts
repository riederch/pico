import { Buffer } from 'node:buffer';
import sodium from 'libsodium-wrappers-sumo';
import {
  picoHomeClaimEnvelopeSchema,
  picoHomeFoundingAcceptanceSchema,
  picoHomeSealedClaimPayloadV2Schema,
  picoHomeV2SignatureInputLabels,
  picoIdentitySignatureInputLabels,
  picoIdentitySuite,
  type PicoHomeClaimSignatureInput,
  type PicoHomeFoundingSignatureInput,
  type PicoIdentityDelegationScope,
  type PicoIdentityDelegationSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
} from '@pico/protocol';
import type { VaultSodium } from '@pico/vault';
import type { PicoVaultDaemonClient } from './client.js';
import type { PicoLinkDirectClient } from './link-direct-client.js';

/** Local to this ceremony, as it was local to the file it came from. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * ADR 0103 C1 with ADR 0130 E2 - founding a Home, without a terminal in it.
 *
 * **Lifted out of `cli.ts` unchanged, because a second copy would be a second
 * ceremony.** This is the only sequence that turns a fresh Home and a move-in
 * code into a founded one, and it was reachable from exactly one place: the
 * `pico-vault claim-home` subcommand. That made founding the last piece of
 * configuration on a command line, against the decision that every
 * configuration goes through the Pico Client - and it is what the roadmap
 * means by "today a Home can only be founded through `pico-vault`".
 *
 * Nothing about the sequence changed in the move. What changed is the one
 * thing that was terminal-shaped: three `process.stderr.write` calls told the
 * person to approve on the terminal holding the unlock. Those are now an
 * `announce` port with a closed set of moments, so a caller says it in its own
 * medium - a line on stderr, or a sentence in a window - and the words live
 * where that caller's words live.
 */

/**
 * The three moments this ceremony asks a person to approve something.
 *
 * A closed set rather than a string, because the caller writes the sentence:
 * "on the terminal holding the unlock" is true of a CLI and false of a window,
 * and a ceremony that shipped either wording would be wrong in one of them.
 */
export type PicoClaimHomeCeremonyStep =
  | 'device_delegation'
  | 'home_claim'
  | 'founding_acceptance';

export type PicoClaimHomeCeremonyAnnounce = (step: PicoClaimHomeCeremonyStep) => void;

export async function runPicoClaimHomeCeremony(input: {
  client: PicoVaultDaemonClient;
  vaultSodium: VaultSodium;
  coreUrl: string;
  linkClient?: PicoLinkDirectClient;
  /** ADR 0130 E2. Told in the caller's medium, not in this one. */
  announce?: PicoClaimHomeCeremonyAnnounce;
  moveInCode: string;
  signerKeyFingerprintHex: string;
  firstDeviceSigningKeyFingerprintHex: string;
  firstDeviceKeyAgreementKeyFingerprintHex: string;
  firstDeviceDelegationId: string;
  firstDeviceDelegationValidUntil: string;
  expectedHostSigningKeyFingerprintHex: string;
  expectedHostKeyAgreementKeyFingerprintHex: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined) {
    throw new Error('claim_signer_not_unlocked');
  }
  if (signer.keyRole !== 'pico_identity') {
    throw new Error('claim_requires_pico_identity_key');
  }
  const setup = await picoFoundationRequest(
    input.coreUrl,
    '/api/home/setup',
    undefined,
    undefined,
    input.linkClient,
  ) as {
    setupMode: { hostSetupNonceHex: string };
    host: {
      signingKeyFingerprintHex: string;
      keyAgreementKeyFingerprintHex: string;
      keyAgreementPublicKeyHex: string;
    };
  };

  // Trust the person's log, not the endpoint's self-description.
  if (setup.host.signingKeyFingerprintHex !== input.expectedHostSigningKeyFingerprintHex
    || setup.host.keyAgreementKeyFingerprintHex !== input.expectedHostKeyAgreementKeyFingerprintHex) {
    throw new Error('host_key_fingerprint_mismatch');
  }

  const firstDeviceSigning = status.sessions.find(
    (session) =>
      session.keyFingerprintHex === input.firstDeviceSigningKeyFingerprintHex,
  );
  if (firstDeviceSigning?.keyRole !== 'device_signing') {
    throw new Error('claim_device_signing_key_not_unlocked');
  }
  const firstDeviceAgreement = status.sessions.find(
    (session) =>
      session.keyFingerprintHex === input.firstDeviceKeyAgreementKeyFingerprintHex,
  );
  if (firstDeviceAgreement?.keyRole !== 'device_key_agreement') {
    throw new Error('claim_device_agreement_key_not_unlocked');
  }

  const firstDeviceDelegation = await runPicoDelegateDeviceCeremony({
    client: input.client,
    ...(input.announce === undefined ? {} : { announce: input.announce }),
    signerKeyFingerprintHex: signer.keyFingerprintHex,
    subjectSigningKeyFingerprintHex: firstDeviceSigning.keyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: firstDeviceAgreement.keyFingerprintHex,
    scopes: ['surface_session', 'decrypt_domain', 'receive_key_envelope'],
    validFrom: new Date().toISOString(),
    validUntil: input.firstDeviceDelegationValidUntil,
    lifecycleOrder: 'seq:0000000000000001',
    delegationId: input.firstDeviceDelegationId,
  });

  const claimantIdentityKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'pico_identity',
    publicKeyHex: signer.publicKeyHex,
  };
  const firstDeviceSigningKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_signing',
    publicKeyHex: firstDeviceSigning.publicKeyHex,
  };
  const firstDeviceKeyAgreementKeyRecord: PicoIdentityKeyRecordSignatureInput = {
    suite: picoIdentitySuite,
    keyRole: 'device_key_agreement',
    publicKeyHex: firstDeviceAgreement.publicKeyHex,
  };
  const claim: PicoHomeClaimSignatureInput = {
    suite: picoIdentitySuite,
    claimId: `claim_${Buffer.from(input.vaultSodium.randombytes_buf(16)).toString('hex')}`,
    hostSigningKeyFingerprintHex: setup.host.signingKeyFingerprintHex,
    hostKeyAgreementKeyFingerprintHex: setup.host.keyAgreementKeyFingerprintHex,
    moveInCode: input.moveInCode,
    claimantIdentityKeyFingerprintHex: signer.keyFingerprintHex,
    claimantNonceHex: Buffer.from(input.vaultSodium.randombytes_buf(32)).toString('hex'),
    hostSetupNonceHex: setup.setupMode.hostSetupNonceHex,
    firstDeviceDelegationId: firstDeviceDelegation.record.delegationId,
    firstDeviceSigningKeyFingerprintHex: firstDeviceSigning.keyFingerprintHex,
    firstDeviceKeyAgreementKeyFingerprintHex: firstDeviceAgreement.keyFingerprintHex,
  };

  input.announce?.('home_claim');
  const claimSignature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeV2SignatureInputLabels.claim,
    fields: claim as unknown as Record<string, unknown>,
  });
  const firstDeviceSignature = await input.client.sign({
    keyFingerprintHex: firstDeviceSigning.keyFingerprintHex,
    label: picoHomeV2SignatureInputLabels.claim,
    fields: claim as unknown as Record<string, unknown>,
  });

  const sealedClaimPayload = {
    schema: picoHomeSealedClaimPayloadV2Schema,
    claim,
    claimantIdentityKeyRecord,
    firstDeviceSigningKeyRecord,
    firstDeviceKeyAgreementKeyRecord,
    firstDeviceDelegation,
    firstDeviceRevocations: [],
    claimantSignatureHex: claimSignature.signatureHex,
    firstDeviceSignatureHex: firstDeviceSignature.signatureHex,
  };
  const sealedClaimPayloadHex = Buffer.from(input.vaultSodium.crypto_box_seal(
    Uint8Array.from(Buffer.from(JSON.stringify(sealedClaimPayload), 'utf8')),
    Uint8Array.from(Buffer.from(setup.host.keyAgreementPublicKeyHex, 'hex')),
  )).toString('hex');

  const pending = await picoFoundationRequest(
    input.coreUrl,
    '/api/home/claim',
    {
      claimEnvelope: { schema: picoHomeClaimEnvelopeSchema, sealedClaimPayloadHex },
    },
    undefined,
    input.linkClient,
  ) as { pendingClaim: { founding: PicoHomeFoundingSignatureInput } };

  input.announce?.('founding_acceptance');
  const foundingSignature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeV2SignatureInputLabels.founding,
    fields: pending.pendingClaim.founding as unknown as Record<string, unknown>,
  });

  return await picoFoundationRequest(
    input.coreUrl,
    '/api/home/claim',
    {
      foundingAcceptance: {
        schema: picoHomeFoundingAcceptanceSchema,
        claimId: claim.claimId,
        foundingId: pending.pendingClaim.founding.foundingId,
        claimantFoundingSignatureHex: foundingSignature.signatureHex,
      },
    },
    undefined,
    input.linkClient,
  ) as Record<string, unknown>;
}

export async function runPicoDelegateDeviceCeremony(input: {
  client: PicoVaultDaemonClient;
  signerKeyFingerprintHex: string;
  subjectSigningKeyFingerprintHex: string;
  subjectKeyAgreementKeyFingerprintHex: string;
  scopes: PicoIdentityDelegationScope[];
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  delegationId?: string;
  announce?: PicoClaimHomeCeremonyAnnounce;
}): Promise<{
  record: PicoIdentityDelegationSignatureInput;
  signatureHex: string;
}> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('delegation_issuer_not_unlocked');
  }

  const record: PicoIdentityDelegationSignatureInput = {
    suite: picoIdentitySuite,
    delegationId: input.delegationId
      ?? `delegation_${Buffer.from(sodium.randombytes_buf(16)).toString('hex')}`,
    issuerIdentityKeyFingerprintHex: signer.keyFingerprintHex,
    subjectSigningKeyFingerprintHex: input.subjectSigningKeyFingerprintHex,
    subjectKeyAgreementKeyFingerprintHex: input.subjectKeyAgreementKeyFingerprintHex,
    scopes: input.scopes,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    lifecycleOrder: input.lifecycleOrder,
  };

  input.announce?.('device_delegation');
  const signature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoIdentitySignatureInputLabels.delegation,
    fields: record as unknown as Record<string, unknown>,
  });

  return { record, signatureHex: signature.signatureHex };
}

export async function picoFoundationRequest(
  coreUrl: string,
  path: string,
  body: Record<string, unknown> | undefined,
  session?: string,
  linkClient?: PicoLinkDirectClient,
): Promise<unknown> {
  if (linkClient !== undefined) {
    const linked = await picoLinkFoundationRequest(linkClient, path, body);
    const statusCode = typeof linked.result.statusCode === 'number'
      ? linked.result.statusCode
      : undefined;
    const result = { ...linked.result };
    delete result.statusCode;
    if (linked.outcome !== 'ok'
      || (statusCode !== undefined && (statusCode < 200 || statusCode >= 300))) {
      const reason = typeof result.error === 'string' ? result.error : linked.outcome;
      throw new Error(
        `foundation_rejected:${statusCode ?? 400}:${reason}`,
      );
    }
    return result;
  }

  const url = new URL(path, coreUrl.endsWith('/') ? coreUrl : `${coreUrl}/`);
  const headers: Record<string, string> = session === undefined
    ? {}
    : { authorization: `Bearer ${session}` };
  const response = await fetch(url, body === undefined
    ? { method: 'GET', headers }
    : {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? {} : JSON.parse(text);
  } catch {
    throw new Error(`foundation_invalid_response:${response.status}`);
  }

  if (!response.ok) {
    const reason = (parsed as { error?: unknown }).error;
    throw new Error(`foundation_rejected:${response.status}:${typeof reason === 'string' ? reason : text}`);
  }

  return parsed;
}

export async function picoLinkFoundationRequest(
  client: PicoLinkDirectClient,
  path: string,
  body: Record<string, unknown> | undefined,
): Promise<{ outcome: string; result: Record<string, unknown> }> {
  if (path === '/api/home/setup' && body === undefined) {
    return await client.request('home.setup.read', {});
  }
  if (path === '/api/home/claim' && body !== undefined) {
    return await client.request('home.claim.submit', body);
  }
  if (path === '/api/system/status' && body === undefined) {
    const linked = await client.request('home.authority.list', { resource: 'home_state' });
    if (linked.outcome !== 'ok' || !isRecord(linked.result.claimState)) {
      return linked;
    }
    const { claimState, ...rest } = linked.result;
    return {
      outcome: linked.outcome,
      result: {
        ...rest,
        picoHome: { claimState },
      },
    };
  }

  // ADR 0130 E4. The read half of the one resource a Home Host Pico issues
  // from their own device: admitting somebody without being able to see who
  // is in is a surface that cannot check its own work.
  if (path === '/api/home/memberships' && body === undefined) {
    return await client.request('home.authority.list', { resource: 'memberships' });
  }

  const resources: Record<string, string> = {
    '/api/home/memberships': 'membership',
    // ADR 0130 E5's finding: the statement that ends a membership had no Link
    // path, so somebody could be let in from a person's own device and not
    // let out from it.
    '/api/home/membership-lifecycle': 'membership_lifecycle',
    '/api/home/reader-key-freshness-checkpoints': 'reader_key_freshness_checkpoint',
    '/api/home/reader-custody/domains': 'reader_custody_domain',
    '/api/home/reader-custody/reader-grants': 'reader_custody_reader_grant',
    // ADR 0130 E5, dieselbe Asymmetrie eine Ressource weiter: das Vergeben
    // ging über Link, das Beenden nicht.
    '/api/home/reader-custody/reader-grant-lifecycle':
      'reader_custody_reader_grant_lifecycle',
    '/api/home/reader-custody/kek-rotations': 'reader_custody_kek_rotation',
  };
  const resource = resources[path];
  if (resource !== undefined && body !== undefined) {
    return await client.request('home.authority.submit', { resource, record: body });
  }
  throw new Error('operation_not_available_over_link');
}
