import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
 * Zug.** Am 2026-09-18 wurde er zweimal abgebrochen, neben einer laufenden IDE.
 * Die Pakete laufen zwar schon einzeln (`--workspace-concurrency=1`), aber
 * vitest startet je Paket bis zu einen Arbeiter pro Kern.
 *
 * **Warum jeder Schritt einen Versuch mehr bekommt.** Bis zum 2026-09-19
 * wurden acht Läufe gefahren und vier abgebrochen. Vier Fassungen dieses
 * Kommentars haben die Zahl mitgeschleppt und dreimal eine Ursache behauptet,
 * die nicht stimmte. Am 2026-09-19 wurde sie gemessen, und keine der drei war
 * es (Befund B221):
 *
 * **Es war nie der Kernel.** `journalctl -k` über drei Tage: *null* Zeilen mit
 * `Out of memory` oder `oom-kill`. Der Linux-OOM-Killer hat auf dieser Maschine
 * nichts getötet. Was die Läufe beendet, ist die Aufsicht über die
 * Hintergrundaufgaben des Agenten, die bei knappem Speicher eingreift - und
 * deshalb passte auch keine Erklärung, die am Schritt hing: der letzte Abbruch
 * hinterließ **24 Byte** Ausgabe, er kam also, bevor der erste Schritt seine
 * Überschrift schreiben konnte.
 *
 * **Der Druck ist trotzdem echt, und woher er kommt, ist jetzt eine Zahl.**
 * Gemessen an den Suiten, mit einer Stichprobe alle zwei Sekunden:
 *
 *   ungebremst      17 vitest-Prozesse   3,3 GB   14,6 von 15,3 GB belegt   399 s
 *   auf vier        6 vitest-Prozesse    1,6 GB   14,0 GB belegt            396 s
 *
 * Die Hälfte des Speichers, und **dieselbe Zeit**. Die Aufteilung auf sechzehn
 * Arbeiter bringt hier nichts, weil `--workspace-concurrency=1` die Pakete
 * ohnehin nacheinander fährt und die meisten Pakete zu wenige Testdateien
 * haben, um sechzehn Arbeiter zu beschäftigen. Parallelität in der falschen
 * Richtung, bezahlt mit 1,7 GB.
 *
 * Deshalb setzt dieser Befehl die Grenze selbst, in der Umgebung der
 * Kindprozesse und nicht in siebzehn Paketen: wie viel von dieser Maschine ein
 * Prüflauf nehmen darf, ist eine Eigenschaft der Maschine und nicht der Pakete.
 * `package.json` bleibt unangetastet, weil ein fremder Läufer eine andere
 * Maschine ist.
 *
 * Für ein umgebungsbedingtes Scheitern ist *ein* Versuch mehr die richtige
 * Antwort, und er wird laut angekündigt: ein stiller Wiederholungsversuch
 * verwandelt einen echten Fehlschlag in Rauschen. Er kostet nur Zeit, wenn
 * ohnehin etwas gefallen ist.
 *
 * **Und warum es sich merkt, was schon grün war.** Der zweite Abbruch kam nach
 * zwanzig Minuten im letzten Schritt - und wenn der Aufrufer selbst getötet
 * wird, hilft kein Wiederholungsversuch im Skript, weil es den Versuch nicht
 * mehr erlebt. Ein Lauf, der dann von vorn anfinge, wäre auf dieser Maschine
 * unbenutzbar. Also wird je Commit festgehalten, welcher Schritt grün war, und
 * ein neuer Lauf überspringt ihn. Der Stand gilt **nur für genau diesen
 * Commit**: eine Änderung macht ihn wertlos, und das ist der ganze Punkt.
 * `pnpm prepush --fresh` fängt trotzdem von vorn an.
 */
const STEPS = [
  { script: 'verify:gates', title: 'Die Torkette' },
  { script: 'test', title: 'Die Testsuiten' },
  { script: 'clock:check', title: 'Suiten unter verschobener Uhr' },
  { script: 'display-zone:check', title: 'Suiten in fremder Zeitzone' },
];

/** Wo der Stand liegt: im Scratchpad, nicht im Baum - er ist kein Ergebnis. */
const STATE = join(tmpdir(), 'pico-prepush-state.json');

/**
 * Was ein Schritt an Arbeitern bekommen darf (B221). Beide Namenspaare, weil
 * vitest je nach Pool das eine oder das andere liest und ein Wert, den niemand
 * liest, still nichts tut.
 */
const workerLimits = {
  VITEST_MAX_FORKS: '4',
  VITEST_MIN_FORKS: '1',
  VITEST_MAX_THREADS: '4',
  VITEST_MIN_THREADS: '1',
};

function run(script) {
  const started = Date.now();
  const result = spawnSync('pnpm', ['run', script], {
    stdio: 'inherit',
    env: { ...process.env, ...workerLimits },
  });
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

const head = git(['rev-parse', 'HEAD']);
const fresh = process.argv.includes('--fresh');
let done = new Set();
if (!fresh && existsSync(STATE)) {
  try {
    const saved = JSON.parse(readFileSync(STATE, 'utf8'));
    if (saved.head === head && Array.isArray(saved.green)) {
      done = new Set(saved.green);
    }
  } catch {
    // Ein unlesbarer Stand ist kein Stand. Von vorn ist immer richtig.
  }
}
if (done.size > 0) {
  process.stdout.write(
    `\nFuer ${head.slice(0, 8)} waren schon gruen: ${[...done].join(', ')}.\n`
    + 'Diese Schritte werden uebersprungen; `--fresh` faehrt alles noch einmal.\n',
  );
}

const outcomes = [];
for (const step of STEPS) {
  if (done.has(step.script)) {
    outcomes.push({ ...step, ok: true, status: 0, seconds: 0, skipped: true });
    continue;
  }
  process.stdout.write(`\n\u2500\u2500 ${step.title} (${step.script})\n`);
  let outcome = run(step.script);
  if (!outcome.ok) {
    process.stdout.write(
      `\n${step.script} ist mit ${outcome.status} gefallen. Ein Versuch mehr, und\n`
      + 'zwar ein einziger: bis zum 2026-09-19 wurden vier von acht Laeufen\n'
      + 'abgebrochen - nicht vom Kernel (der hat nie einen OOM-Kill protokolliert),\n'
      + 'sondern von der Aufsicht ueber Hintergrundaufgaben. Seit B221 laufen die\n'
      + 'Suiten mit vier Arbeitern statt sechzehn: halber Speicher, gleiche Zeit.\n'
      + 'Faellt er auch jetzt, ist es keine Speicherlage, sondern ein Fund.\n',
    );
    outcome = run(step.script);
    outcome.retried = true;
  }
  outcomes.push({ ...step, ...outcome });
  if (outcome.ok) {
    done.add(step.script);
    writeFileSync(STATE, JSON.stringify({ head, green: [...done] }), 'utf8');
  } else {
    break;
  }
}

const failed = outcomes.find((outcome) => !outcome.ok);
process.stdout.write('\n── Stand\n');
for (const outcome of outcomes) {
  const mark = outcome.skipped === true
    ? 'gruen, aus einem frueheren Lauf'
    : (outcome.ok ? 'gruen' : `GEFALLEN (${outcome.status})`);
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

rmSync(STATE, { force: true });
const ahead = git(['rev-list', '--count', 'origin/main..HEAD']);
process.stdout.write(
  `\nAlle vier Schritte gruen. ${ahead === '' ? 'Unbekannt viele' : ahead} Commit(s) vor origin/main.\n`
  + 'Das ist dieselbe Kette, die der Ablauf auf GitHub fuhr; was dort zusaetzlich\n'
  + 'laeuft, sind die beiden Container-Rauchtests und das Client-Paket, und die\n'
  + 'holt der Tag-Ausloeser beim Release nach.\n',
);
