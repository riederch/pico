import type { PicoCompanionPlatformSecretPort } from '@pico/companion/platform-unlock';

type ElectronSafeStorage = Pick<Electron.SafeStorage,
  | 'decryptString'
  | 'encryptString'
  | 'getSelectedStorageBackend'
  | 'isEncryptionAvailable'>;

/**
 * Linux Electron adapter for ADR 0081 P3. Policy lives in the shell-free
 * companion layer; this adapter exposes Electron's selected backend exactly
 * so `basic_text` and `unknown` are refused there rather than papered over.
 */
export function createLinuxElectronPlatformSecretPort(
  storage: ElectronSafeStorage,
  platform: NodeJS.Platform = process.platform,
): PicoCompanionPlatformSecretPort {
  if (platform !== 'linux') {
    throw new Error('unsupported_platform_keystore');
  }
  return {
    platform: 'linux',
    selectedBackend: () => storage.getSelectedStorageBackend(),
    isEncryptionAvailable: () => storage.isEncryptionAvailable(),
    encryptString: (plainText) => new Uint8Array(
      storage.encryptString(plainText),
    ),
    decryptString: (encrypted) => storage.decryptString(
      Buffer.from(encrypted),
    ),
  };
}
