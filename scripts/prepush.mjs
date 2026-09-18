import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';

/**
 * Was vor einem Push zu laufen hat, hier statt auf fremden Läufern.
 *
 * **Der Anlass** (Nutzerentscheidung vom 2026-09-18). Vorher löste jeder Push
 * auf `main` sieben bezahlte Jobs aus - die Torkette, vier Suitenläufe und zwei
 * Container-Rauchtests -, und dasselbe noch einmal bei jedem Pull Request. Auf
 * einem privaten Repository zieht das ein Kontingent, das an anderer Stelle
 * fehlt. Der Ablauf läuft jetzt auf Knopfdruck und bei einem Release-Tag; was
 * er sonst geprüft hätte, prüft dieser Befehl.
 *
 * **Es ist wörtlich dieselbe Kette.** `release:verify` ist
 * `verify:gates && verify:passes`, und `verify:passes` ist
 * `test && clock:check && display-zone:check`. Hier stehen die vier Schritte
 * einzeln, aus einem gemessenen Grund, nicht aus Geschmack.
 *
 * **Warum einzeln: der volle Lauf passt auf dieser Maschine nicht in einen
 * Zug.** Am 2026-09-18 wurde er zweimal vom Speichermangel abgeschossen, neben
 * einer laufenden IDE. Die Pakete laufen zwar schon einzeln
 * (`--workspace-concurrency=1`), aber vitest startet je Paket bis zu einen
 * Arbeiter pro Kern.
 *
 * **Warum der eine Wiederholungsversuch:** `clock:check` unmittelbar nach den
 * Suiten fiel am 2026-09-18 zweimal im ersten Anlauf und lief im zweiten
 * unverändert durch - beim dritten Mal, im ersten Lauf dieses Skripts, fiel es
 * gar nicht. **Zwei von drei, also wackelig und nicht deterministisch**; die
 * erste Fassung dieses Satzes sagte "zweimal von zwei" und war eine Runde zu
 * früh verallgemeinert.
 *
 * Die Ursache kenne ich nicht, und drei Erklärungen sind widerlegt: nicht
 * `shift-clock.mjs` (53 Zeilen, leitet nur `Date` ab), nicht der freie
 * Arbeitsspeicher und nicht der Swap-Stand - beim Abbruch und beim Erfolg
 * standen dieselben Zahlen.
 *
 * Für ein wackeliges Scheitern ist *ein* Versuch mehr die richtige Antwort,
 * und er wird laut angekündigt: ein stiller Wiederholungsversuch verwandelt
 * einen echten Fehlschlag in Rauschen. Er kostet nur Zeit, wenn ohnehin etwas
 * gefallen ist.
 */
const STEPS = [
  { script: 'verify:gates', title: 'Die Torkette' },
  { script: 'test', title: 'Die Testsuiten' },
  { script: 'clock:check', title: 'Suiten unter verschobener Uhr', retryOnce: true },
  { script: 'display-zone:check', title: 'Suiten in fremder Zeitzone' },
];

function run(script) {
  const started = Date.now();
  const result = spawnSync('pnpm', ['run', script], { stdio: 'inherit' });
  return { ok: result.status === 0, status: result.status, seconds: Math.round((Date.now() - started) / 1000) };
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const dirty = git(['status', '--porcelain']);
if (dirty !== '') {
  process.stdout.write(
    '\nDer Arbeitsbaum ist nicht sauber. Was hier läuft, prüft den Stand auf der\n'
    + 'Platte - und der geht so nicht in den Push. Erst committen, dann prüfen:\n\n'
    + `${dirty}\n\n`,
  );
  process.exit(1);
}

const outcomes = [];
for (const step of STEPS) {
  process.stdout.write(`\n── ${step.title} (${step.script})\n`);
  let outcome = run(step.script);
  if (!outcome.ok && step.retryOnce === true) {
    process.stdout.write(
      `\n${step.script} ist mit ${outcome.status} gefallen. Ein Versuch mehr, und\n`
      + 'zwar ein einziger: dieser Schritt fiel auf dieser Maschine an zwei von drei\n'
      + 'Tagen im ersten Anlauf und lief im zweiten unverändert durch - wackelig\n'
      + 'also, nicht sicher. Faellt er auch jetzt, ist es keine Speicherlage,\n'
      + 'sondern ein Fund.\n',
    );
    outcome = run(step.script);
    outcome.retried = true;
  }
  outcomes.push({ ...step, ...outcome });
  if (!outcome.ok) {
    break;
  }
}

const failed = outcomes.find((outcome) => !outcome.ok);
process.stdout.write('\n── Stand\n');
for (const outcome of outcomes) {
  const mark = outcome.ok ? 'gruen' : `GEFALLEN (${outcome.status})`;
  const again = outcome.retried === true ? ', im zweiten Anlauf' : '';
  process.stdout.write(`  ${outcome.script.padEnd(20)} ${mark}${again}  ${outcome.seconds}s\n`);
}
for (const step of STEPS.slice(outcomes.length)) {
  process.stdout.write(`  ${step.script.padEnd(20)} nicht gefahren\n`);
}

if (failed !== undefined) {
  process.stdout.write(
    `\nNicht pushen. ${failed.script} steht offen.\n`,
  );
  process.exit(1);
}

const ahead = git(['rev-list', '--count', 'origin/main..HEAD']);
process.stdout.write(
  `\nAlle vier Schritte gruen. ${ahead === '' ? 'Unbekannt viele' : ahead} Commit(s) vor origin/main.\n`
  + 'Das ist dieselbe Kette, die der Ablauf auf GitHub fuhr; was dort zusaetzlich\n'
  + 'laeuft, sind die beiden Container-Rauchtests und das Client-Paket, und die\n'
  + 'holt der Tag-Ausloeser beim Release nach.\n',
);
