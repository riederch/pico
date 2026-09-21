import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Jeder Darstellungszustand des Companions traegt ein Zeichen neben seiner
 * Schwere - und das Zeichen ist keine zweite Wahrheit, sondern eine Sicht auf
 * die erste.
 *
 * **Der Anlass** (2026-09-21, Befund B238). Gemessen: **43** Paarungen aus
 * Schwere und Zeichen stehen von Hand nebeneinander, und heute sind alle 43
 * einig. Der Vertrag band sie nicht: `severities` und `symbols` waren zwei
 * unabhaengige Mengen, jede fuer sich geprueft. Die 44. Stelle durfte
 * `blocked` mit `!` paaren, und ein Mensch haette ein schwaecheres Zeichen
 * gesehen, als sein Zustand verdient.
 *
 * **Warum der Vertragspruefer allein nicht genuegt.** Er weist die falsche
 * Paarung zurueck - aber erst, wenn der Zustand einem Menschen gezeigt werden
 * soll. Eine Zurueckweisung in genau dem Moment, in dem jemand etwas erfahren
 * muss, ist keine Rettung. Dieser Pruefer holt den Fund in die Kette, wo er
 * niemanden kostet.
 *
 * **Wie gelesen wird.** Ueber den Syntaxbaum, nicht ueber ein Muster: gesucht
 * wird ein Objektliteral, das beide Eigenschaften traegt. Ein Muster ueber
 * Zeilen wuerde jede mehrzeilige Stelle verfehlen und dabei gruen bleiben
 * (ADR 0133, Regel aus B188).
 *
 * **Der Pruefer hat einen Gegenstand.** Faellt die Zahl der gefundenen
 * Paarungen unter die Untergrenze, schlaegt er an, statt ueber einer leeren
 * Menge zu schweigen (B166). Genau **eine** Stelle bleibt unentscheidbar -
 * der Vertragstest selbst, der die falschen Paare absichtlich durchprobiert.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

/** Die Tabelle, gegen die geprueft wird - dieselbe, die der Vertrag ableitet. */
const expected = new Map([
  ['active', '●'],
  ['warning', '!'],
  ['blocked', '×'],
]);

/**
 * Untergrenze statt exakter Zahl: neue Zustaende sollen ohne Pflege dieses
 * Pruefers dazukommen duerfen, aber ein Leser, der ploetzlich nichts mehr
 * findet, ist kaputt und nicht zufrieden.
 */
const floor = 38;

const files = execFileSync('git', ['ls-files', '*.ts'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path.length > 0 && !path.includes('/dist/'));

/** `'active' as const` ist dieselbe Zeichenkette wie `'active'`. */
const unwrap = (node) => (node !== undefined
  && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))
  ? unwrap(node.expression)
  : node);

/**
 * Ein Bauplatz nennt seine Schwere entweder geradeheraus oder in zwei Zweigen.
 * Der Zweigfall ist der gefaehrlichere - dieselbe Bedingung steht zweimal da,
 * und wer einen Zweig umdreht, dreht den anderen leicht nicht mit. Deshalb
 * wird er nicht uebergangen, sondern in seine Zweige zerlegt und paarweise
 * gegen die Bedingung des Zeichens gehalten.
 */
function branches(node) {
  const inner = unwrap(node);
  if (inner === undefined) return undefined;
  if (ts.isStringLiteralLike(inner)) return [{ when: '', value: inner.text }];
  if (ts.isConditionalExpression(inner)) {
    const whenTrue = branches(inner.whenTrue);
    const whenFalse = branches(inner.whenFalse);
    if (whenTrue === undefined || whenFalse === undefined) return undefined;
    const condition = inner.condition.getText();
    return [
      ...whenTrue.map((branch) => ({ when: `${condition} ? ${branch.when}`, value: branch.value })),
      ...whenFalse.map((branch) => ({ when: `${condition} : ${branch.when}`, value: branch.value })),
    ];
  }
  return undefined;
}

const sites = [];
const unreadable = [];
const errors = [];

for (const path of files) {
  const source = ts.createSourceFile(
    path,
    readFileSync(join(repoRoot, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  (function walk(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const named = (name) => node.properties.find(
        (property) => ts.isPropertyAssignment(property)
          && ts.isIdentifier(property.name)
          && property.name.text === name,
      );
      const severityProperty = named('severity');
      const symbolProperty = named('symbol');
      if (severityProperty !== undefined && symbolProperty !== undefined) {
        const severities = branches(severityProperty.initializer);
        const symbolBranches = branches(symbolProperty.initializer);
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (severities === undefined || symbolBranches === undefined) {
          // Eine berechnete Seite kann dieser Leser nicht entscheiden. Er
          // nennt sie, statt sie stillschweigend als geprueft zu zaehlen.
          unreadable.push(`${path}:${line}`);
        } else if (severities.length !== symbolBranches.length
          || severities.some((branch, index) => branch.when !== symbolBranches[index].when)) {
          errors.push(
            `${path}:${line} entscheidet Schwere und Zeichen an verschiedenen Bedingungen `
            + `(${severities.map((branch) => branch.when || '(fest)').join(' | ')} gegen `
            + `${symbolBranches.map((branch) => branch.when || '(fest)').join(' | ')}). `
            + 'Dann gibt es einen Fall, in dem beide nicht dasselbe meinen.',
          );
        } else {
          for (const [index, branch] of severities.entries()) {
            const symbol = symbolBranches[index].value;
            if (!expected.has(branch.value)) {
              errors.push(
                `${path}:${line} traegt severity '${branch.value}', das keine Schwere des `
                + 'Companions ist. Entweder gehoert es nicht hierher, oder die Tabelle '
                + 'dieses Pruefers ist dem Vertrag nicht nachgezogen.',
              );
            } else if (symbol !== expected.get(branch.value)) {
              errors.push(
                `${path}:${line} paart severity '${branch.value}' mit '${symbol}'`
                + `${branch.when === '' ? '' : ` im Zweig \`${branch.when}\``}. Diese Schwere `
                + `steht fuer '${expected.get(branch.value)}'. Ein Mensch liest das Zeichen vor `
                + 'den Worten, und ein Zeichen, das schwaecher ist als sein Zustand, belaeuft ihn.',
              );
            } else {
              sites.push({ path, line, severity: branch.value });
            }
          }
        }
      }
    }
    node.forEachChild(walk);
  })(source);
}

if (sites.length + errors.length < floor) {
  errors.push(
    `Nur ${sites.length + errors.length} Paarungen gefunden, gemessen waren 43 `
    + `(Untergrenze ${floor}). Ein Leser, der seinen Gegenstand verloren hat, ist `
    + 'kaputt und nicht zufrieden.',
  );
}

if (errors.length > 0) {
  console.error('Presentation symbol check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counted = (severity) => sites.filter((site) => site.severity === severity).length;
console.log(
  `Presentation symbol check passed (${sites.length} Paarungen aus Schwere und Zeichen, `
  + `Zweige einzeln gezaehlt, jede das Zeichen ihrer Schwere: ${counted('active')} active `
  + `●, ${counted('warning')} warning !, ${counted('blocked')} blocked ×`
  + `${unreadable.length > 0 ? `; ${unreadable.length} berechnet und daher hier nicht entscheidbar` : ''}).`,
);
