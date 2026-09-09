import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Jedes Bedienelement, das eine Person vor sich hat, sagt was es ist.
 *
 * **Der Anlass ist ein sauberer Befund** (2026-09-09, B100). Beide Flaechen,
 * die eine Person wirklich benutzt, sind makellos: das Fenster hat fuenfzehn
 * Bedienelemente und fuenfzehn verbundene Beschriftungen, das Dashboard
 * siebenundzwanzig und siebenundzwanzig. Gehalten hat das nichts -
 * `check-companion-boundary.mjs` zaehlt, dass die Elemente *da* sind, nicht
 * dass sie beschriftet sind, und ein sechzehntes Feld ohne `<label>` faellt
 * niemandem auf.
 *
 * **Warum das kein Schoenheitsfehler ist.** Ein Eingabefeld ohne verbundene
 * Beschriftung ist fuer einen Screenreader namenlos, und der Klick auf den
 * Text daneben setzt den Fokus nicht. Ein Produkt, dessen ganze These „ein
 * Begleiter fuer eine Person" ist, kann sich das an genau den zwei Stellen
 * nicht leisten, an denen die Person etwas entscheidet.
 *
 * **Was hier nicht geprueft wird**, damit niemand mehr hineinliest: ob die
 * Beschriftung *gut* ist, ob die Reihenfolge stimmt, ob Kontrast und
 * Fokusrahmen reichen. Das sind Urteile. Dies ist die Syntax darunter: ein
 * Bedienelement, eine Kennung, eine Beschriftung, die auf sie zeigt - oder ein
 * `aria-label`, wenn keine sichtbare Beschriftung hingehoert.
 *
 * **Die Flaechen sind abgeleitet und nicht gelistet.** Jede verfolgte
 * HTML-Datei ausser den beiden, die niemand bedient: eine Demo des
 * Designsystems und eine Vorlage eines Werkzeugs, beide hier mit Grund
 * genannt statt stillschweigend uebersprungen.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const notOperated = new Map([
  ['docs/design-system/08_Starter_Kit/demo.html',
    'eine Demo des importierten Designsystems - sie zeigt Bausteine und nimmt keine Entscheidung entgegen'],
  ['tools/character-modeling/demo-viewer/viewer-template.html',
    'eine Vorlage eines Entwicklungswerkzeugs; niemand benutzt Pico damit'],
]);

const controlPattern = /<(input|select|textarea)\b[^>]*>/giu;
const labelForPattern = /<label[^>]*\bfor="([^"]+)"/giu;
const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/giu;

const tracked = execSync('git ls-files "*.html"', { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line !== '' && !line.includes('node_modules'));

let surfaces = 0;
let controls = 0;
let buttons = 0;
let buttonsSeen = 0;
for (const path of tracked) {
  if (notOperated.has(path)) {
    continue;
  }
  surfaces += 1;
  const html = readFileSync(join(repoRoot, path), 'utf8');
  /**
   * Drei weitere Fragen derselben Art (Befund B101), und alle drei waren beim
   * Messen schon beantwortet: 42 Knoepfe, keiner namenlos; beide Flaechen mit
   * `lang` und `<title>`. Sie stehen hier, weil ein Knopf, der nur ein Symbol
   * traegt, fuer einen Screenreader nichts ist, und weil eine Seite ohne
   * `lang` in der falschen Sprache vorgelesen wird - Deutsch als Englisch
   * gesprochen ist nicht schwer zu verstehen, sondern gar nicht.
   */
  if (!/<html[^>]*\blang="[^"]+"/u.test(html)) {
    errors.push(
      `${path}: the page declares no \`lang\`. A screen reader then reads it in `
      + 'whatever language it happens to be set to, and the wrong one is not hard to '
      + 'follow - it is not language at all.',
    );
  }
  if (!/<title>[^<]*\S[^<]*<\/title>/u.test(html)) {
    errors.push(
      `${path}: the page has no non-empty \`<title>\`. It is the first thing said `
      + 'about a window and the only thing a tab shows.',
    );
  }
  for (const [element, attributes, inner] of html.matchAll(buttonPattern)) {
    const text = inner.replace(/<[^>]+>/gu, '').trim();
    if (text !== '' || /aria-label|aria-labelledby/u.test(attributes)) {
      continue;
    }
    buttons += 1;
    errors.push(
      `${path}: ${element.slice(0, 60).replace(/\s+/gu, ' ')} carries no text and no `
      + '`aria-label`. A button that shows only a symbol has a name for whoever sees '
      + 'it and none for whoever does not.',
    );
  }
  for (const [] of html.matchAll(buttonPattern)) {
    buttonsSeen += 1;
  }

  const labelled = new Set([...html.matchAll(labelForPattern)].map(([, id]) => id));
  for (const [element] of html.matchAll(controlPattern)) {
    const type = /\btype="([^"]+)"/u.exec(element)?.[1];
    if (type === 'hidden') {
      continue;
    }
    controls += 1;
    const id = /\bid="([^"]+)"/u.exec(element)?.[1];
    if (element.includes('aria-label')) {
      continue;
    }
    if (id === undefined) {
      errors.push(
        `${path}: ${element.slice(0, 60)} has no id, so no label can point at it. `
        + 'A control a person operates says what it is, or a screen reader reads it '
        + 'as nothing.',
      );
      continue;
    }
    if (!labelled.has(id)) {
      errors.push(
        `${path}: the control \`${id}\` has no \`<label for="${id}">\` and no `
        + '`aria-label`. Clicking the text beside it will not focus it, and a screen '
        + 'reader has no name to read.',
      );
    }
  }
}

if (surfaces === 0 || controls === 0) {
  console.error(
    'Form-label check failed: no operated surface or no control was read, so this '
    + 'check passed over nothing.',
  );
  process.exit(1);
}

if (errors.length > 0) {
  console.error('Form-label check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Form-label check passed (${surfaces} operated surfaces, ${controls} controls, `
  + `each with a label that points at it, and ${buttonsSeen} buttons that each say `
  + `what they are; ${notOperated.size} pages named as not operated).`,
);
