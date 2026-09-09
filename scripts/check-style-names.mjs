import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import {
  picoOperatedSurfaces,
  picoRepoRoot,
  picoUnoperatedSurfaces,
} from './operated-surfaces.mjs';

/**
 * Jeder Name, den eine Flaeche traegt, hat eine Regel.
 *
 * **Der Anlass** (2026-09-09, Befund B103). Das Begleiterfenster trug elf
 * Klassennamen, die in keinem Stilblatt vorkamen. Der schlimmste hiess
 * `quiet`: er sass auf den Knoepfen, die eine Zugangsberechtigung verwerfen
 * und die Vollmacht eines Geraets beenden. Weil ihn keine Regel kannte, waren
 * genau diese Knoepfe die **lautesten** im Fenster - `button` ohne Klasse ist
 * hier gefuellt, fett und in der Primaerfarbe. Drei Zeilenarten standen ohne
 * Rahmen und ohne Innenabstand neben Zeilen, die beides hatten, und zwei
 * verschachtelte Listen zeigten Aufzaehlungspunkte, die dieses Stilblatt
 * ueberall sonst abschaltet.
 *
 * **Warum das niemandem auffiel.** Ein Element mit einem unbekannten
 * Klassennamen verschwindet nicht und meldet nichts. Es erscheint - als das,
 * was der Browser vorgibt. Ein Tippfehler in einem Klassennamen ist deshalb
 * der stillste Fehler, den eine Flaeche haben kann: alles ist da, nur anders,
 * und wer die Seite nicht neben der Absicht sieht, merkt es nie.
 *
 * **Was hier nicht geprueft wird.** Nicht, ob eine Regel gut aussieht, und
 * nicht die Gegenrichtung - eine Regel ohne Traeger ist toter Stil, ein
 * anderer Mangel mit anderen Fehlalarmen (Zustandsklassen, Medienabfragen,
 * fremde Blaetter). Hier steht die Richtung, in der eine Absicht verloren
 * geht: ein Name wird versprochen und nirgends eingeloest.
 *
 * **Alles abgeleitet.** Die bedienten Flaechen kommen aus
 * `operated-surfaces.mjs`. Die Stilblaetter einer Flaeche stehen in ihr
 * (`<link rel="stylesheet">` und `<style>`), sie werden nicht gelistet. Wer
 * auf die Flaeche zeichnet, sind die verfolgten `.ts` unter derselben
 * Anwendungswurzel - die naechste Elternschaft mit einer `package.json`.
 *
 * **Wo er blind ist**, und das gehoert dazu: ein Klassenname, der zur Laufzeit
 * zusammengesetzt wird (`className = \`a ${b}\``), laesst sich hier nicht
 * lesen und wird uebersprungen. Solche gibt es heute keine; kaemen welche,
 * pruefte diese Frage sie nicht.
 */
const errors = [];
const tracked = new Set(
  execSync('git ls-files', { cwd: picoRepoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== ''),
);

/** Die naechste Elternschaft mit einer `package.json` - die Anwendungswurzel. */
function appRootOf(path) {
  let directory = dirname(path);
  while (directory !== '.' && directory !== '') {
    if (existsSync(join(picoRepoRoot, directory, 'package.json'))) {
      return directory;
    }
    directory = dirname(directory);
  }
  return null;
}

const classSelector = /\.(-?[_a-zA-Z][\w-]*)/gu;
const attributePattern = /\bclass="([^"]*)"/gu;
const assignmentPattern = /\bclassName\s*=\s*'([^']*)'/gu;
const listPattern = /classList\.(?:add|remove|toggle|contains)\(\s*'([^']+)'/gu;

let surfaces = 0;
let sheets = 0;
let defined = 0;
let used = 0;
let drawers = 0;
for (const surface of picoOperatedSurfaces()) {
  surfaces += 1;
  const html = readFileSync(join(picoRepoRoot, surface), 'utf8');

  const styles = [];
  for (const [, href] of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/gu)) {
    const sheet = relative(picoRepoRoot, resolve(dirname(join(picoRepoRoot, surface)), href));
    if (!tracked.has(sheet)) {
      errors.push(
        `${surface}: the stylesheet \`${href}\` is not a tracked file, so nothing here `
        + 'can say which names it defines.',
      );
      continue;
    }
    sheets += 1;
    styles.push(readFileSync(join(picoRepoRoot, sheet), 'utf8'));
  }
  for (const [, block] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)) {
    sheets += 1;
    styles.push(block);
  }

  const known = new Set();
  for (const style of styles) {
    for (const [, name] of style.matchAll(classSelector)) {
      known.add(name);
    }
  }
  defined += known.size;

  /** Wer auf diese Flaeche zeichnet: die verfolgten `.ts` derselben Wurzel. */
  const root = appRootOf(surface);
  const sources = [...tracked].filter((path) => root !== null
    && path.startsWith(`${root}/`)
    && path.endsWith('.ts')
    && !path.endsWith('.d.ts'));

  const wearers = new Map();
  const wear = (name, where) => {
    if (!wearers.has(name)) {
      wearers.set(name, new Set());
    }
    wearers.get(name).add(where);
  };
  for (const [, value] of html.matchAll(attributePattern)) {
    for (const name of value.trim().split(/\s+/u)) {
      if (name !== '') {
        wear(name, surface);
      }
    }
  }
  for (const path of sources) {
    const source = readFileSync(join(picoRepoRoot, path), 'utf8');
    let drew = false;
    for (const pattern of [assignmentPattern, listPattern]) {
      for (const [, value] of source.matchAll(pattern)) {
        for (const name of value.trim().split(/\s+/u)) {
          if (name !== '') {
            wear(name, path);
            drew = true;
          }
        }
      }
    }
    if (drew) {
      drawers += 1;
    }
  }

  used += wearers.size;
  for (const [name, where] of wearers) {
    if (known.has(name)) {
      continue;
    }
    errors.push(
      `${surface}: \`${name}\` is worn by an element (${[...where].join(', ')}) and no `
      + 'rule defines it. The element still appears - as whatever the browser makes of '
      + 'it - so nothing looks broken and the intent never arrives.',
    );
  }
}

if (surfaces === 0 || sheets === 0 || defined === 0 || used === 0 || drawers === 0) {
  console.error(
    'Style-name check failed: no operated surface, no stylesheet, no defined name, no '
    + 'worn name or no renderer was read, so this check passed over nothing.',
  );
  process.exit(1);
}

if (errors.length > 0) {
  console.error('Style-name check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Style-name check passed (${surfaces} operated surfaces reading ${sheets} stylesheets, `
  + `${defined} names defined and ${used} worn by ${drawers} renderers and the pages `
  + `themselves, each of them defined; ${picoUnoperatedSurfaces.size} pages named as not `
  + 'operated).',
);
