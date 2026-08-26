/**
 * ADR 0118 O1 auf dem Telefon - Phase 6, „Termine auf dem Telefon".
 *
 * Der Beitritt und die Erreichbarkeit stehen seit dem 2026-08-25; was fehlte,
 * war der erste Grund, das Ding dabeizuhaben. Dieses Skript ist er: es fragt
 * das eigene Home, was fällig ist, und lässt die Fläche es sagen.
 *
 * **Zwei Läufe, ein Skript.** Ohne Argument liest es; mit `acknowledge`
 * quittiert es. Der Grund ist die Vorrede: entsiegeln, den Daemon abwarten,
 * grüßen - dreimal geschrieben wäre dreimal zu pflegen, und `ProbeService`
 * kann jedem Dienst sein Argument mitgeben.
 *
 * **Warum das Lesen nicht quittiert.** ADR 0118 O1 sagt, nur ein Gerät kann
 * sagen, dass es jemandem etwas gezeigt hat - und eine geschriebene Datei ist
 * kein gesehener Satz. Eine frühere Fassung des Schedulers markierte einen
 * Eintrag als geweckt und rief danach eine Fläche; genau daran ist die Zusage
 * still verlorengegangen. Hier quittiert deshalb erst der Knopf, den ein
 * Mensch drückt. Ein Eintrag, den niemand quittiert, bleibt offen und wird
 * wieder angeboten: Wiederholung ist der laute Fehlschlag, Schweigen der
 * leise, und dies ist die Richtung, in der man sich irren soll.
 *
 * **Die Worte gehören dem Kern.** `renderPicoCompanionDueEntries` schreibt
 * sie, dieselbe Funktion, aus der der Desktop seine Benachrichtigung baut -
 * seit dem 2026-08-26 schalenfrei, genau für diesen zweiten Client. Diese
 * Datei setzt nichts zusammen und der Java-Bildschirm daneben erst recht
 * nicht: er zeigt fertige Zeilen an.
 */
import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPicoCompanionAutomaticVaultUnlock,
  defaultPicoCompanionPlatformUnlockPath,
} from '@pico/companion/platform-unlock';
import { createPicoCompanionLinkClient } from '@pico/companion/recovery-controller';
import {
  createPicoCompanionDueEntriesReader,
  createPicoCompanionDueEntryAcknowledger,
} from '@pico/companion/storage-reader';
import { renderPicoCompanionDueEntries } from '@pico/companion/notify';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon/client';
import { connectPicoAndroidKeystorePort } from './keystore-port.mjs';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const say = (fields) => process.stdout.write(`${JSON.stringify(fields)}\n`);

/** `acknowledge` oder nichts. Nichts heisst lesen. */
const acknowledging = process.argv[2] === 'acknowledge';

/** Wo die fertigen Zeilen stehen, und wo der eine Eintrag, der sie ausloeste. */
const shown = join(files, 'entries.txt');
const pending = join(files, 'entries.pending');

/**
 * Auf den Daemon warten, nicht ihn voraussetzen - und ihn dabei *fragen*,
 * nicht seine Datei ansehen. Dieselbe Regel wie in `reachability.mjs`, aus
 * demselben Grund: eine Socket-Datei ueberlebt ihren Dienst.
 */
async function connectDaemon(socketPath) {
  let refused;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await connectPicoVaultDaemonClient({ socketPath });
    } catch (failed) {
      refused = failed;
      await new Promise((resolve) => { setTimeout(resolve, 500); });
    }
  }
  throw refused;
}

try {
  const profilePath = join(files, 'profile.json');
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'));
  const requireFromVault = createRequire(
    realpathSync(join(stage, 'node_modules/@pico/vault/package.json')),
  );
  const sodium = (await import(requireFromVault.resolve('libsodium-wrappers-sumo'))).default;
  await sodium.ready;

  const socketPath = join(files, 'vault', 'run', 'daemon.sock');
  await (await connectDaemon(socketPath)).close();

  const keystore = await connectPicoAndroidKeystorePort(
    join(files, acknowledging ? 'keystore-ack.sock' : 'keystore-entries.sock'),
  );
  const automatic = createPicoCompanionAutomaticVaultUnlock({
    path: defaultPicoCompanionPlatformUnlockPath(profilePath),
    profile,
    socketPath,
    secrets: keystore,
  });
  await automatic.ensureUnlocked();

  const daemonClient = await connectDaemon(socketPath);
  // Erst gruessen. Ohne das wirft der Daemon `hello_required`, und ein lokaler
  // Fehler wuerde als Aussage ueber das Home ausgegeben (am 2026-08-25 gelernt).
  await daemonClient.hello();
  try {
    const linkClient = await createPicoCompanionLinkClient({ profile, daemonClient, sodium });

    if (acknowledging) {
      const memoryItemId = readFileSync(pending, 'utf8').trim();
      if (memoryItemId === '') {
        throw new Error('nothing_pending');
      }
      await createPicoCompanionDueEntryAcknowledger({ linkClient })(memoryItemId);
      /**
       * Beides weg, und in dieser Reihenfolge gedacht: die Zusage ist erfuellt,
       * sobald das Home die Quittung hat. Die Datei stehen zu lassen, hiesse,
       * denselben Satz beim naechsten Blick wieder anzuzeigen - fuer etwas, das
       * die Person gerade weggedrueckt hat.
       */
      rmSync(pending, { force: true });
      rmSync(shown, { force: true });
      say({ step: 'acknowledged', memoryItemId });
    } else {
      const view = await createPicoCompanionDueEntriesReader({ linkClient })();
      const rendered = renderPicoCompanionDueEntries(view);
      /**
       * Leer heisst leer. Eine Zeile wie „nichts steht an" waere eine zweite
       * Aussage, die niemand entschieden hat - dieselbe Regel wie bei den
       * Bedingungen nebenan.
       */
      writeFileSync(shown, rendered === null ? '' : `${rendered.title}\n${rendered.body}`, 'utf8');
      writeFileSync(pending, rendered === null ? '' : rendered.memoryItemId, 'utf8');
      say({ step: 'read', due: view.total, shown: rendered !== null });
    }
  } finally {
    await daemonClient.close();
  }
} catch (failed) {
  say({ step: acknowledging ? 'acknowledge_failed' : 'read_failed', reason: String(failed && failed.message) });
}
