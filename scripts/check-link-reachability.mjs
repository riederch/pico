import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPicoLinkDirectOperations } from './link-operations.mjs';

/**
 * Link operations, checked for somebody outside the Home who calls them.
 *
 * **The sibling of `check-store-writers`, one layer up, and it proved itself
 * on the work that prompted it.** That check asks whether a store method has a
 * caller; this one asks whether an *operation* does. They catch different
 * halves of the same failure: a Home that writes what nobody can ask for, and
 * a Home that answers what nobody can say.
 *
 * Both halves happened within an hour. `home.supplier.detach`,
 * `home.depot.detach` and `home.model.provider.forget` were added to give
 * three store writers their first caller - which satisfied the store check
 * completely, while no client could invoke any of the three. The person still
 * could not detach a depot. A surface with no consumer is a surface somebody
 * has to keep working forever for nobody, and the Home's own tests are not a
 * consumer.
 *
 * **The Home is excluded on purpose**, and so is the protocol that declares
 * the list: an operation is reachable when something *other than* the thing
 * answering it says its name. Everything else counts - the companion, the
 * vault daemon, a module - because reachability is about a caller existing
 * rather than about which client it is.
 *
 * **What this cannot do is follow the chain to a button.** An operation named
 * by a client library passes here, and a client function nobody calls is the
 * same disease one layer down - which is exactly how these three got past a
 * store check. Said rather than implied, so the green line is read for what it
 * claims.
 *
 * **Und der Satz darunter war ueberholt** (2026-09-02 nachgemessen). Hier
 * stand, zwischen einer Laufzeitmethode und ihrem Kanal und zwischen einer
 * Brueckenfunktion und einem Bedienelement pruefe nichts, und daneben eine
 * Messung von 44 Kanaelen, die den Verzicht begruendete. Beides stimmt nicht
 * mehr: `check-companion-boundary` haelt heute **68 Kanaele auf beiden Seiten
 * gleich benannt, 68 vom Hauptprozess beantwortet und 68 angebotene Methoden
 * je vom Fenster gerufen**, dazu 114 Elemente, die das Fenster verlangt und
 * `index.html` erklaert. Die Kette ist also nicht nur heil, sie wird gehalten.
 *
 * Was weiter niemand prueft, ist die letzte Spanne: dass ein *Druck* auf eines
 * dieser Elemente wirklich bei einem laufenden Home ankommt. Das ist dieselbe
 * Luecke, die Befund B36 eine Ebene hoeher gemessen hat - benannt ist nicht
 * angenommen -, und sie braucht ein echtes Fenster und keine dritte
 * Textpruefung.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Where an operation is declared and where it is answered. Neither is a caller. */
const declaresTheList = 'packages/protocol/src/index.ts';
const answersThem = 'apps/core/src/app.ts';

/**
 * Operations nothing calls, and why that is not a defect today.
 *
 * A list rather than a rule, for the reason its sibling states: each entry is
 * a judgement about one operation rather than a property anybody can derive,
 * and a judgement belongs written where a reader meets it. **What this cannot
 * do is judge the reason** - what it buys is that an unreachable surface is
 * argued rather than unnoticed.
 */
const withoutACaller = [
  [
    'home.identity.rotation.submit',
    'ADR 0114 T4. The ADR says it outright: "T4\'s person-side ceremonies stay '
    + 'open on ADR 0105 B2/B3". The Foundation half landed, the person-side '
    + 'ceremony did not, and the vault daemon offers `rotate-domain` and '
    + '`rotate-host-key` but no identity-root rotation. A stated deferral, not '
    + 'a surface somebody forgot.',
  ],
  [
    'home.identity.rotation.veto',
    'ADR 0114 T4, the other half of the same deferred ceremony. A veto with no '
    + 'submission to veto would be reachable and useless.',
  ],
];

const errors = [];
const sources = [];
const walk = (directory) => {
  for (const entry of readdirSync(join(repoRoot, directory), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(path);
    } else if (/\.(ts|mts|cts|mjs)$/u.test(entry.name)) {
      sources.push(path);
    }
  }
};
/**
 * `scripts/` is deliberately not walked.
 *
 * A checker naming an operation is not a caller - this file names two in its
 * own exemption list, and the first run duly reported them as reachable
 * *because of the argument that they are not*. Nor is a development tool a
 * client: reachability here means a person can get there, and
 * `measure-model-provider.ts` says of itself that it is not a product surface.
 */
for (const directory of ['apps', 'packages', 'modules']) {
  walk(directory);
}
const text = new Map(sources.map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')]));

/** A spec, or a helper the repository already names `test-`. */
const isTestOnly = (path) => /\.test\.ts$/u.test(path) || /\/test-[^/]+$/u.test(path);

/**
 * Read through the shared reader. This file had its own, and its character
 * class was `[a-z][a-z0-9_.]*` - no hyphen. `home.domain.read-grant.submit`
 * carries one, so the check written to say that every operation is named by
 * somebody outside the Home had never looked at it, and printed "45
 * operations" beside `check-surface-classes`'s "46" for as long as both have
 * existed (2026-08-24). Nothing was broken behind it, which is the point: had
 * its caller gone, this would have stayed green and kept counting to 45.
 */
const operations = readPicoLinkDirectOperations();
if (operations.length === 0) {
  errors.push(`${declaresTheList}: could not read the closed operation list, so every `
    + 'sentence below is about nothing.');
}

const callers = sources.filter((path) =>
  !isTestOnly(path) && path !== declaresTheList && path !== answersThem);
/**
 * **Und die Ressourcen darin, seit dem 2026-08-22.**
 *
 * Dieser Prüfer zählt Operationsnamen. Zwei davon sind aber Sammelrufe:
 * `home.authority.list` und `home.authority.submit` verzweigen über ein
 * `resource`-Feld, und jede Ressource darin erbt das Grün des Namens, ob
 * jemand sie ruft oder nicht.
 *
 * Gefunden, als der Reader-Custody-Ast seine Leseseite bekam:
 * `reader_custody_domains` wurde vom Home ausgeliefert und von keinem Client
 * je erfragt - eine unerreichbare Fläche hinter einem erreichbaren Namen.
 * Genau die Krankheit, gegen die dieser Prüfer geschrieben wurde, eine
 * Auflösungsstufe unter ihm.
 *
 * **Was er auch hier nicht kann**, in derselben Ehrlichkeit wie oben: er
 * folgt der Kette nicht bis zu einem Knopf. Eine Ressource, die eine
 * Client-Funktion nennt, die niemand ruft, besteht - dieselbe Krankheit eine
 * Ebene tiefer, und ein dritter Prüfer.
 */
const dispatchers = ['executeHomeAuthorityList', 'executeHomeAuthoritySubmit'];
const homeSource = readFileSync(join(repoRoot, 'apps/core/src/app.ts'), 'utf8');
const resources = new Set();
for (const name of dispatchers) {
  const body = homeSource.match(
    new RegExp(`function ${name}\\(([\\s\\S]*?)\\n  \\}`));
  if (body === null) {
    continue;
  }
  for (const found of body[1].matchAll(/case '(\w+)':/g)) {
    resources.add(found[1]);
  }
}
if (resources.size === 0) {
  errors.push('no authority resources found - this rule is guarding nothing');
}
const unaskedResources = [...resources].filter((resource) =>
  !callers.some((path) => text.get(path).includes(`'${resource}'`)));

const exempt = new Map(withoutACaller);
const unreachable = operations.filter((operation) =>
  !callers.some((path) => text.get(path).includes(`'${operation}'`)));
for (const resource of unaskedResources) {
  errors.push(`the Home answers \`${resource}\` and nothing outside it ever asks: a resource `
    + 'behind a reachable operation inherits that operation\'s green, so this one was invisible '
    + 'to the check above. Either a client asks for it, or it goes.');
}

for (const operation of unreachable) {
  if (exempt.has(operation)) {
    continue;
  }
  errors.push(
    `\`${operation}\` is in the closed operation set, the Home answers it, and nothing outside `
    + 'the Home says its name. Either no client can reach the feature it belongs to, or the '
    + 'reason it has no caller belongs in `withoutACaller` with a sentence somebody can judge.',
  );
}

for (const [name] of withoutACaller) {
  if (!operations.includes(name)) {
    errors.push(`\`${name}\` is argued here and is no longer a Link operation.`);
  } else if (!unreachable.includes(name)) {
    errors.push(
      `\`${name}\` is listed as having no caller and now has one. An exemption that outlives its `
      + 'reason is the drift this check exists to catch, one level up.',
    );
  }
}

if (errors.length > 0) {
  console.error('Link-reachability check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Link-reachability check passed (${operations.length} operations and `
  + `${resources.size} authority resources, each named by something `
  + `other than the Home except ${withoutACaller.length} argued here).`,
);
