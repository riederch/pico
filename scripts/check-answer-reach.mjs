import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  picoElementNames,
  picoOperatedSurfaces,
  picoRepoRoot,
  picoSurfaceRenderers,
  picoTrackedPaths,
  picoUnoperatedSurfaces,
} from './operated-surfaces.mjs';

/**
 * Eine Antwort erreicht auch den, der sie nicht sieht.
 *
 * **Der Anlass** (2026-09-09, Befund B104). ADR 0118 O4 sagt: was eine Person
 * drueckt, antwortet immer. Das Fenster haelt das - sichtbar. Elf seiner
 * dreizehn Antwortfaecher standen ausserhalb jedes lebendigen Bereichs, also
 * wurde die Antwort *hingeschrieben* und nie *gesagt*. Wer die Seite nicht
 * sieht, drueckt und hoert nichts: nicht "das ist entfernt", nicht "das wurde
 * nicht angenommen", nicht "das dauert mehrere Minuten".
 *
 * **Es ist keine unbekannte Regel.** Dasselbe Produkt macht es auf der anderen
 * Flaeche vollstaendig richtig: jedes Antwortfach des Dashboards traegt
 * `role="status" aria-live="polite"`. Dieselbe Wahrheit, an zwei Orten
 * geschrieben, ist an einem abgefallen - und nichts hat es bemerkt, weil ein
 * fehlender lebendiger Bereich nichts kaputt macht. Er macht nur still.
 *
 * **Was ein Antwortfach ist, ist abgeleitet und nicht geraten.** Drei
 * Merkmale, die beide Flaechen selbst tragen: die Kennung endet auf
 * `-status`, das Element ist in der HTML-Datei **leer** (es haelt keinen
 * Inhalt, es wartet auf eine Nachricht), und ein Zeichner schreibt Text
 * hinein. Drei Unterscheidungen sind vorher gemessen und verworfen worden,
 * weil sie an einer der beiden Flaechen falsch lagen: die Kennung allein
 * (das Dashboard hat drei `-status`, die Werte zeigen statt Antworten), Prosa
 * gegen Zahl (blind, sobald eine Hilfsfunktion schreibt) und "steht in einem
 * Druck-Zuhoerer" (blind gegen das Ansichtsobjekt des Dashboards, das den
 * Druck nur weiterreicht).
 *
 * **Was hier nicht geprueft wird**: ob `polite` oder `assertive` richtig ist,
 * und ob der Satz gut ist. Das sind Urteile. Hier steht, dass eine Antwort
 * ueberhaupt eine Chance hat, anzukommen.
 */
const errors = [];
const tracked = picoTrackedPaths();
const voidElements = new Set([
  'input', 'br', 'hr', 'img', 'meta', 'link', 'source', 'track', 'area',
  'base', 'col', 'embed', 'param', 'wbr',
]);

/**
 * Jede Kennung einer Seite mit zwei Tatsachen: ist sie leer, und liegt sie in
 * einem lebendigen Bereich - sie selbst oder ein Vorfahr. Der Vorfahr zaehlt,
 * weil `aria-live` erbt; ohne ihn meldete dieser Pruefer die vier Faecher des
 * obersten Statusblocks als stumm, die in einem `aria-live="assertive"` sitzen.
 */
function readSurface(html) {
  const elements = new Map();
  const stack = [];
  const pattern = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/gu;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const [whole, closing, tag, attributes, selfClosing] = match;
    const name = tag.toLowerCase();
    if (closing === '/') {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag !== name) {
          continue;
        }
        const frame = stack[i];
        if (frame.id !== undefined) {
          elements.set(frame.id, {
            live: frame.liveHere || frame.liveAbove,
            empty: html.slice(frame.opensAt, match.index).trim() === '',
          });
        }
        stack.length = i;
        break;
      }
      continue;
    }
    const liveHere = /aria-live=|role="(?:status|alert|log)"/u.test(attributes);
    const liveAbove = stack.some((frame) => frame.liveHere || frame.liveAbove);
    const id = /\bid="([^"]+)"/u.exec(attributes)?.[1];
    if (selfClosing === '/' || voidElements.has(name)) {
      if (id !== undefined) {
        elements.set(id, { live: liveHere || liveAbove, empty: true });
      }
      continue;
    }
    stack.push({
      tag: name, id, liveHere, liveAbove, opensAt: match.index + whole.length,
    });
  }
  return elements;
}

let surfaces = 0;
let slots = 0;
let announced = 0;
for (const surface of picoOperatedSurfaces()) {
  const html = readFileSync(join(picoRepoRoot, surface), 'utf8');
  const elements = readSurface(html);
  const sources = picoSurfaceRenderers(surface, tracked)
    .filter((path) => !path.includes('.test.'));
  if (sources.length === 0) {
    continue;
  }
  surfaces += 1;

  const written = new Set();
  const read = sources.map((path) => readFileSync(join(picoRepoRoot, path), 'utf8'));
  const named = picoElementNames(read);
  for (const source of read) {
    for (const [, variable] of source.matchAll(
      /(?:\b|\.)([A-Za-z_$][\w$]*)\s*\.\s*textContent\s*=/gu,
    )) {
      const id = named.get(variable);
      if (id !== undefined) {
        written.add(id);
      }
    }
  }

  for (const id of written) {
    const element = elements.get(id);
    if (element === undefined || !element.empty || !id.endsWith('-status')) {
      continue;
    }
    slots += 1;
    if (element.live) {
      announced += 1;
      continue;
    }
    errors.push(
      `${surface}: \`${id}\` is an empty slot a renderer writes an answer into, and it `
      + 'sits in no live region. The answer is written and never said - somebody who '
      + 'does not see the page presses and hears nothing. Give it '
      + '`role="status" aria-live="polite"`, as the other surface does.',
    );
  }
}

if (surfaces === 0 || slots === 0) {
  console.error(
    'Answer-reach check failed: no operated surface or no answer slot was read, so '
    + 'this check passed over nothing.',
  );
  process.exit(1);
}

if (errors.length > 0) {
  console.error('Answer-reach check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Answer-reach check passed (${surfaces} operated surfaces, ${slots} slots a renderer `
  + `writes an answer into, ${announced} of them inside a live region; `
  + `${picoUnoperatedSurfaces.size} pages named as not operated).`,
);
