import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Was dieses Produkt anlegt, gehoert der Person und sonst niemandem auf der
 * Maschine.
 *
 * **Der Anlass** (2026-09-21, Befund B246). Befund B117 hat das schon einmal
 * *gemessen*: ein Home gegen ein bestehendes Datenverzeichnis liess
 *
 *     755 data
 *     644 data/pico.sqlite
 *     644 data/pico.sqlite-wal
 *
 * zurueck - die Schluessel sorgfaeltig, die Datenbank, fuer die es sie gibt,
 * fuer jeden lesbar. Und bei nicht vorhandenem Verzeichnis kam `700` heraus,
 * aber nur, weil ein `mkdirSync(..., { mode: 0o700 })` fuer den Key-Store das
 * Elternverzeichnis zufaellig mit anlegte. Ein Schutz, der aus Versehen haelt,
 * haelt bis jemand anders installiert.
 *
 * Behoben wurde das damals an den betroffenen Stellen. Gehalten hat es
 * niemand: der **naechste** Ort, an dem dieses Produkt eine Datei anlegt,
 * bekommt seine Rechte wieder von der umask des Dienstes - und niemand merkt
 * es, weil keine API danach fragt.
 *
 * **Zwei Zahlen, und beide sind Entscheidungen dieses Produkts.** `0o700` fuer
 * ein Verzeichnis, `0o600` fuer eine Datei: nur die Person, die das Pico
 * betreibt. Nicht die Gruppe, nicht die Welt, auch nicht auf einer Maschine,
 * auf der sonst niemand sitzt - denn "sonst niemand" ist eine Aussage ueber
 * heute.
 *
 * **Drei Gestalten, weil der Baum drei benutzt.** `mkdirSync` mit
 * `{ mode }`, `writeFileSync`/`createWriteStream` mit `{ mode }`, und
 * `openSync` mit dem Modus als **drittem, positionellen** Parameter. Meine
 * erste Messung suchte nur nach `mode:` und meldete darum neun Stellen ohne
 * Modus, die alle einen hatten. Ein Leser, der eine Gestalt kennt, findet die
 * anderen nicht (B188).
 *
 * **Was ausgenommen ist, und warum es gezaehlt wird.** Ein Schreiben in einen
 * *Dateideskriptor* traegt keinen Modus - er gehoert dem `openSync`, das ihn
 * aufmachte, und das hat einen. Und ein `openSync`, dessen Flags nur lesen,
 * legt nichts an. Beides wird gezaehlt statt uebersehen.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

const directoryMode = '0o700';
const fileMode = '0o600';

const errors = [];
const narrowed = [];
const descriptors = [];
const readOnly = [];

const files = execSync('git ls-files "apps/*.ts" "packages/*.ts"', {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .filter((path) => path !== '' && !path.includes('/dist/') && !path.includes('.test.'));

/** Der `{ mode: 0o600 }`-Eintrag eines Optionsarguments, als Text. */
function modeOption(node, source) {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const property = node.properties.find(
    (entry) => ts.isPropertyAssignment(entry)
      && ts.isIdentifier(entry.name)
      && entry.name.text === 'mode',
  );
  return property === undefined ? undefined : property.initializer.getText(source);
}

/**
 * Ob diese Flags eine Datei anlegen koennen.
 *
 * Ein Bezeichner wird auf den Parameter zurueckgefuehrt, aus dem er kommt:
 * `function fsyncPath(path: string, flags: 'r' | 'r+')` legt nichts an, und
 * das steht in seiner Annotation.
 */
function flagsCreate(node, source) {
  const creating = /O_CREAT|['"`][ra]?\+?[wax]/u;
  if (node === undefined) return { creates: true, readable: false };
  const text = node.getText(source);
  if (ts.isStringLiteralLike(node)) {
    return { creates: /[wax]/u.test(node.text), readable: true };
  }
  if (!ts.isIdentifier(node)) {
    return { creates: creating.test(text), readable: true };
  }
  for (let up = node.parent; up !== undefined; up = up.parent) {
    const parameters = ts.isFunctionDeclaration(up) || ts.isFunctionExpression(up)
      || ts.isArrowFunction(up) || ts.isMethodDeclaration(up)
      ? up.parameters
      : undefined;
    if (parameters === undefined) continue;
    const parameter = parameters.find(
      (entry) => ts.isIdentifier(entry.name) && entry.name.text === node.text,
    );
    if (parameter?.type !== undefined) {
      /**
       * Nur eine Annotation aus Zeichenkettenliteralen sagt etwas. `string`
       * enthaelt zufaellig kein `w`, `a` oder `x` - eine Pflanzung hat genau
       * das ausgenutzt und ist durchgekommen, bis hier nach der *Gestalt* der
       * Annotation gefragt wurde statt nach ihrem Text.
       */
      const members = ts.isUnionTypeNode(parameter.type)
        ? parameter.type.types
        : [parameter.type];
      const literals = members.every(
        (member) => ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal),
      );
      if (!literals) {
        return { creates: true, readable: false };
      }
      return {
        creates: members.some((member) => /[wax]/u.test(member.literal.text)),
        readable: true,
      };
    }
  }
  return { creates: true, readable: false };
}

for (const path of files) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);

  (function walk(node) {
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : undefined;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const where = `${path}:${line}`;

      if (callee === 'mkdirSync' || callee === 'mkdir') {
        const mode = modeOption(node.arguments[1], source);
        if (mode === undefined) {
          errors.push(
            `${where}: \`${callee}\` names no mode, so the directory takes whatever the `
            + `service umask leaves. Pico makes its directories \`${directoryMode}\`.`,
          );
        } else if (mode !== directoryMode) {
          errors.push(
            `${where}: \`${callee}\` makes a directory \`${mode}\` where every other `
            + `directory here is \`${directoryMode}\`.`,
          );
        } else {
          narrowed.push({ where, kind: 'directory' });
        }
      }

      if (callee === 'writeFileSync' || callee === 'createWriteStream') {
        const target = node.arguments[0];
        const isDescriptor = target !== undefined
          && ts.isIdentifier(target)
          && /descriptor|(^|[^A-Za-z])fd([^A-Za-z]|$)/iu.test(target.text);
        if (isDescriptor) {
          descriptors.push({ where });
        } else {
          const mode = modeOption(node.arguments[callee === 'writeFileSync' ? 2 : 1], source);
          if (mode === undefined) {
            errors.push(
              `${where}: \`${callee}\` names no mode. A file this product writes holds what `
              + `somebody told their Pico; Pico writes it \`${fileMode}\`.`,
            );
          } else if (mode !== fileMode) {
            errors.push(
              `${where}: \`${callee}\` writes \`${mode}\` where every other file here is `
              + `\`${fileMode}\`.`,
            );
          } else {
            narrowed.push({ where, kind: 'file' });
          }
        }
      }

      if (callee === 'openSync') {
        const { creates, readable } = flagsCreate(node.arguments[1], source);
        if (!readable) {
          errors.push(
            `${where}: \`openSync\` takes flags this check cannot decide, so whether it `
            + 'creates a file is unknown. Give the flags a literal type or pass them '
            + 'directly.',
          );
        } else if (!creates) {
          readOnly.push({ where });
        } else {
          const mode = node.arguments[2]?.getText(source);
          if (mode === undefined) {
            errors.push(
              `${where}: \`openSync\` can create a file and names no mode. The mode is the `
              + `third positional argument here, not an option; Pico passes \`${fileMode}\`.`,
            );
          } else if (mode !== fileMode) {
            errors.push(
              `${where}: \`openSync\` creates with \`${mode}\` where every other file here `
              + `is \`${fileMode}\`.`,
            );
          } else {
            narrowed.push({ where, kind: 'file' });
          }
        }
      }
    }
    node.forEachChild(walk);
  })(source);
}

if (narrowed.length < 25) {
  errors.push(
    `Only ${narrowed.length} narrowed creations found, and 31 were measured on 2026-09-21 `
    + '(20 directories, 11 files). A check that has lost its subject is broken rather than '
    + 'satisfied (B166).',
  );
}

if (errors.length > 0) {
  console.error('File-mode check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const counted = (kind) => narrowed.filter((entry) => entry.kind === kind).length;
console.log(
  `File-mode check passed (${counted('directory')} directories made ${directoryMode} and `
  + `${counted('file')} files made ${fileMode}, every creation in the product naming its own `
  + `mode rather than taking the service umask; ${descriptors.length} writes into a descriptor `
  + `its own openSync already narrowed, and ${readOnly.length} openSync calls whose flags `
  + 'cannot create anything).',
);
