/**
 * ADR 0081 P3. What the desktop's own keystore is, and what counts as one.
 *
 * **Split out of `platform-unlock.ts` on 2026-08-16 for a boundary reason
 * rather than a tidiness one.** That module reaches the Vault daemon, which is
 * right for automatic unlock and wrong for everything else: ADR 0154's relay
 * credential needs the same keystore rules and has nothing to do with
 * unlocking a Vault, and importing them together pulled the daemon - with its
 * CLI and its PDF generator - into the tray's static closure. The boundary
 * check caught it, which is what it is for.
 *
 * Nothing here holds a secret. It says which backends are a keystore and
 * which are a file with a lock painted on it.
 */

/**
 * Backends that actually encrypt against the logged-in session.
 *
 * A closed list because the interesting value is the one that is missing:
 * Electron reports `basic_text` when it found no keyring, and that mode
 * "encrypts" with a hardcoded key - which is not encryption, and accepting it
 * would make every record below a plaintext file that looks protected.
 */
export const picoCompanionLinuxKeystoreBackends = [
  'gnome_libsecret',
  'kwallet',
  'kwallet5',
  'kwallet6',
] as const;

export type PicoCompanionLinuxKeystoreBackend =
  typeof picoCompanionLinuxKeystoreBackends[number];

export interface PicoCompanionPlatformSecretPort {
  platform: 'linux';
  selectedBackend(): string;
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Uint8Array;
  decryptString(encrypted: Uint8Array): string;
}

/**
 * The backend in use, or a refusal that says which of the two problems it is.
 *
 * `platform_keystore_plaintext_refused` and `platform_keystore_unavailable`
 * are told apart because they are different things to do next: one is "your
 * desktop has no keyring running", the other is "your desktop has one and
 * Electron did not find it".
 */
export function requirePicoCompanionKeystoreBackend(
  secrets: PicoCompanionPlatformSecretPort,
): PicoCompanionLinuxKeystoreBackend {
  if (secrets.platform !== 'linux' || !secrets.isEncryptionAvailable()) {
    throw new Error('platform_keystore_unavailable');
  }
  const backend = secrets.selectedBackend();
  if (!picoCompanionLinuxKeystoreBackends.includes(
    backend as PicoCompanionLinuxKeystoreBackend,
  )) {
    throw new Error(backend === 'basic_text'
      ? 'platform_keystore_plaintext_refused'
      : 'platform_keystore_unavailable');
  }
  return backend as PicoCompanionLinuxKeystoreBackend;
}
