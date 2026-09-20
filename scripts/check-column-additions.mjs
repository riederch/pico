import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A column added to a schema is one a Home with memories in it can take.
 *
 * **The occasion** (2026-09-20, finding B230). Every test in this repository
 * migrates a *fresh* database, and SQLite is more forgiving of an empty table
 * than of a full one. Measured against the bundled SQLite (3.49.2), with the
 * same statement twice:
 *
 *   ALTER TABLE t ADD COLUMN a TEXT NOT NULL
 *     empty table  -> accepted
 *     one row      -> "Cannot add a NOT NULL column with default value NULL"
 *
 *   ALTER TABLE t ADD COLUMN c TEXT DEFAULT CURRENT_TIMESTAMP
 *     empty table  -> accepted
 *     one row      -> "Cannot add a column with non-constant default"
 *
 * So this whole class of defect is invisible here and visible only on a Home
 * that has something in it - which is to say, on somebody's, at the moment
 * they update. The twenty additions in the schema today are all safe; that is
 * the state this check is meant to keep rather than a problem it found.
 *
 * **The instrument is SQLite, not a reader of SQL** (the same choice
 * `index:check` made). Each addition is replayed against a probe table that
 * holds one row, and the database decides. A clause this reader never thought
 * about is judged by the thing that will judge it on the day.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const Database = createRequire(join(repoRoot, 'apps', 'core', 'package.json'))('better-sqlite3');
void require;

/** Both places this repository alters a schema. */
const schemaFiles = [
  join('apps', 'core', 'src', 'migrations.ts'),
  join('apps', 'relay', 'src', 'store.ts'),
];

const additions = [];
for (const path of schemaFiles) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  for (const match of text.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+([^;]+);/gu)) {
    additions.push({
      path,
      table: match[1],
      definition: match[2].replace(/\s+/gu, ' ').trim(),
    });
  }
}

const failures = [];
if (additions.length === 0) {
  failures.push(
    'no ALTER TABLE ... ADD COLUMN was found in the schema at all. Either this repository stopped '
    + 'adding columns or this reader stopped finding them, and a check with no subject passes by '
    + 'having nothing to say.',
  );
}

const db = new Database(':memory:');
try {
  for (const addition of additions) {
    db.exec('DROP TABLE IF EXISTS pico_column_probe');
    // Eine Zeile, denn genau sie ist der Unterschied: SQLite fragt nach einem
    // Wert fuer das, was schon dasteht.
    db.exec('CREATE TABLE pico_column_probe (id TEXT PRIMARY KEY)');
    db.prepare('INSERT INTO pico_column_probe (id) VALUES (?)').run('one-memory');
    try {
      db.exec(`ALTER TABLE pico_column_probe ADD COLUMN ${addition.definition}`);
    } catch (error) {
      failures.push(
        `${addition.path}: \`ALTER TABLE ${addition.table} ADD COLUMN ${addition.definition}\` is `
        + `refused by SQLite on a table that has a row: ${String(error?.message ?? error)}. Every `
        + 'test here migrates an empty database, so this passes the whole suite and fails on the '
        + 'first Home that has something in it.',
      );
    }
  }
} finally {
  db.close();
}

if (failures.length > 0) {
  console.error('Column addition check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Column addition check passed (${additions.length} columns added by migrations, every one of `
    + 'them replayed against a table that already holds a row - which is the case the suite never '
    + 'sees and a person always does).',
  );
}
