import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Welche Seiten eine Person wirklich bedient - einmal abgeleitet, zweimal
 * gelesen.
 *
 * Drei Pruefer stellen Fragen ueber dieselben Flaechen: ob jedes Bedienelement
 * sagt, was es ist (`check-form-labels.mjs`), ob jeder Name, den eine Flaeche
 * traegt, eine Regel hat (`check-style-names.mjs`), und ob eine Antwort auch
 * den erreicht, der sie nicht sieht (`check-answer-reach.mjs`). Alle drei
 * brauchen dieselbe Menge, und alle drei brauchen dieselbe Begruendung, warum
 * zwei Seiten nicht dazugehoeren. Zweimal geschrieben driftet sie: der eine Pruefer
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

/**
 * Jede verfolgte HTML-Datei, die niemand als unbedient begruendet hat.
 *
 * **Und die Gegenrichtung, weil sie sonst fehlt** (Befund B119). Diese Liste
 * sagte bis heute nur, welche Seite uebersprungen werden *darf*. Gepflanzt -
 * eine der beiden Seiten geloescht, die Begruendung stehen gelassen - blieben
 * alle drei Pruefer gruen und meldeten weiter *"2 pages named as not
 * operated"*, was dann nicht mehr stimmte.
 *
 * Es ist die vierte Ausnahmeliste an diesem Wochenende mit derselben
 * Asymmetrie (B106, B115, B118) und die erste, die ich selbst geschrieben
 * habe. Sie wirft statt zu melden, wie der Ausblender in B109: was eine
 * Ableitung braucht, prueft sie selbst, und dann kann kein Leser es
 * vergessen.
 */
export function picoOperatedSurfaces() {
  const tracked = execSync('git ls-files "*.html"', { cwd: picoRepoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== '' && !line.includes('node_modules'));
  for (const [path, reason] of picoUnoperatedSurfaces) {
    if (!tracked.includes(path)) {
      throw new Error(
        `pico_unoperated_surface_is_gone: ${path} is argued as not operated (${reason}) and the `
        + 'repository has no such page. A reason for something that is gone outlives what it '
        + 'explained.',
      );
    }
  }
  return tracked.filter((line) => !picoUnoperatedSurfaces.has(line));
}

/**
 * Wer auf eine Flaeche zeichnet: die verfolgten `.ts` unter derselben
 * Anwendungswurzel - der naechsten Elternschaft mit einer `package.json`.
 * Abgeleitet und nicht gelistet, damit eine neue Datei im selben Verzeichnis
 * von selbst mitgeprueft wird.
 */
export function picoSurfaceRenderers(surface, tracked) {
  let directory = dirname(surface);
  let root = null;
  while (directory !== '.' && directory !== '') {
    if (existsSync(join(picoRepoRoot, directory, 'package.json'))) {
      root = directory;
      break;
    }
    directory = dirname(directory);
  }
  if (root === null) {
    return [];
  }
  return [...tracked].filter((path) => path.startsWith(`${root}/`)
    && path.endsWith('.ts')
    && !path.endsWith('.d.ts'));
}

/** Jeder verfolgte Pfad, einmal gelesen. */
export function picoTrackedPaths() {
  return new Set(
    execSync('git ls-files', { cwd: picoRepoRoot, encoding: 'utf8' })
      .split('\n')
      .filter((line) => line !== ''),
  );
}

/**
 * Welcher Name im Zeichner welche Kennung der Seite haelt.
 *
 * `const depotStatus = requireElement('depot-status')` und
 * `contentReadForm: requireElement(document, 'content-read-form', ...)` sind
 * dieselbe Aussage in zwei Schreibweisen, weil die beiden Flaechen
 * verschieden gebaut sind - das Fenster holt seine Elemente einzeln, das
 * Dashboard sammelt sie in einem Objekt. Beide Formen stehen hier einmal,
 * damit nicht jeder Pruefer sie neu erraet und einer davon eine Flaeche
 * uebersieht.
 */
export function picoElementNames(sources) {
  const names = new Map();
  for (const source of sources) {
    for (const [, variable, id] of source.matchAll(
      /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*requireElement\((?:document,\s*)?'([^']+)'/gu,
    )) {
      names.set(variable, id);
    }
    for (const [, variable, id] of source.matchAll(
      /([A-Za-z_$][\w$]*)\s*:\s*requireElement\((?:document,\s*)?'([^']+)'/gu,
    )) {
      names.set(variable, id);
    }
  }
  return names;
}
