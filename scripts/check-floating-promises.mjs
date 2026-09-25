#!/usr/bin/env node
/**
 * Befund B273. Jede verworfene Promise in einem Node-Prozess hat einen
 * Ablehnungszweig, oder es steht hier, warum sie keinen braucht.
 *
 * Verworfen heisst: als Anweisung stehengelassen oder mit `void` weggeworfen.
 * Unter Node 22 beendet eine unbehandelte Ablehnung den Prozess. Der Zeitgeber
 * des Terminplaners warf so den Tick weg: ein Speicher, der die Markierung
 * nicht annahm, haette das ganze Home beendet, und ueberlebt haette der Planer
 * nie wieder geweckt.
 *
 * Gelesen wird mit dem Typpruefer, nicht mit einem Muster (B188): ob ein
 * Ausdruck eine Promise ist, weiss nur der Typ. `void` als Rueckgabetyp und
 * `reply.header(...)`, das ein `then` traegt, sind keine.
 *
 * Geltungsbereich sind die Node-Prozesse - Home, Tresor-Dienst, Relay - und
 * die Pakete, die sie laden. Der Electron-Hauptprozess des Companion warnt bei
 * einer unbehandelten Ablehnung nur und laeuft weiter; am 2026-09-25 mit
 * Electron 44 gemessen. Dort ist das keine Prozessfrage, und dieses Netz
 * behauptet nichts darueber.
 *
 * Ein Ablehnungszweig ist `.catch(...)` oder `.then(ok, fehler)`, auch wenn
 * danach noch `.finally(...)` folgt.
 */
import { readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';

const ts = createRequire(import.meta.url)('typescript');
const root = resolve(import.meta.dirname, '..');

const scopes = [
  'apps/core',
  'apps/vault-daemon',
  'apps/relay',
  ...readdirSync(join(root, 'packages'))
    .map((name) => `packages/${name}`)
    .filter((path) => existsSync(join(root, path, 'tsconfig.json'))),
];

/**
 * Schluessel: Datei und der Anfang des verworfenen Ausdrucks. Ein Argument,
 * dessen Stelle verschwunden ist oder einen Ablehnungszweig bekommen hat, ist
 * ein Fehler - sonst deckt es eines Tages eine neue Stelle gleichen Namens.
 */
const argued = new Map([
  ['apps/core/src/app.ts|(async () => {', 'Die Messung eines Modellhosts: der ganze Koerper steht in try/catch, und der Fangzweig schreibt nur in die Liste im Speicher und in die Live-Ansicht.'],
  ['apps/core/src/periodic-task-scheduler.ts|tick()', 'Der einzige fremde Aufruf des Ticks, `options.request`, steht in try/catch; der Rest liest Maps im Speicher und die eingespeiste Uhr. Anders als der Terminplaner beruehrt er keinen Speicher.'],
  ['apps/vault-daemon/src/reader-access.ts|worker.terminate()', 'Node lehnt `terminate()` nicht ab; die Promise traegt nur den Exit-Code des Workers, und der Kanal ist davor schon geschlossen.'],
  ['apps/vault-daemon/src/cli.ts|client.close()', '`close()` wartet nur auf das close-Ereignis des Sockets und hat keinen Weg, der wirft.'],
]);

const keyLength = (key) => key.slice(key.indexOf('|') + 1).length;

const isPromise = (type) => {
  if (type.isUnion()) {
    return type.types.some(isPromise);
  }
  const symbol = type.getSymbol();
  return symbol !== undefined && symbol.getName() === 'Promise';
};

const methodCall = (node, name) => ts.isCallExpression(node)
  && ts.isPropertyAccessExpression(node.expression)
  && node.expression.name.text === name;

const handled = (node) => {
  let current = node;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  while (methodCall(current, 'finally')) {
    current = current.expression.expression;
  }
  return methodCall(current, 'catch')
    || (methodCall(current, 'then') && current.arguments.length >= 2);
};

const errors = [];
const seenArguments = new Set();
let promisesSeen = 0;
let handledCount = 0;
let arguedCount = 0;

for (const scope of scopes) {
  const configPath = join(root, scope, 'tsconfig.json');
  const config = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      errors.push(`${scope}: tsconfig nicht lesbar: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    },
  });
  if (config === undefined) {
    continue;
  }
  const program = ts.createProgram(config.fileNames, config.options);
  const checker = program.getTypeChecker();
  const scopeRoot = join(root, scope, 'src');

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile
      || !source.fileName.startsWith(`${scopeRoot}/`)
      || /\.test\.ts$/u.test(source.fileName)) {
      continue;
    }
    const file = relative(root, source.fileName);

    const visit = (node) => {
      let discarded;
      if (ts.isVoidExpression(node)) {
        discarded = node.expression;
      } else if (ts.isExpressionStatement(node)
        && !ts.isVoidExpression(node.expression)
        && !ts.isAwaitExpression(node.expression)
        && !(ts.isBinaryExpression(node.expression)
          && node.expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
          && node.expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment)) {
        discarded = node.expression;
      }
      if (discarded !== undefined && isPromise(checker.getTypeAtLocation(discarded))) {
        promisesSeen += 1;
        if (handled(discarded)) {
          handledCount += 1;
        } else {
          const text = discarded.getText(source).replace(/\s+/gu, ' ');
          const key = [...argued.keys()].find((candidate) => candidate.startsWith(`${file}|`)
            && text.startsWith(candidate.slice(file.length + 1)));
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          if (key === undefined) {
            errors.push(`${file}:${line}: eine verworfene Promise ohne Ablehnungszweig: ${text.slice(0, 80)}`);
          } else {
            seenArguments.add(key);
            arguedCount += 1;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

for (const key of argued.keys()) {
  if (keyLength(key) === 0) {
    errors.push(`${key}: ein Argument ohne Ausdruck deckt jede Stelle der Datei.`);
  }
  if (!seenArguments.has(key)) {
    errors.push(`${key}: begruendet, aber keine solche Stelle ohne Ablehnungszweig mehr - das Argument streichen.`);
  }
}

if (promisesSeen === 0) {
  errors.push('Keine einzige verworfene Promise gefunden - der Leser misst nichts mehr (B166).');
}

if (errors.length > 0) {
  console.error('Floating-promise check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Floating-promise check passed (${promisesSeen} discarded promises in ${scopes.length} Node scopes: `
  + `${handledCount} with a rejection branch, ${arguedCount} argued).`,
);
