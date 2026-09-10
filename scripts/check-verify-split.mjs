import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flattenPicoVerifyChain, picoVerifyStepName } from './verify-chain.mjs';

/**
 * Die geteilte Kette und der Läufer dürfen nicht auseinanderlaufen.
 *
 * **Der Anlass** (2026-09-05, Befund B67). `release:verify` lief als eine
 * Kette von 42 Schritten in einem Auftrag, 58 Minuten lang, und drei Schritte
 * davon - die Testmenge, dieselbe unter verschobener Uhr, dieselbe in zwei
 * Zeitzonen - machten 92 Prozent davon aus. Sie wissen voneinander nichts,
 * also stehen sie jetzt nebeneinander auf eigenen Läufern.
 *
 * **Was das kostet, wenn es niemand hält.** Die Kette steht damit an zwei
 * Stellen: in `package.json` als Wahrheit für jede Hand, und in `ci.yml` als
 * Aufteilung. Wer einen Schritt in `release:verify` einhängt und den Läufer
 * vergisst, hat ein Tor, das lokal läuft und in CI nie - und das merkt
 * niemand, weil beide grün sind. Eine Wahrheit, zweimal geschrieben, driftet;
 * hier wird sie gehalten statt gehofft.
 *
 * **Was geprüft wird.** `release:verify` wird flachgeklopft - jeder Schritt
 * der Form `pnpm <name>`, dessen Skript selbst eine `&&`-Kette von
 * `pnpm`-Aufrufen ist, wird aufgelöst -, und dieselbe Auflösung läuft über
 * alles, was `ci.yml` in seinen Aufträgen mit `pnpm` startet. Danach muss
 * jeder Blattschritt der Kette **genau einmal** von einem Auftrag erreicht
 * werden: keiner fehlt, keiner doppelt, und keiner steht im Läufer, den die
 * Kette nicht kennt.
 */
/**
 * **Wer hier einen Schritt hinzufuegt, zieht die Zahl in `progress.md` mit.**
 *
 * Diese Pruefung druckt die Kettenlaenge in ihrer Erfolgszeile, und
 * `progress.md` behauptet sie in einem Satz. Am 2026-09-08 ist die Zahl
 * zweimal an einem Tag stehen geblieben - `45` bei `secrets:check`, `46` bei
 * `migration:check` -, und beide Male hat `progress:walk` es gefunden und nicht
 * der Mensch.
 *
 * Ein Tor daraus wird es nicht: `measure-progress-numbers.mjs` sagt im eigenen
 * Kopf, warum es ein Werkzeug bleibt - es liest Prosa, und ein Muster ueber
 * Prosa greift irgendwann daneben. Ein Tor, das das zweimal tut, wird
 * ueberlesen, und das waere teurer als eine Zahl, die einen Tag hinterherhinkt.
 *
 * Also steht der Satz hier, an der Stelle, an der man die Kette verlaengert:
 * die Zahl gehoert in dieselbe Aenderung, nicht ans Ende.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const workflowPath = join(repoRoot, '.github', 'workflows', 'ci.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const scripts = manifest.scripts ?? {};

const errors = [];
if (typeof scripts['release:verify'] !== 'string') {
  errors.push('package.json has no `release:verify`, so there is no chain to hold anything to.');
}

const flatten = (chainText) => flattenPicoVerifyChain(scripts, chainText);
const chain = flatten(scripts['release:verify'] ?? '');

/**
 * Was der Läufer startet, **je Auftrag**. Gelesen wie
 * `check-workflow-pinning.mjs` liest: mit einem Ausdruck über den Text, weil
 * dieses Haus keine YAML-Abhängigkeit hat. Eine Matrix zählt mit - dort steht
 * der Aufruf im Eintrag und nicht im `run:`.
 */
const jobs = [];
{
  const body = workflow.slice(workflow.indexOf('\njobs:'));
  let current;
  for (const line of body.split('\n')) {
    const header = /^ {2}([A-Za-z_][\w-]*):\s*$/u.exec(line);
    if (header !== null) {
      current = { name: header[1], lines: [] };
      jobs.push(current);
      continue;
    }
    current?.lines.push(line);
  }
}
const started = [];
for (const job of jobs) {
  job.started = [];
  const text = job.lines.join('\n');
  for (const found of text.matchAll(/(?:^|\n)\s*(?:-\s*)?(?:run|verify):\s*(pnpm [^\n#]+)/gu)) {
    job.started.push(found[1].trim());
    started.push(found[1].trim());
  }
  const needs = /(?:^|\n)\s{4}needs:\s*(\[[^\]]*\]|[\w-]+)/u.exec(text);
  job.needs = needs === null
    ? []
    : needs[1].replace(/[[\]]/gu, '').split(',').map((name) => name.trim()).filter(Boolean);
}
if (started.length === 0) {
  errors.push(`${workflowPath} starts nothing with pnpm, so this check has no subject. A reader that finds no subject is broken, not clean.`);
}

/**
 * Jeder Auftrag sagt, wann er zu lange gebraucht hat (Befund B88).
 *
 * Ohne `timeout-minutes` gilt GitHubs Vorgabe von sechs Stunden, und ein
 * haengender Auftrag laeuft einen Nachmittag lang. Am 2026-09-08 hatte kein
 * einziger der fuenf eine Frist - in genau dem Ablauf, der die Fristen
 * ausfuehrt, die B77 und B78 ins Produkt gezogen haben.
 *
 * Die Regel steht hier, weil dieser Pruefer die Auftragsliste ohnehin liest:
 * ein sechster Auftrag waere sonst wieder unbegrenzt, und niemand haette es
 * gemerkt, bis eine Rechnung kommt.
 */
/**
 * Ein Lauf, der veroeffentlicht, wird nicht abgebrochen (Befund B89).
 *
 * `cancel-in-progress: true` waere die bequeme Fassung und die falsche: dieser
 * Ablauf baut Bilder und ein Paket. Ein abgebrochener Lauf auf `main` oder auf
 * einem Tag hiesse, dass ein Commit nie geprueft wurde und eine
 * Veroeffentlichung auf halbem Weg endete. Bei einem Pull Request zaehlt nur
 * der neueste Stand, und dort ist Abbrechen richtig.
 *
 * Die Regel prueft deshalb nicht, *ob* abgebrochen wird, sondern dass es an
 * eine Bedingung gebunden bleibt - wer sie auf `true` vereinfacht, nimmt die
 * Unterscheidung heraus, ohne dass etwas rot wird.
 */
const cancelLine = /\n\s*cancel-in-progress:\s*([^\n#]+)/u.exec(workflow);
if (cancelLine === null) {
  errors.push(
    `${workflowPath}: declares no \`cancel-in-progress\`, so two pushes in a row `
    + 'each run to the end. Say what should happen, with a condition.',
  );
} else if (cancelLine[1].trim() === 'true') {
  errors.push(
    `${workflowPath}: cancels every superseded run, publishing ones included. A run `
    + 'on `main` or a tag that is cancelled leaves a commit unverified and a '
    + 'publication half done; bind it to the event instead.',
  );
}

for (const job of jobs) {
  if (!/(?:^|\n)\s{4}timeout-minutes:\s*\d+/u.test(job.lines.join('\n'))) {
    errors.push(
      `${workflowPath}: job \`${job.name}\` declares no \`timeout-minutes\`, so it `
      + 'inherits six hours. A job that hangs should end in an hour that somebody '
      + 'notices, not in one that shows up on a bill.',
    );
  }
}

/**
 * **Was der Läufer ausserhalb der Kette starten darf, mit Grund.**
 *
 * Beide standen schon da, bevor dieses Tor sie las - es hat sie beim ersten
 * Lauf gefunden, was der Beleg dafür ist, dass es hinsieht.
 */
const besideTheChain = new Map([
  ['pnpm install --frozen-lockfile', 'Die Kette braucht einen Baum, bevor sie etwas prüfen kann.'],
  [
    'pnpm audit --prod --audit-level high',
    'ADR 0122 Y1, ausdrücklich neben `release:verify` und nicht darin: eine bekannte '
    + 'Meldung ist eine Aussage über den Tag des Baus, und sie in das Tor zu falten '
    + 'liesse eine fremde Veröffentlichung wie einen kaputten Baum aussehen (Befund B63).',
  ],
  [
    'pnpm release:tag-check',
    'ADR 0122. Läuft nur im Tag-Bau und hält den Tag gegen die Version; ausserhalb '
    + 'eines Tag-Baus hat er keinen Gegenstand.',
  ],
  [
    'pnpm progress:walk',
    'Befund B118. Er fährt neun Tore selbst, die derselbe Auftrag gerade gefahren hat - '
    + 'in die Kette gefaltet liefe die Hälfte davon zweimal je Lauf. Und er beantwortet '
    + 'eine andere Frage als jedes Tor: nicht "stimmt der Baum", sondern "sagt das '
    + 'Statusdokument die Wahrheit über ihn". Zweimal in zwei Tagen ist eine Zahl '
    + 'gedriftet, und gefunden hat es beide Male nur ein Aufruf von Hand.',
  ],
]);

/**
 * **Zwei weitere Begriffe, ohne die die Aufteilung nicht beschreibbar ist**,
 * jeder mit seinem Grund - und keiner davon eine Ausnahme „weil es sonst rot
 * ist".
 */
const sharedSteps = new Map([
  ['pnpm display-zone:check', {
    parts: 2,
    why: 'Die beiden Enden des Tages - Kiritimati und Niue - laufen seit dem 2026-09-05 auf '
      + 'zwei Läufern. Zusammen sind sie der eine Schritt der Kette; einzeln sagt der Lauf '
      + 'selbst, dass er eine Hälfte ist.',
  }],
]);
const mayRepeat = new Map([
  ['pnpm build', 'Jeder Läufer braucht ein `dist`, bevor eine Testmenge etwas importieren kann. '
    + 'Hier ist der Bau eine Voraussetzung und nicht das Tor - das Tor ist der eine Lauf in '
    + '`verify:gates`, und er urteilt für alle.'],
]);

/** Ein Aufruf mit Argumenten trifft den Schritt, der ohne sie dasteht. */
const chainSteps = new Set(chain);
const keyFor = (leaf) => {
  if (chainSteps.has(leaf)) {
    return leaf;
  }
  const parsed = picoVerifyStepName(leaf);
  const bare = parsed === undefined ? undefined : `pnpm ${parsed.name}`;
  return bare !== undefined && chainSteps.has(bare) ? bare : leaf;
};

const reached = new Map();
for (const start of started) {
  for (const leaf of flatten(start)) {
    const key = keyFor(leaf);
    reached.set(key, (reached.get(key) ?? 0) + 1);
  }
}

/**
 * Ein Schritt, der zweimal in der Kette steht, wird auch zweimal bezahlt -
 * lokal wie auf dem Laeufer. Aufgefallen an dieser Pruefung selbst: eine
 * Pflanzung hing `docs:check` ein zweites Mal ein, und der Bericht sagte die
 * Folge zweimal statt die Ursache einmal.
 */
for (const leaf of new Set(chain)) {
  const listed = chain.filter((step) => step === leaf).length;
  if (listed > 1) {
    errors.push(
      `\`${leaf}\` stands ${listed} times in \`release:verify\`. A chain pays for every step it `
      + 'names, and naming one twice buys nothing.',
    );
  }
}

for (const leaf of new Set(chain)) {
  const times = reached.get(leaf) ?? 0;
  const expected = sharedSteps.get(leaf)?.parts ?? 1;
  if (times === 0) {
    errors.push(
      `\`${leaf}\` is a step of \`release:verify\` that no job in ci.yml runs. It passes on a `
      + 'desk and never on the runner, and both look green.',
    );
  } else if (times !== expected && !mayRepeat.has(leaf)) {
    errors.push(
      `\`${leaf}\` is started ${times} times by ci.yml, and this check expects ${expected}. `
      + (expected === 1
        ? 'The split was meant to spread the chain, not to pay for a step twice; if it is '
          + 'deliberately shared, say so in `sharedSteps` with the reason.'
        : `It is declared as shared in ${expected} parts, and one of them is missing.`),
    );
  }
}
for (const [leaf] of reached) {
  if (!chainSteps.has(leaf) && !besideTheChain.has(leaf)) {
    errors.push(
      `ci.yml runs \`${leaf}\`, which is not a step of \`release:verify\`. A gate the chain does `
      + 'not know is one nobody can run before pushing.',
    );
  }
}

/**
 * **Und die Gegenrichtung** (Befund B118).
 *
 * Diese Liste sagte bisher nur, was der Laeufer starten *darf*. Eine
 * Begruendung fuer einen Schritt, den niemand mehr startet, faellt damit nicht
 * auf - sie ueberlebt, was sie erklaerte, und liest sich beim naechsten Mal
 * wie eine Tatsache. Dieselbe Asymmetrie wie bei den etikettlosen `.sign(` in
 * Befund B106, und dort war sie schon einmal die halbe Regel.
 */
for (const [leaf, reason] of besideTheChain) {
  if (reached.has(leaf)) {
    continue;
  }
  errors.push(
    `\`${leaf}\` is argued as running beside the chain (${reason.slice(0, 60)}...) and ci.yml `
    + 'does not start it. A reason for something that is gone outlives what it explained.',
  );
}

/**
 * **Und wer auf die Kette wartet, muss auf die ganze warten.**
 *
 * Bis zum 2026-09-05 hiess `needs: verify` „alles ist grün", weil `verify`
 * die ganze Kette fuhr. Seit der Teilung heisst es nur noch „die Tore sind
 * grün" - ein Bild könnte veröffentlicht werden, während eine Testmenge
 * daneben rot ist. Genau das stand nach der Teilung eine Stunde lang in
 * `ci.yml`, und diese Regel ist die Antwort darauf.
 */
const chainJobs = jobs
  .filter((job) => job.started.some((start) => flatten(start).some((leaf) => chainSteps.has(keyFor(leaf)))))
  .map((job) => job.name);
for (const job of jobs) {
  const waited = job.needs.filter((name) => chainJobs.includes(name));
  const missing = chainJobs.filter((name) => !job.needs.includes(name));
  if (waited.length > 0 && missing.length > 0) {
    errors.push(
      `Job \`${job.name}\` waits for ${waited.join(', ')} but not for ${missing.join(', ')}. `
      + 'Since the chain is split, waiting for one half means starting while the other half may '
      + 'still be red - and this job publishes or packages what that half was checking.',
    );
  }
}

/**
 * **Und der eine Schritt, der nichts mit `pnpm` startet** (externes Review
 * vom 2026-09-09, §3; entschieden am 2026-09-10).
 *
 * Der Client-Job haengt sein Paket mit `gh release upload` an das Release. Bis
 * zu diesem Tag stand `--clobber` dahinter, und der Job wartet nur auf
 * `verify` und `suites` - die Monotoniepruefung laeuft in den Bild-Jobs. Ein
 * Tag, den die Registry abgelehnt hatte, konnte sein `.deb` also trotzdem
 * unter demselben Namen tauschen. Die Entscheidung liegt jetzt in
 * `scripts/check-release-asset-absent.mjs` und ist dort getestet; was hier
 * gehalten wird, ist die Verdrahtung: jeder Upload fragt vorher, und nirgends
 * steht ein Ueberschreiben. Ein Upload, den es nicht mehr gibt, ist ebenfalls
 * ein Fehler - dann hat diese Regel keinen Gegenstand, und das muss sie sagen.
 */
// Ohne Kommentarzeilen: der Kommentar am Upload-Schritt erklaert das Wort
// `--clobber`, und ein Wort in einem Kommentar ueberschreibt nichts.
const workflowText = jobs
  .map((job) => job.lines.filter((line) => !/^\s*#/u.test(line)).join('\n'))
  .join('\n');
if (/--clobber/u.test(workflowText)) {
  errors.push(
    'ci.yml overwrites a release asset with `--clobber`. A published artifact never changes what '
    + 'it is; `check-release-asset-absent.mjs` refuses a name that is already attached, and an '
    + 'upload that can replace one makes that refusal decorative.',
  );
}
const uploads = [...workflowText.matchAll(/gh release upload\b/gu)];
if (uploads.length === 0) {
  errors.push(
    'ci.yml attaches nothing with `gh release upload`, so the rule that every upload asks '
    + '`check-release-asset-absent.mjs` first has no subject. A reader that finds no subject is '
    + 'broken, not clean.',
  );
}
for (const upload of uploads) {
  const stepStart = workflowText.lastIndexOf('run: |', upload.index);
  const before = workflowText.slice(stepStart === -1 ? 0 : stepStart, upload.index);
  if (!before.includes('node scripts/check-release-asset-absent.mjs ')) {
    errors.push(
      'ci.yml runs `gh release upload` without asking `scripts/check-release-asset-absent.mjs` '
      + 'in the same step first. The check is what stops a second run on the same tag from '
      + 'replacing what the first attached.',
    );
  }
}

if (errors.length > 0) {
  console.error('Verify-split check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Verify-split check passed (${chain.length} steps in \`release:verify\`, each started exactly `
  + `once across ${started.length} pnpm invocations in ci.yml; `
  + `${besideTheChain.size} run beside the chain with a reason; `
  + `${chainJobs.length} jobs carry the chain, and everything that waits for one waits for all; `
  + `${uploads.length} release upload${uploads.length === 1 ? '' : 's'}, each asking what is attached first, none clobbering).`,
);
