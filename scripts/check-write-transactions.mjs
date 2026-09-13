#!/usr/bin/env node
/**
 * Befund B163. Schreibvorgaenge, die zusammen eine Handlung sind, stehen in
 * einer Transaktion.
 *
 * Die Frage: gibt es eine Methode, in der zwei oder mehr Schreibvorgaenge auf
 * *einem* Weg liegen und die keine Transaktion haelt? Ein Absturz dazwischen
 * laesst dann einen Zustand zurueck, den es nach der eigenen Erklaerung des
 * Codes nicht geben soll - vier solche Faelle standen am 2026-09-13 im Baum,
 * und in dreien nannte ein Kommentar daneben den Schaden bereits beim Namen.
 * Ein Satz, der eine Gefahr nennt, ist kein Schutz vor ihr.
 *
 * **Ueber den Syntaxbaum und nicht ueber Textfenster.** Ein Zeilenfenster hat
 * mich bei dieser Messung sechsmal in die Irre gefuehrt: es hielt ein `if/else`
 * fuer zwei Schreibvorgaenge, uebersah eine Transaktion, die zwei Zeilen
 * spaeter begann, und schnitt Methoden an der falschen Klammer ab. Der
 * Uebersetzer weiss, wo eine Methode aufhoert; ein Suchmuster raet es.
 *
 * Drei Dinge entscheidet dieses Tor deshalb genau und nicht ungefaehr:
 *
 * 1. **Wo eine Methode aufhoert.** Verschachtelte Funktionen gehoeren sich
 *    selbst, nicht ihrem Wirt.
 * 2. **Was ein Schreibvorgang ist.** `prepare(<SQL>)` mit einem Schreibverb,
 *    gefolgt von `.run(...)` - auch dann, wenn der Satz erst in einer Variablen
 *    liegt und spaeter in einer Schleife laeuft. Nachgezaehlt am 2026-09-13:
 *    ueber 249 Quelldateien 170 unmittelbare Ketten und 7 ueber eine Variable,
 *    **0 unerkannt**. Ein Tor, das nur fast alles sieht, meldet Erfolg ueber
 *    dem, was es uebersehen hat.
 * 3. **Ob zwei Schreibvorgaenge sich ausschliessen.** Zwei Zweige eines `if`
 *    sind zwei Wege und nicht einer; genauso ein Zweig, der mit `return` oder
 *    `throw` endet, gegenueber allem, was danach kommt.
 *
 * Begruendete Eintraege tragen ihren Grund, und wo der Grund pruefbar ist,
 * prueft ihn das Tor: `wrapped_by_caller` behauptet nicht, dass ein Aufrufer
 * einfasst - es zaehlt die Aufrufstellen und besteht darauf, dass jede einzelne
 * in einer Transaktion liegt. Ein Name ist keine Regel (B124).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE_VERB = /\b(INSERT|UPDATE|DELETE)\b/i;

/**
 * Was hier steht, ist gemessen und beurteilt, nicht weggewunken.
 *
 * `reason` ist der Grund, aus dem die Schreibvorgaenge *keine* gemeinsame
 * Handlung sind. `kind` sagt, wie das Tor den Grund behandelt:
 *
 * - `wrapped_by_caller` wird nachgeprueft: jede Aufrufstelle muss in einer
 *   Transaktion liegen. Zieht jemand die Methode woandershin, faellt das Tor.
 * - `argued` steht fuer Gruende, die kein Skript nachrechnen kann; sie tragen
 *   ihre Begruendung im Text und sind beim Lesen zu pruefen.
 */
const ARGUED = [
  {
    site: 'apps/core/src/event-store.ts#dropPicoHomeMembershipCredential',
    kind: 'wrapped_by_caller',
    reason:
      'Drei Loeschungen, die eine sind - und sie liegen bereits in einer '
      + 'Transaktion, nur eine Ebene hoeher: der einzige Aufrufer ist der '
      + 'Abgleichlauf in `reconcilePicoHomeMembershipsFromCredentials`, der '
      + 'ueber alle Berechtigungen einfasst. Eine zweite Transaktion hier '
      + 'waere in SQLite verschachtelt und wuerde nichts hinzufuegen.',
  },
  {
    site: 'apps/core/src/reader-custody.ts#dropDomain',
    kind: 'wrapped_by_caller',
    reason:
      'Sieben Loeschungen fuer eine Handlung, aus demselben Grund eine Ebene '
      + 'hoeher eingefasst: `reconcile` faehrt sie, und ein halb abgeraeumtes '
      + 'Gebiet waere schlimmer als ein nicht abgeraeumtes.',
  },
  {
    site: 'apps/core/src/event-store.ts#reconcilePicoHomeHostContinuity',
    kind: 'argued',
    reason:
      'Eine Reparatur, die bei jedem Start vollstaendig neu laeuft, und zwar '
      + 'bevor irgendetwas der Kette traut (`app.ts`, vor dem Verwahrungstor). '
      + 'Ein Absturz zwischen dem Abschneiden der Kette und dem Richten des '
      + 'Anspruchszustands hinterlaesst keinen Zustand, den jemand liest: der '
      + 'naechste Start faengt von vorn an und macht denselben Schnitt. Eine '
      + 'Transaktion waere hier nicht falsch, aber sie schuetzte vor nichts.',
  },
];

/**
 * **Was dieses Tor nicht fragt: ein Schreibsatz, der in einer Schleife oft
 * laeuft.** Das ist ein Ort und nicht zwei, und ob ein halber Durchlauf
 * schadet, haengt an der Schleife und nicht an der Form. Gemessen am
 * 2026-09-13 stehen zwei davon nebeneinander und antworten verschieden:
 * `deletePicoObservations` faellt seine Loeschungen in eine Transaktion, weil
 * eine halb verbrauchte Verdichtung Messwerte zweimal zaehlen liesse -
 * `PicoRelayStore.acknowledge` tut es nicht, und das ist richtig, weil ADR
 * 0147 lieber zweimal ausliefert als einmal zu wenig. Wer diese Frage stellen
 * will, stellt sie neu; sie hier mitzufuehren hiesse, zwei Fragen als eine
 * auszugeben.
 *
 * Wer die Volkszaehlung sehen will, ohne auf einen Fehlschlag zu warten:
 * `PICO_WRITE_TRANSACTION_CENSUS=1 node scripts/check-write-transactions.mjs`.
 */

function sources(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') {
        sources(path, found);
      }
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      found.push(path);
    }
  }
  return found;
}

function workspaceSources() {
  const found = [];
  for (const group of ['apps', 'packages']) {
    const base = join(root, group);
    for (const project of readdirSync(base)) {
      const src = join(base, project, 'src');
      try {
        if (statSync(src).isDirectory()) {
          sources(src, found);
        }
      } catch {
        // Ein Paket ohne `src` ist kein Fehler, nur kein Gegenstand.
      }
    }
  }
  return found.sort();
}

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);

/** Der Text eines SQL-Arguments, egal ob Zeichenkette oder Schablone. */
function sqlOf(node) {
  if (node === undefined) {
    return '';
  }
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => span.literal.text).join(' ');
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return '';
}

/** `<irgendwas>.prepare(<SQL>)` - und ob das SQL schreibt. */
function preparedWrite(node) {
  if (!ts.isCallExpression(node)
    || !ts.isPropertyAccessExpression(node.expression)
    || node.expression.name.text !== 'prepare') {
    return false;
  }
  return WRITE_VERB.test(sqlOf(node.arguments[0]));
}

/** `transaction(<Funktion>)`, in jeder Schreibweise, die hier vorkommt. */
function isTransactionCall(node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'transaction';
}

function functionName(node, source) {
  if (node.name !== undefined && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  if (node.kind === ts.SyntaxKind.Constructor) {
    return 'constructor';
  }
  // Eine namenlose Funktion erbt den Namen, unter dem sie steht.
  let parent = node.parent;
  while (parent !== undefined) {
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    parent = parent.parent;
  }
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `<anonym:${String(line + 1)}>`;
}

/**
 * Schliessen zwei Stellen einander aus?
 *
 * Zwei Zweige eines `if` oder `switch` sind zwei Wege. Ebenso ein Zweig, der
 * mit `return` oder `throw` endet, gegenueber allem, was nach ihm kommt: was
 * dort steht, laeuft nur, wenn der Zweig nicht genommen wurde.
 */
function ancestry(node) {
  const chain = [];
  for (let current = node; current !== undefined; current = current.parent) {
    chain.push(current);
  }
  return chain.reverse();
}

function alwaysLeaves(statement) {
  if (statement === undefined) {
    return false;
  }
  if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)
    || ts.isContinueStatement(statement) || ts.isBreakStatement(statement)) {
    return true;
  }
  if (ts.isBlock(statement)) {
    return statement.statements.length > 0
      && alwaysLeaves(statement.statements[statement.statements.length - 1]);
  }
  if (ts.isIfStatement(statement)) {
    return statement.elseStatement !== undefined
      && alwaysLeaves(statement.thenStatement)
      && alwaysLeaves(statement.elseStatement);
  }
  return false;
}

function mutuallyExclusive(left, right) {
  const a = ancestry(left);
  const b = ancestry(right);
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) {
    shared += 1;
  }
  if (shared === 0) {
    return false;
  }
  const meeting = a[shared - 1];
  const stepA = a[shared];
  const stepB = b[shared];

  // Verschiedene Zweige desselben `if` oder `?:`.
  if (ts.isIfStatement(meeting) || ts.isConditionalExpression(meeting)) {
    if (stepA !== undefined && stepB !== undefined && stepA !== stepB
      && stepA !== meeting.expression && stepB !== meeting.expression) {
      return true;
    }
  }
  // Verschiedene Faelle desselben `switch`.
  if (ts.isCaseBlock(meeting) && stepA !== stepB) {
    return true;
  }
  /*
   * Ein Zweig, der immer verlaesst, gegenueber allem danach im selben Block.
   *
   * Weiter geht diese Analyse absichtlich nicht: ein `try`, dessen Rumpf
   * zurueckkehrt, oder eine Schleife, die es tut, gelten hier als *nicht*
   * ausschliessend. Das ist die sichere Richtung - das Tor meldet dann einen
   * Fall zu viel, und ein zu viel gemeldeter Fall wird begruendet, waehrend
   * ein uebersehener still bliebe.
   */
  if (ts.isBlock(meeting) || ts.isSourceFile(meeting) || ts.isCaseClause(meeting)) {
    const statements = meeting.statements ?? [];
    const indexOf = (step) => statements.findIndex((entry) => entry === step);
    const ia = indexOf(stepA);
    const ib = indexOf(stepB);
    if (ia >= 0 && ib >= 0 && ia !== ib) {
      const earlier = statements[Math.min(ia, ib)];
      if (ts.isIfStatement(earlier) && earlier.elseStatement === undefined
        && alwaysLeaves(earlier.thenStatement)) {
        return true;
      }
    }
  }
  return false;
}

let guardedWrites = 0;
let unguardedWrites = 0;
let inspectedFunctions = 0;
const bySite = new Map();
const callSites = new Map();

for (const path of workspaceSources()) {
  const text = readFileSync(path, 'utf8');
  if (!text.includes('.prepare(')) {
    continue;
  }
  const rel = relative(root, path);
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true);

  /** Variablen, die einen schreibenden Satz halten. */
  const writingStatements = new Set();
  const collectStatements = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.initializer !== undefined && preparedWrite(node.initializer)) {
      writingStatements.add(node.name.text);
    }
    ts.forEachChild(node, collectStatements);
  };
  collectStatements(source);

  const writes = [];
  const collectWrites = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'run') {
      const target = node.expression.expression;
      const direct = preparedWrite(target);
      const viaVariable = ts.isIdentifier(target) && writingStatements.has(target.text);
      if (direct || viaVariable) {
        writes.push(node);
      }
    }
    ts.forEachChild(node, collectWrites);
  };
  collectWrites(source);

  for (const write of writes) {
    // Der naechste Wirt: die umschliessende Funktion. Liegt zwischen dem
    // Schreibvorgang und ihr eine `transaction(...)`, ist er eingefasst.
    let guarded = false;
    let owner;
    for (let current = write.parent; current !== undefined; current = current.parent) {
      if (isTransactionCall(current)) {
        guarded = true;
        break;
      }
      if (FUNCTION_KINDS.has(current.kind)) {
        if (isTransactionCall(current.parent)) {
          guarded = true;
        }
        owner = current;
        break;
      }
    }
    if (guarded) {
      guardedWrites += 1;
      continue;
    }
    unguardedWrites += 1;
    if (owner === undefined) {
      continue;
    }
    const site = `${rel}#${functionName(owner, source)}`;
    if (!bySite.has(site)) {
      bySite.set(site, { owner, writes: [], source });
      inspectedFunctions += 1;
    }
    bySite.get(site).writes.push(write);
  }

  // Aufrufstellen, damit `wrapped_by_caller` nachrechenbar ist.
  const collectCalls = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      let inTransaction = false;
      for (let current = node.parent; current !== undefined; current = current.parent) {
        if (isTransactionCall(current)) {
          inTransaction = true;
          break;
        }
      }
      if (!callSites.has(name)) {
        callSites.set(name, []);
      }
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      callSites.get(name).push({ file: rel, line: line + 1, inTransaction });
    }
    ts.forEachChild(node, collectCalls);
  };
  collectCalls(source);
}

const flagged = [];
for (const [site, entry] of bySite) {
  const onOnePath = [];
  for (let i = 0; i < entry.writes.length; i += 1) {
    for (let j = i + 1; j < entry.writes.length; j += 1) {
      if (!mutuallyExclusive(entry.writes[i], entry.writes[j])) {
        onOnePath.push([entry.writes[i], entry.writes[j]]);
      }
    }
  }
  if (onOnePath.length > 0) {
    const { line } = entry.source.getLineAndCharacterOfPosition(
      entry.owner.getStart(entry.source),
    );
    flagged.push({ site, line: line + 1, writes: entry.writes.length });
  }
}

const argued = new Map(ARGUED.map((entry) => [entry.site, entry]));
const problems = [];

for (const entry of flagged) {
  const excuse = argued.get(entry.site);
  if (excuse === undefined) {
    problems.push(
      `${entry.site} (Zeile ${String(entry.line)}) fuehrt ${String(entry.writes)} Schreibvorgaenge `
      + 'auf einem Weg aus und haelt keine Transaktion. Entweder sie gehoeren zusammen - dann '
      + 'gehoert `db.transaction(() => { ... })()` darum -, oder sie gehoeren es nicht, dann '
      + 'gehoert der Grund nach `scripts/check-write-transactions.mjs`.',
    );
    continue;
  }
  if (excuse.kind === 'wrapped_by_caller') {
    const method = entry.site.split('#')[1];
    const calls = (callSites.get(method) ?? []).filter((call) => !call.inTransaction);
    if (calls.length > 0) {
      problems.push(
        `${entry.site} ist als "vom Aufrufer eingefasst" eingetragen, aber `
        + `${String(calls.length)} Aufrufstelle(n) liegen in keiner Transaktion: `
        + `${calls.map((call) => `${call.file}:${String(call.line)}`).join(', ')}. `
        + 'Der Grund traegt nicht mehr.',
      );
    }
  }
}

for (const entry of ARGUED) {
  if (!flagged.some((found) => found.site === entry.site)) {
    problems.push(
      `${entry.site} steht begruendet in diesem Tor, wird aber nicht mehr gefunden - `
      + 'die Methode ist fort, umbenannt oder inzwischen eingefasst. Ein Pruefer ohne '
      + 'Gegenstand ist kaputt und nicht sauber: der Eintrag gehoert entfernt.',
    );
  }
}

if (process.env.PICO_WRITE_TRANSACTION_CENSUS === '1') {
  for (const entry of flagged) {
    console.log(`FLAGGED ${entry.site} (Zeile ${String(entry.line)}, ${String(entry.writes)} Schreibvorgaenge)`);
  }
}

if (problems.length > 0) {
  console.error('Write transaction check failed:\n');
  for (const problem of problems) {
    console.error(`  - ${problem}\n`);
  }
  process.exit(1);
}

console.log(
  `Write transaction check passed (${String(guardedWrites)} writes stand inside a transaction, `
  + `${String(unguardedWrites)} stand alone; of ${String(inspectedFunctions)} functions writing `
  + `outside one, ${String(flagged.length)} put two or more on a single path and all `
  + `${String(flagged.length)} are argued).`,
);
