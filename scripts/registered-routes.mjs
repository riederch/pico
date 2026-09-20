import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Welche Routen der Kern bedient und in welche Zugangsklasse er sie stellt -
 * einmal gelesen, statt in jedem Leser neu.
 *
 * **Der Anlass** (2026-09-20, Befund B235). Drei Stellen lasen das mit einem
 * Muster, das nur Zeichenketten kennt:
 *
 *     accessClasses\.register\(\s*'([A-Z]+)',\s*'([^']+)',\s*'([^']+)'
 *     app\.(get|post|put|delete|patch)\('([^']+)'
 *
 * Eine Route, die als **Konstante** steht, fällt da hindurch. Genau eine tut
 * das seit jeher - `PICO_LINK_CONTINUITY_READ_PATH`, und sie ist `public`,
 * also ausgerechnet aus der Menge, die ein Fremder ohne alles erreicht.
 * `check-surface-classes.mjs` hat sie nie verglichen und war dabei grün.
 *
 * Ein Leser, der einen Bezeichner sieht, schlägt ihn nach. Die Konstanten
 * kommen aus `app.ts` selbst und aus dem Modul, aus dem es die beiden
 * Link-Pfade holt.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

export const picoAppSourcePath = 'apps/core/src/app.ts';
const constantSources = [picoAppSourcePath, 'apps/core/src/link-intake-listener.ts'];

function parse(path) {
  return ts.createSourceFile(
    path,
    readFileSync(join(repoRoot, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}

/** Jede Zeichenketten-Konstante, die einer dieser Quellen erklärt. */
function stringConstants() {
  const constants = new Map();
  for (const path of constantSources) {
    (function collect(node) {
      if (ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer !== undefined
        && ts.isStringLiteralLike(node.initializer)) {
        constants.set(node.name.text, node.initializer.text);
      }
      node.forEachChild(collect);
    })(parse(path));
  }
  return constants;
}

const constants = stringConstants();
export const picoStringConstants = constants;

const valueOf = (node) => {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text);
  return undefined;
};

const appSource = parse(picoAppSourcePath);

/**
 * `accessClasses.register(method, route, class)`, mit aufgelösten Bezeichnern.
 * `unreadable` sammelt, was dieser Leser nicht auflösen konnte - eine
 * Registrierung, die niemand lesen kann, ist eine Route, die niemand hält.
 */
export function picoRegisteredRoutes() {
  const registrations = [];
  const unreadable = [];
  (function scan(node) {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'register'
      && /accessClasses$/u.test(node.expression.expression.getText())
      && node.arguments.length === 3) {
      const [method, route, accessClass] = node.arguments.map(valueOf);
      if (method !== undefined && route !== undefined && accessClass !== undefined) {
        registrations.push({ method, route, accessClass });
      } else {
        unreadable.push(node.getText().replace(/\s+/gu, ' ').slice(0, 100));
      }
    }
    node.forEachChild(scan);
  })(appSource);
  return { registrations, unreadable };
}

/**
 * `app.get('/x', …)` und Geschwister, mit aufgelösten Bezeichnern, als
 * `METHOD /pfad`.
 */
export function picoServedRoutes() {
  const served = new Set();
  const unreadable = [];
  const verbs = new Set(['get', 'post', 'put', 'delete', 'patch']);
  (function scan(node) {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && verbs.has(node.expression.name.text)
      && node.expression.expression.getText() === 'app'
      && node.arguments.length >= 1) {
      const route = valueOf(node.arguments[0]);
      if (route === undefined) unreadable.push(node.arguments[0].getText().slice(0, 60));
      else served.add(`${node.expression.name.text.toUpperCase()} ${route}`);
    }
    node.forEachChild(scan);
  })(appSource);
  return { served: [...served], unreadable };
}
