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
 * Was der Läufer startet. Gelesen wie `check-workflow-pinning.mjs` liest: mit
 * einem Ausdruck über den Text, weil dieses Haus keine YAML-Abhängigkeit hat.
 * Eine Matrix zählt mit - dort steht der Aufruf im Eintrag und nicht im
 * `run:`.
 */
const started = [];
for (const found of workflow.matchAll(/(?:^|\n)\s*(?:-\s*)?(?:run|verify):\s*(pnpm [^\n#]+)/gu)) {
  started.push(found[1].trim());
}
if (started.length === 0) {
  errors.push(`${workflowPath} starts nothing with pnpm, so this check has no subject. A reader that finds no subject is broken, not clean.`);
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
  + `${besideTheChain.size} run beside the chain with a reason).`,
);
