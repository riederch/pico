import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Eine Wanderung, die eine Auslieferung gesehen hat, aendert sich nicht mehr.
 *
 * **Warum das die haerteste Regel dieses Verzeichnisses ist.** Eine Wanderung
 * laeuft einmal je Installation, und `schema_migration` merkt sich nur *ihre
 * Kennung*. Wer den Rumpf einer bereits ausgelieferten Wanderung aendert,
 * aendert damit nichts an einer Installation, die sie gefahren hat - die Kennung
 * steht dort, also laeuft sie nie wieder. Der Code erwartet ab dann ein Schema,
 * das dieses Home nie bekommen hat, und niemand erfaehrt es, bis eine Abfrage
 * ueber eine Spalte stolpert, die es nur auf neuen Installationen gibt.
 *
 * `schema_migration_audit` haelt `migration_ids_json` - *welche* liefen, nicht
 * *was* sie taten. Es gibt also im Produkt nichts, was das faengt.
 *
 * **Die Quelle ist abgeleitet und nicht gepflegt.** Kein Hash-Verzeichnis, das
 * jemand nachfuehren muesste: was ausgeliefert wurde, steht im letzten
 * Versionsschild dieses Repositoriums. `git show <tag>:apps/core/src/migrations.ts`
 * ist die Wahrheit darueber, und eine gepflegte Liste waere die zweite Fassung
 * davon - die driftet (Befund B69).
 *
 * **Ohne Schilder wird uebersprungen und gesagt.** Ein flacher Klon hat keine,
 * und ein Ueberspringen ist keine Behauptung (`check-vacuous-gates.mjs`).
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const relativePath = 'apps/core/src/migrations.ts';
const errors = [];

/** Kennung je Konstantenname, aus `export const X = '0007_...' as const`. */
function migrationIdsByConstant(source) {
  return new Map([...source.matchAll(
    /export const (\w+MigrationId)\s*=\s*'([0-9]{4}_[a-z0-9_]+)'/gu,
  )].map(([, constant, id]) => [constant, id]));
}

/**
 * Der Rumpf jeder Wanderung, an ihrer Kennung aufgehaengt und ueber die
 * Klammern abgegrenzt - nicht bis zur naechsten Kennung, denn eine
 * dazwischengeschobene Wanderung wuerde die Nachbarn sonst als geaendert
 * melden, und das waere ein Fehlalarm ueber genau die Bewegung, die erlaubt
 * ist: hinten anfuegen.
 */
function migrationBodies(source) {
  const lines = source.split('\n');
  const constants = migrationIdsByConstant(source);
  const bodies = new Map();
  const order = [];
  for (const [index, line] of lines.entries()) {
    const named = /^\s*id:\s*(\w+MigrationId),\s*$/u.exec(line);
    if (named === null) {
      continue;
    }
    const id = constants.get(named[1]);
    if (id === undefined) {
      continue;
    }
    let start = index;
    while (start > 0 && !/^\s*\{\s*$/u.test(lines[start])) {
      start -= 1;
    }
    let depth = 0;
    let end = start;
    for (; end < lines.length; end += 1) {
      for (const character of lines[end]) {
        if (character === '{') {
          depth += 1;
        } else if (character === '}') {
          depth -= 1;
        }
      }
      if (depth === 0 && end > start) {
        break;
      }
    }
    /**
     * Die Reihenfolge *mit* Wiederholungen wird getrennt gefuehrt (Befund B98).
     *
     * Eine `Map` schluckt eine doppelte Kennung, bevor irgendeine Regel sie
     * sehen koennte - meine erste Fassung der Eindeutigkeitsregel konnte
     * deshalb gar nicht ausloesen, und die Pflanzung hat es gezeigt statt der
     * Kopf.
     */
    order.push(id);
    bodies.set(id, lines.slice(start, end + 1).join('\n'));
  }
  return { bodies, order };
}

let releaseTag;
try {
  releaseTag = execSync('git tag --list "v*" --sort=-v:refname', {
    cwd: repoRoot,
    encoding: 'utf8',
  }).split('\n')[0]?.trim();
} catch {
  releaseTag = undefined;
}

if (releaseTag === undefined || releaseTag === '') {
  console.log(
    'Migration immutability check skipped: this checkout carries no release tag, '
    + 'so there is nothing to compare a shipped migration against.',
  );
  process.exit(0);
}

let released;
try {
  released = execSync(`git show ${releaseTag}:${relativePath}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
} catch {
  console.log(
    `Migration immutability check skipped: ${releaseTag} does not carry `
    + `${relativePath}, so there is nothing to compare.`,
  );
  process.exit(0);
}

const shipped = migrationBodies(released).bodies;
const parsed = migrationBodies(readFileSync(join(repoRoot, relativePath), 'utf8'));
const current = parsed.bodies;

if (shipped.size === 0) {
  console.error(
    `Migration immutability check failed: no migration was read out of ${releaseTag}, `
    + 'so this check compared nothing and must not report that as clean.',
  );
  process.exit(1);
}

/**
 * Zwei Eigenschaften der Liste von heute, nicht ihrer Geschichte
 * (Befund B98).
 *
 * `listPendingMigrations` filtert die Liste **in ihrer Reihenfolge** und
 * sortiert nicht nach Kennung. Also zaehlt beides:
 *
 * - Eine Kennung, die zweimal vorkommt, steht zweimal in derselben Auswahl -
 *   die Liste wird einmal berechnet und dann abgearbeitet -, also liefe sie
 *   **zweimal**, und aufgezeichnet wuerde sie einmal.
 * - Eine Nummer, die spaeter steht als eine hoehere, laeuft spaeter als sie.
 *   Die Nummerierung waere dann eine Aussage ueber eine Ordnung, die es nicht
 *   gibt - und wer eine Wanderung auf das Schema der vorigen baut, baut auf
 *   eine, die noch nicht lief.
 */
const inOrder = parsed.order;
const seen = new Set();
for (const id of inOrder) {
  if (seen.has(id)) {
    errors.push(
      `${id} appears twice in the migration list. The pending set is computed once `
      + 'and then applied, so both entries would run and only one id would be '
      + 'recorded.',
    );
  }
  seen.add(id);
}
const numbers = inOrder.map((id) => Number.parseInt(id.slice(0, 4), 10));
for (let index = 1; index < numbers.length; index += 1) {
  if (numbers[index] <= numbers[index - 1]) {
    errors.push(
      `${inOrder[index]} stands after ${inOrder[index - 1]} and is not numbered after `
      + 'it. Migrations run in list order, not in id order, so the numbering would be '
      + 'a statement about an order that does not exist.',
    );
  }
}

for (const [id, body] of shipped) {
  const now = current.get(id);
  if (now === undefined) {
    errors.push(
      `${id} shipped in ${releaseTag} and is gone. Every installation that ran it `
      + 'still carries what it did, so removing it makes the list disagree with the '
      + 'installations rather than with the past.',
    );
    continue;
  }
  if (now !== body) {
    errors.push(
      `${id} shipped in ${releaseTag} and its body changed. An installation that `
      + 'already ran it will never run it again - its id is recorded - so the change '
      + 'reaches new installations only, and the code then expects a schema the old '
      + 'ones never got. Add a new migration instead.',
    );
  }
}

/**
 * Die erste Wanderung, die eine Sicherung verlangt, legt eine Klartextkopie an.
 *
 * **Der Anlass** (2026-09-18, Befund B205). `createSqliteBackup` ist
 * vollstaendig gebaut und geprueft, und es laeuft nie: eine Sicherung entsteht
 * nur, wenn eine *ausstehende* Wanderung `requiresBackup: true` traegt, und
 * keine der sechsundzwanzig tut das. Wer die erste schreibt, legt damit still
 * eine vollstaendige Kopie der Datenbank nach `<data>/backups` - und nichts im
 * Baum raeumt eine `.bak` je wieder ab.
 *
 * **Warum das seit B203 schwerer wiegt.** Der Store vergisst jetzt wirklich
 * (`secure_delete = ON`), also waere eine solche Kopie der einzige Ort, an dem
 * geloeschter Inhalt weiterlebt - auf einem Home ohne eingeschaltete
 * Verschluesselung als Klartext. ADR 0070 nennt genau das als Restrisiko, ADR
 * 0119 Q5 nimmt Sicherungsgroesse und Aufbewahrung ausdruecklich aus seinem
 * Umfang. Beides ist ehrlich; unbeabsichtigt ist nur, dass die Kopie *leise*
 * entsteht.
 *
 * **Also ein Tor ueber null Faellen**, in der Bauart von
 * `check-product-path.mjs`: es faengt heute nichts und weist den ersten
 * Rueckfall ab. Wer eine Sicherung verlangt, traegt hier ein, wer die Kopie
 * wieder wegnimmt - ein Satz, den sonst niemand zu schreiben haette.
 */
const arguedBackupMigrations = new Map([
  // ['0027_beispiel', 'wer die Kopie wieder wegnimmt, und wann'],
]);
let backupMigrationsChecked = 0;
for (const [id, body] of current) {
  if (!/requiresBackup:\s*true/u.test(body)) {
    continue;
  }
  backupMigrationsChecked += 1;
  if (!arguedBackupMigrations.has(id)) {
    errors.push(
      `${id} declares requiresBackup: true, and nothing says who removes the copy it `
      + 'makes. A backup is a full copy of the database in `<data>/backups`; no code in '
      + 'this tree ever prunes one, and since finding B203 the live store overwrites '
      + 'what it deletes - so that copy is the one place deleted content survives, as '
      + 'plaintext on a Home without encryption. Name in '
      + 'scripts/check-migration-immutability.mjs who takes it away again.',
    );
  }
}
for (const id of arguedBackupMigrations.keys()) {
  if (!current.has(id)) {
    errors.push(
      `${id} is argued as a backup-requiring migration and no such migration is in the `
      + 'tree. An argument for a migration that is gone is one more sentence nobody reads.',
    );
  }
}

if (errors.length > 0) {
  console.error('Migration immutability check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Migration immutability check passed (${shipped.size} migrations shipped in `
  + `${releaseTag}, each still word for word what it was; ${current.size} in the tree, `
  + `each named once and numbered in the order it runs; ${backupMigrationsChecked} of `
  + `them ask for a backup before they run, ${arguedBackupMigrations.size} with a named `
  + 'owner for the copy that makes).',
);
