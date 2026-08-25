/**
 * ADR 0131 A7, die laufende Hälfte.
 *
 * Der Beitritt spricht die Grenze seit dem 2026-08-22 - aber nur dort, wo ein
 * Beitritt an ihr scheitert. A7 verlangt mehr: eine Fläche, die **im Betrieb**
 * sagt, dass das Home nicht antwortet. Bis heute prüfte Android nichts
 * periodisch; `ReachabilityJobService` maß, *ob das System ihn laufen ließ*,
 * und tat ausdrücklich kein Link-Werk.
 *
 * Dieses Skript ist das Link-Werk dazu, und es besteht aus drei Teilen, von
 * denen zwei schon bewiesen sind:
 *
 *  1. **Wiederöffnen** wie in `reopen.mjs` - der Plattform-Keystore entsiegelt
 *     die Passphrase, der Vault-Daemon öffnet die Gerätesitzungen. Der Daemon
 *     ist der Zeuge: eine falsche Passphrase nimmt er nicht an.
 *  2. **Ein authentifizierter Lesevorgang**, derselbe, an dem der Desktop seine
 *     Erreichbarkeit misst: gelingt er, antwortet das Home; wirft er, nicht.
 *     Genau diese Regel steht im Alarm-Carrier, und sie wird hier nicht
 *     nachgebaut, sondern angewandt.
 *  3. **Der Satz gehört dem Kern.** `picoCompanionConditionsFor` entscheidet,
 *     welche Bedingung gilt und wie sie heißt - samt der Vorrangregel, dass
 *     ohne Netz `home_unreachable` nicht dazugesagt wird, weil das dieselbe
 *     Tatsache zweimal wäre (ADR 0077 C4). Dieses Skript sagt keinen eigenen
 *     Satz; es meldet den, den es bekommen hat.
 *
 * **Ob Netz da ist, weiß die Plattform**, nicht Node: Android hat einen
 * `ConnectivityManager`, und ein Ersatz hier - ein DNS-Versuch, ein Socket -
 * wäre eine zweite Regel neben der des Systems. Die Tatsache kommt deshalb als
 * Argument herein, die Worte darüber aus dem Kern. Fehlt das Argument, bleibt
 * `online` unbekannt, und der Kern lässt `no_network` dann weg, statt es zu
 * raten.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPicoCompanionAutomaticVaultUnlock,
  defaultPicoCompanionPlatformUnlockPath,
} from '@pico/companion/platform-unlock';
import { createPicoCompanionLifecycleReader } from '@pico/companion/lifecycle-reader';
import { picoCompanionConditionsFor } from '@pico/companion/conditions';
import { connectPicoVaultDaemonClient } from '@pico/vault-daemon/client';
import { connectPicoAndroidKeystorePort } from './keystore-port.mjs';

const stage = dirname(fileURLToPath(import.meta.url));
const files = dirname(stage);
const say = (fields) => process.stdout.write(`${JSON.stringify(fields)}\n`);

/** `online`, `offline`, oder nichts - und nichts heißt unbekannt, nicht falsch. */
const stated = process.argv[2];
const online = stated === 'online' ? true : stated === 'offline' ? false : undefined;

/**
 * Auf den Daemon warten, nicht ihn voraussetzen - und ihn dabei *fragen*,
 * nicht seine Datei ansehen (am Gerät gelernt, 2026-08-25).
 *
 * Der erste Lauf meldete `ECONNREFUSED`: die Fläche startet den Custody-Dienst
 * und diese Prüfung im selben Augenblick, und ein Vault-Daemon steht später
 * als ein `startForegroundService` zurückkehrt. Der zweite Versuch prüfte, ob
 * die Socket-**Datei** da ist - sie war es, vom vorigen Lauf, und niemand
 * lauschte darauf. Eine Datei ist nicht der Dienst; die einzige ehrliche
 * Frage ist der Verbindungsversuch selbst.
 *
 * Begrenzt, weil unbegrenztes Warten dieselbe Unwahrheit wäre, nur später.
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
  /**
   * Auf den Daemon warten, nicht ihn voraussetzen (am Gerät gelernt,
   * 2026-08-25).
   *
   * Der erste Lauf meldete `ECONNREFUSED` auf genau diesen Pfad: die Fläche
   * startet den Custody-Dienst und diese Prüfung im selben Augenblick, und ein
   * Vault-Daemon braucht länger zum Aufstehen als ein `startForegroundService`
   * zum Zurückkehren. Eine Prüfung, die auf einem Takt läuft, trifft diesen
   * Zustand regelmäßig - sie darf ihn nicht als „Home antwortet nicht"
   * ausgeben, denn das wäre ein Satz über das Home und stimmt über den Daemon.
   *
   * Begrenzt, weil ein unbegrenztes Warten dieselbe Lüge wäre, nur später.
   */
  /**
   * Zuerst, weil das Entsiegeln selbst eine Daemon-Verbindung öffnet. Der
   * zweite Fehlversuch hing genau hier: die Wiederholung stand *unter*
   * `ensureUnlocked`, und geworfen hat die Zeile darüber.
   */
  await (await connectDaemon(socketPath)).close();
  say({ step: 'daemon_up' });

  const keystore = await connectPicoAndroidKeystorePort(join(files, 'keystore-conditions.sock'));
  const automatic = createPicoCompanionAutomaticVaultUnlock({
    path: defaultPicoCompanionPlatformUnlockPath(profilePath),
    profile,
    socketPath,
    secrets: keystore,
  });
  await automatic.ensureUnlocked();
  say({ step: 'unlocked' });

  const daemonClient = await connectDaemon(socketPath);
  /**
   * **Erst grüßen** (am Gerät gefunden, 2026-08-25).
   *
   * Ohne `hello` wirft der Daemon `hello_required` - und dieses Skript hat
   * daraus `home_unreachable` gemacht: „dein Home antwortet nicht", während
   * das Home lief und der eigene Daemon einen Handschlag vermisste. Ein
   * lokaler Fehler, als Aussage über das Home ausgegeben, ist genau das, was
   * ADR 0131 A7 verbietet - nur andersherum als sonst.
   *
   * Der Handschlag steht deshalb **außerhalb** des `try`, das die
   * Erreichbarkeit misst: was hier schiefgeht, ist kein Satz über das Home.
   */
  await daemonClient.hello();
  let homeReachable;
  try {
    const readLifecycle = await createPicoCompanionLifecycleReader({
      profile,
      profilePath,
      daemonClient,
      sodium,
    });
    /**
     * **Mit einer Grenze**, am Gerät gelernt (2026-08-25).
     *
     * Ein Home, das die Verbindung *ablehnt*, meldet sich sofort. Ein Home,
     * das *schweigt* - angehalten, überlastet, hinter einer Brücke, die
     * annimmt und nicht weiterreicht - lässt jeden Aufrufer warten:
     * `link-direct-client.ts` kennt keinen Timeout, und die Companion gibt
     * keinen mit. Auf dem Desktop heißt das ein hängender Hintergrundlauf;
     * auf einem Telefon ein Vordergrunddienst, der nicht mehr zurückkommt.
     *
     * Eine Prüfung, die hängt, sagt nie „dein Home antwortet nicht" - und
     * genau das ist der Satz, für den sie da ist. Zwanzig Sekunden sind
     * reichlich für ein Heimnetz und kurz genug, um eine Antwort zu sein.
     */
    const snapshot = await Promise.race([
      readLifecycle(),
      new Promise((_resolve, reject) => {
        setTimeout(() => { reject(new Error('read_timed_out')); }, 20_000);
      }),
    ]);
    homeReachable = true;
    say({
      step: 'home_answered',
      // Der Fingerabdruck, unter dem gelesen wurde, und ob etwas wartet - nicht
      // was wartet: diese Sonde ist keine Recovery-Fläche.
      identity: snapshot.picoIdentityFingerprintHex,
      pendingRecovery: snapshot.pendingRecovery !== null,
    });
  } catch (refused) {
    homeReachable = false;
    say({ step: 'home_silent', reason: String(refused && refused.message) });
  } finally {
    await daemonClient.close();
  }

  /**
   * Der Kern entscheidet und benennt. Was hier steht, ist die Antwort, nicht
   * eine zweite Fassung davon - `check-one-voice.mjs` hält genau das fest.
   */
  const conditions = picoCompanionConditionsFor({ online, homeReachable });
  say({ step: 'conditions', online, homeReachable, conditions });

  /**
   * Fertig geschrieben statt als Daten: die Fläche zeigt diese Datei an und
   * setzt nichts zusammen. Wer die Worte besitzt, ist damit nicht eine Frage
   * der Disziplin, sondern des Formats - ein Java-Bildschirm, der aus `kind`
   * einen Satz machen wollte, hätte hier nichts, woraus.
   *
   * Leer heißt leer: keine Bedingung ist eine Aussage, und eine Zeile wie
   * "alles in Ordnung" wäre eine zweite, die niemand entschieden hat.
   */
  writeFileSync(
    join(files, 'condition.txt'),
    conditions.map((entry) => `${entry.label} - ${entry.remedy}`).join('\n'),
    'utf8',
  );
} catch (failed) {
  say({ step: 'reachability_failed', reason: String(failed && failed.message) });
}
