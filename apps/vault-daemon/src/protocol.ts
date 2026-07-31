import {
  picoHomeDeviceLifecycleCanonicalLabels,
  picoHomeDeviceRecoveryCanonicalLabels,
  picoHomeV2SignatureInputLabels,
  picoVaultPersonKeyRoles,
  type PicoVaultPersonKeyRole,
} from '@pico/protocol';
import {
  MAX_PICO_READER_CUSTODY_SYNC_PAYLOAD_BYTES,
  picoRecoveryPinProtection,
} from '@pico/vault';

/**
 * ADR 0097 local wire contract. This is a private contract between the Vault
 * daemon and same-person local clients: no docs/protocol surface, no fixtures,
 * no compatibility claim. Frames are U32BE(length) || UTF-8 JSON; every request
 * carries a versioned family label and every response echoes the request id.
 */
export const picoVaultDaemonProtocolVersion = 1 as const;

export const picoVaultDaemonRequestFamilies = {
  hello: 'pico.vault.daemon.hello.v1',
  status: 'pico.vault.daemon.status.v1',
  unlock: 'pico.vault.daemon.unlock.v1',
  lock: 'pico.vault.daemon.lock.v1',
  sign: 'pico.vault.daemon.sign.v1',
  readerAccessOpen: 'pico.vault.daemon.reader-access.open.v1',
  readerAccessIsLocked: 'pico.vault.daemon.reader-access.is-locked.v1',
  readerAccessOpenPayload: 'pico.vault.daemon.reader-access.open-payload.v1',
  readerAccessDecryptItem: 'pico.vault.daemon.reader-access.decrypt-item.v1',
  readerAccessClose: 'pico.vault.daemon.reader-access.close.v1',
  approvalWait: 'pico.vault.daemon.approval.wait.v1',
  approvalDecide: 'pico.vault.daemon.approval.decide.v1',
  ceremonyCreateDomain: 'pico.vault.daemon.ceremony.create-domain.v1',
  ceremonyRotateDomain: 'pico.vault.daemon.ceremony.rotate-domain.v1',
  ceremonyCreateReaderGrant: 'pico.vault.daemon.ceremony.create-reader-grant.v1',
  ceremonyIssueRecoveryCard: 'pico.vault.daemon.ceremony.issue-recovery-card.v1',
} as const;

/**
 * ADR 0099 gating policy. Approval guards the creation of new signed
 * authority; these families are the operational high-frequency ones that
 * prove possession or carry routine traffic and create nothing that outlives
 * the call. The list is closed: every other signable label - including any
 * family added later - requires approval, so the default is to ask.
 */
export const picoVaultDaemonApprovalExemptLabels: ReadonlySet<string> = new Set([
  'pico.id.possession.v1',
  'pico.id.reader-key-freshness.v1',
  'pico.mem.reader-sync-manifest.v1',
  'pico.mem.reader-item.v1',
  'pico.link.direct.request.v1',
]);

export function picoVaultDaemonSignatureNeedsApproval(
  label: string,
  keyRole?: PicoVaultPersonKeyRole,
): boolean {
  // ADR 0108 keeps the closed global exemption list unchanged. The v2 claim
  // remains gated for the identity root, while the delegated device's
  // co-signature over those same bytes is possession proof and creates no
  // authority of its own.
  if (keyRole === 'device_signing' && label === picoHomeV2SignatureInputLabels.claim) {
    return false;
  }
  // ADR 0109 keeps the global exempt-label catalog closed. The only new
  // exception is role-aware: a delegated device key may prove possession of
  // the exact short-lived activation bytes, while an identity root requesting
  // the same label remains gated (and cannot sign it at the Vault role gate).
  if (
    keyRole === 'device_signing'
    && label === picoHomeDeviceLifecycleCanonicalLabels.activation
  ) {
    return false;
  }
  // ADR 0110 mirrors the v2 founding split: the identity root approval
  // authorizes total replacement, while the target device co-signature proves
  // possession of the same short-lived claim and creates no authority alone.
  if (
    keyRole === 'device_signing'
    && label === picoHomeDeviceRecoveryCanonicalLabels.claim
  ) {
    return false;
  }
  return !picoVaultDaemonApprovalExemptLabels.has(label);
}

export const picoVaultDaemonResponseFamily = 'pico.vault.daemon.response.v1' as const;

export const MAX_PICO_VAULT_DAEMON_FRAME_BYTES = 128 * 1024;

/**
 * ADR 0098 lease-scoped budget. A sealed ADR 0089 batch is capped at
 * `MAX_PICO_READER_CUSTODY_SYNC_PAYLOAD_BYTES`; carrying it hex-encoded
 * doubles it, and the opened payload plus the JSON envelope needs headroom on
 * top. Only a connection that already holds a lease may send or receive this
 * much - everything else stays at the control-family cap.
 */
export const MAX_PICO_VAULT_DAEMON_READER_ACCESS_FRAME_BYTES =
  3 * MAX_PICO_READER_CUSTODY_SYNC_PAYLOAD_BYTES;

export const PICO_VAULT_DAEMON_READER_ACCESS_LEASE_CEILING_MS = 5 * 60 * 1_000;

export const PICO_VAULT_DAEMON_APPROVAL_WINDOW_MS = 60 * 1_000;
export const PICO_VAULT_DAEMON_APPROVAL_WAIT_MS = 30 * 1_000;
export const PICO_VAULT_DAEMON_APPROVAL_ID_HEX_CHARS = 32;
export const MAX_PICO_VAULT_DAEMON_SIGN_LABEL_CHARS = 128;
export const MAX_PICO_VAULT_DAEMON_PASSPHRASE_CHARS = 1024;
export const MAX_PICO_VAULT_DAEMON_REQUEST_ID_CHARS = 64;

export const PICO_VAULT_DAEMON_LEASE_ID_HEX_CHARS = 32;

const FRAME_LENGTH_PREFIX_BYTES = 4;
const requestIdPattern = /^[A-Za-z0-9_-]+$/;
const lowercaseHexPattern = /^(?:[0-9a-f]{2})+$/;
const KEY_FINGERPRINT_HEX_CHARS = 64;
const MAX_PICO_VAULT_DAEMON_INSTANT_CHARS = 64;

export interface PicoVaultDaemonHelloRequest {
  family: typeof picoVaultDaemonRequestFamilies.hello;
  requestId: string;
  protocolVersion: number;
}

export interface PicoVaultDaemonStatusRequest {
  family: typeof picoVaultDaemonRequestFamilies.status;
  requestId: string;
}

export interface PicoVaultDaemonUnlockRequest {
  family: typeof picoVaultDaemonRequestFamilies.unlock;
  requestId: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  passphrase: string;
}

export interface PicoVaultDaemonLockRequest {
  family: typeof picoVaultDaemonRequestFamilies.lock;
  requestId: string;
}

export interface PicoVaultDaemonSignRequest {
  family: typeof picoVaultDaemonRequestFamilies.sign;
  requestId: string;
  /**
   * ADR 0102: required. With several sessions unlocked there is no such thing
   * as "the" unlocked key, and guessing one would be a silent-wrong-key
   * hazard, so the request names the key it wants.
   */
  keyFingerprintHex: string;
  /**
   * ADR 0106: the request names the canonical family and carries the record's
   * fields; it never carries bytes. The daemon rebuilds the canonical bytes
   * with the same builder every verifier uses and renders the approval
   * statement from the same fields, so display and signature cannot diverge -
   * and the daemon never signs bytes it did not construct.
   */
  label: string;
  fields: Record<string, unknown>;
}

export interface PicoVaultDaemonReaderAccessOpenRequest {
  family: typeof picoVaultDaemonRequestFamilies.readerAccessOpen;
  requestId: string;
  readerKeyFingerprintHex: string;
  maxDurationMs: number;
}

export interface PicoVaultDaemonReaderAccessIsLockedRequest {
  family: typeof picoVaultDaemonRequestFamilies.readerAccessIsLocked;
  requestId: string;
  leaseId: string;
}

export interface PicoVaultDaemonReaderAccessCloseRequest {
  family: typeof picoVaultDaemonRequestFamilies.readerAccessClose;
  requestId: string;
  leaseId: string;
}

export interface PicoVaultDaemonReaderAccessOpenPayloadRequest {
  family: typeof picoVaultDaemonRequestFamilies.readerAccessOpenPayload;
  requestId: string;
  leaseId: string;
  batchRecord: Record<string, unknown>;
  evaluatedAt: string;
}

export interface PicoVaultDaemonReaderAccessDecryptItemRequest {
  family: typeof picoVaultDaemonRequestFamilies.readerAccessDecryptItem;
  requestId: string;
  leaseId: string;
  domainRecord: Record<string, unknown>;
  readerGrantRecord: Record<string, unknown>;
  writerGrantRecord: Record<string, unknown>;
  rotationRecords: Record<string, unknown>[];
  itemRecord: Record<string, unknown>;
}

/**
 * ADR 0101 ceremony requests. Scalars are validated structurally; embedded
 * records stay opaque because `@pico/vault` is the single authority that
 * verifies them. The approval digest covers the exact frame bytes, so every
 * field below is bound whether or not the wire inspects it.
 */
export interface PicoVaultDaemonCeremonyCreateDomainRequest {
  family: typeof picoVaultDaemonRequestFamilies.ceremonyCreateDomain;
  requestId: string;
  signerKeyFingerprintHex: string;
  ownerReaderKeyRecord: Record<string, unknown>;
  domainAuthorityId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  domainId: string;
  kekVersion?: number;
  authorizedAt: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface PicoVaultDaemonCeremonyRotateDomainRequest {
  family: typeof picoVaultDaemonRequestFamilies.ceremonyRotateDomain;
  requestId: string;
  signerKeyFingerprintHex: string;
  domainRecord: Record<string, unknown>;
  rotationRecords: Record<string, unknown>[];
  readerGrantLifecycleRecords: Record<string, unknown>[];
  writerGrantLifecycleRecords: Record<string, unknown>[];
  remainingReaderGrantRecords: Record<string, unknown>[];
  rotationId: string;
  rotatedAt: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

/**
 * ADR 0102: the first two-role ceremony. The signer creates the authority and
 * its holder approves; the agreement key only unwraps and re-seals KEKs its
 * owner already holds, which ADR 0099 deliberately does not gate.
 */
export interface PicoVaultDaemonCeremonyCreateReaderGrantRequest {
  family: typeof picoVaultDaemonRequestFamilies.ceremonyCreateReaderGrant;
  requestId: string;
  signerKeyFingerprintHex: string;
  agreementKeyFingerprintHex: string;
  domainRecord: Record<string, unknown>;
  rotationRecords: Record<string, unknown>[];
  readerKeyRecord: Record<string, unknown>;
  readerGrantId: string;
  readerIdentityKeyFingerprintHex: string;
  readerDeviceSigningKeyFingerprintHex: string;
  readerDelegationId: string;
  accessMode: string;
  firstKekVersion: number;
  validFrom: string;
  validUntil: string;
  lifecycleOrder: string;
  receivedAt?: string;
}

export interface PicoVaultDaemonCeremonyCreateReaderGrantResult {
  readerGrantRecord: Record<string, unknown>;
}

/**
 * ADR 0110's one named seed-export exception. The mandatory PIN enters only
 * this approval-bound issuance frame and is neither rendered nor audited.
 */
export interface PicoVaultDaemonCeremonyIssueRecoveryCardRequest {
  family:
    typeof picoVaultDaemonRequestFamilies.ceremonyIssueRecoveryCard;
  requestId: string;
  signerKeyFingerprintHex: string;
  picoName: string;
  homeNameOrId: string;
  homeId: string;
  hostSigningKeyFingerprintHex: string;
  hostKeyAgreementKeyFingerprintHex: string;
  hostKeyAgreementPublicKeyHex: string;
  endpointHint: string;
  issuedAt: string;
  pin: string;
}

export interface PicoVaultDaemonCeremonyIssueRecoveryCardResult {
  payload: Record<string, unknown>;
  recoveryPhrase: string;
  canonicalPayloadHex: string;
}

export interface PicoVaultDaemonApprovalWaitRequest {
  family: typeof picoVaultDaemonRequestFamilies.approvalWait;
  requestId: string;
}

export interface PicoVaultDaemonApprovalDecideRequest {
  family: typeof picoVaultDaemonRequestFamilies.approvalDecide;
  requestId: string;
  approvalId: string;
  signatureInputDigestHex: string;
  approved: boolean;
}

export type PicoVaultDaemonRequest =
  | PicoVaultDaemonHelloRequest
  | PicoVaultDaemonStatusRequest
  | PicoVaultDaemonUnlockRequest
  | PicoVaultDaemonLockRequest
  | PicoVaultDaemonSignRequest
  | PicoVaultDaemonReaderAccessOpenRequest
  | PicoVaultDaemonReaderAccessIsLockedRequest
  | PicoVaultDaemonReaderAccessCloseRequest
  | PicoVaultDaemonReaderAccessOpenPayloadRequest
  | PicoVaultDaemonReaderAccessDecryptItemRequest
  | PicoVaultDaemonApprovalWaitRequest
  | PicoVaultDaemonApprovalDecideRequest
  | PicoVaultDaemonCeremonyCreateDomainRequest
  | PicoVaultDaemonCeremonyRotateDomainRequest
  | PicoVaultDaemonCeremonyCreateReaderGrantRequest
  | PicoVaultDaemonCeremonyIssueRecoveryCardRequest;

export interface PicoVaultDaemonKeyfileDescriptor {
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
}

export interface PicoVaultDaemonHelloResult {
  protocolVersion: typeof picoVaultDaemonProtocolVersion;
  daemonVersion: string;
  locked: boolean;
}

/**
 * ADR 0100: while a session is unlocked, status also publishes its public key
 * (the ADR 0079 public surface) so a ceremony signer can embed real key
 * records without a private-key holder in its own process. Locked keyfiles
 * cannot reveal it - the public key sits inside the encrypted payload.
 */
export interface PicoVaultDaemonUnlockedSessionDescriptor {
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  publicKeyHex: string;
}

export interface PicoVaultDaemonStatusResult {
  locked: boolean;
  sessions: PicoVaultDaemonUnlockedSessionDescriptor[];
  keyfiles: PicoVaultDaemonKeyfileDescriptor[];
}

export interface PicoVaultDaemonUnlockResult {
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  publicKeyHex: string;
  idleLockMs: number;
  maxUnlockDurationMs: number;
}

export interface PicoVaultDaemonLockResult {
  locked: true;
}

export interface PicoVaultDaemonSignResult {
  signatureHex: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
}

export interface PicoVaultDaemonReaderAccessOpenResult {
  leaseId: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  maxDurationMs: number;
}

export interface PicoVaultDaemonReaderAccessIsLockedResult {
  locked: boolean;
}

export interface PicoVaultDaemonReaderAccessCloseResult {
  closed: true;
}

export interface PicoVaultDaemonReaderAccessOpenPayloadResult {
  payload: Record<string, unknown>;
}

export interface PicoVaultDaemonReaderAccessDecryptItemResult {
  plaintext: string;
}

/**
 * What the person is shown. It is deliberately the family label, the key it
 * would be signed with and the digest that binds the decision - not a rendered
 * statement of the record, which no renderer exists for yet (ADR 0099).
 */
export interface PicoVaultDaemonApprovalRequestDescriptor {
  approvalId: string;
  label: string;
  keyRole: PicoVaultPersonKeyRole;
  keyFingerprintHex: string;
  signatureInputDigestHex: string;
  /**
   * ADR 0106: rendered by the daemon from the same fields the signature
   * covers - never echoed from the requester. This is what a person is shown.
   */
  statement: string;
  expiresInMs: number;
  /**
   * ADR 0101: verbatim scalar echo from a ceremony request (already covered
   * by the digest) - input echo, never interpretation. Absent for plain
   * signature approvals.
   */
  summary?: Record<string, string | number>;
}

export interface PicoVaultDaemonCeremonyCreateDomainResult {
  domainRecord: Record<string, unknown>;
}

export interface PicoVaultDaemonCeremonyRotateDomainResult {
  rotationRecord: Record<string, unknown>;
}

export interface PicoVaultDaemonApprovalWaitResult {
  pending: PicoVaultDaemonApprovalRequestDescriptor | null;
}

export interface PicoVaultDaemonApprovalDecideResult {
  recorded: true;
}

export interface PicoVaultDaemonOkResponse {
  family: typeof picoVaultDaemonResponseFamily;
  requestId: string;
  ok: true;
  result: Record<string, unknown>;
}

export interface PicoVaultDaemonErrorResponse {
  family: typeof picoVaultDaemonResponseFamily;
  requestId: string;
  ok: false;
  reason: string;
}

export type PicoVaultDaemonResponse = PicoVaultDaemonOkResponse | PicoVaultDaemonErrorResponse;

export function encodePicoVaultDaemonFrame(
  payload: Record<string, unknown>,
  maxFrameBytes: number = MAX_PICO_VAULT_DAEMON_FRAME_BYTES,
): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  if (body.byteLength > maxFrameBytes) {
    throw new Error('frame_too_large');
  }
  const frame = Buffer.allocUnsafe(FRAME_LENGTH_PREFIX_BYTES + body.byteLength);
  frame.writeUInt32BE(body.byteLength, 0);
  body.copy(frame, FRAME_LENGTH_PREFIX_BYTES);
  return frame;
}

/**
 * Incremental frame decoder. The declared length is checked against the current
 * cap before any body bytes are buffered, so an oversized declaration fails
 * immediately instead of allocating. The cap is per connection and mutable:
 * ADR 0098 raises it only while that connection holds a reader-access lease.
 */
export class PicoVaultDaemonFrameDecoder {
  #buffered: Buffer = Buffer.alloc(0);

  #maxFrameBytes: number;

  public constructor(maxFrameBytes: number = MAX_PICO_VAULT_DAEMON_FRAME_BYTES) {
    this.#maxFrameBytes = maxFrameBytes;
  }

  public setMaxFrameBytes(maxFrameBytes: number): void {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes < 1) {
      throw new Error('invalid_max_frame_bytes');
    }
    this.#maxFrameBytes = maxFrameBytes;
  }

  public feed(chunk: Buffer): Buffer[] {
    this.#buffered = this.#buffered.byteLength === 0 ? chunk : Buffer.concat([this.#buffered, chunk]);
    const frames: Buffer[] = [];

    for (;;) {
      if (this.#buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES) {
        return frames;
      }
      const bodyLength = this.#buffered.readUInt32BE(0);
      if (bodyLength === 0 || bodyLength > this.#maxFrameBytes) {
        throw new Error('frame_too_large');
      }
      if (this.#buffered.byteLength < FRAME_LENGTH_PREFIX_BYTES + bodyLength) {
        return frames;
      }
      frames.push(this.#buffered.subarray(FRAME_LENGTH_PREFIX_BYTES, FRAME_LENGTH_PREFIX_BYTES + bodyLength));
      this.#buffered = Buffer.from(this.#buffered.subarray(FRAME_LENGTH_PREFIX_BYTES + bodyLength));
    }
  }
}

export function parsePicoVaultDaemonRequest(frame: Buffer): PicoVaultDaemonRequest {
  const parsed = parseJsonRecord(frame);
  const requestId = parseRequestId(parsed);
  const family = parsed.family;
  if (typeof family !== 'string') {
    throw new Error('invalid_request');
  }

  switch (family) {
    case picoVaultDaemonRequestFamilies.hello: {
      assertExactKeys(parsed, ['family', 'requestId', 'protocolVersion']);
      const protocolVersion = parsed.protocolVersion;
      if (!Number.isSafeInteger(protocolVersion) || (protocolVersion as number) < 1) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.hello,
        requestId,
        protocolVersion: protocolVersion as number,
      };
    }
    case picoVaultDaemonRequestFamilies.status: {
      assertExactKeys(parsed, ['family', 'requestId']);
      return { family: picoVaultDaemonRequestFamilies.status, requestId };
    }
    case picoVaultDaemonRequestFamilies.lock: {
      assertExactKeys(parsed, ['family', 'requestId']);
      return { family: picoVaultDaemonRequestFamilies.lock, requestId };
    }
    case picoVaultDaemonRequestFamilies.unlock: {
      assertExactKeys(parsed, ['family', 'requestId', 'keyRole', 'keyFingerprintHex', 'passphrase']);
      const keyRole = parsed.keyRole;
      if (typeof keyRole !== 'string' || !(picoVaultPersonKeyRoles as readonly string[]).includes(keyRole)) {
        throw new Error('invalid_request');
      }
      const keyFingerprintHex = parsed.keyFingerprintHex;
      if (
        typeof keyFingerprintHex !== 'string'
        || keyFingerprintHex.length !== KEY_FINGERPRINT_HEX_CHARS
        || !lowercaseHexPattern.test(keyFingerprintHex)
      ) {
        throw new Error('invalid_request');
      }
      const passphrase = parsed.passphrase;
      if (
        typeof passphrase !== 'string'
        || passphrase.length === 0
        || passphrase.length > MAX_PICO_VAULT_DAEMON_PASSPHRASE_CHARS
      ) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.unlock,
        requestId,
        keyRole: keyRole as PicoVaultPersonKeyRole,
        keyFingerprintHex,
        passphrase,
      };
    }
    case picoVaultDaemonRequestFamilies.sign: {
      assertExactKeys(parsed, ['family', 'requestId', 'keyFingerprintHex', 'label', 'fields']);
      const label = parsed.label;
      const fields = parsed.fields;
      if (
        typeof label !== 'string'
        || label.length === 0
        || label.length > MAX_PICO_VAULT_DAEMON_SIGN_LABEL_CHARS
        || typeof fields !== 'object'
        || fields === null
        || Array.isArray(fields)
      ) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.sign,
        requestId,
        keyFingerprintHex: requireFingerprintHex(parsed, 'keyFingerprintHex'),
        label,
        fields: fields as Record<string, unknown>,
      };
    }
    case picoVaultDaemonRequestFamilies.readerAccessOpen: {
      assertExactKeys(parsed, ['family', 'requestId', 'readerKeyFingerprintHex', 'maxDurationMs']);
      const maxDurationMs = parsed.maxDurationMs;
      if (
        !Number.isSafeInteger(maxDurationMs)
        || (maxDurationMs as number) < 1
        || (maxDurationMs as number) > PICO_VAULT_DAEMON_READER_ACCESS_LEASE_CEILING_MS
      ) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.readerAccessOpen,
        requestId,
        readerKeyFingerprintHex: requireFingerprintHex(parsed, 'readerKeyFingerprintHex'),
        maxDurationMs: maxDurationMs as number,
      };
    }
    case picoVaultDaemonRequestFamilies.readerAccessIsLocked: {
      assertExactKeys(parsed, ['family', 'requestId', 'leaseId']);
      return {
        family: picoVaultDaemonRequestFamilies.readerAccessIsLocked,
        requestId,
        leaseId: requireLeaseId(parsed),
      };
    }
    case picoVaultDaemonRequestFamilies.readerAccessClose: {
      assertExactKeys(parsed, ['family', 'requestId', 'leaseId']);
      return {
        family: picoVaultDaemonRequestFamilies.readerAccessClose,
        requestId,
        leaseId: requireLeaseId(parsed),
      };
    }
    case picoVaultDaemonRequestFamilies.readerAccessOpenPayload: {
      assertExactKeys(parsed, ['family', 'requestId', 'leaseId', 'batchRecord', 'evaluatedAt']);
      const evaluatedAt = parsed.evaluatedAt;
      if (
        typeof evaluatedAt !== 'string'
        || evaluatedAt.length === 0
        || evaluatedAt.length > MAX_PICO_VAULT_DAEMON_INSTANT_CHARS
      ) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.readerAccessOpenPayload,
        requestId,
        leaseId: requireLeaseId(parsed),
        batchRecord: requireRecord(parsed, 'batchRecord'),
        evaluatedAt,
      };
    }
    case picoVaultDaemonRequestFamilies.readerAccessDecryptItem: {
      assertExactKeys(parsed, [
        'family',
        'requestId',
        'leaseId',
        'domainRecord',
        'readerGrantRecord',
        'writerGrantRecord',
        'rotationRecords',
        'itemRecord',
      ]);
      return {
        family: picoVaultDaemonRequestFamilies.readerAccessDecryptItem,
        requestId,
        leaseId: requireLeaseId(parsed),
        domainRecord: requireRecord(parsed, 'domainRecord'),
        readerGrantRecord: requireRecord(parsed, 'readerGrantRecord'),
        writerGrantRecord: requireRecord(parsed, 'writerGrantRecord'),
        rotationRecords: requireRecordArray(parsed, 'rotationRecords'),
        itemRecord: requireRecord(parsed, 'itemRecord'),
      };
    }
    case picoVaultDaemonRequestFamilies.ceremonyCreateDomain: {
      assertExactKeysWithOptional(
        parsed,
        [
          'family', 'requestId', 'signerKeyFingerprintHex', 'ownerReaderKeyRecord', 'domainAuthorityId',
          'homeId', 'hostSigningKeyFingerprintHex', 'domainId', 'authorizedAt',
          'lifecycleOrder',
        ],
        ['kekVersion', 'receivedAt'],
      );
      const kekVersion = parsed.kekVersion;
      if (kekVersion !== undefined && (!Number.isSafeInteger(kekVersion) || (kekVersion as number) < 1)) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.ceremonyCreateDomain,
        requestId,
        signerKeyFingerprintHex: requireFingerprintHex(parsed, 'signerKeyFingerprintHex'),
        ownerReaderKeyRecord: requireRecord(parsed, 'ownerReaderKeyRecord'),
        domainAuthorityId: requireBoundedString(parsed, 'domainAuthorityId'),
        homeId: requireBoundedString(parsed, 'homeId'),
        hostSigningKeyFingerprintHex: requireFingerprintHex(parsed, 'hostSigningKeyFingerprintHex'),
        domainId: requireBoundedString(parsed, 'domainId'),
        ...(kekVersion === undefined ? {} : { kekVersion: kekVersion as number }),
        authorizedAt: requireBoundedString(parsed, 'authorizedAt'),
        lifecycleOrder: requireBoundedString(parsed, 'lifecycleOrder'),
        ...(parsed.receivedAt === undefined
          ? {}
          : { receivedAt: requireBoundedString(parsed, 'receivedAt') }),
      };
    }
    case picoVaultDaemonRequestFamilies.ceremonyRotateDomain: {
      assertExactKeysWithOptional(
        parsed,
        [
          'family', 'requestId', 'signerKeyFingerprintHex', 'domainRecord', 'rotationRecords',
          'readerGrantLifecycleRecords', 'writerGrantLifecycleRecords',
          'remainingReaderGrantRecords', 'rotationId', 'rotatedAt',
          'lifecycleOrder',
        ],
        ['receivedAt'],
      );
      return {
        family: picoVaultDaemonRequestFamilies.ceremonyRotateDomain,
        requestId,
        signerKeyFingerprintHex: requireFingerprintHex(parsed, 'signerKeyFingerprintHex'),
        domainRecord: requireRecord(parsed, 'domainRecord'),
        rotationRecords: requireRecordArray(parsed, 'rotationRecords'),
        readerGrantLifecycleRecords: requireRecordArray(parsed, 'readerGrantLifecycleRecords'),
        writerGrantLifecycleRecords: requireRecordArray(parsed, 'writerGrantLifecycleRecords'),
        remainingReaderGrantRecords: requireRecordArray(parsed, 'remainingReaderGrantRecords'),
        rotationId: requireBoundedString(parsed, 'rotationId'),
        rotatedAt: requireBoundedString(parsed, 'rotatedAt'),
        lifecycleOrder: requireBoundedString(parsed, 'lifecycleOrder'),
        ...(parsed.receivedAt === undefined
          ? {}
          : { receivedAt: requireBoundedString(parsed, 'receivedAt') }),
      };
    }
    case picoVaultDaemonRequestFamilies.ceremonyCreateReaderGrant: {
      assertExactKeysWithOptional(
        parsed,
        [
          'family', 'requestId', 'signerKeyFingerprintHex',
          'agreementKeyFingerprintHex', 'domainRecord', 'rotationRecords',
          'readerKeyRecord', 'readerGrantId', 'readerIdentityKeyFingerprintHex',
          'readerDeviceSigningKeyFingerprintHex', 'readerDelegationId',
          'accessMode', 'firstKekVersion', 'validFrom', 'validUntil',
          'lifecycleOrder',
        ],
        ['receivedAt'],
      );
      const firstKekVersion = parsed.firstKekVersion;
      if (!Number.isSafeInteger(firstKekVersion) || (firstKekVersion as number) < 1) {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.ceremonyCreateReaderGrant,
        requestId,
        signerKeyFingerprintHex: requireFingerprintHex(parsed, 'signerKeyFingerprintHex'),
        agreementKeyFingerprintHex: requireFingerprintHex(parsed, 'agreementKeyFingerprintHex'),
        domainRecord: requireRecord(parsed, 'domainRecord'),
        rotationRecords: requireRecordArray(parsed, 'rotationRecords'),
        readerKeyRecord: requireRecord(parsed, 'readerKeyRecord'),
        readerGrantId: requireBoundedString(parsed, 'readerGrantId'),
        readerIdentityKeyFingerprintHex:
          requireFingerprintHex(parsed, 'readerIdentityKeyFingerprintHex'),
        readerDeviceSigningKeyFingerprintHex:
          requireFingerprintHex(parsed, 'readerDeviceSigningKeyFingerprintHex'),
        readerDelegationId: requireBoundedString(parsed, 'readerDelegationId'),
        accessMode: requireBoundedString(parsed, 'accessMode'),
        firstKekVersion: firstKekVersion as number,
        validFrom: requireBoundedString(parsed, 'validFrom'),
        validUntil: requireBoundedString(parsed, 'validUntil'),
        lifecycleOrder: requireBoundedString(parsed, 'lifecycleOrder'),
        ...(parsed.receivedAt === undefined
          ? {}
          : { receivedAt: requireBoundedString(parsed, 'receivedAt') }),
      };
    }
    case picoVaultDaemonRequestFamilies.ceremonyIssueRecoveryCard: {
      assertExactKeys(
        parsed,
        [
          'family', 'requestId', 'signerKeyFingerprintHex',
          'picoName', 'homeNameOrId', 'homeId',
          'hostSigningKeyFingerprintHex',
          'hostKeyAgreementKeyFingerprintHex',
          'hostKeyAgreementPublicKeyHex', 'endpointHint', 'issuedAt', 'pin',
        ],
      );
      const pin = parsed.pin;
      if (
        typeof pin !== 'string'
        || pin.length < picoRecoveryPinProtection.minLength
        || pin.length > picoRecoveryPinProtection.maxLength
        || !/^[0-9a-z]+$/.test(pin)
      ) {
        throw new Error('invalid_request');
      }
      return {
        family:
          picoVaultDaemonRequestFamilies.ceremonyIssueRecoveryCard,
        requestId,
        signerKeyFingerprintHex:
          requireFingerprintHex(parsed, 'signerKeyFingerprintHex'),
        picoName: requireBoundedString(parsed, 'picoName'),
        homeNameOrId: requireBoundedString(parsed, 'homeNameOrId'),
        homeId: requireBoundedString(parsed, 'homeId'),
        hostSigningKeyFingerprintHex:
          requireFingerprintHex(
            parsed,
            'hostSigningKeyFingerprintHex',
          ),
        hostKeyAgreementKeyFingerprintHex:
          requireFingerprintHex(
            parsed,
            'hostKeyAgreementKeyFingerprintHex',
          ),
        hostKeyAgreementPublicKeyHex:
          requireFingerprintHex(
            parsed,
            'hostKeyAgreementPublicKeyHex',
          ),
        endpointHint: requireBoundedString(parsed, 'endpointHint'),
        issuedAt: requireBoundedString(parsed, 'issuedAt'),
        pin,
      };
    }
    case picoVaultDaemonRequestFamilies.approvalWait: {
      assertExactKeys(parsed, ['family', 'requestId']);
      return { family: picoVaultDaemonRequestFamilies.approvalWait, requestId };
    }
    case picoVaultDaemonRequestFamilies.approvalDecide: {
      assertExactKeys(parsed, [
        'family',
        'requestId',
        'approvalId',
        'signatureInputDigestHex',
        'approved',
      ]);
      const approvalId = parsed.approvalId;
      if (
        typeof approvalId !== 'string'
        || approvalId.length !== PICO_VAULT_DAEMON_APPROVAL_ID_HEX_CHARS
        || !lowercaseHexPattern.test(approvalId)
      ) {
        throw new Error('invalid_request');
      }
      if (typeof parsed.approved !== 'boolean') {
        throw new Error('invalid_request');
      }
      return {
        family: picoVaultDaemonRequestFamilies.approvalDecide,
        requestId,
        approvalId,
        signatureInputDigestHex: requireFingerprintHex(parsed, 'signatureInputDigestHex'),
        approved: parsed.approved,
      };
    }
    default:
      throw new Error('unknown_request_family');
  }
}

export function parsePicoVaultDaemonResponse(frame: Buffer): PicoVaultDaemonResponse {
  const parsed = parseJsonRecord(frame);
  if (parsed.family !== picoVaultDaemonResponseFamily) {
    throw new Error('invalid_response');
  }
  const requestId = parsed.requestId;
  if (typeof requestId !== 'string') {
    throw new Error('invalid_response');
  }
  if (parsed.ok === true) {
    assertExactKeys(parsed, ['family', 'requestId', 'ok', 'result']);
    const result = parsed.result;
    if (!isRecord(result)) {
      throw new Error('invalid_response');
    }
    return { family: picoVaultDaemonResponseFamily, requestId, ok: true, result };
  }
  if (parsed.ok === false) {
    assertExactKeys(parsed, ['family', 'requestId', 'ok', 'reason']);
    const reason = parsed.reason;
    if (typeof reason !== 'string' || reason.length === 0) {
      throw new Error('invalid_response');
    }
    return { family: picoVaultDaemonResponseFamily, requestId, ok: false, reason };
  }
  throw new Error('invalid_response');
}

function parseJsonRecord(frame: Buffer): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.toString('utf8'));
  } catch {
    throw new Error('malformed_frame');
  }
  if (!isRecord(parsed)) {
    throw new Error('malformed_frame');
  }
  return parsed;
}

function parseRequestId(parsed: Record<string, unknown>): string {
  const requestId = parsed.requestId;
  if (
    typeof requestId !== 'string'
    || requestId.length === 0
    || requestId.length > MAX_PICO_VAULT_DAEMON_REQUEST_ID_CHARS
    || !requestIdPattern.test(requestId)
  ) {
    throw new Error('invalid_request');
  }
  return requestId;
}

/**
 * Structural wire checks only. Record contents stay unvalidated here on
 * purpose: `@pico/vault` is the single authority that verifies signatures,
 * scope and lifecycle, and a second validator at the socket would be a second
 * place to disagree with it.
 */
function requireRecord(parsed: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = parsed[key];
  if (!isRecord(value)) {
    throw new Error('invalid_request');
  }
  return value;
}

function requireRecordArray(parsed: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = parsed[key];
  if (!Array.isArray(value) || !value.every((entry) => isRecord(entry))) {
    throw new Error('invalid_request');
  }
  return value as Record<string, unknown>[];
}

function requireFingerprintHex(parsed: Record<string, unknown>, key: string): string {
  const value = parsed[key];
  if (
    typeof value !== 'string'
    || value.length !== KEY_FINGERPRINT_HEX_CHARS
    || !lowercaseHexPattern.test(value)
  ) {
    throw new Error('invalid_request');
  }
  return value;
}

function requireLeaseId(parsed: Record<string, unknown>): string {
  const value = parsed.leaseId;
  if (
    typeof value !== 'string'
    || value.length !== PICO_VAULT_DAEMON_LEASE_ID_HEX_CHARS
    || !lowercaseHexPattern.test(value)
  ) {
    throw new Error('invalid_request');
  }
  return value;
}

function assertExactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) {
    throw new Error('invalid_request');
  }
}

function assertExactKeysWithOptional(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): void {
  if (!required.every((key) => Object.hasOwn(record, key))) {
    throw new Error('invalid_request');
  }
  for (const key of Object.keys(record)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new Error('invalid_request');
    }
  }
}

function requireBoundedString(parsed: Record<string, unknown>, key: string): string {
  const value = parsed[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
    throw new Error('invalid_request');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
