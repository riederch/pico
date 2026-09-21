import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Was eine geoeffnete SQLite-Datei ueber sich wissen muss, bevor sie das erste
 * Mal etwas tut.
 *
 * **Der Anlass** (2026-09-21, Befund B245). `secure_delete = ON` steht in
 * beiden schreibenden Stores, und es steht dort, weil es **gemessen** wurde:
 * sechzig Eintraege mit einem eindeutigen Satz, alle geloescht, der Store
 * geschlossen - und der Satz stand einundsechzigmal noch in der Datei. Nur ein
 * `VACUUM` bekam ihn heraus, und keiner laeuft hier je. Das ist der Unterschied
 * zwischen "geloescht" und "nicht mehr aufgelistet", an den Erinnerungen einer
 * Person.
 *
 * Gehalten hat das niemand. Ein dritter Store, oder eine Umstellung im
 * Konstruktor, und der Beweis von damals gilt fuer die neue Datei nicht - ohne
 * dass ein Test faellt, denn keine API sagt, ob ein geloeschtes Byte noch
 * dasteht.
 *
 * **Drei Pragmas, und jedes hat seinen eigenen Grund.**
 *
 * `secure_delete` ist die Aussage oben: geloescht heisst weg.
 *
 * `journal_mode = WAL` ist die Haltbarkeitsseite - ein Leser blockiert keinen
 * Schreiber und ein Absturz laesst eine Datei zurueck, die sich selbst wieder
 * herstellt.
 *
 * `foreign_keys` wird **nur dort verlangt, wo es etwas durchzusetzen gibt**.
 * Der Kommentar im Home-Store sagt es selbst: ein Pragma ohne Gegenstand ist
 * ein Pruefer ohne Gegenstand (B166). Das Relay-Schema kennt kein `REFERENCES`
 * und setzt es darum zu Recht nicht.
 *
 * **Die Reihenfolge ist Teil der Regel.** Ein Pragma wirkt ab dem Moment, in
 * dem es gesetzt wird. Stuende `secure_delete` hinter den Migrationen, waeren
 * deren Loeschungen nicht gedeckt. Verlangt wird deshalb: gesetzt, bevor auf
 * derselben Verbindung das erste Mal etwas ausgefuehrt wird.
 *
 * **Nur schreibende Verbindungen.** `sqlite-backup.ts` oeffnet zweimal mit
 * `readonly: true` und loescht nichts; die Sicherung selbst geht ueber die
 * Backup-API, die nur lebende Seiten kopiert. Das ist gezaehlt und
 * ausgenommen, nicht uebersehen.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

/** Was jede schreibende Verbindung setzen muss, und woran man den Zwang erkennt. */
const required = [
  { pragma: 'journal_mode', value: 'WAL', always: true },
  { pragma: 'secure_delete', value: 'ON', always: true },
  {
    pragma: 'foreign_keys',
    value: 'ON',
    always: false,
    // Nur wenn das Schema dieser Datei ueberhaupt eine Fremdschluesselregel
    // erklaert - sonst ist es ein Pragma ohne Gegenstand.
    whenSourceHas: 'REFERENCES',
  },
];

const errors = [];
const writable = [];
const readOnly = [];

const files = execSync('git ls-files "*.ts"', { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '' && !path.includes('/dist/') && !path.includes('.test.'));

for (const path of files) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  if (!text.includes('new Database(')) {
    continue;
  }
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);

  (function walk(node) {
    if (ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'Database') {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const options = node.arguments?.[1];
      const isReadOnly = options !== undefined
        && ts.isObjectLiteralExpression(options)
        && options.properties.some(
          (property) => ts.isPropertyAssignment(property)
            && ts.isIdentifier(property.name)
            && property.name.text === 'readonly'
            && property.initializer.kind === ts.SyntaxKind.TrueKeyword,
        );
      if (isReadOnly) {
        readOnly.push({ path, line });
        return;
      }

      // Auf welchen Ausdruck die Verbindung gelegt wird - `this.db`, `db`, …
      let receiver;
      for (let up = node.parent; up !== undefined; up = up.parent) {
        if (ts.isVariableDeclaration(up) && ts.isIdentifier(up.name)) {
          receiver = up.name.text;
          break;
        }
        if (ts.isBinaryExpression(up)
          && up.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          receiver = up.left.getText(source);
          break;
        }
        if (ts.isBlock(up)) break;
      }
      if (receiver === undefined) {
        errors.push(
          `${path}:${line}: opens a writable database into something this check cannot name, `
          + 'so the pragmas after it cannot be matched to it. Assign the connection to a '
          + 'variable or a field.',
        );
        return;
      }

      // Der Block, in dem geoeffnet wird, in Anweisungsreihenfolge.
      let block = node.parent;
      while (block !== undefined && !ts.isBlock(block)) block = block.parent;
      const statements = block === undefined ? [] : block.statements;

      const seen = new Map();
      let firstUse;
      let passedOpen = false;
      for (const statement of statements) {
        const line2 = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
        if (!passedOpen) {
          if (statement.getStart(source) <= node.getStart(source)
            && node.getEnd() <= statement.getEnd()) {
            passedOpen = true;
          }
          continue;
        }
        const calls = [];
        (function collect(inner) {
          if (ts.isCallExpression(inner)
            && ts.isPropertyAccessExpression(inner.expression)
            && inner.expression.expression.getText(source) === receiver) {
            calls.push(inner);
          }
          inner.forEachChild(collect);
        })(statement);
        for (const call of calls) {
          const method = call.expression.name.text;
          if (method === 'pragma') {
            const argument = call.arguments[0];
            if (argument !== undefined && ts.isStringLiteralLike(argument)) {
              const [name, value] = argument.text.split('=').map((part) => part.trim());
              if (!seen.has(name)) seen.set(name, { value, line: line2 });
            }
            continue;
          }
          if (firstUse === undefined && method !== 'close') {
            firstUse = { method, line: line2 };
          }
        }
      }

      writable.push({ path, line, receiver, seen: [...seen.keys()] });
      for (const rule of required) {
        if (!rule.always && !text.includes(rule.whenSourceHas)) {
          continue;
        }
        const set = seen.get(rule.pragma);
        if (set === undefined) {
          errors.push(
            `${path}:${line}: opens a writable database and never sets \`${rule.pragma}\`. `
            + (rule.pragma === 'secure_delete'
              ? 'Deleted person content then stays in the page until something overwrites it, '
              + 'and nothing here ever runs a VACUUM - measured at sixty deletes, the sentence '
              + 'was still in the file sixty-one times.'
              : `Every other store in this repository sets \`${rule.pragma} = ${rule.value}\`, `
              + 'and a store that differs differs for a reason nobody wrote down.'),
          );
          continue;
        }
        if (set.value !== rule.value) {
          errors.push(
            `${path}:${set.line}: sets \`${rule.pragma} = ${set.value}\` where every other `
            + `store sets \`${rule.value}\`.`,
          );
          continue;
        }
        if (firstUse !== undefined && set.line > firstUse.line) {
          errors.push(
            `${path}:${set.line}: sets \`${rule.pragma}\` after \`${receiver}.${firstUse.method}\` `
            + `on line ${firstUse.line}. A pragma holds from the moment it is set, so whatever `
            + 'that call did was not covered by it.',
          );
        }
      }
    }
    node.forEachChild(walk);
  })(source);
}

if (writable.length < 2) {
  errors.push(
    `Only ${writable.length} writable SQLite connection found, and this repository has two `
    + '(the Home event store and the relay store). A check that has lost its subject is '
    + 'broken rather than satisfied (B166).',
  );
}

if (errors.length > 0) {
  console.error('Store-pragma check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Store-pragma check passed (${writable.length} writable SQLite connections, each setting `
  + 'journal_mode = WAL and secure_delete = ON before it does anything, and foreign_keys = ON '
  + `wherever a schema declares one; ${readOnly.length} read-only openings, which delete `
  + 'nothing and are exempt by their own flag).',
);
