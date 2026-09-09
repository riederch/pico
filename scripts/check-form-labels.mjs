import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  picoOperatedSurfaces,
  picoRepoRoot,
  picoUnoperatedSurfaces,
} from './operated-surfaces.mjs';

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
 * **Die Flaechen sind abgeleitet und nicht gelistet**, und die Ableitung
 * wohnt seit Befund B103 in `operated-surfaces.mjs`, weil ein zweiter Pruefer
 * dieselbe Menge braucht: jede verfolgte HTML-Datei ausser den beiden, die
 * niemand bedient, beide dort mit Grund genannt statt stillschweigend
 * uebersprungen.
 *
 * **Und dort, wo die Bedienelemente wirklich herkommen** (Befund B102). Der
 * Kopf oben sagte, ein sechzehntes Feld ohne Beschriftung falle niemandem
 * auf. Das sechzehnte Feld gab es schon: fast die Haelfte aller Knoepfe und
 * das einzige freie Eingabefeld des Fensters entstehen nicht in der
 * HTML-Datei, sondern zur Laufzeit im TypeScript daneben - und genau dort war
 * die Beschriftung nicht verbunden. Ein Pruefer, der nur die Datei liest,
 * liest die kleinere Haelfte.
 *
 * Der zweite Teil liest deshalb jede verfolgte `.ts`, die ein Bedienelement
 * erzeugt. Auch diese Menge ist abgeleitet und nicht gelistet: es sind genau
 * die drei Zeichner, kein Test darunter, keine Ausnahme noetig.
 *
 * **Wie weit er schaut, und was das kostet.** Der Name eines erzeugten
 * Elements wird im selben Abschnitt gesetzt - hoechstens 25 Zeilen ab der
 * Erzeugung, und nicht ueber die naechste Erzeugung desselben Namens hinaus,
 * damit nicht der Name des uebernaechsten Knopfes den vorigen entlastet. Wer
 * ihn weiter weg setzt, bekommt einen Fehlalarm. Das ist die richtige
 * Richtung zu irren: laut statt still.
 */
const repoRoot = picoRepoRoot;
const errors = [];

const controlPattern = /<(input|select|textarea)\b[^>]*>/giu;
const labelForPattern = /<label[^>]*\bfor="([^"]+)"/giu;
const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/giu;

const tracked = picoOperatedSurfaces();

let surfaces = 0;
let controls = 0;
let buttons = 0;
let buttonsSeen = 0;
for (const path of tracked) {
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

/**
 * Zweiter Teil: dieselbe Frage, wo die Bedienelemente entstehen.
 *
 * Ein Element ist benannt, wenn es (a) selbst einen Namen bekommt -
 * `textContent`, `ariaLabel`, `title`, `setAttribute('aria-label')` -, (b) in
 * eine Beschriftung mit Text gehaengt wird, oder (c) eine Kennung bekommt,
 * auf die ein `htmlFor` zeigt. Drei Arten, dasselbe zu erreichen; keine davon
 * ist besser als die andere, und alle drei stehen hier, damit niemand die
 * Regel fuer eine Vorschrift zur Bauweise haelt.
 */
const creationPattern =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[\w.]+\.)?document\.createElement\(\s*'(button|input|select|textarea|label)'\s*\)/gu;

const renderers = execSync('git ls-files "apps/**/*.ts" "packages/**/*.ts" "tools/**/*.ts"', {
  cwd: repoRoot,
  encoding: 'utf8',
}).split('\n').filter((line) => line !== '');

let drawingSources = 0;
let codeControls = 0;
let codeButtons = 0;
for (const path of renderers) {
  const source = readFileSync(join(repoRoot, path), 'utf8');
  const sites = [...source.matchAll(creationPattern)].map((match) => ({
    name: match[1],
    tag: match[2],
    index: match.index,
    line: source.slice(0, match.index).split('\n').length,
  }));
  if (sites.length === 0) {
    continue;
  }
  drawingSources += 1;
  const lines = source.split('\n');
  const spanOf = (site) => {
    const next = sites.find((other) => other.index > site.index && other.name === site.name);
    const end = Math.min(site.line + 25, next === undefined ? lines.length : next.line - 1);
    return lines.slice(site.line - 1, end).join('\n');
  };
  const withText = new Set(
    sites
      .filter((site) => site.tag === 'label')
      .filter((site) => new RegExp(`\\b${site.name}\\s*\\.\\s*textContent\\s*=`, 'u').test(spanOf(site)))
      .map((site) => site.name),
  );
  for (const site of sites) {
    if (site.tag === 'label') {
      continue;
    }
    codeControls += 1;
    if (site.tag === 'button') {
      codeButtons += 1;
    }
    const span = spanOf(site);
    const named = new RegExp(
      `\\b${site.name}\\s*\\.\\s*(?:textContent|ariaLabel|title)\\s*=`
      + `|\\b${site.name}\\s*\\.\\s*setAttribute\\(\\s*'aria-label'`,
      'u',
    ).test(span);
    const nested = [...withText].some((label) => new RegExp(
      `\\b${label}\\s*\\.\\s*append\\([^)]*\\b${site.name}\\b`,
      'u',
    ).test(span));
    const joined = new RegExp(`\\b${site.name}\\s*\\.\\s*id\\s*=`, 'u').test(span)
      && /\.\s*htmlFor\s*=/u.test(span);
    if (named || nested || joined) {
      continue;
    }
    errors.push(
      `${path}:${site.line}: the <${site.tag}> built as \`${site.name}\` never gets a name - `
      + 'no text, no `aria-label`, and not inside a label. A control a person operates '
      + 'in the window is read as nothing, and the text beside it does not focus it.',
    );
  }
}

if (surfaces === 0 || controls === 0 || drawingSources === 0 || codeControls === 0) {
  console.error(
    'Form-label check failed: no operated surface, no control in one, or no control '
    + 'built in code was read, so this check passed over nothing.',
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
  + `what they are; ${picoUnoperatedSurfaces.size} pages named as not operated; `
  + `${codeControls} further controls built in ${drawingSources} renderers `
  + `(${codeButtons} of them buttons), each named where it is built).`,
);
