import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every column a Home stores is asked for somewhere, or says why not.
 *
 * **The occasion** (2026-09-17, finding B184). `check-store-writers.mjs` asks
 * whether a store method has a caller. This asks the same question one level
 * down, about the data itself: a column that is written and never queried is
 * something a person's Home keeps for nobody. Of 418 columns, 28 were in that
 * state, and 27 of them turned out to be copies with a second home. The
 * twenty-eighth was not: `pico_module_effect_consent.consented_at` recorded
 * *when* a person agreed to a module effect, and nothing - not the person, not
 * a surface, not an auditor - could read it back. Seit dem 2026-09-23 liest es
 * der Zustimmungsschirm der Schale: wer erneut gefragt wird, weil ein Modul
 * jetzt etwas anderes will, sieht daneben den Tag seiner frueheren Zusage
 * (Nutzerentscheidung 9). Damit hat dieser Pruefer keine offene Frage mehr.
 *
 * **What counts as a column is derived**: the `CREATE TABLE` blocks in
 * `apps/core/src/migrations.ts`, which is where this repository's schema
 * lives. What counts as *asked for* is the column's name appearing anywhere in
 * the tree outside its own `CREATE TABLE` block and outside a write position -
 * an `INSERT INTO t (...)` column list or an `UPDATE t SET col =` assignment.
 * A `CREATE INDEX` counts as asked for: an index exists to be queried through.
 *
 * **Why the file itself is not excluded**, said because the first measurement
 * got this wrong: `migrations.ts` holds both the schema *and* the writer for
 * the migration audit, a few hundred lines apart. Excluding the file reported
 * a column as untouched that is written in it. Only the blocks are masked.
 *
 * **What this cannot see** is a column queried through `SELECT *` and then
 * reached by a name this reader cannot tie back - the repository does not do
 * that today (every read names its columns or reads a `*_json` blob), and if
 * it starts, this check will report a gap that is not one. The honest fix then
 * is an argued entry, not a looser rule.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
/**
 * Both places this repository declares tables. The Home's schema lives in its
 * migrations; the relay carries its four tables in its own store. Checking only
 * the first would make this check's sentence wider than its subject - it says
 * "every column a Home stores", and a relay stores too (B187).
 */
const schemaFiles = [
  join(repoRoot, 'apps', 'core', 'src', 'migrations.ts'),
  join(repoRoot, 'apps', 'relay', 'src', 'store.ts'),
];

/**
 * Columns written but never queried, each with the reason it stays.
 *
 * `beside_json` is **verified, not trusted**: the table must really carry a
 * `*_json` column, or the entry is refused. `recoverable` names the column the
 * value can still be read from. `open_question` is a finding that has not been
 * decided yet and says where the decision lives.
 */
const argued = [
  {
    kind: 'beside_json',
    why: 'the row carries the whole record as JSON, and every read goes through '
      + 'that; these columns are denormalised copies no SELECT names',
    columns: [
      'pico_identity_delegation.subject_signing_key_fingerprint_hex',
      'pico_identity_revocation.subject_kind',
      'pico_identity_revocation.subject_ref',
      'pico_model_job_queue.last_attempt_at',
      'pico_reader_custody_domain.owner_identity_key_fingerprint_hex',
      'pico_reader_custody_domain.owner_reader_key_fingerprint_hex',
      'pico_reader_custody_domain.received_at',
      'pico_reader_custody_item.writer_device_signing_key_fingerprint_hex',
      'pico_reader_custody_item.content_ciphertext_hex',
      'pico_reader_custody_item.wrapped_dek_hex',
      'pico_reader_custody_item.received_at',
      'pico_reader_custody_kek_rotation.previous_kek_version',
      'pico_reader_custody_kek_rotation.received_at',
      'pico_reader_custody_reader_grant.owner_identity_key_fingerprint_hex',
      'pico_reader_custody_reader_grant.reader_device_signing_key_fingerprint_hex',
      'pico_reader_custody_reader_grant.reader_delegation_id',
      'pico_reader_custody_reader_grant.access_mode',
      'pico_reader_custody_reader_grant.first_kek_version',
      'pico_reader_custody_reader_grant.received_at',
      'pico_reader_custody_reader_grant_lifecycle.received_at',
      'pico_reader_custody_writer_grant.owner_identity_key_fingerprint_hex',
      'pico_reader_custody_writer_grant.writer_device_signing_key_fingerprint_hex',
      'pico_reader_custody_writer_grant.received_at',
      'pico_reader_custody_writer_grant_lifecycle.received_at',
      'pico_share_envelope.issuer_identity_key_fingerprint_hex',
      'pico_share_envelope.wrap_digest_hex',
    ],
  },
  {
    kind: 'recoverable',
    why: 'the row references pico_event, and the instant is readable there as '
      + 'created_at',
    columns: ['pico_audit_record.recorded_at'],
  },
];

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith('.ts') || path.endsWith('.mjs')) found.push(path);
  }
  return found;
}

/** The declared tables, and the span each `CREATE TABLE` block occupies. */
function readSchema(text) {
  const tables = new Map();
  const spans = [];
  const opener = /CREATE TABLE(?: IF NOT EXISTS)? (\w+)\s*\(/gu;
  for (const match of text.matchAll(opener)) {
    let depth = 1;
    let index = match.index + match[0].length;
    const bodyStart = index;
    while (depth > 0 && index < text.length) {
      if (text[index] === '(') depth += 1;
      else if (text[index] === ')') depth -= 1;
      index += 1;
    }
    spans.push([match.index, index]);
    const columns = tables.get(match[1]) ?? [];
    for (const line of text.slice(bodyStart, index - 1).split('\n')) {
      const column = /^([a-z][a-z0-9_]*)\s+(?:TEXT|INTEGER|REAL|BLOB|NUMERIC)\b/u
        .exec(line.trim());
      if (column && !columns.includes(column[1])) columns.push(column[1]);
    }
    tables.set(match[1], columns);
  }
  return { tables, spans };
}

function maskSpans(text, spans) {
  let masked = text;
  for (const [from, to] of [...spans].sort((left, right) => right[0] - left[0])) {
    masked = masked.slice(0, from) + ' '.repeat(to - from) + masked.slice(to);
  }
  return masked;
}

/**
 * Comments are not queries.
 *
 * Added 2026-09-17, after a doc comment that *named* a column - "the database
 * says the same three words in a CHECK constraint on
 * `pico_identity_revocation.subject_kind`" - made this check report that
 * column as asked for. Prose about a column is exactly the thing that looks
 * like a use and is not one.
 */
function maskComments(text) {
  const spans = [];
  for (const match of text.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu)) {
    spans.push([match.index, match.index + match[0].length]);
  }
  return maskSpans(text, spans);
}

/** Write positions: an INSERT column list, or the assignments of an UPDATE. */
function maskWrites(text) {
  const spans = [];
  for (const match of text.matchAll(/INSERT(?: OR \w+)? INTO\s+\w+\s*\(([^)]*)\)/gsu)) {
    spans.push([match.index + match[0].indexOf(match[1]), match.index + match[0].length - 1]);
  }
  for (const match of text.matchAll(/UPDATE\s+\w+\s+SET\s+(.{0,900}?)(?:WHERE|\n\s*`|$)/gsu)) {
    spans.push([match.index + match[0].indexOf(match[1]), match.index + match[0].indexOf(match[1]) + match[1].length]);
  }
  return maskSpans(text, spans);
}

const schemaTexts = new Map(schemaFiles.map((path) => [path, readFileSync(path, 'utf8')]));
const tables = new Map();
const spansByFile = new Map();
for (const [path, text] of schemaTexts) {
  const read = readSchema(text);
  spansByFile.set(path, read.spans);
  for (const [table, columns] of read.tables) tables.set(table, columns);
}

/**
 * This file is not part of its own corpus. The argued list below names every
 * column it excuses, so a checker that reads itself finds each of them
 * "queried" and passes over nothing - which is exactly what the first run did.
 *
 * **Und kein anderes Tor ist es** (2026-09-22, Befund B252). Das Argument
 * darueber gilt fuer jedes Tor, nicht nur fuer dieses: ein Pruefer nennt eine
 * Spalte, um **ueber** sie zu urteilen, nie um sie zu lesen. Als
 * `forget:check` seine Spalten begruendete, zaehlte dieser Schritt das als
 * Abfrage und meldete einen Eintrag zu Unrecht als ueberfluessig. Gemessen,
 * bevor es geaendert wurde: der Ausschluss aller `check-*.mjs` laesst jedes
 * Urteil hier unveraendert - 437 Spalten, 409 gelesen, 28 begruendet.
 */
const self = fileURLToPath(import.meta.url);
const gateScript = /(?:^|\/)check-[a-z-]+\.mjs$/u;
const sources = [];
for (const root of ['apps', 'packages', 'modules', 'scripts']) {
  sources.push(...sourceFiles(join(repoRoot, root)).filter(
    (path) => path !== self && !gateScript.test(path),
  ));
}
/**
 * Masked per file, not on one joined string: a span is a position in the file
 * it was found in, and joining first makes every offset after the first file
 * point at the wrong text.
 */
const queryable = sources
  .map((path) => maskWrites(maskComments(schemaTexts.has(path)
    ? maskSpans(schemaTexts.get(path), spansByFile.get(path))
    : readFileSync(path, 'utf8'))))
  .join('\n');

const arguedByColumn = new Map();
for (const entry of argued) {
  for (const column of entry.columns) arguedByColumn.set(column, entry);
}

const failures = [];
const unread = [];
let columnCount = 0;
for (const [table, columns] of tables) {
  const hasJson = columns.some((column) => column.endsWith('_json'));
  for (const column of columns) {
    columnCount += 1;
    const qualified = `${table}.${column}`;
    const asked = new RegExp(`\\b${column}\\b`, 'u').test(queryable);
    const entry = arguedByColumn.get(qualified);
    if (asked && entry !== undefined) {
      failures.push(`${qualified} is argued as ${entry.kind} but a query does name it; drop the entry`);
      continue;
    }
    if (asked) continue;
    if (entry === undefined) {
      failures.push(`${qualified} is written and never queried, and says no reason`);
      continue;
    }
    if (entry.kind === 'beside_json' && !hasJson) {
      failures.push(`${qualified} is argued as beside_json but ${table} carries no *_json column`);
      continue;
    }
    unread.push(qualified);
  }
}

for (const column of arguedByColumn.keys()) {
  const [table, name] = column.split('.');
  if (!tables.has(table) || !tables.get(table).includes(name)) {
    failures.push(`${column} is argued but no such column is declared`);
  }
}

if (failures.length > 0) {
  console.error('Column reach check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const counts = argued
    .map((entry) => `${entry.columns.length} ${entry.kind}`)
    .join(', ');
  console.log(
    `Column reach check passed (${columnCount} columns across ${tables.size} tables, `
    + `${columnCount - unread.length} named by something other than a write; `
    + `${unread.length} argued: ${counts} - and every beside_json entry sits in a `
    + `table that really carries the record as JSON, checked here rather than believed).`,
  );
}
