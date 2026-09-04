import { spawnSync } from 'node:child_process';
import { accessSync, constants, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { selectChromiumSandboxProbe } from './chromium-sandbox-probe.mjs';

/**
 * Der Rauchtest am echten Fenster, mit derselben Sandbox-Regel wie die
 * Paketpruefung daneben.
 *
 * **Der Anlass** (2026-09-04, in CI gefunden, Befund B62). `test:electron`
 * stand seit dem 2026-09-02 in `release:verify` und rief `electron` direkt.
 * Auf diesem Rechner lief das; auf dem CI-Laeufer scheiterte es sofort:
 *
 *     The SUID sandbox helper binary was found, but is not configured
 *     correctly. Rather than run without sandboxing I'm aborting now.
 *
 * Chromium sucht sich seine Sandbox selbst, und in einem ausgepackten
 * `node_modules` gehoert `chrome-sandbox` nicht root. Genau diese Frage hat
 * dieses Haus schon einmal beantwortet: `selectChromiumSandboxProbe` waehlt
 * ohne das Paket-Probe-Flag den **Namensraum**-Modus und gibt
 * `--disable-setuid-sandbox` mit. Der Kern der Antwort ist, was sie *nicht*
 * ist: `--no-sandbox` - und `check-companion-boundary` verbietet das auf jeder
 * Produktionsflaeche. Die Sandbox bleibt an, nur nicht die setuid-Variante.
 *
 * Die Regel wird geholt und nicht abgeschrieben. Eine zweite Fassung davon
 * waere die, die driftet, wenn jemand die erste anfasst - und sie entschiede
 * ueber eine Sandbox.
 *
 * **Was hier trotzdem anders ist als in Produktion**, gesagt statt
 * verschwiegen: eine ausgelieferte Companion startet mit dem root-eigenen
 * setuid-Helfer aus ihrem Paket, und *dass* sie ihn behaelt, prueft
 * `verify-linux-package.mjs`. Dieser Lauf prueft die Isolationsnaht im
 * Fenster - kein `process`, kein `require`, genau die freigegebenen Namen -,
 * und die haengt nicht daran, welche der beiden Sandboxen darunter liegt.
 */
const here = fileURLToPath(new URL('.', import.meta.url));
const shellRoot = join(here, '..');

/**
 * **Den Pfad holen, nicht aus einer Ausgabe herauslesen.**
 *
 * Die erste Fassung startete ein Kind-Node, liess es `require('electron')`
 * ausfuehren und nahm dessen **ganzes stdout** als Pfad. Das ging gut, solange
 * die Binaerdatei schon dalag - und nur dann. Electron 44 veroeffentlicht
 * naemlich *kein* Installationsskript mehr (die Registry sagt zu 44.0.0
 * `scripts: undefined`); die Binaerdatei kommt beim **ersten `require`**, und
 * `index.js` meldet das mit `console.log('Downloading Electron binary...')`
 * auf stdout, bevor es den Pfad zurueckgibt.
 *
 * Auf einem frischen Laeufer stand darum genau das in `binary`:
 *
 *     "Downloading Electron binary...\n/pfad/zur/electron"
 *
 * Nicht leer, also lief die Pruefung auf den leeren Pfad ins Leere; `spawnSync`
 * darauf endete mit `ENOENT`, `status: null` und **keiner Zeile Ausgabe** -
 * das Bild, mit dem CI am 2026-09-04 zurueckkam und das wie ein
 * Sandbox-Abbruch aussah. Nachgestellt, nicht vermutet.
 *
 * Hier wird der Pfad jetzt in diesem Prozess geholt. Der Rueckgabewert ist der
 * Pfad; was der Download dabei auf stdout meldet, ist eine Meldung an den
 * Menschen und nicht mehr die Antwort.
 */
let binary;
try {
  binary = createRequire(join(shellRoot, 'package.json'))('electron');
} catch (cause) {
  process.stderr.write(`electron did not resolve to a binary path: ${cause.message}\n`);
  process.exit(1);
}

if (typeof binary !== 'string' || binary.trim() === '') {
  process.stderr.write(`electron resolved to ${JSON.stringify(binary)}, which is not a path\n`);
  process.exit(1);
}

/**
 * **`rootOwnedPackageProbe: false`, ausdruecklich und nicht aus der Umgebung.**
 *
 * Die CI-Datei setzt `PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE=1` fuer den
 * ganzen `release:verify`-Schritt, weil die *Paket*pruefung den root-eigenen
 * setuid-Helfer aus dem `.deb` verlangt. Dieser Lauf fuehrt kein Paket aus,
 * sondern das Electron aus `node_modules` - dort gibt es keinen solchen
 * Helfer, und die Frage danach gehoert ihm nicht.
 *
 * Ohne diese Zeile las der Waehler die Umgebung, nahm den Paket-Zweig und warf
 * „Packaged Chromium sandbox helper path must be absolute" - derselbe
 * Fehlschlag noch einmal, nur mit einem anderen Satz. Gefunden, indem die
 * CI-Datei gelesen und der Lauf mit ihrem Flag nachgestellt wurde, statt ihn
 * ein zweites Mal blind auszuliefern.
 */
const probe = selectChromiumSandboxProbe({ rootOwnedPackageProbe: false });
const run = spawnSync(
  binary,
  [...probe.arguments, '--headless', join(shellRoot, 'dist', 'electron-smoke.js')],
  { stdio: 'inherit' },
);
/**
 * **Ein Fehlschlag hier soll sagen, was ihm fehlt - und zwar das, was er
 * *weiss*, nicht das, was er vermutet.**
 *
 * Die erste Fassung dieser Zeilen nannte zwei Ursachen, die gleich aussehen,
 * und liess die eine Zahl weg, die dieser Prozess bereits in der Hand hielt.
 * Am 2026-09-04 kam der Laeufer damit zurueck: `chromium sandbox:
 * user_namespace`, danach die Diagnose - und **kein einziges Wort von
 * Chromium selbst**. Aus derselben Ausgabe folgen mindestens drei Lagen, und
 * die Diagnose nannte zwei davon:
 *
 *   * die Namensraum-Sandbox darf nicht (Ubuntu 24.04 sperrt unprivilegierte
 *     User-Namespaces per AppArmor);
 *   * das Kind starb an einem Signal, also ohne Zeile auf stderr;
 *   * `spawnSync` kam gar nicht bis zum Start - eine fehlende Binaerdatei
 *     ergibt `status: null`, `signal: null`, `error: ENOENT` und **keine
 *     Ausgabe**, exakt das Bild vom Laeufer. Nachgestellt, nicht vermutet.
 *
 * Die dritte fehlte, weil `status ?? 1` den Unterschied zwischen „beendet mit
 * 1" und „nie gestartet" wegwirft. Es steht jetzt alles da: der Weg zur
 * Binaerdatei, ob sie ausfuehrbar ist, Status, Signal, Spawn-Fehler und die
 * Schalter, an denen die Namensraum-Sandbox haengt.
 *
 * **Eine Ursache ist ausgeschlossen und steht deshalb nicht mehr als
 * Vermutung da:** eine fehlende Anzeige ist es nicht. Derselbe Lauf ist hier
 * ohne `DISPLAY` und ohne `WAYLAND_DISPLAY` gruen - Electron 44 nimmt
 * `--headless` an.
 */
const readSwitch = (path) => {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return 'absent';
  }
};
const binaryState = () => {
  try {
    accessSync(binary, constants.X_OK);
    return 'executable';
  } catch (cause) {
    return `unusable (${cause.code})`;
  }
};
const namespaceSwitches = [
  `apparmor_restrict_unprivileged_userns=${readSwitch('/proc/sys/kernel/apparmor_restrict_unprivileged_userns')}`,
  `unprivileged_userns_clone=${readSwitch('/proc/sys/kernel/unprivileged_userns_clone')}`,
  `max_user_namespaces=${readSwitch('/proc/sys/user/max_user_namespaces')}`,
].join(', ');

process.stdout.write(`chromium sandbox: ${probe.mode} (${namespaceSwitches})\n`);

if (run.status !== 0) {
  process.stderr.write(
    'The window did not come up. What this process knows:\n'
    + `  * electron binary: ${binary} - ${binaryState()}\n`
    + `  * exit status: ${run.status ?? 'none'}, signal: ${run.signal ?? 'none'}`
    + `, spawn error: ${run.error ? `${run.error.code} (${run.error.message})` : 'none'}\n`
    + `  * sandbox arguments: ${probe.arguments.join(' ') || '(none)'}\n`
    + `  * ${namespaceSwitches}\n`
    + `  * DISPLAY: ${process.env.DISPLAY ?? 'unset'}\n`
    + 'Reading it: a spawn error means the binary never ran, so the sandbox is '
    + 'not the question. A signal means Chromium died before it could speak - '
    + 'with the namespace sandbox that is usually a restricted user namespace, '
    + 'and on Ubuntu 24.04 `sudo sysctl -w '
    + 'kernel.apparmor_restrict_unprivileged_userns=0` lifts it. A missing '
    + 'display is not a cause here: this run is green without one, because '
    + 'Electron takes `--headless`.\n'
    + 'Turning the sandbox off with `--no-sandbox` would make this pass and '
    + 'measure a different program than the one that ships.\n',
  );
}
process.exit(run.status === 0 ? 0 : 1);
