import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * store check. `check-companion-boundary` ties the contract's channels to the
 * preload's; between a runtime method and its channel, and between a bridge
 * function and a control, nothing checks. Said rather than implied, so the
 * green line is read for what it claims.
 *
 * **Measured before it was left open**, so nobody spends the effort twice: all
 * 44 IPC channels have a handler, every bridge function is called by the
 * renderer, and every runtime method is reached from main. The chain is whole
 * today. A third gate would find nothing and would have to be maintained
 * anyway, which is why the limit is stated rather than closed.
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

const declaration = /picoLinkDirectOperations = \[([\s\S]*?)\n\] as const;/u
  .exec(text.get(declaresTheList) ?? '');
if (declaration === null) {
  errors.push(`${declaresTheList}: could not read the closed operation list.`);
}
const operations = [...(declaration?.[1] ?? '').matchAll(/^\s*'([a-z][a-z0-9_.]*)',$/gmu)]
  .map(([, name]) => name);

const callers = sources.filter((path) =>
  !isTestOnly(path) && path !== declaresTheList && path !== answersThem);
const exempt = new Map(withoutACaller);
const unreachable = operations.filter((operation) =>
  !callers.some((path) => text.get(path).includes(`'${operation}'`)));

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
  `Link-reachability check passed (${operations.length} operations, each named by something `
  + `other than the Home except ${withoutACaller.length} argued here).`,
);
