import { bytesToHex } from '@pico/protocol/canonical-bytes';
import {
  picoHomeContinuityRecordSchema,
  picoHomeMembershipCredentialSchema,
  picoHomeMembershipLifecycleRecordSchema,
  picoHomeSignatureInputLabels,
  picoIdentitySuite,
  type PicoHomeContinuityReasonCategory,
  type PicoHomeContinuitySignatureInput,
  type PicoHomeMembershipLifecycleReasonCategory,
  type PicoHomeMembershipLifecycleSignatureInput,
  type PicoHomeMembershipRole,
  type PicoHomeMembershipScope,
  type PicoHomeMembershipStatus,
  type PicoHomeMembershipSignatureInput,
  type PicoIdentityKeyRecordSignatureInput,
  picoMemoryContentSuite,
  picoReaderCustodyCanonicalLabels,
  picoReaderCustodyReaderGrantLifecycleRecordSchema,
  type PicoReaderCustodyReaderGrantLifecycleSignatureInput,
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

/**
 * ADR 0080's other half: the statement that ends a membership.
 *
 * The Home keeps every statement and projects the latest one by lifecycle
 * order, so ending is not a deletion - it is a later sentence about the same
 * credential, signed by the same authority that issued it. That is why a
 * revoked member can be told apart from one who was never admitted.
 *
 * There was no ceremony for this anywhere: not here, not in the CLI's
 * eighteen subcommands. A Home Host Pico could let somebody in and not let
 * them out.
 */
/**
 * ADR 0082 mit ADR 0130 E5. Einen Lesezugang beenden.
 *
 * **Hier und nicht im Companion, und der Grund ist eine Beobachtung über die
 * eigene Arbeit** (2026-08-22): die erste Fassung nannte
 * `reader_custody_reader_grant_lifecycle` direkt gegenüber dem Link-Client und
 * war damit der einzige Aufrufer im Baum, der eine Autoritätsressource beim
 * Namen ruft. Alle anderen sprechen die Foundation-Route an, und
 * `picoFoundationRequest` entscheidet, ob sie über eine Sitzung oder über den
 * Link geht - ein Vokabular statt zweier, und beide Transporte umsonst.
 *
 * Unterschrieben wird über den Hold-Channel: der Schlüssel liegt im Vault, und
 * ADR 0106 zeigt der Person den Satz, den sie unterschreibt.
 */
export async function revokePicoHomeDomainReaderGrant(input: {
  client: PicoVaultDaemonClient;
  sodium: VaultSodium;
  coreUrl: string;
  session?: string;
  linkClient?: PicoLinkDirectClient;
  lifecycle: Omit<PicoReaderCustodyReaderGrantLifecycleSignatureInput,
    'suite' | 'lifecycleId' | 'status'>;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find((session) =>
    session.keyFingerprintHex === input.lifecycle.ownerIdentityKeyFingerprintHex);
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    // Der Name der Rolle, nicht "ging nicht": ein gesperrter Vault ist etwas
    // anderes als ein Gerät, das die Domäne gar nicht besitzt.
    throw new Error('domain_owner_identity_not_unlocked');
  }

  const lifecycle: PicoReaderCustodyReaderGrantLifecycleSignatureInput = {
    suite: picoMemoryContentSuite,
    lifecycleId: `reader_grant_lifecycle_${bytesToHex(input.sodium.randombytes_buf(16))}`,
    status: 'revoked',
    ...input.lifecycle,
  };

  const signature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoReaderCustodyCanonicalLabels.readerGrantLifecycle,
    fields: lifecycle as unknown as Record<string, unknown>,
  });

  const record = {
    schema: picoReaderCustodyReaderGrantLifecycleRecordSchema,
    lifecycle,
    ownerIdentityKeyRecord: {
      /**
       * **Die Identitätssuite, nicht die des Inhalts** (gefunden am
       * 2026-08-27, gegen ein laufendes Home).
       *
       * Hier stand `picoMemoryContentSuite`, und das Home verlangt von einer
       * Lebenszyklus-Aussage, dass ihr Schlüsselnachweis Zeichen für Zeichen
       * derselbe ist wie der in der Domäne - die trägt `pico.suite.id.v1`.
       * Also wurde jedes Beenden eines Lesezugangs mit `invalid_record`
       * abgewiesen, seit das Fenster es am 2026-08-24 anbietet. Die drei
       * Geschwister-Zeremonien in dieser Datei hatten es richtig; diese eine
       * nicht, und kein Test bemerkte es, weil alle gegen einen erfundenen
       * Link-Client prüfen, welche *Operation* geschickt wird - nicht, ob
       * jemand sie annimmt.
       *
       * Ein Schlüssel in einer Identitätsrolle gehört in die Identitätssuite;
       * `check-key-record-suites.mjs` hält das jetzt fest.
       */
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: signer.publicKeyHex,
    },
    ownerSignatureHex: signature.signatureHex,
    receivedAt: lifecycle.changedAt,
  };

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/reader-custody/reader-grant-lifecycle',
    record,
    input.session,
    input.linkClient,
  ) as Record<string, unknown>;

  return { accepted, record };
}

export async function endPicoHomeMembership(input: {
  client: PicoVaultDaemonClient;
  sodium: VaultSodium;
  coreUrl: string;
  session?: string;
  linkClient?: PicoLinkDirectClient;
  signerKeyFingerprintHex: string;
  homeId: string;
  credentialId: string;
  subjectPicoIdentityFingerprintHex: string;
  status: PicoHomeMembershipStatus;
  reasonCategory: PicoHomeMembershipLifecycleReasonCategory;
  changedAt: string;
  lifecycleOrder: string;
}): Promise<Record<string, unknown>> {
  const status = await input.client.status();
  const signer = status.sessions.find(
    (session) => session.keyFingerprintHex === input.signerKeyFingerprintHex,
  );
  if (signer === undefined || signer.keyRole !== 'pico_identity') {
    throw new Error('membership_issuer_not_unlocked');
  }

  const lifecycle: PicoHomeMembershipLifecycleSignatureInput = {
    suite: picoIdentitySuite,
    lifecycleId: `membership_lifecycle_${bytesToHex(input.sodium.randombytes_buf(16))}`,
    homeId: input.homeId,
    credentialId: input.credentialId,
    issuerPicoIdentityFingerprintHex: signer.keyFingerprintHex,
    subjectPicoIdentityFingerprintHex: input.subjectPicoIdentityFingerprintHex,
    status: input.status,
    reasonCategory: input.reasonCategory,
    changedAt: input.changedAt,
    lifecycleOrder: input.lifecycleOrder,
  };

  const signature = await input.client.sign({
    keyFingerprintHex: signer.keyFingerprintHex,
    label: picoHomeSignatureInputLabels.membershipLifecycle,
    fields: lifecycle as unknown as Record<string, unknown>,
  });

  const record = {
    schema: picoHomeMembershipLifecycleRecordSchema,
    lifecycle,
    issuerIdentityKeyRecord: {
      suite: picoIdentitySuite,
      keyRole: 'pico_identity',
      publicKeyHex: signer.publicKeyHex,
    },
    issuerSignatureHex: signature.signatureHex,
    createdAt: input.changedAt,
  };

  const accepted = await foundationRequest(
    input.coreUrl,
    '/api/home/membership-lifecycle',
    record,
    input.session,
    input.linkClient,
  ) as Record<string, unknown>;

  return { accepted, record };
}
