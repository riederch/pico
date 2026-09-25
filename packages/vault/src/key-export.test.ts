import sodium from 'libsodium-wrappers-sumo';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPicoVaultKeyExportHeaderAad } from '@pico/protocol';
import {
  assertPicoVaultKeyExportPassphraseIsOwn,
  createPicoVaultKeyfile,
  openPicoVaultKeyExport,
  picoVaultKekDigestHex,
  sealPicoVaultKeyExport,
  serializePicoVaultKeyExport,
  serializePicoVaultKeyfile,
  type PicoVaultExportedKek,
  type VaultSodium,
} from './index.js';

/**
 * ADR 0158 KE2/KE3/KE5 - das Exportartefakt, auf dem Geraet versiegelt.
 *
 * Gegangen wird, was das Artefakt allein verspricht: nur die richtige
 * Passphrase oeffnet es, nichts anderes oeffnet sich als Export, jeder
 * Schluessel kommt mit seinem Digest zurueck, und die Exportpassphrase darf
 * nicht die sein, die schon die Identitaetswurzel schuetzt.
 */
let vaultSodium: VaultSodium;

beforeAll(async () => {
  await sodium.ready;
  vaultSodium = sodium as unknown as VaultSodium;
});

const PASSPHRASE = 'a passphrase of its own';
const IDENTITY = 'ab'.repeat(32);

function kek(domainId: string, version: number, fill: number): PicoVaultExportedKek {
  const bytes = new Uint8Array(32).fill(fill);
  return {
    domainId,
    version,
    kekHex: Buffer.from(bytes).toString('hex'),
    digestHex: picoVaultKekDigestHex(vaultSodium, bytes),
  };
}

function seal(keks: PicoVaultExportedKek[], passphrase = PASSPHRASE) {
  return sealPicoVaultKeyExport(vaultSodium, {
    passphrase,
    homeId: 'home_0123456789abcdef',
    identityKeyFingerprintHex: IDENTITY,
    exportedAt: '2026-09-25T10:00:00.000Z',
    keks,
  });
}

describe('ADR 0158 - the key export artifact', () => {
  it('opens with its passphrase and returns every key with its digest, sorted', () => {
    const artifact = seal([kek('private', 2, 2), kek('household', 1, 3), kek('private', 1, 1)]);

    const opened = openPicoVaultKeyExport(vaultSodium, {
      artifact: serializePicoVaultKeyExport(artifact),
      passphrase: PASSPHRASE,
    });

    expect(opened.keks.map((entry) => `${entry.domainId}:${entry.version}`))
      .toEqual(['household:1', 'private:1', 'private:2']);
    expect(opened.header.homeId).toBe('home_0123456789abcdef');
    expect(opened.header.identityKeyFingerprintHex).toBe(IDENTITY);
    // Kein Schluessel steht im Klartext in der Datei.
    expect(serializePicoVaultKeyExport(artifact)).not.toContain(kek('private', 1, 1).kekHex);
  }, 30_000);

  it('does not open with another passphrase, and says nothing more than that', () => {
    const artifact = seal([kek('private', 1, 1)]);
    expect(() => openPicoVaultKeyExport(vaultSodium, {
      artifact,
      passphrase: 'not the passphrase at all',
    })).toThrow('key_export_not_opened');
  }, 30_000);

  it('refuses a header that was changed after sealing', () => {
    // Der Kopf steht in den AAD: ein anderes Home, eine andere Person oder ein
    // anderer Augenblick oeffnet nicht, statt still zu gelten.
    const artifact = seal([kek('private', 1, 1)]);
    expect(() => openPicoVaultKeyExport(vaultSodium, {
      artifact: { ...artifact, header: { ...artifact.header, homeId: 'home_someone_else' } },
      passphrase: PASSPHRASE,
    })).toThrow('key_export_not_opened');
  }, 30_000);

  it('never opens a keyfile as an export', () => {
    // Das Formatlabel steht in den AAD. Ein Keyfile hier einzureichen faellt am
    // Kopf, bevor ueberhaupt abgeleitet wird.
    const keyfile = createPicoVaultKeyfile(vaultSodium, {
      keyRole: 'pico_identity',
      passphrase: PASSPHRASE,
    });
    expect(() => openPicoVaultKeyExport(vaultSodium, {
      artifact: serializePicoVaultKeyfile(keyfile.keyfile),
      passphrase: PASSPHRASE,
    })).toThrow('invalid_key_export');
  }, 30_000);

  it('refuses what opens but is not a list of keys', () => {
    /**
     * Die AEAD beweist, dass jemand mit der Passphrase versiegelt hat - nicht,
     * dass es dieser Code war. Eine Datei, die sich oeffnet und keine
     * Schluesselliste enthaelt, bekommt ihren eigenen Namen, statt als
     * Laufzeitfehler irgendwo weiter unten aufzuschlagen.
     */
    const template = seal([kek('private', 1, 1)]);
    const header = {
      ...template.header,
      aeadNonceHex: Buffer.from(sodium.randombytes_buf(24)).toString('hex'),
    };
    const fileKey = sodium.crypto_pwhash(
      32,
      PASSPHRASE,
      Buffer.from(header.kdfSaltHex, 'hex'),
      header.kdfOpsLimit,
      header.kdfMemLimitBytes,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );
    /**
     * KE1s zweite Haelfte: ein Element, das mehr traegt als ein
     * Schluesseltupel, wird abgewiesen - auch wenn es sonst stimmt. Die Datei
     * traegt Erinnerungsschluessel und nichts sonst, und das haelt der Leser,
     * nicht der Vorsatz des Schreibers.
     */
    const smuggled = JSON.stringify({
      keks: [{ ...kek('private', 1, 1), identityPrivateKeyHex: 'ee'.repeat(64) }],
    });
    for (const body of ['{"keks":"not a list"}', '{"keks":[],"extra":1}', 'nicht einmal JSON', smuggled]) {
      const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        new TextEncoder().encode(body),
        buildPicoVaultKeyExportHeaderAad(header),
        null,
        Buffer.from(header.aeadNonceHex, 'hex'),
        fileKey,
      );
      expect(() => openPicoVaultKeyExport(vaultSodium, {
        artifact: { ...template, header, ciphertextHex: Buffer.from(ciphertext).toString('hex') },
        passphrase: PASSPHRASE,
      }), body).toThrow('invalid_key_export_payload');
    }
  }, 60_000);

  it('refuses a key whose digest does not match, and a key named twice', () => {
    const wrongDigest = { ...kek('private', 1, 1), digestHex: 'cd'.repeat(32) };
    expect(() => seal([wrongDigest])).toThrow('invalid_key_export_keks');
    expect(() => seal([kek('private', 1, 1), kek('private', 1, 2)]))
      .toThrow('invalid_key_export_keks');
    expect(() => seal([])).toThrow('invalid_key_export_keks');
    expect(() => seal([{ ...kek('private', 1, 1), identityPrivateKeyHex: 'ee'.repeat(64) } as never]))
      .toThrow('invalid_key_export_keks');
  });

  it('refuses a passphrase shorter than the floor', () => {
    expect(() => seal([kek('private', 1, 1)], 'short')).toThrow('key_export_passphrase_too_short');
  });

  it('refuses the passphrase that already protects the identity root (KE3)', () => {
    /**
     * Eine Gewohnheit, die aus einem Geheimnis zwei Tueren machte: wer dieselbe
     * Passphrase waehlt, hat mit der Datei und dem Keyfile dasselbe verloren.
     */
    const identity = createPicoVaultKeyfile(vaultSodium, {
      keyRole: 'pico_identity',
      passphrase: PASSPHRASE,
    });
    expect(() => assertPicoVaultKeyExportPassphraseIsOwn(vaultSodium, {
      identityKeyfile: identity.keyfile,
      passphrase: PASSPHRASE,
    })).toThrow('key_export_passphrase_is_vault_passphrase');
    expect(() => assertPicoVaultKeyExportPassphraseIsOwn(vaultSodium, {
      identityKeyfile: identity.keyfile,
      passphrase: 'something else entirely',
    })).not.toThrow();
  }, 30_000);
});
