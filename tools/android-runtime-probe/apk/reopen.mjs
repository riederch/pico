/**
 * ADR 0131 A3. Öffnet sich das Versiegelte noch, in einem Prozess, der beim
 * Versiegeln nicht dabei war?
 *
 * Das ist die einzige der drei Fragen, die ein zweiter Lauf beantworten muss.
 * Die anderen beiden - ist der Anschluss von Node erreichbar, nimmt der Kern
 * seinen Beleg an - beantwortet der Beitritt selbst, indem er gelingt.
 *
 * Geprüft wird über den Kern, nicht daneben: `createPicoCompanionAutomaticVaultUnlock`
 * liest den Satz, vergleicht das Keystore-Niveau mit dem heutigen, entsiegelt
 * die Passphrase und öffnet damit die zwei Gerätesitzungen im Vault-Daemon.
 * Der Daemon ist der eigentliche Zeuge: er nimmt eine falsche Passphrase
 * nicht an, also ist eine geöffnete Sitzung der Beweis, dass die Bytes
 * dieselben sind, die hineingingen.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPicoCompanionAutomaticVaultUnlock,
  defaultPicoCompanionPlatformUnlockPath,
} from '@pico/companion/platform-unlock';
import { connectPicoAndroidKeystorePort } from './keystore-port.mjs';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const say = (fields) => process.stdout.write(`${JSON.stringify(fields)}\n`);

try {
  const profilePath = join(files, 'profile.json');
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
  const keystore = await connectPicoAndroidKeystorePort(join(files, 'keystore.sock'));
  say({ step: 'reopen_evidence', ...(await keystore.keystoreEvidence()) });

  const automatic = createPicoCompanionAutomaticVaultUnlock({
    path: defaultPicoCompanionPlatformUnlockPath(profilePath),
    profile,
    socketPath: join(files, 'vault', 'run', 'daemon.sock'),
    secrets: keystore,
  });
  await automatic.ensureUnlocked();
  say({
    step: 'reopened',
    // Die Fingerabdrücke, nicht die Passphrase: was hier zählt, ist welche
    // Sitzungen aufgingen, und die sind öffentlich.
    deviceSigningKeyFingerprintHex: profile.device.signingKeyFingerprintHex,
    delegationId: profile.device.delegationId,
  });
  await automatic.close();
} catch (refused) {
  say({ step: 'reopen_failed', reason: String(refused && refused.message) });
}
