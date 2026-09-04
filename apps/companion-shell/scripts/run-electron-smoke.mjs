import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
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

/**
 * **Ein Fenster braucht eine Anzeige, und dieser Lauf besorgt sich eine.**
 *
 * `--headless` stand hier bis zum 2026-09-04 und tat **nichts**. Electron 44
 * nimmt das Flag entgegen und startet trotzdem Ozones X11-Flaeche; auf dem
 * Laeufer endete das mit `Could not open the default X display`, einem
 * `Gtk-ERROR` und `SIGTRAP`. Alle kopflosen Wege sind durchprobiert und keiner
 * traegt: `--ozone-platform=headless` (auch mit `--disable-gpu`,
 * `--use-gl=swiftshader`, `--in-process-gpu`) endet im Speicherzugriffsfehler,
 * `--headless=new` ebenso.
 *
 * **Und mein Beweis, dass es ohne Anzeige liefe, war keiner.** Er entfernte
 * `DISPLAY` und `WAYLAND_DISPLAY` - also die *Namen* der Anzeige, nicht die
 * Anzeige: Ozone findet den Wayland-Sockel auch als `wayland-0` unter
 * `XDG_RUNTIME_DIR`. Mit diesem dritten Namen weg scheitert derselbe Lauf hier
 * genauso wie auf dem Laeufer. Deshalb fragt die Erkennung unten nach allen
 * dreien und nicht nach zweien.
 *
 * Wo keine Anzeige ist, wird eine gestellt. Das ist keine Umgehung, sondern
 * das, was ein Fenstertest braucht - im Gegensatz zu `--no-sandbox`, das die
 * Lage aendern wuerde, die hier gemessen wird.
 */
const waylandSocket = process.env.XDG_RUNTIME_DIR
  ? join(process.env.XDG_RUNTIME_DIR, process.env.WAYLAND_DISPLAY || 'wayland-0')
  : undefined;
const displayReachable = (process.env.DISPLAY ?? '') !== ''
  || (process.env.WAYLAND_DISPLAY ?? '') !== ''
  || (waylandSocket !== undefined && existsSync(waylandSocket));

const virtualDisplay = ['xvfb-run', '--auto-servernum', '--server-args=-screen 0 1280x1024x24'];
if (!displayReachable && spawnSync(virtualDisplay[0], ['--help'], { stdio: 'ignore' }).error) {
  process.stderr.write(
    'No display and no `xvfb-run` to make one. This test drives a real window, '
    + 'so it needs a display server; Electron 44 has no working headless mode '
    + '(measured: `--headless` is ignored, `--ozone-platform=headless` and '
    + '`--headless=new` crash). Install xvfb, or run this where DISPLAY, '
    + 'WAYLAND_DISPLAY or $XDG_RUNTIME_DIR/wayland-0 is reachable.\n',
  );
  process.exit(1);
}

/**
 * **Unter der gestellten Anzeige wird die Flaeche benannt.**
 *
 * `xvfb-run` setzt `DISPLAY`, und trotzdem waehlte Ozone die *Wayland*-Flaeche
 * und starb mit „Failed to initialize Wayland platform" - hier nachgestellt,
 * mit echtem Xvfb, am 2026-09-04. Wo dieser Lauf die Anzeige selbst stellt,
 * weiss er auch, welche Sorte sie ist, und sagt es.
 *
 * **Gefunden hat das erst das echte Xvfb.** Vorher stand hier eine Attrappe
 * auf dem Pfad, die statt einer virtuellen Anzeige die *echte* zurueckgab; sie
 * belegte Erkennung, Umhuellung und Reihenfolge - und verdeckte genau diesen
 * Fehler, weil Ozones Wayland-Wahl mit einer Wayland-Sitzung ja aufgeht. Eine
 * Attrappe, die das Echte zurueckgibt, prueft die Verdrahtung und luegt ueber
 * die Welt.
 */
const command = displayReachable ? binary : virtualDisplay[0];
const commandArguments = [
  ...(displayReachable ? [] : [...virtualDisplay.slice(1), binary]),
  ...probe.arguments,
  ...(displayReachable ? [] : ['--ozone-platform=x11']),
  join(shellRoot, 'dist', 'electron-smoke.js'),
];
const run = spawnSync(command, commandArguments, { stdio: 'inherit' });
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
    + `  * DISPLAY: ${process.env.DISPLAY ?? 'unset'}, WAYLAND_DISPLAY: ${process.env.WAYLAND_DISPLAY ?? 'unset'}, wayland socket: ${waylandSocket ?? 'no XDG_RUNTIME_DIR'} -> ${displayReachable ? 'display reachable' : 'none, ran under xvfb-run'}\n`
    + 'Reading it: a spawn error means the binary never ran, so the sandbox is '
    + 'not the question. A signal means Chromium died before it could speak - '
    + 'with the namespace sandbox that is usually a restricted user namespace, '
    + 'and on Ubuntu 24.04 `sudo sysctl -w '
    + 'kernel.apparmor_restrict_unprivileged_userns=0` lifts it. A missing '
    + 'display is the cause when SIGTRAP arrives with `Could not open the '
    + 'default X display` above it - Electron 44 has no working headless '
    + 'mode, so this run makes its own display with xvfb-run.\n'
    + 'Turning the sandbox off with `--no-sandbox` would make this pass and '
    + 'measure a different program than the one that ships.\n',
  );
}
process.exit(run.status === 0 ? 0 : 1);
