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
    bodies.set(id, lines.slice(start, end + 1).join('\n'));
  }
  return bodies;
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

const shipped = migrationBodies(released);
const current = migrationBodies(readFileSync(join(repoRoot, relativePath), 'utf8'));

if (shipped.size === 0) {
  console.error(
    `Migration immutability check failed: no migration was read out of ${releaseTag}, `
    + 'so this check compared nothing and must not report that as clean.',
  );
  process.exit(1);
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

if (errors.length > 0) {
  console.error('Migration immutability check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Migration immutability check passed (${shipped.size} migrations shipped in `
  + `${releaseTag}, each still word for word what it was; ${current.size} in the tree).`,
);
