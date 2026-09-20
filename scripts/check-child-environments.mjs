import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A program this tree starts gets what it needs and nothing about this
 * process.
 *
 * **The occasion** (2026-09-20, finding B227). The posture is written twice
 * and argued well. `supplier-host.ts` hands a supplier `{ PATH }`: *"a
 * supplier that could read this process's environment would have the
 * configuration channel the manifest's missing `env` field exists to deny"*.
 * `depot-fetch.ts` repeats it for `git`: *"`git` gets what it needs to run and
 * nothing about this process"*. Both cite ADR 0143 DP3.
 *
 * The TPM adapter handed `{ ...process.env }` to `tpm2_*` - the whole
 * environment of a Home, which is where `PICO_FOUNDATION_TOKEN` lives beside
 * every path this Home keeps its keys at. Nothing leaked: tpm2-tools is a
 * trusted binary on the same machine under the same user. What was missing is
 * the reason.
 *
 * **What this cannot see, measured while planting against it.** It reads the
 * call site. Where a caller assembles the environment one function earlier and
 * hands it down - which is exactly what the TPM adapter does - the spawn only
 * carries an identifier, and this check reports a controlled environment
 * because at that line there is one. The content is held by a test instead
 * (`platform-anchor.test.ts`, B227), which pushes its own `run` in and asks
 * what the child was really given. Two nets, two questions, and the one this
 * file answers is: does anybody hand over `process.env` where a reader can see
 * it.
 *
 * **Inheriting is sometimes right, and then it is argued.** The companion runs
 * as the person, on the person's session: `notify-send` cannot find the bus
 * without `DBUS_SESSION_BUS_ADDRESS`, `lp` reads the session's printing
 * configuration, and a shell relaunching itself wants the environment it was
 * started with. Each of those says so here, and each argument names something
 * that must still be in its file - so an argument that stops describing its
 * subject fails rather than outliving it.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

/** Every way this tree starts another program. */
const starters = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync']);

/**
 * A call that inherits the environment on purpose, and what has to stay true.
 *
 * `requires` is a phrase the file must still contain: the argument is about
 * what the file does, so it is checked against the file.
 */
const argued = [
  {
    file: 'apps/companion/src/notify.ts',
    // Das Argument der Anrufung selbst, nicht der Programmname: der steht auch
    // in der Prosa darueber, und eine Phrase, die im Kommentar ueberlebt, haelt
    // nichts (gemessen beim Pflanzen).
    requires: '--app-name=Pico',
    why: 'the desktop notifier runs on the person\'s own session and finds the message bus '
      + 'through DBUS_SESSION_BUS_ADDRESS. A handed-over environment here is the person\'s '
      + 'own, and without it there is nothing to notify',
  },
  {
    file: 'apps/companion-shell/src/linux-print.ts',
    requires: 'request id is',
    why: 'printing goes through the session\'s own CUPS configuration. The card is the most '
      + 'sensitive artefact this product makes, and the answer is still the person\'s printer '
      + 'rather than one Pico picked',
  },
  {
    file: 'apps/companion-shell/src/main.ts',
    requires: 'launching a second copy',
    why: 'a probe relaunching this same shell wants the environment it was started with - '
      + 'that is what it is measuring',
  },
];

const shipped = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => /^(apps|packages|modules)\/.*\.ts$/u.test(path))
  .filter((path) => !path.includes('/dist/') && !path.includes('.test.'));

/** Which names in this file came from `node:child_process`. */
function startersImportedBy(source) {
  const names = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== 'node:child_process') continue;
    const clause = statement.importClause;
    if (clause === undefined || clause.isTypeOnly) continue;
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly) names.add(element.name.text);
      }
    }
  }
  return names;
}

/** The `env` property of any options object this call carries, if it has one. */
function environmentOf(call) {
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (ts.isPropertyAssignment(property)
        && ts.isIdentifier(property.name)
        && property.name.text === 'env') {
        return property.initializer;
      }
    }
  }
  return undefined;
}

/**
 * Whether an expression hands over the whole environment of this process.
 *
 * **Not a text comparison, and the first draft was one** - it matched
 * `process.env` and `{ ...process.env }` and let
 * `{ ...process.env, TPM2TOOLS_TCTI: tcti }` through, which is the exact
 * spelling this finding started from. A spread is a spread however many
 * properties stand beside it, so the question is asked of the syntax tree:
 * is `process.env` spread in here, or is it the expression itself? A narrow
 * read like `process.env.PATH` is not, and that is the whole difference.
 */
function isWholeEnvironment(node) {
  if (node.getText().replace(/\s+/gu, '') === 'process.env') return true;
  let spreads = false;
  (function scan(inner) {
    if (ts.isSpreadAssignment(inner)
      && inner.expression.getText().replace(/\s+/gu, '') === 'process.env') {
      spreads = true;
    }
    inner.forEachChild(scan);
  })(node);
  return spreads;
}

const failures = [];
const controlled = [];
const inherited = [];
const used = new Set();

for (const path of shipped) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  if (!text.includes('node:child_process')) continue;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const names = startersImportedBy(source);
  if (names.size === 0) continue;

  (function scan(node) {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && names.has(node.expression.text)
      && starters.has(node.expression.text)) {
      const where = `${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      const environment = environmentOf(node);
      const entry = argued.find((one) => one.file === path);

      if (environment !== undefined && !isWholeEnvironment(environment)) {
        if (entry !== undefined) {
          failures.push(
            `${where} builds its own environment and ${path} is argued as inheriting one. `
            + 'Drop the entry; an argument for something that is not happening reads as a '
            + 'reason and is furniture.',
          );
        } else {
          controlled.push(`${where} ${node.expression.text}`);
        }
        return;
      }

      if (entry === undefined) {
        failures.push(
          `${where} starts ${node.expression.text} and hands it this process's environment. `
          + 'A Home\'s environment carries PICO_FOUNDATION_TOKEN and every path its keys are '
          + 'at; ADR 0143 DP3\'s posture is that a child gets what it needs and nothing about '
          + 'this process. Give it an explicit env, or argue the inheritance here.',
        );
        return;
      }
      used.add(path);
      if (!text.includes(entry.requires)) {
        failures.push(
          `${path} is argued because of "${entry.requires}", which the file no longer says. `
          + 'The argument outlived what it described.',
        );
        return;
      }
      inherited.push(`${where}: ${entry.why}`);
    }
    node.forEachChild(scan);
  })(source);
}

for (const entry of argued) {
  if (!used.has(entry.file)) {
    failures.push(`${entry.file} is argued here and starts no program that inherits an environment`);
  }
}
if (controlled.length === 0) {
  failures.push(
    'not one controlled child environment was found. Either this tree stopped starting '
    + 'programs or this reader stopped recognising how, and a check with no subject passes by '
    + 'having nothing to say.',
  );
}

if (failures.length > 0) {
  console.error('Child environment check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Child environment check passed (${controlled.length + inherited.length} places start another `
    + `program; ${controlled.length} build the child an environment of their own, `
    + `${inherited.length} hand over the person's session and say why - each argument checked `
    + 'against a phrase its file must still carry).',
  );
  for (const line of controlled) console.log(`  own environment: ${line}`);
  for (const line of inherited) console.log(`  inherited:       ${line}`);
}
