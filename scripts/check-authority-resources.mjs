import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Jede Ressource, die ein Client nennt, nimmt der Home auch an.
 *
 * **Gefunden, indem ein Durchlauf scheiterte** (2026-08-27).
 * `home.authority.submit` trägt Autoritätsaufzeichnungen als *Ressourcen* -
 * eine geschlossene Liste im Home, gespiegelt von jedem, der etwas abgibt. Ein
 * Client, der `reader_custody_writer_grant` schickte, während der Home das Wort
 * nicht kannte, bekam `unknown_authority_resource`; nichts prüfte die beiden
 * Listen gegeneinander, und `release:verify` blieb grün, weil der Test des
 * Clients den *Namen* behauptet und nicht, dass jemand ihn annimmt.
 *
 * Dieselbe Klasse wie die Link-Operationen, die `check-surface-classes` gegen
 * ihre Urkunde hält - nur eine Ebene tiefer: dort ist der Name der Vorgang,
 * hier ist er ein Feld darin, und ein Namensvergleich über Vorgänge findet ihn
 * deshalb nicht. Wer nach einem Namen sucht, findet keine Fähigkeit.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const homeSource = readFileSync(join(repoRoot, 'apps', 'core', 'src', 'app.ts'), 'utf8');
/**
 * **Beide Vokabulare**, und die Prüfung sagt genau das: `home.authority.submit`
 * nimmt Aufzeichnungen entgegen, `home.authority.list` gibt sie heraus, und
 * jedes hat seine eigene Liste. Was hier gehalten wird, ist die schwächere und
 * wichtigere Aussage - **kein Client nennt ein Wort, das dieser Home nie
 * gelernt hat**. Welches der beiden es ist, entscheidet die Aufrufstelle, und
 * ein Namensvergleich sähe das nicht.
 */
const accepted = [...homeSource.matchAll(/switch \(args\.resource\) \{([\s\S]*?)\n    \}/gu)]
  .flatMap(([, block]) => [...block.matchAll(/case '([a-z_]+)':/gu)].map(([, name]) => name));

/**
 * Die geschlossene Liste des Protokolls - die Seite, die ein Client benutzt.
 *
 * Gelesen statt gesucht: die erste Fassung dieser Prüfung suchte
 * `resource: '...'` im Quelltext der Clients und sah die Stelle nicht, an der
 * die Wörter als Feldwerte in einem Array stehen. Eine Suche nach einer Form
 * findet die andere Form nicht - und eine Pflanzung hat genau das gezeigt.
 */
const protocolSource = readFileSync(
  join(repoRoot, 'packages', 'protocol', 'src', 'index.ts'),
  'utf8',
);
const declaredBlock =
  /picoHomeAuthoritySubmitResources = \[([\s\S]*?)\] as const;/u.exec(protocolSource);
const named = new Map(
  (declaredBlock === null
    ? []
    : [...declaredBlock[1].matchAll(/^\s*'([a-z_]+)',$/gmu)].map(([, name]) => name))
    .map((name) => [name, 'packages/protocol/src/index.ts']),
);

if (accepted.length === 0 || named.size === 0) {
  errors.push(
    'scripts/check-authority-resources.mjs read no accepted resources or no named ones, so it '
    + 'compared nothing. A reader that finds neither side is broken, not clean.',
  );
}

for (const [name, path] of named) {
  if (!accepted.includes(name)) {
    errors.push(
      `${path} declares the authority resource \`${name}\` and this Home's dispatch has no case `
      + 'for it. A client typed against that list would compile and then meet '
      + '`unknown_authority_resource` at the moment somebody presses the button.',
    );
  }
}
for (const name of accepted) {
  if (!named.has(name) && !name.endsWith('s') && name !== 'home_state') {
    errors.push(
      `this Home accepts the authority resource \`${name}\` and the protocol's closed list does `
      + 'not declare it, so no client can name it without inventing a string.',
    );
  }
}

if (errors.length > 0) {
  console.error('Authority-resource check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Authority-resource check passed (${accepted.length} accepted by the Home, `
  + `${named.size} named by a client, each accepted).`,
);
