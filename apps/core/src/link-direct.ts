import {
  buildPicoIdentityKeyRecordSignatureInput,
  buildPicoLinkDirectRequestSignatureInput,
  buildPicoLinkDirectResponseSignatureInput,
  picoIdentitySuite,
  picoLinkDirectOperations,
  picoLinkDirectPayloadDigestHex,
  picoLinkDirectRequestEnvelopeSchema,
  picoLinkDirectResponseEnvelopeSchema,
  type PicoLinkDirectOperation,
  type PicoLinkDirectRequestSignatureInput,
  type PicoLinkDirectResponseSignatureInput,
} from '@pico/protocol';
import { verifyPicoIdentityDetachedSignature, verifyPicoIdentityKeyRecordFingerprint } from '@pico/identity';
import type { IdentityVerificationSodium } from '@pico/identity';
import { PicoRequestQuota } from './request-quota.js';

/**
 * ADR 0107 D2: the Foundation's Pico Link Direct intake.
 *
 * The order of the checks below is the security content of this file, not an
 * implementation detail, so it is written once and commented where it is
 * load-bearing. Cheap and unauthenticated rejections come first; each step
 * only runs on input the previous step vouched for; and nothing reaches an
 * operation until the sender, the audience and the arguments are all bound to
 * one signature.
 *
 * This module verifies and dispatches. It holds no route, no policy and no
 * operation: the caller supplies an executor, so remote capability stays a
 * decision made where the local authorization already lives (ADR 0107).
 */

export const MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS = 256 * 1024;
// JSON framing around `sealedRequestHex` stays deliberately tiny. Fastify
// applies this per-route limit before the intake performs its own exact
// envelope-field limit and before any private-key operation.
export const MAX_PICO_LINK_DIRECT_REQUEST_BODY_BYTES =
  MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS + 1024;
export const MAX_PICO_LINK_DIRECT_REQUEST_LIFETIME_MS = 60 * 1_000;
export const MAX_PICO_LINK_DIRECT_SEEN_REQUESTS = 1_024;

export type PicoLinkDirectFailure =
  | 'invalid_envelope'
  | 'envelope_too_large'
  | 'sealed_request_unreadable'
  | 'malformed_request'
  | 'wrong_home'
  | 'request_expired'
  | 'request_lifetime_too_long'
  | 'request_replayed'
  | 'invalid_sender_key'
  | 'invalid_sender_signature'
  | 'invalid_arguments_digest'
  | 'sender_is_not_authorized'
  | 'unknown_operation'
  /**
   * ADR 0119 Q4. Deliberately one reason for both budgets: a refusal that
   * distinguished a known sender from an unknown one would turn the quota into
   * a membership oracle.
   */
  | 'quota_exceeded';

export interface PicoLinkDirectPrincipal {
  picoIdentityFingerprintHex: string;
  deviceSigningKeyFingerprintHex: string;
  deviceKeyAgreementKeyFingerprintHex: string;
  delegationId: string;
}

export interface PicoLinkDirectExecution {
  outcome: string;
  result: Record<string, unknown>;
}

export interface PicoLinkDirectAuthority {
  /**
   * The Home this intake speaks for. A request naming a different host key is
   * refused before anything else is verified: a URL is reachability, never
   * identity (ADR 0031), and a Home that can open a sealed box still must not
   * accept a request addressed elsewhere.
   */
  hostSigningKeyFingerprintHex(): string | undefined;
  openSealedToHostKeyAgreement(sealedHex: string): string;
  signWithHostSigningKey(signatureInput: Uint8Array): string;
  sealToReplyKey(replyPublicKeyHex: string, plaintext: string): string;
  /**
   * Whether this sender may act for its identity at all: an active delegation
   * covering exactly these device keys, plus active Home membership. The two
   * setup operations skip this by design - they are pre-authority, because a
   * claim cannot carry a membership when no Home exists yet.
   */
  isAuthorizedSender(principal: PicoLinkDirectPrincipal, at: string): boolean;
}

const preAuthorityOperations: ReadonlySet<string> = new Set<PicoLinkDirectOperation>([
  'home.setup.read',
  'home.claim.submit',
  // ADR 0110: standing but inert without the root signature carried by the
  // semantic recovery submission. The outer envelope remains a target-device
  // possession proof and never turns the identity root into a carrier key.
  'home.device.recovery.submit',
]);

export class PicoLinkDirectIntake {
  /**
   * Bounded idempotency inside the expiry window (ADR 0107: replay is bounded,
   * not impossible). Insertion-ordered, so eviction drops the oldest; every
   * entry is short-lived by construction because a request outside its window
   * is refused before this map is consulted.
   */
  readonly #seenRequests = new Map<string, number>();

  public constructor(
    private readonly sodium: IdentityVerificationSodium & {
      crypto_generichash(length: number, message: Uint8Array, key: null): Uint8Array;
    },
    private readonly authority: PicoLinkDirectAuthority,
    private readonly maxSeenRequests = MAX_PICO_LINK_DIRECT_SEEN_REQUESTS,
    /** ADR 0119 Q4. Aggregate send budgets, keyed on relationship. */
    private readonly quota: PicoRequestQuota = new PicoRequestQuota(),
  ) {}

  /**
   * Returns a sealed, signed response envelope for anything that got far
   * enough to have a reply key, and a bare failure for anything that did not.
   * A refusal after that point is signed exactly like a result, so a carrier
   * cannot turn one into the other by dropping bytes.
   */
  public async handle(
    body: unknown,
    execute: (
      operation: PicoLinkDirectOperation,
      args: Record<string, unknown>,
      principal: PicoLinkDirectPrincipal,
    ) => Promise<PicoLinkDirectExecution>,
    now: Date = new Date(),
  ): Promise<
    | { ok: true; envelope: { schema: string; sealedResponseHex: string } }
    | { ok: false; reason: PicoLinkDirectFailure }
    > {
    const hostSigningKeyFingerprintHex = this.authority.hostSigningKeyFingerprintHex();
    if (hostSigningKeyFingerprintHex === undefined) {
      return { ok: false, reason: 'wrong_home' };
    }

    // 0. ADR 0119 Q4, the stranger budget. Charged for every request alike and
    //    before anything else, because step 2 below is where the Home first
    //    spends a private key and a bound behind it would not bound that at
    //    all. One shared bucket, not one per caller: the envelope hides the
    //    sender by design, so before the seal is opened there is genuinely
    //    nothing to key on, and the only other candidate is the network
    //    property ADR 0119 refuses to trust. The residual is named there.
    if (!this.quota.admitStranger()) {
      return { ok: false, reason: 'quota_exceeded' };
    }

    // 1. Shape and size, before any cryptography: a caller must not be able to
    //    make the Home do work by sending something large and meaningless.
    if (!isRecord(body)
      || body.schema !== picoLinkDirectRequestEnvelopeSchema
      || typeof body.sealedRequestHex !== 'string') {
      return { ok: false, reason: 'invalid_envelope' };
    }
    if (body.sealedRequestHex.length > MAX_PICO_LINK_DIRECT_ENVELOPE_HEX_CHARS) {
      return { ok: false, reason: 'envelope_too_large' };
    }

    // 2. One seal-open. This is the first place the Home spends a private key,
    //    and it is unavoidable: without opening, there is nothing to
    //    authenticate. Hence the size limit above it.
    let plaintext: string;
    try {
      plaintext = this.authority.openSealedToHostKeyAgreement(body.sealedRequestHex);
    } catch {
      return { ok: false, reason: 'sealed_request_unreadable' };
    }

    let sealed: unknown;
    try {
      sealed = JSON.parse(plaintext);
    } catch {
      return { ok: false, reason: 'malformed_request' };
    }
    if (!isRecord(sealed)
      || sealed.schema !== picoLinkDirectRequestEnvelopeSchema
      || !isRecord(sealed.request)
      || !isRecord(sealed.senderIdentityKeyRecord)
      || !isRecord(sealed.senderDeviceSigningKeyRecord)
      || !isRecord(sealed.arguments)
      || typeof sealed.senderSignatureHex !== 'string') {
      return { ok: false, reason: 'malformed_request' };
    }

    // 3. The closed operation set, named before anything else is derived from
    //    the request. The builder below rejects an unlisted operation too, but
    //    only as `malformed_request` - and "this Home does not offer that
    //    remotely" deserves to be said precisely rather than folded into a
    //    generic parse failure. Remote capability is opt-in per operation
    //    (ADR 0107); this is where that refusal is spoken.
    const request = sealed.request as unknown as PicoLinkDirectRequestSignatureInput;
    if (!(picoLinkDirectOperations as readonly string[]).includes(request.operation as string)) {
      return { ok: false, reason: 'unknown_operation' };
    }

    // 4. Canonical bytes. The builder is the field validator: if it throws,
    //    the request was malformed in a way no later check needs to know
    //    about, and nothing has been trusted yet.
    let signatureInput: Uint8Array;
    try {
      signatureInput = buildPicoLinkDirectRequestSignatureInput(request);
    } catch {
      return { ok: false, reason: 'malformed_request' };
    }

    // 5. Audience pin before authentication. A valid signature from a real
    //    sender addressed to another Home must not be accepted here, and
    //    checking this first keeps that impossible to get wrong later.
    if (request.hostSigningKeyFingerprintHex !== hostSigningKeyFingerprintHex) {
      return { ok: false, reason: 'wrong_home' };
    }

    // 6. Freshness on the Home's clock, not the sender's claim. The lifetime
    //    ceiling matters as much as the expiry: without it a sender could mint
    //    a request valid for a year and defeat the idempotency window below.
    const nowMs = now.getTime();
    const createdAtMs = Date.parse(request.createdAt);
    const expiresAtMs = Date.parse(request.expiresAt);
    if (expiresAtMs - createdAtMs > MAX_PICO_LINK_DIRECT_REQUEST_LIFETIME_MS) {
      return { ok: false, reason: 'request_lifetime_too_long' };
    }
    if (nowMs >= expiresAtMs || nowMs < createdAtMs - MAX_PICO_LINK_DIRECT_REQUEST_LIFETIME_MS) {
      return { ok: false, reason: 'request_expired' };
    }

    // 7. Replay, bounded by that window. Checked before the signature so a
    //    replayed request costs no verification, and recorded only after the
    //    signature holds so an unauthenticated caller cannot poison the set
    //    with a request id it never had the key to send.
    this.#evictExpired(nowMs);
    if (this.#seenRequests.has(request.requestId)) {
      return { ok: false, reason: 'request_replayed' };
    }

    // 8. Bind the key records to the fingerprints the signed bytes name, then
    //    verify with the key that binding produced. In the other order the
    //    signature would prove only that whoever sent it holds *some* key.
    if (sealed.senderIdentityKeyRecord.suite !== picoIdentitySuite
      || sealed.senderIdentityKeyRecord.keyRole !== 'pico_identity'
      || sealed.senderDeviceSigningKeyRecord.suite !== picoIdentitySuite
      || sealed.senderDeviceSigningKeyRecord.keyRole !== 'device_signing'
      || !verifyPicoIdentityKeyRecordFingerprint(this.sodium, {
        keyRecord: sealed.senderIdentityKeyRecord as never,
        expectedFingerprintHex: request.senderIdentityKeyFingerprintHex,
      })
      || !verifyPicoIdentityKeyRecordFingerprint(this.sodium, {
        keyRecord: sealed.senderDeviceSigningKeyRecord as never,
        expectedFingerprintHex: request.senderDeviceSigningKeyFingerprintHex,
      })) {
      return { ok: false, reason: 'invalid_sender_key' };
    }

    const senderPublicKeyHex = (sealed.senderDeviceSigningKeyRecord as { publicKeyHex?: unknown })
      .publicKeyHex;
    if (typeof senderPublicKeyHex !== 'string'
      || !verifyPicoIdentityDetachedSignature(this.sodium, {
        publicKeyHex: senderPublicKeyHex,
        signatureInput,
        signatureHex: sealed.senderSignatureHex,
      })) {
      return { ok: false, reason: 'invalid_sender_signature' };
    }

    // 9. The arguments travel beside the signature and are bound by digest, so
    //    this is what makes them signed rather than merely adjacent.
    const args = sealed.arguments as Record<string, unknown>;
    if (picoLinkDirectPayloadDigestHex(this.sodium, args) !== request.argumentsDigestHex) {
      return { ok: false, reason: 'invalid_arguments_digest' };
    }

    // 10. Authenticated. From here a reply key is trustworthy, so every outcome
    //     below is a signed response rather than a bare failure.
    const at = new Date(nowMs).toISOString();
    const principal: PicoLinkDirectPrincipal = {
      picoIdentityFingerprintHex: request.senderIdentityKeyFingerprintHex,
      deviceSigningKeyFingerprintHex: request.senderDeviceSigningKeyFingerprintHex,
      deviceKeyAgreementKeyFingerprintHex: request.senderDeviceKeyAgreementKeyFingerprintHex,
      delegationId: request.senderDelegationId,
    };
    const preAuthority = preAuthorityOperations.has(request.operation);
    const related = this.authority.isAuthorizedSender(principal, at);
    if (!preAuthority && !related) {
      return { ok: false, reason: 'sender_is_not_authorized' };
    }

    // ADR 0119 Q4, the relationship budget, charged on top of the stranger
    // charge already spent at step 0. The two answer different questions: that
    // one bounds the cryptographic work an unknown caller can demand, this one
    // bounds authorized volume so a single runaway peer is contained without
    // touching anyone else's budget.
    //
    // Only a proven relationship gets its own bucket. A self-minted identity
    // reaches this line for a pre-authority operation, and it must not be
    // rewarded with a larger budget than raw garbage for having generated a
    // keypair - so it stays on the stranger bucket alone.
    //
    // The refusal is the same `quota_exceeded` an unauthenticated caller gets,
    // which is what keeps a quota from becoming a membership oracle.
    if (related && !this.quota.admitRelationship(principal.picoIdentityFingerprintHex)) {
      return { ok: false, reason: 'quota_exceeded' };
    }

    this.#remember(request.requestId, expiresAtMs);

    // 11. Only now does an operation run, and its own authorization still
    //     applies on top of this - the link authenticates a sender, it does
    //     not decide what that sender may do.
    let execution: PicoLinkDirectExecution;
    try {
      execution = await execute(
        request.operation,
        args,
        principal,
      );
    } catch {
      execution = { outcome: 'operation_failed', result: {} };
    }

    return {
      ok: true,
      envelope: {
        schema: picoLinkDirectResponseEnvelopeSchema,
        sealedResponseHex: this.#sealResponse(request, execution, request.replyPublicKeyHex, now),
      },
    };
  }

  #sealResponse(
    request: PicoLinkDirectRequestSignatureInput,
    execution: PicoLinkDirectExecution,
    replyPublicKeyHex: string,
    now: Date,
  ): string {
    const response: PicoLinkDirectResponseSignatureInput = {
      suite: picoIdentitySuite,
      requestId: request.requestId,
      operation: request.operation,
      hostSigningKeyFingerprintHex: request.hostSigningKeyFingerprintHex,
      outcome: execution.outcome,
      resultDigestHex: picoLinkDirectPayloadDigestHex(this.sodium, execution.result),
      createdAt: now.toISOString(),
    };

    return this.authority.sealToReplyKey(replyPublicKeyHex, JSON.stringify({
      schema: picoLinkDirectResponseEnvelopeSchema,
      response,
      result: execution.result,
      hostSignatureHex: this.authority.signWithHostSigningKey(
        buildPicoLinkDirectResponseSignatureInput(response),
      ),
    }));
  }

  #evictExpired(nowMs: number): void {
    for (const [requestId, expiresAtMs] of this.#seenRequests) {
      if (expiresAtMs <= nowMs) {
        this.#seenRequests.delete(requestId);
      }
    }
  }

  #remember(requestId: string, expiresAtMs: number): void {
    // Bounded even if every entry is still live: a caller holding a valid key
    // can fill this, and dropping the oldest is preferable to unbounded growth.
    // The dropped entry is replayable only within its own remaining window.
    if (this.#seenRequests.size >= this.maxSeenRequests) {
      const oldest = this.#seenRequests.keys().next();
      if (!oldest.done) {
        this.#seenRequests.delete(oldest.value);
      }
    }
    this.#seenRequests.set(requestId, expiresAtMs);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function picoLinkDirectKeyRecordFingerprintHex(
  sodium: { crypto_generichash(length: number, message: Uint8Array, key: null): Uint8Array },
  keyRecord: { suite: string; keyRole: string; publicKeyHex: string },
): string {
  return Array.from(sodium.crypto_generichash(
    32,
    buildPicoIdentityKeyRecordSignatureInput(keyRecord as never),
    null,
  )).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
