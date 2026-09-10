import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Was das Paket wirklich mitbringt, gegen das, was bekannt kaputt ist.
 *
 * **`pnpm audit --prod` beantwortet eine andere Frage als die, die zaehlt**
 * (externes Review vom 2026-09-09, §5). Es liest den Produktionsgraphen des
 * Workspaces. Das Debian-Paket enthaelt aber die **Electron-Laufzeit** samt
 * Chromium und V8, und `electron` steht als `devDependency` in
 * `apps/companion-shell/package.json` - `--prod` sieht sie also nie, waehrend
 * `package-linux.mjs` sie in jedes gebaute Paket kopiert. Was ein Paket ist,
 * entscheidet der Packer und nicht ein Feld in einem Manifest.
 *
 * Gemessen am 2026-09-10 ueber `pico-companion_0.2.1_amd64.deb`:
 * `pnpm audit --prod` meldet **null** Hinweise, der volle Lauf **sieben** -
 * und alle sieben betreffen Testwerkzeug (`vitest`, `vite`, `esbuild`), das in
 * keinem Paket landet. Die Luecke lag also nicht dort, wo sie sichtbar war,
 * sondern genau umgekehrt: das eine, was ausgeliefert wird und `--prod`
 * entgeht, ist Electron, und dafuer stand an dem Tag nichts an.
 *
 * **Das Inventar kommt aus dem Artefakt, nicht aus einem Graphen.** Ein
 * zweites Mal abgeleitet, was ausgeliefert werden *sollte*, waere dieselbe
 * Behauptung noch einmal; `dpkg-deb --contents` sagt, was drin ist. pnpm
 * schreibt Name und Version in den Verzeichnisnamen unter `.pnpm`, und die
 * Electron-Version steht als Datei `version` neben der Binaerdatei. Beides
 * ohne Auspacken lesbar, was auf einer Maschine mit tmpfs kein Nebenpunkt ist.
 *
 * **Genau statt nach Namen:** ein Hinweis nennt in `findings[].version` die
 * *installierte* Fassung, gegen die er gilt. Verglichen wird Name **und**
 * Version, damit ein Werkzeug, das in einer verwundbaren Fassung im Baum liegt
 * und in einer sicheren im Paket, nicht faelschlich meldet.
 *
 * Neben der Kette und nicht darin, aus demselben Grund wie das Audit daneben:
 * ein bekannter Hinweis ist eine Tatsache ueber die Welt am Tag des Baus, und
 * ihn in ein Tor zu falten liesse eine fremde Veroeffentlichung wie einen
 * kaputten Baum aussehen.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Ab hier faellt der Lauf. Alles darunter steht da und faellt nicht. */
const failingSeverities = new Set(['high', 'critical']);

/**
 * Die Pakete in einem `.deb`, aus der Ausgabe von `dpkg-deb --contents`.
 *
 * pnpm kodiert einen Namensraum mit `+` statt `/` und haengt bei
 * Peer-Aufloesungen ein `_` mit der Aufloesung an. `node_modules` ist der
 * private Hebeordner von pnpm und kein Paket.
 */
export function picoArtifactPackages(contentsListing) {
  const packages = new Map();
  for (const line of contentsListing.split('\n')) {
    const found = /node_modules\/\.pnpm\/([^/]+)\//u.exec(line);
    if (found === null || found[1] === 'node_modules') {
      continue;
    }
    const base = found[1].split('_')[0];
    const at = base.lastIndexOf('@');
    if (at <= 0) {
      continue;
    }
    const encoded = base.slice(0, at);
    const name = encoded.startsWith('@') ? encoded.replace('+', '/') : encoded;
    const versions = packages.get(name) ?? new Set();
    versions.add(base.slice(at + 1));
    packages.set(name, versions);
  }
  return packages;
}

/**
 * Welche Hinweise etwas betreffen, das dieses Paket wirklich traegt.
 *
 * Rein, damit die Regel geprueft werden kann, ohne ein Paket zu bauen und ins
 * Netz zu greifen - dieselbe Trennung wie bei `decidePicoRelease`.
 */
export function picoShippedAdvisories({ packages, audit }) {
  const shipped = [];
  const elsewhere = [];
  for (const advisory of Object.values(audit.advisories ?? {})) {
    const carried = (advisory.findings ?? [])
      .map((finding) => finding.version)
      .filter((version) => packages.get(advisory.module_name)?.has(version) === true);
    const entry = {
      module: advisory.module_name,
      severity: advisory.severity,
      title: advisory.title,
      url: advisory.url,
      versions: [...new Set(carried)].sort(),
    };
    if (entry.versions.length > 0) {
      shipped.push(entry);
    } else {
      elsewhere.push(entry);
    }
  }
  return { shipped, elsewhere };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = [];
  const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
  const artifact = join(
    repoRoot,
    'apps', 'companion-shell', 'out', `pico-companion_${version}_amd64.deb`,
  );

  // Vor allem anderen und vor jedem Netz: ohne Artefakt hat dieser Prüfer
  // keinen Gegenstand, und ein Prüfer ohne Gegenstand ist kaputt und nicht
  // sauber. Über einem leeren Baum endet er genau hier.
  if (!existsSync(artifact)) {
    console.error(
      `Shipped-closure check failed: ${artifact} does not exist, so there is nothing to `
      + 'inventory. `pnpm companion:release-check` builds it.',
    );
    process.exit(1);
  }

  const listing = execFileSync('dpkg-deb', ['--contents', artifact], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const packages = picoArtifactPackages(listing);
  if (packages.size === 0) {
    console.error(
      'Shipped-closure check failed: the package carries no node_modules entry this reader '
      + 'recognises. Either the packaging changed shape or this reader stopped reading it, and '
      + 'an empty inventory would pass every advisory silently.',
    );
    process.exit(1);
  }

  // Die Electron-Fassung steht als Datei im Paket. Aus dem Artefakt gelesen
  // und nicht aus `electron-support.json`: das Artefakt ist der Gegenstand,
  // und die Gleichheit der beiden ist eine Zusicherung des Packers, keine
  // Tatsache dieses Laufs.
  const electronVersion = execFileSync(
    'sh',
    ['-c', `dpkg-deb --fsys-tarfile ${JSON.stringify(artifact)} | tar -xO ./opt/pico-companion/version`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  ).trim();
  if (!/^\d+\.\d+\.\d+$/u.test(electronVersion)) {
    console.error(
      `Shipped-closure check failed: the package's Electron version reads ${JSON.stringify(electronVersion)}, `
      + 'which is not a version. Without it the largest thing in this package is not in the '
      + 'inventory, and that is the one `pnpm audit --prod` already misses.',
    );
    process.exit(1);
  }
  packages.set('electron', new Set([electronVersion]));
  /**
   * Und dass es wirklich drinsteht, gefragt statt behauptet.
   *
   * **Gefunden durch die eigene Pflanzung am 2026-09-10:** wird die Zeile
   * darueber entfernt, laeuft dieser Pruefer gruen durch und sagt im
   * Schlusssatz weiterhin *„including electron"*. Die Zahl faellt von 40 auf
   * 39, und das sieht niemand. Ein Satz, der eine Eigenschaft behauptet, die
   * der Lauf nicht geprueft hat, ist genau das, wogegen dieser Pruefer
   * geschrieben ist - nur eine Ebene hoeher.
   */
  if (packages.get('electron')?.has(electronVersion) !== true) {
    console.error(
      `Shipped-closure check failed: the inventory does not name electron ${electronVersion}, `
      + 'and Electron is the one thing this package carries that `pnpm audit --prod` cannot '
      + 'see. Without it this check answers a question the audit beside it already answered.',
    );
    process.exit(1);
  }

  /**
   * `pnpm audit` endet ungleich null, sobald es etwas findet - hier ist das
   * die Eingabe und kein Fehlschlag, also `spawnSync` statt `execFileSync`,
   * das darauf werfen wuerde. Ein echter Fehlschlag (kein Netz, kein pnpm)
   * liefert keine lesbare Ausgabe und faellt eine Zeile weiter.
   */
  const pnpmEntry = process.env.npm_execpath;
  const audited = pnpmEntry === undefined
    ? spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd: repoRoot })
    : spawnSync(process.execPath, [pnpmEntry, 'audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      cwd: repoRoot,
    });
  let audit;
  try {
    audit = JSON.parse(audited.stdout ?? '');
  } catch (error) {
    console.error(
      `Shipped-closure check failed: cannot read the audit output (${String(error)}). `
      + `The audit ended ${audited.signal === null || audited.signal === undefined
        ? `with status ${audited.status}` : `on signal ${audited.signal}`}`
      + `${audited.stderr ? `:\n${String(audited.stderr).trim()}` : '.'}`,
    );
    process.exit(1);
  }

  const { shipped, elsewhere } = picoShippedAdvisories({ packages, audit });
  for (const advisory of shipped) {
    const line = `${advisory.module}@${advisory.versions.join(', ')} (${advisory.severity}): `
      + `${advisory.title} - ${advisory.url}`;
    if (failingSeverities.has(advisory.severity)) {
      errors.push(line);
    } else {
      console.log(`- carried, below the failing bar: ${line}`);
    }
  }

  if (errors.length > 0) {
    console.error('Shipped-closure check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `Shipped-closure check passed (${packages.size - 1} npm packages in `
    + `pico-companion_${version}_amd64.deb beside electron `
    + `${[...packages.get('electron')].join(', ')}, all read from the artifact - and Electron `
    + 'is the one `pnpm audit --prod` never sees; '
    + `${shipped.length} advisories name something the package carries and `
    + `${elsewhere.length} name something it does not).`,
  );
}
