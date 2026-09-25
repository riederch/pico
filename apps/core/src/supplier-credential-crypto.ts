import { randomBytes } from 'node:crypto';
import {
  buildPicoSupplierCredentialAd,
  buildPicoSupplierCredentialDekWrapAd,
  picoSupplierCredentialSuite,
} from '@pico/protocol';
import type { MemoryDomainCustodyClass } from '@pico/protocol';
import type { KeyStore } from './key-store.js';
import type { SodiumLike } from './memory-content-crypto.js';

/**
 * ADR 0138 CO1 - a supplier credential at rest.
 *
 * The custody is ADR 0072's, unchanged and deliberately so: a credential lives
 * in the domain its supplier attached into (ADR 0137 IN5), wrapped by that
 * domain's KEK, so shredding the domain shreds the credential with everything
 * else that domain held. Reusing the key store is right; reusing the memory
 * *suite* was not, and that is the whole reason this file exists.
 *
 * `MemoryContentCrypto`'s associated data binds a `memoryItemId`. A credential
 * has none, and handing it a fabricated one would make the AD a lie - the
 * single thing associated data exists to prevent. So this has its own suite and
 * its own AD, naming what a credential actually is.
 *
 * **The scope is bound into the AD.** A credential sealed for `read` cannot be
 * opened as `read_write`, and no column update changes that: widening takes
 * re-encrypting, which takes re-supplying the credential, which takes asking
 * the person again. ADR 0138's "read scope where reading is all that is
 * needed" is carried by the cipher rather than by a value somebody could edit.
 *
 * Two-level keys and both AEADs as ADR 0071 R2/R4 already specify them: a fresh
 * random DEK per credential, wrapped by the per-domain KEK,
 * XChaCha20-Poly1305 with a 192-bit random nonce throughout.
 */
export const SUPPLIER_CREDENTIAL_SUITE = picoSupplierCredentialSuite;

const DEK_BYTES = 32;

export type PicoSupplierCredentialScope = 'read' | 'read_write';

export interface PicoSupplierCredentialSeal {
  suite: string;
  scope: PicoSupplierCredentialScope;
  nonce: string;
  ciphertext: string;
  keyEnvelopeId: string;
  kekVersion: number;
  wrapNonce: string;
  wrappedDek: string;
  createdAt: string;
}

export type PicoSupplierCredentialOpen =
  | { status: 'ok'; secret: string }
  /** ADR 0072: the domain was shredded. Reported, never thrown. */
  | { status: 'key_unavailable' };

export class SupplierCredentialCrypto {
  public constructor(
    private readonly sodium: SodiumLike,
    private readonly keyStore: KeyStore,
  ) {}

  public seal(input: {
    supplierIdentifier: string;
    privacyDomain: string;
    scope: PicoSupplierCredentialScope;
    secret: string;
    domainCustodyClass?: MemoryDomainCustodyClass;
  }): PicoSupplierCredentialSeal {
    const custodyClass = input.domainCustodyClass ?? 'host_custody';
    const keyEnvelopeId = `kenv_${randomBytes(16).toString('hex')}`;

    const credentialAd = buildPicoSupplierCredentialAd({
      suite: SUPPLIER_CREDENTIAL_SUITE,
      supplierIdentifier: input.supplierIdentifier,
      privacyDomain: input.privacyDomain,
      scope: input.scope,
    });
    const dekWrapAd = buildPicoSupplierCredentialDekWrapAd({
      suite: SUPPLIER_CREDENTIAL_SUITE,
      keyEnvelopeId,
      domainId: input.privacyDomain,
      supplierIdentifier: input.supplierIdentifier,
    });

    // Finding B278: the domain key, the data key and the secret's bytes leave
    // the heap as zeros on every path, not whenever the collector gets to them.
    const dek = randomBytes(DEK_BYTES);
    const nonce = this.randomNonce();
    const kekVersion = this.currentOrNewKekVersion(input.privacyDomain, custodyClass);
    // Finding B278: zeroed on every path, as when sealing.
    const kek = this.keyStore.loadKeyVersion(input.privacyDomain, kekVersion, { custodyClass });
    const wrapNonce = this.randomNonce();
    const secretBytes = new TextEncoder().encode(input.secret);
    let ciphertext: Uint8Array;
    let wrappedDek: Uint8Array;
    try {
      ciphertext = this.sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        secretBytes,
        credentialAd,
        null,
        nonce,
        dek,
      );
      wrappedDek = this.sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        dek,
        dekWrapAd,
        null,
        wrapNonce,
        kek,
      );
    } finally {
      secretBytes.fill(0);
      dek.fill(0);
      kek.fill(0);
    }

    return Object.freeze({
      suite: SUPPLIER_CREDENTIAL_SUITE,
      scope: input.scope,
      nonce: Buffer.from(nonce).toString('base64'),
      ciphertext: Buffer.from(ciphertext).toString('base64'),
      keyEnvelopeId,
      kekVersion,
      wrapNonce: Buffer.from(wrapNonce).toString('base64'),
      wrappedDek: Buffer.from(wrappedDek).toString('base64'),
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Opens a sealed credential **for a stated scope**. The scope is in the AD,
   * so asking for a wider one than it was sealed under fails the tag rather
   * than returning something a caller could misuse.
   */
  public open(input: {
    seal: PicoSupplierCredentialSeal;
    supplierIdentifier: string;
    privacyDomain: string;
    scope: PicoSupplierCredentialScope;
    domainCustodyClass?: MemoryDomainCustodyClass;
  }): PicoSupplierCredentialOpen {
    const custodyClass = input.domainCustodyClass ?? 'host_custody';
    const { seal } = input;

    if (!this.keyStore
      .listVersions(input.privacyDomain, { custodyClass })
      .includes(seal.kekVersion)) {
      return { status: 'key_unavailable' };
    }

    const dekWrapAd = buildPicoSupplierCredentialDekWrapAd({
      suite: seal.suite,
      keyEnvelopeId: seal.keyEnvelopeId,
      domainId: input.privacyDomain,
      supplierIdentifier: input.supplierIdentifier,
    });
    const kek = this.keyStore.loadKeyVersion(input.privacyDomain, seal.kekVersion, { custodyClass });
    const credentialAd = buildPicoSupplierCredentialAd({
      suite: seal.suite,
      supplierIdentifier: input.supplierIdentifier,
      privacyDomain: input.privacyDomain,
      scope: input.scope,
    });
    let dek: Uint8Array | undefined;
    let secret: Uint8Array | undefined;
    try {
      dek = this.sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        Buffer.from(seal.wrappedDek, 'base64'),
        dekWrapAd,
        Buffer.from(seal.wrapNonce, 'base64'),
        kek,
      );
      secret = this.sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null,
        Buffer.from(seal.ciphertext, 'base64'),
        credentialAd,
        Buffer.from(seal.nonce, 'base64'),
        dek,
      );
      // The string is what the caller needs, and a string cannot be zeroed;
      // the bytes it was decoded from can.
      return { status: 'ok', secret: new TextDecoder().decode(secret) };
    } finally {
      secret?.fill(0);
      dek?.fill(0);
      kek.fill(0);
    }
  }

  private currentOrNewKekVersion(
    domainId: string,
    custodyClass: MemoryDomainCustodyClass,
  ): number {
    const versions = this.keyStore.listVersions(domainId, { custodyClass });
    if (versions.length > 0) {
      return versions[versions.length - 1]!;
    }
    return this.keyStore.createKeyVersion(domainId, { custodyClass }).version;
  }

  private randomNonce(): Uint8Array {
    return randomBytes(this.sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  }
}
