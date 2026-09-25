import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sodium from 'libsodium-wrappers-sumo';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { KeyStore } from './key-store.js';
import { MemoryContentCrypto } from './memory-content-crypto.js';
import { ModelProviderCredentialCrypto } from './model-provider-credential-crypto.js';
import { SupplierCredentialCrypto } from './supplier-credential-crypto.js';

const dirs: string[] = [];

beforeAll(async () => {
  await sodium.ready;
});

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A key store whose every loaded domain key this test keeps a hand on, so it
 * can look at the bytes after the caller is done with them.
 */
function watchedKeyStore(): { keyStore: KeyStore; loaded: Buffer[] } {
  const dir = mkdtempSync(join(tmpdir(), 'pico-key-zeroing-'));
  dirs.push(dir);
  const keyStore = new KeyStore(join(dir, 'keys'));
  const loaded: Buffer[] = [];
  const load = keyStore.loadKeyVersion.bind(keyStore);
  vi.spyOn(keyStore, 'loadKeyVersion').mockImplementation((...args) => {
    const key = load(...args);
    loaded.push(key);
    return key;
  });
  return { keyStore, loaded };
}

const zeroed = (key: Buffer): boolean => key.every((byte) => byte === 0);

/**
 * Finding B278. Every domain key the Home loads to seal or open something
 * leaves the heap as zeros - on success and on a refused open. The export,
 * the import comparison and the shred always did this; the three paths every
 * memory item and every credential takes did not, and left the key to the
 * whole domain for the collector, which frees memory without overwriting it.
 */
describe('B278 a loaded domain key is zeroed once it has been used', () => {
  it('holds for memory content, written and read', () => {
    const { keyStore, loaded } = watchedKeyStore();
    const crypto = new MemoryContentCrypto(sodium, keyStore);
    const item = {
      memoryItemId: 'mem-1',
      privacyDomain: 'domain-private',
      contentType: 'text/plain',
    };
    const written = crypto.encryptForWrite({ ...item, plaintext: 'a note' });
    expect(crypto.decryptForRead({
      ...item,
      storedContent: written.storedContent,
      envelope: written.envelope,
    })).toEqual({ status: 'ok', plaintext: 'a note' });
    expect(() => crypto.decryptForRead({
      ...item,
      memoryItemId: 'mem-other',
      storedContent: written.storedContent,
      envelope: written.envelope,
    })).toThrow();

    expect(loaded).toHaveLength(3);
    expect(loaded.every(zeroed)).toBe(true);
  });

  it('holds for a model provider credential, sealed, opened and refused', () => {
    const { keyStore, loaded } = watchedKeyStore();
    const crypto = new ModelProviderCredentialCrypto(sodium, keyStore);
    const at = {
      entryId: 'a-measured-host',
      picoIdentityFingerprintHex: 'a'.repeat(64),
      credentialRef: 'a_credential_reference',
    };
    const seal = crypto.seal({ ...at, secret: 'a-secret' });
    expect(crypto.open({ seal, ...at })).toEqual({ status: 'ok', secret: 'a-secret' });
    expect(() => crypto.open({ seal, ...at, entryId: 'another-host' })).toThrow();

    expect(loaded).toHaveLength(3);
    expect(loaded.every(zeroed)).toBe(true);
  });

  it('holds for a supplier credential, sealed, opened and refused', () => {
    const { keyStore, loaded } = watchedKeyStore();
    const crypto = new SupplierCredentialCrypto(sodium, keyStore);
    const at = { supplierIdentifier: 'rchkb', privacyDomain: 'domain-privat' };
    const seal = crypto.seal({ ...at, scope: 'read', secret: 'deploy-token' });
    expect(crypto.open({ seal, ...at, scope: 'read' }))
      .toEqual({ status: 'ok', secret: 'deploy-token' });
    expect(() => crypto.open({ seal, ...at, scope: 'write' as never })).toThrow();

    expect(loaded).toHaveLength(3);
    expect(loaded.every(zeroed)).toBe(true);
  });
});
