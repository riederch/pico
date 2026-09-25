#!/usr/bin/env node
/**
 * Befund B278. Jeder Domaenenschluessel, den das Produkt von der Platte laedt,
 * verlaesst den Heap als Nullen - im `finally` derselben Funktion, also auch
 * auf dem Weg, auf dem etwas wirft.
 *
 * **Der Anlass.** Zehn Stellen laden einen Schluessel mit `loadKeyVersion`.
 * Der Export, der Vergleich beim Import, das Schreddern und der Share-Umschlag
 * loeschten ihn. Die drei Wege, die jede Erinnerung und jede Zugangsangabe
 * nimmt - Inhalte, Zugangsdaten fuer Modellanbieter, Zugangsdaten fuer
 * Lieferanten -, liessen ihn dem Garbage Collector, der Speicher freigibt,
 * ohne ihn zu ueberschreiben. Ein einziges Lesen einer Erinnerung hielt so eine
 * Kopie des Schluessels zur ganzen Domaene im Speicher.
 *
 * Gelesen wird mit dem Syntaxbaum: das Ergebnis jedes `loadKeyVersion(...)`
 * muss einem Namen gehoeren, und derselbe Name muss in einem `finally`-Block
 * derselben Funktion mit `.fill(0)` oder `memzero(...)` geloescht werden. Die
 * Tests in `apps/core/src/key-zeroing.test.ts` halten, dass es auch wirkt;
 * dieser Pruefer haelt, dass keine neue Ladestelle ohne die Frage entsteht.
 *
 * Was er nicht haelt, damit niemand mehr hineinliest: die Datenschluessel,
 * die aus einem entpackten Umschlag entstehen. Die tragen keinen Namen, an dem
 * ein Leser sie erkennt, und stehen in denselben drei Funktionen wie der
 * Domaenenschluessel, dessen `finally` sie mitnimmt.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const ts = createRequire(import.meta.url)('typescript');
const root = resolve(import.meta.dirname, '..');

const files = execSync('git ls-files "apps/*.ts" "packages/*.ts"', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '' && !path.includes('/dist/') && !/\.test\.|\.d\.ts$/u.test(path));

const errors = [];
let loads = 0;

const enclosingFunction = (node) => {
  for (let up = node.parent; up !== undefined; up = up.parent) {
    if (ts.isFunctionDeclaration(up) || ts.isMethodDeclaration(up)
      || ts.isArrowFunction(up) || ts.isFunctionExpression(up)) {
      return up;
    }
  }
  return undefined;
};

/** Der Name, dem das Ergebnis des Ladens gehoert: `const kek = ...` oder `kek = ...`. */
const boundName = (call) => {
  const parent = call.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isBinaryExpression(parent)
    && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && ts.isIdentifier(parent.left)) {
    return parent.left.text;
  }
  return undefined;
};

const zeroesIn = (block, name, source) => {
  let found = false;
  (function walk(node) {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)
        && callee.name.text === 'fill'
        && callee.expression.getText(source).replace(/\?$/u, '') === name
        && node.arguments[0]?.getText(source) === '0') {
        found = true;
      }
      if (ts.isPropertyAccessExpression(callee)
        && callee.name.text === 'memzero'
        && node.arguments[0]?.getText(source) === name) {
        found = true;
      }
    }
    ts.forEachChild(node, walk);
  })(block);
  return found;
};

for (const path of files) {
  const source = ts.createSourceFile(path, readFileSync(join(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
  (function walk(node) {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'loadKeyVersion') {
      loads += 1;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const name = boundName(node);
      const fn = enclosingFunction(node);
      if (name === undefined || fn === undefined) {
        errors.push(
          `${path}:${line}: ein geladener Domaenenschluessel gehoert keinem Namen, `
          + 'also kann ihn niemand loeschen. An einen Namen binden und im `finally` nullen.',
        );
      } else {
        let zeroed = false;
        (function find(inner) {
          if (zeroed) return;
          if (ts.isTryStatement(inner) && inner.finallyBlock !== undefined
            && zeroesIn(inner.finallyBlock, name, source)) {
            zeroed = true;
          }
          ts.forEachChild(inner, find);
        })(fn);
        if (!zeroed) {
          errors.push(
            `${path}:${line}: \`${name}\` ist ein geladener Domaenenschluessel und wird in keinem `
            + '`finally` dieser Funktion geloescht. Der Garbage Collector gibt Speicher frei, '
            + 'ohne ihn zu ueberschreiben (B278).',
          );
        }
      }
    }
    ts.forEachChild(node, walk);
  })(source);
}

if (loads === 0) {
  errors.push('Keine einzige Ladestelle gefunden - der Leser misst nichts mehr (B166).');
}

if (errors.length > 0) {
  console.error('Key-zeroing check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Key-zeroing check passed (${loads} loaded domain keys, each zeroed in a finally of the function that loaded it).`);
