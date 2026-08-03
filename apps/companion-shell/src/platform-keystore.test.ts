import { describe, expect, it, vi } from 'vitest';
import { createLinuxElectronPlatformSecretPort } from './platform-keystore.js';

describe('Electron Linux Platform Keystore adapter', () => {
  it('forwards the exact safeStorage backend and bytes', () => {
    const storage = {
      getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret' as const),
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn(() => Buffer.from([1, 2, 3])),
      decryptString: vi.fn(() => 'secret'),
    };
    const port = createLinuxElectronPlatformSecretPort(
      storage as unknown as Electron.SafeStorage,
      'linux',
    );
    expect(port.selectedBackend()).toBe('gnome_libsecret');
    expect(port.isEncryptionAvailable()).toBe(true);
    expect(port.encryptString('secret')).toEqual(Uint8Array.from([1, 2, 3]));
    expect(port.decryptString(Uint8Array.from([1, 2, 3]))).toBe('secret');
    expect(storage.decryptString).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  });

  it('does not pretend another platform has the reviewed Linux contract', () => {
    expect(() => createLinuxElectronPlatformSecretPort(
      {} as Electron.SafeStorage,
      'darwin',
    )).toThrow('unsupported_platform_keystore');
  });
});
