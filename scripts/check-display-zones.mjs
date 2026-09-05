import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Derselbe Tag, egal wo jemand steht.
 *
 * `when-display.ts` entscheidet, wie Pico einer Person *wann* sagt: der
 * Kalendertag der Leserin, aus ECMA-262-Kern gelesen, ohne ICU. Der Grund
 * steht dort ausführlich - ein ISO-Zeitpunkt auf zehn Zeichen gekürzt ist das
 * UTC-Datum ohne Etikett, und für jemanden auf Kiritimati ist dieselbe Zeile
 * anderthalb Tage daneben.
 *
 * **Was diese Prüfung hinzufügt.** Dass die Regel *benutzt* wird, hält
 * `check-runtime-floor.mjs` fest: `Intl` und `toLocaleDateString` sind in
 * `@pico/protocol` verboten, also gibt es keinen zweiten Weg. Was niemand
 * hielt, ist die andere Hälfte: ein **Test**, der den erwarteten Tag von Hand
 * hinschreibt, baut die Regel nach statt sie anzuwenden - und prüft dann seine
 * eigene Nachbildung. Am 2026-08-27 gab es davon drei, alle grün in Wien:
 * zwei in `contract.test.ts` (`'It can act as you until 2027-01-01.'`) und
 * eine, die an diesem Tag frisch dazugekommen war.
 *
 * **Zwei Zonen, weil eine ein einziger Versatz ist.** Ein Zeitpunkt um 00:00Z
 * liegt in UTC+14 am selben Kalendertag und in UTC-11 am Tag davor; um 10:00Z
 * ist es andersherum. Wer nur eine Richtung prüft, prüft die halbe Sorte.
 * Kiritimati (+14) und Niue (-11) sind die beiden Enden.
 *
 * **Und nur, wo ein Tag gezeigt wird.** Die Paketliste wird hier *abgeleitet*
 * und nicht getippt: wer `when-display` nennt oder `Intl.DateTimeFormat`
 * benutzt, zeigt einer Person einen Tag und wird gefahren. Am 2026-08-27 sind
 * das fünf; `apps/core` ist keines davon - das Home zeigt niemandem etwas, die
 * Zeilen gehen durch einen Client. Die ganze Testmenge zweimal mehr zu fahren
 * hieße, für eine Aussage über fünf Pakete bei siebzehn zu bezahlen.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/**
 * **Die beiden Enden, und warum eine Zone auf der Kommandozeile stehen darf.**
 *
 * Ohne Argument werden beide gefahren - das ist die Aussage, und sie bleibt die
 * Vorgabe fuer jede Hand und fuer `release:verify`. Mit Argument faehrt dieser
 * Lauf genau die genannte Zone: CI stellt die beiden seit dem 2026-09-05
 * nebeneinander auf zwei Laeufer, weil sie voneinander nichts wissen (Befund
 * B67). Ein Lauf mit *einer* Zone sagt das auch in seiner Schlusszeile, damit
 * ein halber Lauf nicht wie ein ganzer aussieht.
 */
const bothEnds = ['Pacific/Kiritimati', 'Pacific/Niue'];
const asked = process.argv.slice(2);
const unknown = asked.filter((zone) => !bothEnds.includes(zone));
if (unknown.length > 0) {
  console.error(
    `Display-zone check refuses ${unknown.join(', ')}: this check exists for the two ends of `
    + `the day (${bothEnds.join(' and ')}). A third zone would be a different question, and `
    + 'one that no test here answers.',
  );
  process.exit(1);
}
const zones = asked.length === 0 ? bothEnds : asked;
const marks = /when-display|picoDisplayDate|picoDisplayInstant|Intl\.DateTimeFormat/u;

/** Jedes Arbeitspaket mit einem `src`, und der Name, unter dem pnpm es kennt. */
function workspacePackages() {
  const found = [];
  for (const group of ['apps', 'packages']) {
    const groupRoot = join(repoRoot, group);
    for (const entry of readdirSync(groupRoot)) {
      const manifestPath = join(groupRoot, entry, 'package.json');
      const sourceRoot = join(groupRoot, entry, 'src');
      try {
        if (!statSync(sourceRoot).isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.scripts?.test === undefined) {
        continue;
      }
      found.push({ name: manifest.name, sourceRoot });
    }
  }
  return found;
}

/** Rekursiv, weil `src` Unterverzeichnisse hat und ein Tag überall stehen kann. */
function showsADay(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (showsADay(path)) {
        return true;
      }
      continue;
    }
    if (entry.name.endsWith('.ts') && marks.test(readFileSync(path, 'utf8'))) {
      return true;
    }
  }
  return false;
}

const showing = workspacePackages().filter((entry) => showsADay(entry.sourceRoot));
const errors = [];

if (showing.length === 0) {
  errors.push(
    'scripts/check-display-zones.mjs found no package that shows a person a day, so it ran '
    + 'nothing. A reader that finds no subject is broken, not clean.',
  );
}

for (const zone of zones) {
  for (const { name } of showing) {
    process.stdout.write(`  ${zone} ${name}\n`);
    try {
      execFileSync('npx', ['pnpm@9.0.0', '--filter', name, 'test'], {
        cwd: repoRoot,
        env: { ...process.env, TZ: zone },
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (failed) {
      errors.push(
        `${name} does not pass in ${zone}. A test that writes the expected day out by hand `
        + 'rebuilds `when-display.ts` instead of calling it, and then only agrees with it in '
        + `the zone the machine happens to be in.\n${String(failed.stderr ?? '').slice(-2_000)}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Display-zone check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  zones.length === bothEnds.length ? '' : `Only ${zones.join(', ')} was asked for, so this run `
    + `is one half of the check; the other end (${bothEnds.filter((zone) => !zones.includes(zone)).join(', ')}) `
    + 'is somebody else\'s run.',
);
console.log(
  `Display-zone check passed (${showing.length} packages show a person a day, each green in `
  + `${zones.join(' and ')}).`,
);
