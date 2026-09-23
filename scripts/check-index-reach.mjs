import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every index a Home builds is one some query plan chooses, or says why not.
 *
 * **The occasion** (2026-09-17, finding B188). `column:check` asks whether a
 * column has an asker. This asks the same about an index, and the cost is
 * sharper: a column that nobody reads wastes bytes, an index that nobody uses
 * makes *every write to its table slower*. Measured on the event log, dropping
 * its two unused indexes took 50,000 inserts from 295 ms to 205 ms - a third of
 * the write time for two paths nobody walks.
 *
 * **The instrument is SQLite, not a reader of SQL.** This builds the real
 * schema in a temporary database, hands every statement the product prepares to
 * `EXPLAIN QUERY PLAN`, and collects the indexes the plans name. A plan chooses
 * indexes on an empty table too - checked, because an empty database that
 * preferred scans everywhere would make this whole check say "nothing is used".
 *
 * **And the statements come from the syntax tree, not a regular expression.**
 * Five regex attempts got five different wrong answers before this one (B188):
 * missing parameter values, a missing schema, statements in double quotes,
 * backticks inside doc comments that shift where a template literal ends, and
 * finally one statement that never turned up at all - which put a *demonstrably
 * wrong* index in the list. `.prepare(...)` as a call expression, its single
 * argument as text, found 371 statements where the last regex found 301.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require('typescript');
const Database = createRequire(join(repoRoot, 'apps', 'core', 'package.json'))('better-sqlite3');
const { runMigrations } = await import(join(repoRoot, 'apps', 'core', 'dist', 'migrations.js'));

/**
 * An index no plan chooses, and why it stays.
 *
 * `constraint` is **verified, not trusted**: the index must really be `UNIQUE`,
 * or the entry is refused. The others are judgements, and each says which kind
 * it is, because "built before its query" and "overtaken by a better path" age
 * differently - the first becomes used, the second never will.
 */
const argued = [
  {
    name: 'pico_event_device_lamport_unique_idx',
    kind: 'constraint',
    why: 'Befund B222, Nutzerentscheidung 18: zwei Kerne auf einer Datenbank vergeben '
      + 'dieselbe Lamport-Zahl, weil die Uhr einmal beim Start gesetzt wird. Dieser Index '
      + 'sucht nichts, er laesst den zweiten Schreiber am Speicher fallen - dieselbe Form, '
      + 'mit der pico_audit_record es ueber (writer_id, chain_position) schon tut',
  },
  {
    name: 'idx_pico_identity_root_rotation_one_pending',
    kind: 'constraint',
    why: 'a UNIQUE partial index saying one pending root rotation per predecessor. '
      + 'A plan never chooses it because looking things up is not what it is for',
  },
  {
    name: 'idx_pico_event_stream',
    kind: 'ahead_of_its_query',
    why: 'ADR 0014 designs the log to become replicated, and a replica reads by '
      + 'stream. Nothing reads by stream today, so every event pays for it now',
  },
  {
    name: 'idx_pico_event_device',
    kind: 'ahead_of_its_query',
    why: 'the same, by writing device. Measured: these two together are a third '
      + 'of the insert time on pico_event',
  },
  {
    name: 'idx_memory_item_place',
    kind: 'ahead_of_its_query',
    why: 'a partial index on coordinates for active items. Spatial Recall has no '
      + 'caller for its derivation yet, so the query that would use this does '
      + 'not exist - progress.md has said so for a while',
  },
  {
    name: 'idx_pico_home_membership_identity',
    kind: 'overtaken',
    why: 'usable, and chosen when a query names only the fingerprint - but every '
      + 'real query also names home_id, and then idx_pico_home_membership_home '
      + 'wins. Not dead, overtaken',
  },
  {
    name: 'idx_memory_key_envelope_domain',
    kind: 'no_query_filters_here',
    why: 'nothing filters memory_key_envelope by domain_id',
  },
  {
    name: 'idx_pico_share_envelope_domain',
    kind: 'no_query_filters_here',
    why: 'nothing filters pico_share_envelope by home_id and privacy_domain',
  },
  {
    name: 'idx_pico_home_device_lifecycle_identity',
    kind: 'no_query_filters_here',
    why: 'nothing filters the lifecycle transitions by identity fingerprint',
  },
  {
    name: 'idx_schema_migration_audit_finished_at',
    kind: 'no_query_filters_here',
    why: 'the migration audit is written and never read back by finished_at',
  },
];

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith('.ts') && !path.includes('.test.')) found.push(path);
  }
  return found;
}

/**
 * The text of a string or template argument, with interpolations stood in for.
 *
 * A `${...}` that names a column list becomes one harmless column and anything
 * else becomes a literal: the plan depends on the tables and the WHERE clause,
 * not on which columns a SELECT returns.
 */
function statementText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (!ts.isTemplateExpression(node)) return undefined;
  let text = node.head.text;
  for (const span of node.templateSpans) {
    const name = span.expression.getText();
    text += name.endsWith('Columns') ? '1 AS a' : '1';
    text += span.literal.text;
  }
  return text;
}

const directory = mkdtempSync(join(tmpdir(), 'pico-index-reach-'));
const db = new Database(join(directory, 'schema.sqlite'));
try {
  runMigrations(db);
  const relayStore = readFileSync(join(repoRoot, 'apps', 'relay', 'src', 'store.ts'), 'utf8');
  for (const match of relayStore.matchAll(/CREATE (?:TABLE|INDEX|UNIQUE INDEX)(?: IF NOT EXISTS)? [\s\S]*?;/gu)) {
    try {
      db.exec(match[0]);
    } catch {
      // A fragment of a larger statement; the tables this check needs are whole.
    }
  }

  const indexes = db
    .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL")
    .all();

  const statements = [];
  for (const root of ['apps', 'packages', 'modules']) {
    for (const path of sourceFiles(join(repoRoot, root))) {
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      (function scan(node) {
        if (ts.isCallExpression(node)
          && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === 'prepare'
          && node.arguments.length === 1) {
          const sql = statementText(node.arguments[0]);
          if (sql !== undefined) statements.push({ path: relative(repoRoot, path), sql: sql.trim() });
        }
        node.forEachChild(scan);
      })(source);
    }
  }

  const chosen = new Set();
  let planned = 0;
  for (const statement of statements) {
    try {
      const holes = (statement.sql.match(/\?/gu) ?? []).length;
      const values = Array.from({ length: holes }, () => null);
      for (const row of db.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...values)) {
        for (const match of String(row.detail).matchAll(/USING (?:COVERING )?INDEX ([A-Za-z0-9_]+)/gu)) {
          chosen.add(match[1]);
        }
      }
      planned += 1;
    } catch {
      // A statement this reader cannot stand in for; counted, not guessed at.
    }
  }

  const arguedByName = new Map(argued.map((entry) => [entry.name, entry]));
  const failures = [];
  const unchosen = [];
  for (const index of indexes) {
    const entry = arguedByName.get(index.name);
    if (chosen.has(index.name)) {
      if (entry !== undefined) {
        failures.push(`${index.name} is argued as ${entry.kind} but a query plan chooses it; drop the entry`);
      }
      continue;
    }
    if (entry === undefined) {
      failures.push(
        `${index.name} on ${index.tbl_name} is an index no query plan chooses, and says no reason. `
        + 'Every write to that table pays for it.',
      );
      continue;
    }
    if (entry.kind === 'constraint' && !/CREATE UNIQUE/u.test(index.sql)) {
      failures.push(`${index.name} is argued as a constraint but is not UNIQUE`);
      continue;
    }
    unchosen.push(index.name);
  }
  for (const name of arguedByName.keys()) {
    if (!indexes.some((index) => index.name === name)) {
      failures.push(`${name} is argued but no such index is declared`);
    }
  }
  if (planned < statements.length * 0.9) {
    failures.push(
      `only ${planned} of ${statements.length} prepared statements could be planned. Below nine `
      + 'tenths this check is measuring its own blind spots, not the schema.',
    );
  }

  if (failures.length > 0) {
    console.error('Index reach check failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    const kinds = [...new Set(argued.map((entry) => entry.kind))]
      .map((kind) => `${argued.filter((entry) => entry.kind === kind).length} ${kind}`)
      .join(', ');
    console.log(
      `Index reach check passed (${indexes.length} indexes; ${planned} of ${statements.length} `
      + `prepared statements planned by SQLite itself, and their plans choose `
      + `${indexes.length - unchosen.length} of them; ${unchosen.length} argued: ${kinds} - and `
      + 'every constraint entry is checked to be UNIQUE rather than believed).',
    );
  }
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
