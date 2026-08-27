import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ein Schlüssel in einer Identitätsrolle gehört in die Identitätssuite.
 *
 * **Der Anlass** (2026-08-27, gegen ein laufendes Home gefunden). Einen
 * Lesezugang zu beenden ist seit dem 2026-08-24 ein Knopf im Fenster, und es
 * hat nie funktioniert: die Zeremonie hängte den Schlüsselnachweis der
 * Besitzerin mit `picoMemoryContentSuite` an, während die Domäne, gegen die
 * das Home ihn Zeichen für Zeichen vergleicht, `picoIdentitySuite` trägt. Das
 * Home antwortete `invalid_record` - dieselbe Antwort wie auf eine gefälschte
 * Aussage, und deshalb sah niemand hin.
 *
 * Die drei Geschwister-Zeremonien in derselben Datei hatten es richtig. Kein
 * Test bemerkte es, weil alle gegen einen erfundenen Link-Client prüfen,
 * *welche Operation* geschickt wird - nicht, ob jemand sie annimmt.
 *
 * **Warum das mechanisch geht.** Die drei Rollen unten sind Identitätsrollen;
 * `verifyPicoIdentityKeyRecordFingerprint` prüft den Fingerabdruck über einen
 * Nachweis, der per Definition in der Identitätssuite steht. Eine andere Suite
 * neben einer dieser Rollen ist also nie richtig, egal wozu der Nachweis
 * gehört. Gemessen am 2026-08-27: 79 solche Stellen im Haus, 78 richtig.
 *
 * **Was diese Prüfung nicht kann.** Sie sieht ein `suite` und ein `keyRole`
 * nebeneinander in einem Objektliteral. Ein Nachweis, der über Variablen oder
 * ein Spread zusammengesetzt wird, geht an ihr vorbei - und wird deshalb
 * gezählt und genannt, damit die Zahl nicht so aussieht, als sei sie die
 * Wahrheit über alle.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/** Die Rollen, die eine Pico-Identität trägt. */
const identityRoles = 'pico_identity|device_signing|device_key_agreement';
const suiteThenRole = new RegExp(
  String.raw`suite:\s*([A-Za-z0-9_.']+)\s*,\s*(?:/[/*][^\n]*\n\s*)?keyRole:\s*'(${identityRoles})'`,
  'gu',
);
const roleThenSuite = new RegExp(
  String.raw`keyRole:\s*'(${identityRoles})'\s*,\s*(?:/[/*][^\n]*\n\s*)?suite:\s*([A-Za-z0-9_.']+)\s*,`,
  'gu',
);
const identitySuite = new Set(['picoIdentitySuite', "'pico.suite.id.v1'"]);

function sourceFiles(root) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      found.push(path);
    }
  }
  return found;
}

const roots = [];
for (const group of ['apps', 'packages']) {
  for (const entry of readdirSync(join(repoRoot, group))) {
    const sourceRoot = join(repoRoot, group, entry, 'src');
    try {
      if (statSync(sourceRoot).isDirectory()) {
        roots.push(sourceRoot);
      }
    } catch {
      // Kein `src` ist kein Fehler - nicht jedes Verzeichnis ist ein Paket.
    }
  }
}

let checked = 0;
for (const root of roots) {
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, 'utf8');
    for (const [pattern, suiteGroup, roleGroup] of [
      [suiteThenRole, 1, 2],
      [roleThenSuite, 2, 1],
    ]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        checked += 1;
        const suite = match[suiteGroup];
        if (identitySuite.has(suite)) {
          continue;
        }
        const line = source.slice(0, match.index).split('\n').length;
        errors.push(
          `${relative(repoRoot, path)}:${line} builds a key record in the identity role `
          + `\`${match[roleGroup]}\` with the suite \`${suite}\`. A Home compares such a record `
          + 'against the one in the authority it belongs to, character for character, and '
          + 'answers `invalid_record` - which reads exactly like a forged statement.',
        );
      }
    }
  }
}

if (checked === 0) {
  errors.push(
    'scripts/check-key-record-suites.mjs found no key record at all, so it compared nothing. '
    + 'A reader that finds no subject is broken, not clean.',
  );
}

if (errors.length > 0) {
  console.error('Key-record suite check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Key-record suite check passed (${checked} key records written as a literal beside an `
  + 'identity role, each in the identity suite; records assembled from variables or a spread '
  + 'are not visible to this reader).',
);
