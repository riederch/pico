import { isAsciiToken, isHexOfBytes } from '@pico/protocol/canonical-bytes';
import { randomUUID } from 'node:crypto';
import {
  buildPicoShareEnvelopeSignatureInput,
  buildPicoShareWrapPayload,
  hasPicoExposureWindowElapsed,
  picoShareEnvelopeRecordSchema,
  picoShareSuite,
  type PicoShareEnvelopeRecord,
  type PicoShareEnvelopeSignatureInput,
} from '@pico/protocol';
import { verifyPicoIdentityDetachedSignature } from '@pico/identity';
import type { KeyStore } from './key-store.js';
import type {
  EventStore,
  PicoShareEnvelopeStoredRecord,
  PicoShareEnvelopeVerificationSodium,
} from './event-store.js';
import {
  PicoIdentityReaderKeySelector,
  type PicoIdentityReaderKeySelectionFailure,
} from './reader-key.js';

const DEFAULT_PENDING_TTL_MS = 2 * 60 * 1000;
const DEFAULT_MAX_PENDING = 128;

export interface PicoShareEnvelopeSodium extends PicoShareEnvelopeVerificationSodium {
  crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array;
  memzero(bytes: Uint8Array): void;
}

export interface PicoShareEnvelopePrepareInput {
  grantId: string;
  delegationId: string;
  readerKeyFingerprintHex: string;
  kekVersion: number;
}

export interface PicoShareEnvelopePendingIssuance {
  issuanceId: string;
  envelope: PicoShareEnvelopeSignatureInput;
  sealedWrapHex: string;
  envelopeSignatureInputHex: string;
  expiresAt: string;
}

export type PicoShareEnvelopeIssuanceFailure =
  | 'invalid_request'
  | 'envelope_issuance_unavailable'
  | 'inactive_grant'
  | PicoIdentityReaderKeySelectionFailure
  | 'reader_does_not_match_grant'
  | 'key_version_unavailable'
  | 'unknown_or_expired_issuance'
  | 'invalid_issuer_signature'
  | 'authority_changed'
  | 'conflicting_record';

export type PicoShareEnvelopePrepareResult =
  | { ok: true; pending: PicoShareEnvelopePendingIssuance }
  | { ok: false; reason: PicoShareEnvelopeIssuanceFailure };

export type PicoShareEnvelopeFinalizeResult =
  | { ok: true; inserted: boolean; envelope: PicoShareEnvelopeStoredRecord }
  | { ok: false; reason: PicoShareEnvelopeIssuanceFailure };

interface PendingRecord {
  issuanceId: string;
  delegationId: string;
  envelope: PicoShareEnvelopeSignatureInput;
  sealedWrapHex: string;
  expiresAtMs: number;
  /**
   * ADR 0120 N1. A pending issuance is an exposure window - it bounds a
   * ceremony that holds a sealed wrap - so it ends at the earliest instant
   * either clock allows, and a wall clock wound backward cannot keep the wrap
   * alive longer than it was meant to live.
   */
  startedAtMonotonicMs: number;
}

/**
 * ADR 0084's custody seam. Foundation may prepare a host-custody KEK wrap, but
 * it cannot finalize or persist one until a Pico Identity Vault returns a
 * detached controller signature over the exact canonical envelope bytes.
 */
export class PicoShareEnvelopeIssuer {
  private readonly pending = new Map<string, PendingRecord>();

  public constructor(
    private readonly store: EventStore,
    private readonly sodium: PicoShareEnvelopeSodium,
    private readonly readerKeySelector: PicoIdentityReaderKeySelector,
    private readonly keyStore: KeyStore | undefined,
    private readonly pendingTtlMs: number = DEFAULT_PENDING_TTL_MS,
    private readonly maxPending: number = DEFAULT_MAX_PENDING,
    /** ADR 0120 N1. The second clock; defaults to the process monotonic one. */
    private readonly monotonicNow: () => number = () => performance.now(),
  ) {
    if (!Number.isSafeInteger(pendingTtlMs) || pendingTtlMs < 1
      || !Number.isSafeInteger(maxPending) || maxPending < 1) {
      throw new Error('Invalid Pico share-envelope pending-store bounds.');
    }
  }

  public async prepare(
    input: PicoShareEnvelopePrepareInput,
    now: Date = new Date(),
  ): Promise<PicoShareEnvelopePrepareResult> {
    if (!isPrepareInput(input)) {
      return { ok: false, reason: 'invalid_request' };
    }
    if (this.keyStore === undefined) {
      return { ok: false, reason: 'envelope_issuance_unavailable' };
    }

    const at = now.toISOString();
    const grant = this.store.activePicoHomeDomainReadGrantRecord(
      this.sodium,
      input.grantId,
      at,
    );
    if (grant === undefined) {
      return { ok: false, reason: 'inactive_grant' };
    }

    const selection = await this.readerKeySelector.select({
      homeId: grant.grant.homeId,
      picoIdentityFingerprintHex: grant.grant.readerPicoIdentityFingerprintHex,
      delegationId: input.delegationId,
      deviceKeyAgreementKeyFingerprintHex: input.readerKeyFingerprintHex,
      at,
    });
    if (!selection.ok) {
      return selection;
    }
    if (selection.candidate.picoIdentityFingerprintHex
      !== grant.grant.readerPicoIdentityFingerprintHex) {
      return { ok: false, reason: 'reader_does_not_match_grant' };
    }
    const currentGrant = this.store.activePicoHomeDomainReadGrantRecord(
      this.sodium,
      input.grantId,
      at,
    );
    if (currentGrant === undefined
      || currentGrant.grant.readerPicoIdentityFingerprintHex
        !== selection.candidate.picoIdentityFingerprintHex) {
      return { ok: false, reason: 'authority_changed' };
    }

    let kek: Buffer;
    try {
      if (!this.keyStore.listVersions(currentGrant.grant.privacyDomain, {
        custodyClass: 'host_custody',
      }).includes(input.kekVersion)) {
        return { ok: false, reason: 'key_version_unavailable' };
      }
      kek = this.keyStore.loadKeyVersion(currentGrant.grant.privacyDomain, input.kekVersion, {
        custodyClass: 'host_custody',
      });
    } catch {
      return { ok: false, reason: 'key_version_unavailable' };
    }

    let wrapPayload: Uint8Array | undefined;
    let sealedWrap: Uint8Array;
    try {
      wrapPayload = buildPicoShareWrapPayload({
        suite: picoShareSuite,
        domainId: currentGrant.grant.privacyDomain,
        kekVersion: input.kekVersion,
        readerKeyFingerprintHex: selection.candidate.deviceKeyAgreementKeyFingerprintHex,
        kekHex: kek.toString('hex'),
      });
      sealedWrap = this.sodium.crypto_box_seal(
        wrapPayload,
        Buffer.from(selection.candidate.deviceKeyAgreementKeyRecord.publicKeyHex, 'hex'),
      );
    } catch {
      return { ok: false, reason: 'invalid_request' };
    } finally {
      this.sodium.memzero(kek);
      if (wrapPayload !== undefined) {
        this.sodium.memzero(wrapPayload);
      }
    }

    const wrapDigestHex = Buffer.from(
      this.sodium.crypto_generichash(32, sealedWrap, null),
    ).toString('hex');
    const envelope: PicoShareEnvelopeSignatureInput = {
      suite: picoShareSuite,
      grantId: currentGrant.grant.grantId,
      domainId: currentGrant.grant.privacyDomain,
      kekVersion: input.kekVersion,
      hostSigningKeyFingerprintHex: currentGrant.grant.hostSigningKeyFingerprintHex,
      issuerIdentityKeyFingerprintHex: currentGrant.grant.controllerPicoIdentityFingerprintHex,
      readerKeyFingerprintHex: selection.candidate.deviceKeyAgreementKeyFingerprintHex,
      wrapDigestHex,
      grantedAt: at,
    };
    const signatureInput = buildPicoShareEnvelopeSignatureInput(envelope);
    const issuanceId = `issuance_${randomUUID()}`;
    const expiresAtMs = now.getTime() + this.pendingTtlMs;
    this.pruneAndMakeRoom(now.getTime());
    this.pending.set(issuanceId, {
      issuanceId,
      delegationId: input.delegationId,
      envelope,
      sealedWrapHex: Buffer.from(sealedWrap).toString('hex'),
      expiresAtMs,
      startedAtMonotonicMs: this.monotonicNow(),
    });
    this.sodium.memzero(sealedWrap);

    return {
      ok: true,
      pending: {
        issuanceId,
        envelope,
        sealedWrapHex: this.pending.get(issuanceId)!.sealedWrapHex,
        envelopeSignatureInputHex: Buffer.from(signatureInput).toString('hex'),
        expiresAt: new Date(expiresAtMs).toISOString(),
      },
    };
  }

  public async finalize(
    issuanceId: string,
    issuerSignatureHex: string,
    now: Date = new Date(),
  ): Promise<PicoShareEnvelopeFinalizeResult> {
    if (!isAsciiToken(issuanceId, 256) || !isHexOfBytes(issuerSignatureHex, 64)) {
      return { ok: false, reason: 'invalid_request' };
    }

    const existing = this.store.picoShareEnvelope(issuanceId);
    if (existing !== undefined) {
      if (existing.record.issuerSignatureHex !== issuerSignatureHex) {
        return { ok: false, reason: 'conflicting_record' };
      }
      if (this.keyStore === undefined) {
        return { ok: false, reason: 'envelope_issuance_unavailable' };
      }
      const at = now.toISOString();
      if (!this.store.isPicoShareEnvelopeValid(this.sodium, existing, at)) {
        return { ok: false, reason: 'authority_changed' };
      }
      const grant = this.store.activePicoHomeDomainReadGrantRecord(
        this.sodium,
        existing.record.envelope.grantId,
        at,
      );
      if (grant === undefined) {
        return { ok: false, reason: 'authority_changed' };
      }
      const selection = await this.readerKeySelector.select({
        homeId: grant.grant.homeId,
        picoIdentityFingerprintHex: grant.grant.readerPicoIdentityFingerprintHex,
        delegationId: existing.delegationId,
        deviceKeyAgreementKeyFingerprintHex: existing.record.envelope.readerKeyFingerprintHex,
        at,
      });
      if (!selection.ok) {
        return { ok: false, reason: selection.reason };
      }
      if (!this.store.isPicoShareEnvelopeValid(this.sodium, existing, at)) {
        return { ok: false, reason: 'authority_changed' };
      }
      try {
        if (!this.keyStore.listVersions(existing.record.envelope.domainId, {
          custodyClass: 'host_custody',
        }).includes(existing.record.envelope.kekVersion)) {
          return { ok: false, reason: 'key_version_unavailable' };
        }
      } catch {
        return { ok: false, reason: 'key_version_unavailable' };
      }
      return { ok: true, inserted: false, envelope: existing };
    }

    const pending = this.pending.get(issuanceId);
    this.pending.delete(issuanceId);
    if (pending === undefined || this.hasPendingElapsed(pending, now.getTime())) {
      return { ok: false, reason: 'unknown_or_expired_issuance' };
    }
    if (this.keyStore === undefined) {
      return { ok: false, reason: 'envelope_issuance_unavailable' };
    }

    const at = now.toISOString();
    const grant = this.store.activePicoHomeDomainReadGrantRecord(
      this.sodium,
      pending.envelope.grantId,
      at,
    );
    if (grant === undefined
      || pending.envelope.domainId !== grant.grant.privacyDomain
      || pending.envelope.hostSigningKeyFingerprintHex
        !== grant.grant.hostSigningKeyFingerprintHex
      || pending.envelope.issuerIdentityKeyFingerprintHex
        !== grant.grant.controllerPicoIdentityFingerprintHex
      || pending.envelope.readerKeyFingerprintHex === '') {
      return { ok: false, reason: 'authority_changed' };
    }

    const selection = await this.readerKeySelector.select({
      homeId: grant.grant.homeId,
      picoIdentityFingerprintHex: grant.grant.readerPicoIdentityFingerprintHex,
      delegationId: pending.delegationId,
      deviceKeyAgreementKeyFingerprintHex: pending.envelope.readerKeyFingerprintHex,
      at,
    });
    if (!selection.ok) {
      return { ok: false, reason: selection.reason };
    }
    const currentGrant = this.store.activePicoHomeDomainReadGrantRecord(
      this.sodium,
      pending.envelope.grantId,
      at,
    );
    if (currentGrant === undefined
      || currentGrant.grant.readerPicoIdentityFingerprintHex
        !== selection.candidate.picoIdentityFingerprintHex) {
      return { ok: false, reason: 'authority_changed' };
    }

    try {
      if (!this.keyStore.listVersions(pending.envelope.domainId, {
        custodyClass: 'host_custody',
      }).includes(pending.envelope.kekVersion)) {
        return { ok: false, reason: 'key_version_unavailable' };
      }
      const currentDigest = Buffer.from(
        this.sodium.crypto_generichash(32, Buffer.from(pending.sealedWrapHex, 'hex'), null),
      ).toString('hex');
      if (currentDigest !== pending.envelope.wrapDigestHex
        || currentGrant.issuerIdentityKeyRecord.keyRole !== 'pico_identity'
        || !verifyPicoIdentityDetachedSignature(this.sodium, {
          publicKeyHex: currentGrant.issuerIdentityKeyRecord.publicKeyHex,
          signatureInput: buildPicoShareEnvelopeSignatureInput(pending.envelope),
          signatureHex: issuerSignatureHex,
        })) {
        return { ok: false, reason: 'invalid_issuer_signature' };
      }
    } catch {
      return { ok: false, reason: 'invalid_issuer_signature' };
    }

    const record: PicoShareEnvelopeRecord = {
      schema: picoShareEnvelopeRecordSchema,
      envelope: pending.envelope,
      sealedWrapHex: pending.sealedWrapHex,
      issuerIdentityKeyRecord: currentGrant.issuerIdentityKeyRecord,
      issuerSignatureHex,
      createdAt: at,
    };
    const recorded = this.store.recordPicoShareEnvelope({
      sodium: this.sodium,
      issuanceId,
      delegationId: pending.delegationId,
      record,
      at,
    });
    if (!recorded.ok) {
      return {
        ok: false,
        reason: recorded.reason === 'conflicting_record'
          ? 'conflicting_record'
          : 'authority_changed',
      };
    }
    return recorded;
  }

  /** ADR 0120 N1 exposure evaluation for one pending issuance. */
  private hasPendingElapsed(record: PendingRecord, nowMs: number): boolean {
    return hasPicoExposureWindowElapsed({
      endsAtMs: record.expiresAtMs,
      nowMs,
      monotonic: {
        startedAtMs: record.startedAtMonotonicMs,
        nowMs: this.monotonicNow(),
        durationMs: this.pendingTtlMs,
      },
    });
  }

  private pruneAndMakeRoom(nowMs: number): void {
    for (const [issuanceId, record] of this.pending) {
      if (this.hasPendingElapsed(record, nowMs)) {
        this.pending.delete(issuanceId);
      }
    }
    while (this.pending.size >= this.maxPending) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.pending.delete(oldest);
    }
  }
}

function isPrepareInput(input: PicoShareEnvelopePrepareInput): boolean {
  return isAsciiToken(input.grantId, 256)
    && isAsciiToken(input.delegationId, 256)
    && isHexOfBytes(input.readerKeyFingerprintHex, 32)
    && Number.isSafeInteger(input.kekVersion)
    && input.kekVersion >= 1;
}

