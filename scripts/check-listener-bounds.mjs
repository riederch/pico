import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every listener this tree opens says what it will not accept, or says why it
 * does not have to.
 *
 * **The occasion** (2026-09-19, finding B219). B78 measured this on
 * 2026-09-07 and found the Foundation surface with *no* receive timeout - not
 * missing but removed, because Fastify sets `requestTimeout` to `0` and a
 * framework that takes a bound away takes it away quietly. Its table had three
 * rows, because the tree had three listening HTTP surfaces.
 *
 * It has seven now. ADR 0154 gave the relay two more, ADR 0110 gave the vault
 * daemon a socket, and a test fixture opens one of its own. The check B78 left
 * behind reads the values off the *running* Foundation server and knows
 * nothing about the other six: the finding aged into a checker whose subject
 * grew out from under it.
 *
 * **What a bound is depends on what kind of listener it is**, and the kind
 * comes from the import rather than from the file's name: `createServer` out
 * of `node:http` is a request surface and owes four bounds; out of `node:net`
 * it is a stream and owes a connection bound plus something that ends a
 * conversation that never starts.
 *
 * **An argued listener is verified, not believed.** Each entry names a thing
 * that must still be true in the object - a hello timeout the daemon really
 * references, a fixture no shipped source really imports - so an argument that
 * stops holding fails here rather than outliving what it described.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

/** What an HTTP listener owes, and the reason is B78's: a bound that is not set is not there. */
const httpBounds = ['headersTimeout', 'requestTimeout', 'keepAliveTimeout', 'maxConnections'];

/**
 * A listener that does not owe the four, and what has to stay true for that.
 *
 * `requires` is a word the file must still contain: the argument is about
 * something in the object, so it is checked against the object.
 */
const argued = [
  {
    file: 'apps/vault-daemon/src/daemon.ts',
    kind: 'net',
    requires: 'HELLO_TIMEOUT_MS',
    why: 'a stream listener on an AF_UNIX path at 0600, so reaching it already means being '
      + 'the owner. It bounds connections with maxConnections and ends a conversation that '
      + 'never starts with its own hello timeout; after hello a connection stays open on '
      + 'purpose, because a lease and an unlocked session are held by one',
  },
  {
    file: 'apps/core/src/test-model-provider-host.ts',
    kind: 'http',
    requires: 'A model host, small enough to run in a test',
    importedOnlyByTests: true,
    why: 'a fixture. It is a real HTTP host because a stubbed fetch cannot fail the way a '
      + 'host fails, and no shipped source imports it - which is checked here rather than '
      + 'read off its own comment',
  },
];

function tracked() {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((path) => /^(apps|packages|modules)\/.*\.ts$/u.test(path));
}

const shipped = tracked().filter((path) => !path.includes('.test.'));
const tests = tracked().filter((path) => path.includes('.test.'));

/** Which module a name was imported from, for the names this check cares about. */
function importedFrom(source) {
  const origins = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause === undefined || clause.isTypeOnly) continue;
    if (clause.name !== undefined) origins.set(clause.name.text, module);
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly) origins.set(element.name.text, module);
      }
    }
  }
  return origins;
}

const failures = [];
const bounded = [];
const excused = [];
const used = new Set();

for (const path of shipped) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  if (!/createServer|Fastify|fastify/u.test(text)) continue;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const origins = importedFrom(source);

  const listeners = [];
  (function scan(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const module = origins.get(name);
      if (name === 'createServer' && module !== undefined) {
        listeners.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, module });
      } else if ((name === 'Fastify' || name === 'fastify') && module !== undefined) {
        listeners.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, module: 'fastify' });
      }
    }
    node.forEachChild(scan);
  })(source);
  if (listeners.length === 0) continue;

  const entry = argued.find((one) => one.file === path);
  const kind = listeners.every((one) => one.module === 'node:net') ? 'net' : 'http';

  if (entry !== undefined) {
    used.add(path);
    if (entry.kind !== kind) {
      failures.push(`${path} is argued as a ${entry.kind} listener and imports say it is ${kind}`);
      continue;
    }
    if (!text.includes(entry.requires)) {
      failures.push(
        `${path} is argued because of \`${entry.requires}\`, which the file no longer contains. `
        + 'The argument outlived what it described.',
      );
      continue;
    }
    if (entry.importedOnlyByTests === true) {
      const stem = path.replace(/^.*\//u, '').replace(/\.ts$/u, '');
      const importers = shipped
        .filter((other) => other !== path)
        .filter((other) => readFileSync(join(repoRoot, other), 'utf8').includes(`./${stem}.js`));
      if (importers.length > 0) {
        failures.push(
          `${path} is argued as a fixture no shipped source imports, and ${importers.join(', ')} `
          + 'imports it. It is part of the product now and owes its bounds.',
        );
        continue;
      }
      if (!tests.some((test) => readFileSync(join(repoRoot, test), 'utf8').includes(`./${stem}.js`))) {
        failures.push(
          `${path} is argued as a fixture and no test imports it either. A listener nothing `
          + 'starts is not a fixture, it is a leftover.',
        );
        continue;
      }
    }
    excused.push(`${path} (${kind}): ${entry.why}`);
    continue;
  }

  if (kind === 'net') {
    failures.push(
      `${path} opens a stream listener and nothing here says how it bounds an idle conversation. `
      + 'Argue it, naming what in the file keeps it true.',
    );
    continue;
  }
  const missing = httpBounds.filter((bound) => !new RegExp(`\\b${bound}\\b`, 'u').test(text));
  if (missing.length > 0) {
    failures.push(
      `${path} opens an HTTP listener and sets no ${missing.join(', ')}. B78: Node bounds the `
      + 'receive at five minutes and a framework may set it to zero, so a bound that is not '
      + 'written here is a bound that is not there.',
    );
    continue;
  }
  bounded.push(`${path} (${listeners.length} listener(s))`);
}

for (const entry of argued) {
  if (!used.has(entry.file)) {
    failures.push(`${entry.file} is argued here and opens no listener any more`);
  }
}
if (bounded.length === 0) {
  failures.push(
    'no bounded listener was found at all. Either this tree stopped listening or this reader '
    + 'stopped recognising how, and a check with no subject passes by having nothing to say.',
  );
}

if (failures.length > 0) {
  console.error('Listener bound check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Listener bound check passed (${bounded.length + excused.length} files open a listener; `
    + `${bounded.length} set all of ${httpBounds.join(', ')}; ${excused.length} argued, each `
    + 'against something the file must still contain rather than against its own say-so).',
  );
  for (const line of bounded) console.log(`  bounded: ${line}`);
  for (const line of excused) console.log(`  argued:  ${line}`);
}
