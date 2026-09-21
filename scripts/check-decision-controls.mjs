import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Jede Entscheidung, die ein Zustand anbietet, muss ein Mensch im Fenster auch
 * treffen koennen.
 *
 * **Der Anlass** (2026-09-21, Befund B239). `PicoCompanionPresentationDecision`
 * kennt fuenf Werte; `none` heisst "keine Entscheidung", die anderen vier sind
 * je an genau einen Zustand gebunden (`assertDecisionKind`). Und eine
 * Entscheidung ist kein Hinweis:
 *
 *     picoCompanionPresentationTakesTheWindow(p)
 *       => p.decision !== 'none' || p.severity === 'blocked'
 *
 * Eine Entscheidung reisst das Fenster an sich - mitten in dem, was die Person
 * gerade tat. Eine fuenfte Entscheidung ohne Bedienelement nimmt ihr also das
 * Fenster weg und bietet nichts an, worauf sie druecken koennte. Das ist kein
 * fehlendes Feature, das ist eine Sackgasse.
 *
 * **TypeScript sieht das nicht.** Der Typ kennt das Fenster nicht, und das
 * Fenster kennt keinen Typ - zwischen der Menge und dem HTML liegt nichts.
 * `check-companion-boundary.mjs` haelt die Gegenrichtung (jedes Element, das
 * das Skript verlangt, steht im HTML) und sagt selbst, wo es aufhoert.
 *
 * **Was es *doch* sieht, und wofuer hier nichts gebaut wird:** ein Vergleich
 * gegen eine Zeichenkette, die gar keine Entscheidung ist, ist ein Typfehler
 * ("This comparison appears to be unintentional"). Diese Richtung braucht kein
 * Tor.
 *
 * **Warum ueber den Syntaxbaum.** Zwei der Knoepfe haengen nicht einzeln am
 * Handler, sondern ueber eine Schleife:
 *
 *     for (const [button] of [[joinCamera, 'camera'], [joinTyped, 'typed']])
 *       button.addEventListener(...)
 *
 * Eine Suche nach `joinCamera.addEventListener` findet nichts und haette die
 * beiden als tote Knoepfe gemeldet - ein Tor, das zweimal danebengreift, wird
 * ueberlesen (B188). Dieser Leser loest die Schleifenbindung auf.
 *
 * **Und in den Behaelter hinein.** Zwei Entscheidungen zeigen keinen Knopf,
 * sondern einen Abschnitt (`recovery-card-form`, `first-run`). Ein Abschnitt
 * traegt keinen Handler; seine Knoepfe tun es. Geprueft wird deshalb der
 * Teilbaum im HTML, nicht das eine Element.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

const shellRoot = join(repoRoot, 'apps', 'companion-shell', 'src');
const read = (...parts) => readFileSync(join(shellRoot, ...parts), 'utf8');
const parse = (name, text) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);

const errors = [];

/** Die Entscheidungen, so wie der Vertrag sie erklaert. */
function declaredDecisions() {
  const found = new Set();
  (function walk(node) {
    if (ts.isTypeAliasDeclaration(node)
      && node.name.text === 'PicoCompanionPresentationDecision'
      && ts.isUnionTypeNode(node.type)) {
      for (const member of node.type.types) {
        if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
          found.add(member.literal.text);
        }
      }
    }
    node.forEachChild(walk);
  })(parse('contract.ts', read('contract.ts')));
  return found;
}

const rendererText = read('renderer.ts');
const renderer = parse('renderer.ts', rendererText);

/** Variablenname -> Element-Id, aus `requireElement`/`requireButton`. */
const elementIds = new Map();
/** Wie oft eine Schleifenbindung aufgeloest wurde - nur fuer die Ausgabe. */
let resolvedLoops = 0;
/** Bezeichner, an denen ein Handler haengt. */
const listened = new Set();
/** Entscheidung -> Variablennamen, deren Sichtbarkeit sie steuert. */
const guarded = new Map();

/**
 * Wofuer ein Bezeichner an *dieser* Stelle steht.
 *
 * Meist fuer sich selbst. Steht er aber fuer die Bindung einer Schleife ueber
 * ein Array von Tupeln, steht er der Reihe nach fuer jeden Eintrag darin:
 *
 *     for (const [button, source] of [[joinCamera, 'camera'], [joinTyped, ...]])
 *
 * Aufgeloest wird an der Verwendungsstelle und nicht in einer Tabelle nach
 * Namen: `renderer.ts` hat **zwei** solche Schleifen, und beide nennen ihre
 * Bindung `button`. Eine Tabelle nach Namen haette die erste von der zweiten
 * ueberschrieben und `joinCamera`/`joinTyped` still verloren - ein Name ist
 * kein Bezeichner, er ist einer je Geltungsbereich.
 */
function standsFor(identifier) {
  for (let scope = identifier.parent; scope !== undefined; scope = scope.parent) {
    if (!ts.isForOfStatement(scope)
      || !ts.isVariableDeclarationList(scope.initializer)
      || scope.initializer.declarations.length !== 1) continue;
    const binding = scope.initializer.declarations[0].name;
    const source = ts.isAsExpression(scope.expression)
      ? scope.expression.expression
      : scope.expression;
    if (!ts.isArrayBindingPattern(binding) || !ts.isArrayLiteralExpression(source)) continue;
    const index = binding.elements.findIndex(
      (element) => ts.isBindingElement(element)
        && ts.isIdentifier(element.name)
        && element.name.text === identifier.text,
    );
    if (index < 0) continue;
    const stands = new Set();
    for (const row of source.elements) {
      const tuple = ts.isAsExpression(row) ? row.expression : row;
      if (!ts.isArrayLiteralExpression(tuple)) continue;
      const at = tuple.elements[index];
      if (at !== undefined && ts.isIdentifier(at)) stands.add(at.text);
    }
    if (stands.size > 0) {
      resolvedLoops += 1;
      return stands;
    }
  }
  return new Set([identifier.text]);
}

(function walk(node) {
  if (ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.initializer !== undefined
    && ts.isCallExpression(node.initializer)
    && ts.isIdentifier(node.initializer.expression)
    && /^require[A-Za-z]*$/u.test(node.initializer.expression.text)
    && node.initializer.arguments.length > 0
    && ts.isStringLiteralLike(node.initializer.arguments[0])) {
    elementIds.set(node.name.text, node.initializer.arguments[0].text);
  }

  if (ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'addEventListener'
    && ts.isIdentifier(node.expression.expression)) {
    for (const name of standsFor(node.expression.expression)) listened.add(name);
  }

  // `x.hidden = state.decision !== 'd'` - beide Vergleichsrichtungen.
  if (ts.isBinaryExpression(node)
    && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && ts.isPropertyAccessExpression(node.left)
    && node.left.name.text === 'hidden'
    && ts.isIdentifier(node.left.expression)) {
    const element = node.left.expression.text;
    (function decisions(expression) {
      if (ts.isBinaryExpression(expression)) {
        const { left, right } = expression;
        if (ts.isPropertyAccessExpression(left)
          && left.name.text === 'decision'
          && ts.isStringLiteralLike(right)) {
          if (!guarded.has(right.text)) guarded.set(right.text, new Set());
          guarded.get(right.text).add(element);
        }
        decisions(left);
        decisions(right);
      }
    })(node.right);
  }
  node.forEachChild(walk);
})(renderer);


/** Welche Ids ein Abschnitt im HTML umschliesst. */
const html = readFileSync(join(shellRoot, 'renderer', 'index.html'), 'utf8');
function idsInside(id) {
  const marker = html.indexOf(`id="${id}"`);
  if (marker < 0) return undefined;
  const start = html.lastIndexOf('<', marker);
  const tag = /^<([A-Za-z][\w-]*)/u.exec(html.slice(start))?.[1];
  if (tag === undefined) return undefined;
  const boundary = new RegExp(`</?${tag}\\b`, 'gu');
  boundary.lastIndex = start;
  let depth = 0;
  let match = boundary.exec(html);
  while (match !== null) {
    depth += match[0][1] === '/' ? -1 : 1;
    if (depth === 0) break;
    match = boundary.exec(html);
  }
  const subtree = html.slice(start, match === null ? html.length : match.index);
  return new Set([...subtree.matchAll(/id="([^"]+)"/gu)].map(([, found]) => found));
}

const byId = new Map([...elementIds].map(([name, id]) => [id, name]));
/** Hoert dieses Element selbst oder etwas darin? */
function reachable(name) {
  if (listened.has(name)) return true;
  const inside = idsInside(elementIds.get(name) ?? '');
  if (inside === undefined) return false;
  return [...inside].some((id) => {
    const child = byId.get(id);
    return child !== undefined && child !== name && listened.has(child);
  });
}

const decisions = declaredDecisions();
if (decisions.size === 0 || elementIds.size === 0) {
  errors.push(
    'Keine Entscheidungen oder keine Fensterelemente gelesen - dann lief dieser '
    + 'Vergleich ueber nichts und war gruen, weil er blind war (B166).',
  );
}

const held = [];
for (const decision of [...decisions].sort()) {
  if (decision === 'none') continue;
  const elements = guarded.get(decision);
  if (elements === undefined || elements.size === 0) {
    errors.push(
      `Die Entscheidung '${decision}' steuert kein Element im Fenster. Eine `
      + 'Entscheidung reisst das Fenster an sich (picoCompanionPresentationTakesTheWindow), '
      + 'also stuende eine Person vor einem Fenster, das ihr etwas abverlangt und nichts '
      + 'anbietet, worauf sie druecken kann.',
    );
    continue;
  }
  const dead = [...elements].filter((name) => !reachable(name));
  if (dead.length > 0) {
    errors.push(
      `Die Entscheidung '${decision}' zeigt ${dead.map((name) => `\`${elementIds.get(name) ?? name}\``).join(', ')}, `
      + 'und weder dort noch darin haengt ein Handler. Ein Knopf, der sichtbar wird und '
      + 'nichts ausloest, ist dasselbe wie kein Knopf - nur langsamer.',
    );
    continue;
  }
  held.push({ decision, elements: [...elements] });
}

if (errors.length > 0) {
  console.error('Decision control check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Decision control check passed (${decisions.size} Entscheidungen, davon `
  + `${held.length} mit Bedienelement und eine ('none') ohne; `
  + `${held.reduce((sum, entry) => sum + entry.elements.length, 0)} gesteuerte Elemente, `
  + `jedes selbst oder in seinem Teilbaum an einem Handler; ${resolvedLoops} `
  + 'Schleifenbindungen an ihrer Verwendungsstelle aufgeloest).',
);
