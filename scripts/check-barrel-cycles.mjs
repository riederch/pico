import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ein Modul, das die Sammelausgabe weitergibt, darf keinen *Wert* aus ihr holen.
 *
 * **Der Anlass** (2026-09-01, gegen ein laufendes Home gefunden, Befund B49).
 * `index.ts` gibt `model-context.js` wieder aus, und `model-context.ts` holte
 * `picoEventOriginClasses` von dort zurueck. `index.ts` beschrieb diesen
 * Zyklus selbst - „a cycle that happens to work today only because the values
 * are read inside functions rather than at module evaluation" - und liess ihn
 * stehen.
 *
 * Er hat aufgehoert zu funktionieren. Ein einziger neuer Import an einer ganz
 * anderen Stelle (`pending-action.ts` zog `approval-statement.js` herein)
 * kippte die Auswertungsreihenfolge, und das laufende Home antwortete auf
 * `home.recall.keep` mit `lowestPicoOriginClass is not a function`: die
 * Sternausgabe hatte aus einem halbfertigen Modul kopiert. Kein Typfehler, kein
 * Testfehler an der Stelle des Imports - eine Ablehnung an einer Tuer, die mit
 * Herkunftsklassen nichts zu tun hat.
 *
 * **Die Aussage.** Fuer jedes `./x.js`, das `index.ts` weitergibt, gilt: `x.ts`
 * darf aus `./index.js` Typen holen (die werden geloescht und legen keine
 * Kante) und keine Werte. Ein Wert dort ist ein Zyklus, der von der
 * Reihenfolge lebt - und eine Ordnung, die von der Reihenfolge lebt, ist keine
 * Ordnung, sondern ein Zufall mit einem Datum darauf.
 *
 * **Was diese Pruefung nicht kann.** Sie liest `import`-Anweisungen mit
 * geschweiften Klammern. Ein Standardimport, ein Namensraumimport
 * (`import * as`) oder ein `await import()` aus `./index.js` ginge an ihr
 * vorbei; keiner steht heute im Paket, und deshalb steht das hier und nicht in
 * einem Kommentar ueber die Absicht.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const protocolSrc = join(repoRoot, 'packages/protocol/src');
const errors = [];

/**
 * Die eine Kante, die heute noch steht, mit Grund und Datum.
 *
 * Sie wird gezaehlt und genannt, nicht uebersehen: `recovery.ts` holt drei
 * Signatur-Bauer und `picoIdentitySuite` aus der Sammelausgabe. Die drei Bauer
 * sitzen mitten im Identitaetsteil von `index.ts` und stuetzen sich auf ein
 * Dutzend dortiger Helfer (`assertExactKeys`, `concatCanonicalElements`,
 * `canonicalScopeSet` und weitere). Sie herauszuloesen ist eine eigene Arbeit
 * am Unterschreiben - der heikelsten Stelle im Baum - und keine Zeile, die
 * nebenbei mitgeht.
 *
 * Steht sie am 2026-09-01 hier, damit die Zahl unten nicht so aussieht, als
 * sei sie null.
 */
const known = [
  {
    module: 'recovery',
    values: [
      'buildPicoIdentityDelegationSignatureInput',
      'buildPicoIdentityKeyRecordSignatureInput',
      'buildPicoIdentityRevocationSignatureInput',
      'picoIdentitySuite',
    ],
    since: '2026-09-01',
    reason: 'the three builders sit inside index.ts\'s identity section and lean on a dozen '
      + 'local helpers; moving them is a separate piece of work on the signing path',
  },
];

const index = readFileSync(join(protocolSrc, 'index.ts'), 'utf8');

/** Every `./x.js` the barrel re-exports, star or named. */
const reExported = new Set(
  [...index.matchAll(/export\s+(?:\*|\{[\s\S]*?\})\s+from\s+'\.\/([A-Za-z0-9-]+)\.js'/gu)]
    .map(([, name]) => name),
);

if (reExported.size === 0) {
  errors.push(
    'scripts/check-barrel-cycles.mjs found no module re-exported by packages/protocol/src/'
    + 'index.ts, so it compared nothing. A reader that finds no subject is broken, not clean.',
  );
}

/** The value specifiers `module` imports from the barrel. */
function valueImportsFromBarrel(source) {
  const values = [];
  for (const [, typeOnly, body] of source.matchAll(
    /import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+'\.\/index\.js';/gu,
  )) {
    if (typeOnly !== undefined) {
      continue;
    }
    for (const specifier of body.split(',')) {
      const name = specifier.trim();
      if (name !== '' && !name.startsWith('type ')) {
        values.push(name.split(/\s+as\s+/u)[0]);
      }
    }
  }
  return values;
}

let checked = 0;
let carried = 0;

for (const name of [...reExported].sort()) {
  let source;
  try {
    source = readFileSync(join(protocolSrc, `${name}.ts`), 'utf8');
  } catch {
    errors.push(
      `packages/protocol/src/index.ts re-exports './${name}.js', and there is no `
      + `packages/protocol/src/${name}.ts to read.`,
    );
    continue;
  }
  checked += 1;
  const values = valueImportsFromBarrel(source);
  if (values.length === 0) {
    continue;
  }
  const carriedEntry = known.find((entry) => entry.module === name);
  if (carriedEntry !== undefined) {
    const unexpected = values.filter((value) => !carriedEntry.values.includes(value));
    if (unexpected.length > 0) {
      errors.push(
        `packages/protocol/src/${name}.ts imports ${unexpected.join(', ')} as a value from `
        + './index.js, and the named entry for this module does not cover it. A carried '
        + 'exception that quietly grows is not a record of one edge, it is permission for '
        + 'any number.',
      );
      continue;
    }
    carried += 1;
    continue;
  }
  errors.push(
    `packages/protocol/src/${name}.ts imports ${values.join(', ')} as a value from `
    + "'./index.js', and index.ts re-exports './" + name + ".js'. That is a cycle: whichever "
    + 'module is evaluated first, the other copies its exports while they are still empty, '
    + 'and the failure arrives later as `<name> is not a function` at some unrelated door. '
    + 'Move the value into a leaf module both sides import, the way `origin-class.ts` and '
    + '`foundation-event-type.ts` were moved on 2026-09-01, or take a type-only import, '
    + 'which is erased and carries no edge.',
  );
}

for (const entry of known) {
  if (!reExported.has(entry.module)) {
    errors.push(
      `The carried entry for ${entry.module} (since ${entry.since}) names a module the barrel `
      + 'no longer re-exports. Either the cycle is gone and the entry should go with it, or '
      + 'this file is describing a tree that no longer exists.',
    );
  }
}

if (errors.length > 0) {
  console.error('Barrel-cycle check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Barrel-cycle check passed (${checked} modules are re-exported by the protocol barrel; `
  + `${checked - carried} take no value from it, and ${carried} `
  + `${carried === 1 ? 'carries' : 'carry'} a named entry with a reason and a date`
  + `${carried === 0 ? '' : ` - ${known.map((entry) =>
    `${entry.module} since ${entry.since}`).join(', ')}`}).`,
);
