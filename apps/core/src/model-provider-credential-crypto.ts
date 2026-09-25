import { randomBytes } from 'node:crypto';
import {
  buildPicoModelProviderCredentialAd,
  buildPicoModelProviderCredentialDekWrapAd,
  picoModelProviderCredentialSuite,
} from '@pico/protocol';
import type { KeyStore } from './key-store.js';
import type { SodiumLike } from './memory-content-crypto.js';

/**
 * ADR 0151 PV1 with ADR 0138 CO1 - a model provider credential at rest.
 *
 * **The half PV1 was missing.** An entry may declare a credential reference,
 * and until 2026-08-14 nothing could turn that reference into a secret: the
 * runtime asked a port no Home wired, so a job on such an entry went out
 * unauthenticated and the entry's claim to prove who it is proved nothing.
 *
 * **Its own suite, for CO1's reason.** Reusing the supplier cipher would bind
 * a supplier identifier and a privacy domain to something that has neither -
 * and a fabricated value in associated data is the single thing associated
 * data exists to prevent. A provider credential belongs to one person's
 * decision about one entry, so that is what its AD names.
 *
 * **The key is not a privacy domain's.** A supplier credential lives in the
 * domain its supplier attached into, so a domain shred takes it; a provider
 * credential belongs to nobody's content and is destroyed by the act that
 * makes it meaningless - withdrawing the decision. It is wrapped under a key
 * domain of its own, which keeps it out of any backup for the same ADR 0072 R6
 * reason every other key is: a restored database holds the seal and no key,
 * and the open reports that rather than pretending.
 */
export const MODEL_PROVIDER_CREDENTIAL_SUITE = picoModelProviderCredentialSuite;

/**
 * The key-store domain these are wrapped under.
 *
 * Not a privacy domain and deliberately not named like one: nothing writes
 * memory content here, and a shred of somebody's household domain must not
 * take the credential their model provider runs on.
 */
export const picoModelProviderCredentialKeyDomain = 'pico-model-provider-credentials';

const DEK_BYTES = 32;

export interface PicoModelProviderCredentialSeal {
  suite: string;
  nonce: string;
  ciphertext: string;
  keyEnvelopeId: string;
  kekVersion: number;
  wrapNonce: string;
  wrappedDek: string;
  createdAt: string;
}

export type PicoModelProviderCredentialOpen =
  | { status: 'ok'; secret: string }
  /** ADR 0072: the key is gone - a restore, or a shred. Reported, never thrown. */
  | { status: 'key_unavailable' };

export class ModelProviderCredentialCrypto {
  public constructor(
    private readonly sodium: SodiumLike,
    private readonly keyStore: KeyStore,
  ) {}

  public seal(input: {
    entryId: string;
    picoIdentityFingerprintHex: string;
    credentialRef: string;
    secret: string;
  }): PicoModelProviderCredentialSeal {
    const keyEnvelopeId = `kenv_${randomBytes(16).toString('hex')}`;
    const credentialAd = buildPicoModelProviderCredentialAd({
      suite: MODEL_PROVIDER_CREDENTIAL_SUITE,
      entryId: input.entryId,
      picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
      credentialRef: input.credentialRef,
    });
    const dekWrapAd = buildPicoModelProviderCredentialDekWrapAd({
      suite: MODEL_PROVIDER_CREDENTIAL_SUITE,
      keyEnvelopeId,
      domainId: picoModelProviderCredentialKeyDomain,
      entryId: input.entryId,
      picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
    });

    // Finding B278: the domain key, the data key and the secret's bytes leave
    // the heap as zeros on every path, not whenever the collector gets to them.
    const dek = randomBytes(DEK_BYTES);
    const nonce = this.randomNonce();
    const kekVersion = this.currentOrNewKekVersion();
    // Finding B278: zeroed on every path, as when sealing.
    const kek = this.keyStore.loadKeyVersion(
      picoModelProviderCredentialKeyDomain,
      kekVersion,
      { custodyClass: 'host_custody' },
    );
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
      suite: MODEL_PROVIDER_CREDENTIAL_SUITE,
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
   * Opens a seal **for the entry, the person and the reference it was sealed
   * under**. Any of the three being different fails the tag rather than
   * returning something a caller could use in a place it was never meant for.
   */
  public open(input: {
    seal: PicoModelProviderCredentialSeal;
    entryId: string;
    picoIdentityFingerprintHex: string;
    credentialRef: string;
  }): PicoModelProviderCredentialOpen {
    const { seal } = input;
    if (!this.keyStore
      .listVersions(picoModelProviderCredentialKeyDomain, { custodyClass: 'host_custody' })
      .includes(seal.kekVersion)) {
      return { status: 'key_unavailable' };
    }

    const dekWrapAd = buildPicoModelProviderCredentialDekWrapAd({
      suite: seal.suite,
      keyEnvelopeId: seal.keyEnvelopeId,
      domainId: picoModelProviderCredentialKeyDomain,
      entryId: input.entryId,
      picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
    });
    const kek = this.keyStore.loadKeyVersion(
      picoModelProviderCredentialKeyDomain,
      seal.kekVersion,
      { custodyClass: 'host_custody' },
    );
    const credentialAd = buildPicoModelProviderCredentialAd({
      suite: seal.suite,
      entryId: input.entryId,
      picoIdentityFingerprintHex: input.picoIdentityFingerprintHex,
      credentialRef: input.credentialRef,
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

  private currentOrNewKekVersion(): number {
    const versions = this.keyStore.listVersions(
      picoModelProviderCredentialKeyDomain,
      { custodyClass: 'host_custody' },
    );
    if (versions.length > 0) {
      return versions[versions.length - 1]!;
    }
    return this.keyStore.createKeyVersion(
      picoModelProviderCredentialKeyDomain,
      { custodyClass: 'host_custody' },
    ).version;
  }

  private randomNonce(): Uint8Array {
    return new Uint8Array(randomBytes(24));
  }
}
