import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Der Electron-Unterbau, gegen das, was oben tatsächlich unterstützt wird.
 *
 * Drei Dinge werden erzwungen: der gepinnte Runtime **ist** die überprüfte
 * neueste stabile Fassung (Gleichheit, nicht "innerhalb des Fensters"), die
 * drei unterstützten Hauptversionen sind drei und enthalten die gepinnte, und
 * die Daten in der Beleg-Datei widersprechen sich nicht.
 *
 * **Was er nicht kann, und das ist die wichtigere Hälfte.** Er erreicht kein
 * Netz - `check-time-authority.mjs` verbietet genau das für jede
 * Korrektheitsquelle in diesem Baum -, also weiß er nicht, wann Electron
 * wirklich veröffentlicht. Die Zwangsfunktion ist deshalb `recheckBefore`, ein
 * Datum, das die Datei **über sich selbst** behauptet. Wer es nach vorn
 * schiebt, bekommt eine grüne Zeile, während der Pin veraltet - der Prüfer
 * merkt es erst, wenn jemand `latestStableVersion` mitzieht.
 *
 * Das ist kein Versehen, sondern der Preis dafür, dass eine Prüfung offline
 * dasselbe sagt wie online. Es steht hier, damit die grüne Zeile als das
 * gelesen wird, was sie ist: ein Versprechen mit einem Datum daran, nicht eine
 * Messung an der Wirklichkeit.
 *
 * Am 2026-08-22 widerlegt: Frist auf heute gestellt, und der Prüfer meldet
 * "expired before 2026-08-22". Frist auf den Tag nach dem Release gestellt,
 * und er meldet grün - genau die Lücke, die der Absatz oben benennt.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const shellRoot = join(repoRoot, 'apps', 'companion-shell');
const packageJson = JSON.parse(readFileSync(join(shellRoot, 'package.json'), 'utf8'));
const support = JSON.parse(readFileSync(join(shellRoot, 'electron-support.json'), 'utf8'));
const errors = [];

if (support.schema !== 'pico.electron-support.v1') {
  errors.push('Electron support evidence has an unknown schema.');
}
if (support.policy !== 'latest-three-stable-major-versions') {
  errors.push('Electron support evidence must follow the upstream latest-three-major policy.');
}
if (packageJson.devDependencies?.electron !== support.latestStableVersion) {
  errors.push('The pinned Electron runtime must equal the reviewed latest stable version.');
}

const pinnedMajor = Number(String(packageJson.devDependencies?.electron).split('.')[0]);
if (!Array.isArray(support.supportedMajorVersions)
  || support.supportedMajorVersions.length !== 3
  || !support.supportedMajorVersions.includes(pinnedMajor)) {
  errors.push('The pinned Electron major must be inside the three reviewed supported majors.');
}
if (new Set(support.supportedMajorVersions).size !== 3
  || support.supportedMajorVersions.some((major, index, majors) => (
    index > 0 && major !== majors[index - 1] + 1
  ))) {
  errors.push('Electron supported majors must be three unique consecutive ascending versions.');
}

const today = new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(support.checkedAt)
  || !/^\d{4}-\d{2}-\d{2}$/.test(support.recheckBefore)
  || support.checkedAt > today) {
  errors.push('Electron support evidence dates are invalid.');
}
if (today >= support.recheckBefore) {
  errors.push(
    `Electron support evidence expired before ${support.recheckBefore}; `
      + 'refresh it from the recorded upstream sources before release.',
  );
}
if (support.nextStableDate !== support.recheckBefore) {
  errors.push('Electron support evidence must expire when the next stable major is scheduled.');
}
if (!Array.isArray(support.sources)
  || support.sources.length < 2
  || support.sources.some((source) => !source.startsWith('https://'))) {
  errors.push('Electron support evidence must retain its official HTTPS sources.');
}

if (errors.length > 0) {
  console.error('Electron support check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Electron support check passed (${support.latestStableVersion}, `
    + `reviewed ${support.checkedAt}, recheck before ${support.recheckBefore}).`,
);
