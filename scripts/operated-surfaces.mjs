import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Welche Seiten eine Person wirklich bedient - einmal abgeleitet, zweimal
 * gelesen.
 *
 * Zwei Pruefer stellen Fragen ueber dieselben Flaechen: ob jedes Bedienelement
 * sagt, was es ist (`check-form-labels.mjs`), und ob jeder Name, den eine
 * Flaeche traegt, eine Regel hat (`check-style-names.mjs`). Beide brauchen
 * dieselbe Menge, und beide brauchen dieselbe Begruendung, warum zwei Seiten
 * nicht dazugehoeren. Zweimal geschrieben driftet sie: der eine Pruefer
 * bekommt eine dritte Ausnahme, der andere nicht, und danach messen sie
 * verschiedene Dinge und melden beide gruen.
 *
 * Die Menge ist abgeleitet und nicht gelistet: jede verfolgte HTML-Datei
 * ausser den beiden hier, die niemand bedient - beide mit Grund benannt statt
 * stillschweigend uebersprungen.
 */
export const picoUnoperatedSurfaces = new Map([
  ['docs/design-system/08_Starter_Kit/demo.html',
    'eine Demo des importierten Designsystems - sie zeigt Bausteine und nimmt keine Entscheidung entgegen'],
  ['tools/character-modeling/demo-viewer/viewer-template.html',
    'eine Vorlage eines Entwicklungswerkzeugs; niemand benutzt Pico damit'],
]);

export const picoRepoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Jede verfolgte HTML-Datei, die niemand als unbedient begruendet hat. */
export function picoOperatedSurfaces() {
  return execSync('git ls-files "*.html"', { cwd: picoRepoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== '' && !line.includes('node_modules'))
    .filter((line) => !picoUnoperatedSurfaces.has(line));
}
