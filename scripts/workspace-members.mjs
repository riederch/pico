import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wer zu diesem Baum gehoert, gefragt statt aufgeschrieben.
 *
 * **Zwei Listen sagten es von Hand, und beide waren unvollstaendig oder auf
 * dem Weg dorthin** (externes Review vom 2026-09-09, §8).
 * `check-version.mjs` nannte zwoelf Manifeste; der Workspace hat siebzehn.
 * `packages/gesture` und alle vier `modules/*` standen nicht darin, also
 * durfte ihre Version von der des Produkts abweichen, ohne dass ein Tor etwas
 * sagte. Heute tun sie es nicht - deshalb ist das hier ein Netz und keine
 * Reparatur, und deshalb war es unsichtbar.
 *
 * `check-addon-config.mjs` nannte zwei Konfigurationen unter der Ueberschrift
 * *„Every add-on in this repository, not the one this file was written for"*.
 * Der Satz stimmt, solange jemand ihn nachfuehrt. Eine Liste sagt, was erlaubt
 * ist, nie, ob es das noch gibt - dieselbe Asymmetrie wie bei den Nebenschritten
 * in Befund B118 und den unbedienten Seiten in B119, und beide Male war sie die
 * halbe Regel.
 *
 * **Was hier nicht steht: eine Glob-Bibliothek.** Der Leser expandiert
 * `<verzeichnis>/*` und weigert sich hoerbar bei allem anderen. Ein Muster, das
 * er nicht ausdruecken kann, wuerde die Menge stillschweigend verkleinern, die
 * jedes Versionstor bewacht - und eine kleinere Menge meldet keinen Fehler,
 * sie meldet weniger.
 */

const simpleGlob = /^([A-Za-z0-9._-]+)\/\*$/u;

/**
 * Die Globs aus `pnpm-workspace.yaml`, so gelesen, wie pnpm sie meint.
 *
 * Kein YAML-Parser: die Datei hat einen Schluessel und eine Liste. Was dieser
 * Leser nicht versteht, wirft er - eine stillschweigend uebersprungene Zeile
 * waere genau der Fehler, gegen den er geschrieben ist.
 */
export function picoWorkspaceGlobs(root) {
  const lines = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n');
  const start = lines.findIndex((line) => /^packages:\s*$/u.test(line));
  if (start === -1) {
    throw new Error('pnpm-workspace.yaml has no `packages:` list, so there is no workspace to read.');
  }
  const globs = [];
  for (const line of lines.slice(start + 1)) {
    // Ein Schluessel ohne Einrueckung beendet die Liste; `catalog:` und was
    // sonst noch kommt, geht diesen Leser nichts an.
    if (/^\S/u.test(line)) {
      break;
    }
    if (/^\s*(#|$)/u.test(line)) {
      continue;
    }
    const entry = /^\s+-\s*(.+?)\s*$/u.exec(line);
    if (entry === null) {
      throw new Error(
        `pnpm-workspace.yaml line ${JSON.stringify(line)} is not a list entry this reader `
        + 'understands. Skipping it would narrow the set every version gate guards.',
      );
    }
    globs.push(entry[1].replace(/^(["'])(.*)\1$/u, '$2'));
  }
  if (globs.length === 0) {
    throw new Error('pnpm-workspace.yaml lists no package globs, so this reader has no subject.');
  }
  for (const glob of globs) {
    if (!simpleGlob.test(glob)) {
      throw new Error(
        `pnpm-workspace.yaml lists ${JSON.stringify(glob)}, which this reader cannot expand. `
        + 'It understands `<directory>/*` and nothing else - not `**`, not an exclusion. A '
        + 'pattern it guessed at would guard a different set than pnpm installs.',
      );
    }
  }
  return globs;
}

/**
 * Jedes Workspace-Manifest, in der Reihenfolge der Globs und darin sortiert.
 *
 * Ein Verzeichnis ohne `package.json` ist kein Mitglied - das ist pnpms Regel,
 * und eine strengere hier wuerde ein Kratzverzeichnis zum Fehler machen. Ein
 * *Glob* ohne jedes Mitglied ist dagegen einer: ein Wurzelverzeichnis, das
 * aufhoert zu antworten, ist ein Umzug und kein sauberes Ergebnis.
 */
export function picoWorkspaceManifests(root) {
  const manifests = [];
  for (const glob of picoWorkspaceGlobs(root)) {
    const [, directory] = simpleGlob.exec(glob);
    let entries;
    try {
      entries = readdirSync(join(root, directory), { withFileTypes: true });
    } catch {
      throw new Error(
        `pnpm-workspace.yaml lists ${JSON.stringify(glob)} and ${directory} is not a directory `
        + 'here. The workspace names a root this tree does not have.',
      );
    }
    const found = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => `${directory}/${entry.name}/package.json`)
      .filter((path) => existsSync(join(root, path)))
      .sort();
    if (found.length === 0) {
      throw new Error(
        `pnpm-workspace.yaml lists ${JSON.stringify(glob)} and no directory under ${directory} `
        + 'holds a package.json. A root that stops answering is a move, not a clean result.',
      );
    }
    manifests.push(...found);
  }
  return manifests;
}

/**
 * Jedes Home-Assistant-Add-on dieses Repositoriums.
 *
 * Entdeckt, wie der Supervisor es entdeckt: ein Verzeichnis oberster Ebene mit
 * einer `config.yaml`, die einen `slug` traegt. Das ist die Regel der
 * Plattform und keine, die dieser Baum sich ausgedacht hat - der Unterschied
 * zaehlt, weil eine erfundene Konvention spaeter genau so still bricht wie
 * eine Liste.
 */
export function picoAddons(root) {
  const addons = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => ({ directory: entry.name, configPath: `${entry.name}/config.yaml` }))
    .filter((addon) => existsSync(join(root, addon.configPath)))
    .map((addon) => {
      const config = readFileSync(join(root, addon.configPath), 'utf8');
      if (!/^slug:\s*\S/mu.test(config)) {
        return undefined;
      }
      const image = /^image:\s*(\S+)\s*$/mu.exec(config);
      return { ...addon, image: image === null ? undefined : image[1] };
    })
    .filter((addon) => addon !== undefined)
    .sort((left, right) => left.directory.localeCompare(right.directory));
  if (addons.length === 0) {
    throw new Error(
      'no top-level directory holds a config.yaml with a slug, so there is no add-on to check. '
      + 'A checker without a subject is broken, not clean.',
    );
  }
  return addons;
}

/**
 * Jedes Dockerfile dieses Repositoriums.
 *
 * `check-workflow-pinning.mjs` las das Verzeichnis schon so; `check-addon-config.mjs`
 * fuehrte daneben eine Liste mit zwei Pfaden und der Ueberschrift *„Every
 * published image, not just the one this file was written for"*. Beide Saetze
 * meinen dieselbe Menge, und eine Wahrheit, zweimal geschrieben, driftet - der
 * Fall, den ADR 0153 dieser Datei schon einmal beigebracht hat, als das zweite
 * Bild dazukam.
 */
export function picoDockerfiles(root) {
  const directory = join(root, 'docker');
  const found = readdirSync(directory)
    .filter((entry) => entry.endsWith('.Dockerfile') || entry === 'Dockerfile')
    .sort()
    .map((entry) => `docker/${entry}`);
  if (found.length === 0) {
    throw new Error(
      'docker/ holds no Dockerfile, so there is no published image to check. A checker without '
      + 'a subject is broken, not clean.',
    );
  }
  return found;
}
