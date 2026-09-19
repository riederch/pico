import { randomBytes } from 'node:crypto';
import {
  buildPicoMemoryContentAd,
  buildPicoMemoryDekWrapAd,
  picoMemoryContentSuite,
} from '@pico/protocol';
import type { MemoryDomainCustodyClass } from '@pico/protocol';
import type { KeyStore } from './key-store.js';

/**
 * Memory-content encryption at rest for the `pico.suite.mem.v1` suite
 * (ADR 0071) with the ADR 0073 associated-data binding and the ADR 0072 key
 * store.
 *
 * Two-level keys (ADR 0071 R2): each item gets a fresh random 256-bit DEK that
 * encrypts its content; the DEK is wrapped by the per-domain KEK (held in the
 * separate key store) into a key envelope. Destroying a domain's KEK versions
 * therefore shreds the whole domain (ADR 0072), with the ADR 0033 honesty
 * limits. Both AEADs are XChaCha20-Poly1305 with a 192-bit random nonce (R4).
 *
 * This module performs cryptography only; persistence of the ciphertext blob
 * and the key envelope row belongs to {@link MemoryStore}.
 */

export const MEMORY_CONTENT_SUITE = picoMemoryContentSuite;
const DEK_BYTES = 32;

// Minimal shape of the ready libsodium-wrappers-sumo module this class needs.
export interface SodiumLike {
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
  crypto_aead_xchacha20poly1305_ietf_encrypt(
    message: Uint8Array,
    additionalData: Uint8Array,
    secretNonce: null,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  crypto_aead_xchacha20poly1305_ietf_decrypt(
    secretNonce: null,
    ciphertext: Uint8Array,
    additionalData: Uint8Array,
    publicNonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
}

export interface KeyEnvelopeRecord {
  keyEnvelopeId: string;
  memoryItemId: string;
  domainId: string;
  suite: string;
  kekVersion: number;
  wrapNonce: string;
  wrappedDek: string;
  createdAt: string;
}

export interface EncryptForWriteInput {
  memoryItemId: string;
  privacyDomain: string;
  contentType: string;
  plaintext: string;
  domainCustodyClass?: MemoryDomainCustodyClass;
}

export interface EncryptForWriteResult {
  storedContent: string;
  keyEnvelopeId: string;
  envelope: KeyEnvelopeRecord;
}

export interface DecryptForReadInput {
  memoryItemId: string;
  privacyDomain: string;
  contentType: string;
  storedContent: string;
  envelope: KeyEnvelopeRecord;
  domainCustodyClass?: MemoryDomainCustodyClass;
}

export type DecryptForReadResult =
  | { status: 'ok'; plaintext: string }
  | { status: 'key_unavailable' };

interface StoredContentBlob {
  v: number;
  suite: string;
  n: string;
  c: string;
}

export class MemoryContentCrypto {
  public constructor(
    private readonly sodium: SodiumLike,
    private readonly keyStore: KeyStore,
  ) {}

  public encryptForWrite(input: EncryptForWriteInput): EncryptForWriteResult {
    const domainId = input.privacyDomain;
    const custodyClass = input.domainCustodyClass ?? 'host_custody';
    const keyEnvelopeId = `kenv_${randomBytes(16).toString('hex')}`;

    const contentAd = buildContentAd({
      suite: MEMORY_CONTENT_SUITE,
      memoryItemId: input.memoryItemId,
      privacyDomain: input.privacyDomain,
      contentType: input.contentType,
    });
    const dekWrapAd = buildDekWrapAd({
      suite: MEMORY_CONTENT_SUITE,
      keyEnvelopeId,
      domainId,
      memoryItemId: input.memoryItemId,
    });

    const dek = randomBytes(DEK_BYTES);
    const contentNonce = this.randomNonce();
    const ciphertext = this.sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      new TextEncoder().encode(input.plaintext),
      contentAd,
      null,
      contentNonce,
      dek,
    );

    const kekVersion = this.currentOrNewKekVersion(domainId, custodyClass);
    const kek = this.keyStore.loadKeyVersion(domainId, kekVersion, { custodyClass });
    const wrapNonce = this.randomNonce();
    const wrappedDek = this.sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      dek,
      dekWrapAd,
      null,
      wrapNonce,
      kek,
    );

    const blob: StoredContentBlob = {
      v: 1,
      suite: MEMORY_CONTENT_SUITE,
      n: Buffer.from(contentNonce).toString('base64'),
      c: Buffer.from(ciphertext).toString('base64'),
    };

    const envelope: KeyEnvelopeRecord = {
      keyEnvelopeId,
      memoryItemId: input.memoryItemId,
      domainId,
      suite: MEMORY_CONTENT_SUITE,
      kekVersion,
      wrapNonce: Buffer.from(wrapNonce).toString('base64'),
      wrappedDek: Buffer.from(wrappedDek).toString('base64'),
      createdAt: new Date().toISOString(),
    };

    return { storedContent: JSON.stringify(blob), keyEnvelopeId, envelope };
  }

  public decryptForRead(input: DecryptForReadInput): DecryptForReadResult {
    const { envelope } = input;
    const domainId = input.privacyDomain;
    const custodyClass = input.domainCustodyClass ?? 'host_custody';

    // A domain whose KEK version was crypto-shredded stays unreadable by design
    // (ADR 0072). Report that instead of throwing.
    if (!this.keyStore.listVersions(domainId, { custodyClass }).includes(envelope.kekVersion)) {
      return { status: 'key_unavailable' };
    }

    const dekWrapAd = buildDekWrapAd({
      suite: envelope.suite,
      keyEnvelopeId: envelope.keyEnvelopeId,
      domainId,
      memoryItemId: input.memoryItemId,
    });
    const kek = this.keyStore.loadKeyVersion(domainId, envelope.kekVersion, { custodyClass });
    const dek = this.sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      Buffer.from(envelope.wrappedDek, 'base64'),
      dekWrapAd,
      Buffer.from(envelope.wrapNonce, 'base64'),
      kek,
    );

    const blob = JSON.parse(input.storedContent) as StoredContentBlob;
    const contentAd = buildContentAd({
      suite: blob.suite,
      memoryItemId: input.memoryItemId,
      privacyDomain: input.privacyDomain,
      contentType: input.contentType,
    });
    const plaintext = this.sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      Buffer.from(blob.c, 'base64'),
      contentAd,
      Buffer.from(blob.n, 'base64'),
      dek,
    );

    return { status: 'ok', plaintext: new TextDecoder().decode(plaintext) };
  }

  /**
   * Crypto-shred a domain: destroy every KEK version so all of the domain's
   * items become unreadable, including copies in backups (ADR 0072 R6, with
   * the ADR 0033 limits). Ciphertext and envelopes stay; only the keys are
   * gone.
   *
   * This said `R5` until 2026-09-19 (finding B223), and ADR 0072 has no R5 -
   * it carries exactly one label, `R6`, inherited from ADR 0071. R6 is also
   * the right one: the half of this sentence that reaches into backups is
   * precisely R6's, because "destroying a key that every data backup still
   * contains destroys nothing".
   */
  public shredDomain(domainId: string, custodyClass: MemoryDomainCustodyClass = 'host_custody'): { removed: number } {
    return this.keyStore.shredDomain(domainId, { custodyClass });
  }

  private currentOrNewKekVersion(domainId: string, custodyClass: MemoryDomainCustodyClass): number {
    const versions = this.keyStore.listVersions(domainId, { custodyClass });
    if (versions.length > 0) {
      return versions[versions.length - 1];
    }

    return this.keyStore.createKeyVersion(domainId, { custodyClass }).version;
  }

  private randomNonce(): Uint8Array {
    return randomBytes(this.sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  }
}

/**
 * ADR 0073 canonical associated data: an element is U32BE(len) || bytes, the
 * domain-separation label is element 0, the field order is fixed per family,
 * and every field value must be a non-empty ASCII token of at most 1024 bytes.
 * Content family binds {suite, memoryItemId, privacyDomain, contentType}.
 */
export function buildContentAd(fields: {
  suite: string;
  memoryItemId: string;
  privacyDomain: string;
  contentType: string;
}): Uint8Array {
  return buildPicoMemoryContentAd(fields);
}

/** ADR 0073 DEK-wrap family: binds {suite, keyEnvelopeId, domainId, memoryItemId}. */
export function buildDekWrapAd(fields: {
  suite: string;
  keyEnvelopeId: string;
  domainId: string;
  memoryItemId: string;
}): Uint8Array {
  return buildPicoMemoryDekWrapAd(fields);
}
