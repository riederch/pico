import { spawnSync } from 'node:child_process';
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
const electron = createRequire(join(shellRoot, 'package.json')).resolve('electron');
const binary = `${spawnSync(process.execPath, ['-p', `require(${JSON.stringify(electron)})`], {
  encoding: 'utf8',
}).stdout}`.trim();

if (binary === '') {
  process.stderr.write('electron did not resolve to a binary path\n');
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
process.stdout.write(`chromium sandbox: ${probe.mode}\n`);

/**
 * **Ein Fehlschlag hier soll sagen, was ihm fehlt.**
 *
 * Der Namensraum-Modus braucht unprivilegierte User-Namespaces. Wo sie
 * gesperrt sind - Ubuntu 24.04 tut das per AppArmor fuer unconfined
 * Programme -, bricht Chromium mit einer Zeile ab, die nach einem Fehler im
 * Fenster aussieht und keiner ist. Am 2026-09-02 hat genau das einen
 * CI-Durchgang gekostet, und die Diagnose stand nirgends.
 */
if (run.status !== 0) {
  process.stderr.write(
    'The window did not come up. Two causes look alike here and neither is a '
    + 'defect in the renderer:\n'
    + '  * unprivileged user namespaces are restricted - on Ubuntu 24.04 lift '
    + 'it with `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`;\n'
    + '  * no display and no headless flag - this runner passes `--headless`.\n'
    + 'Turning the sandbox off with `--no-sandbox` would make this pass and '
    + 'measure a different program than the one that ships.\n',
  );
}
process.exit(run.status ?? 1);
