import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankStringsAndComments } from './source-spans.mjs';

/**
 * Ein Standardzweig faengt das Unbekannte auf - oder er verschluckt das
 * Bekannte.
 *
 * **Die erste Messung war selbst zu eng**: sie suchte `switch (X) {` mit einem
 * Ausdruck ohne Klammern und fand 21. Dieser Leser zaehlt die Klammern und
 * fand einen 22. - `switch (extname(filePath))`. Dieselbe Lehre wie B188.
 *
 * **Der Anlass** (2026-09-25, Befunde B271 und B272). Der Verteiler des
 * Vault-Daemons hatte keinen Standardzweig und keine `never`-Pruefung; eine
 * gelesene Familie ohne Fall bekam keine Antwort. Die Messung ueber alle 21
 * `switch`-Anweisungen im Produktcode fand dann eine zweite Form derselben
 * Luecke, und sie ist die tueckischere: sechs Standardzweige fingen nicht das
 * Unbekannte auf, sondern **waren der letzte bekannte Fall**. Ein neuer
 * Geraetestatus haette einer Person gesagt *"You ended its authority"*, ein
 * neuer Passphrasen-Zweck *"Enter the Vault passphrase"* - der Satz eines
 * anderen Zustands, ohne dass der Bau etwas sagt.
 *
 * **Was dieser Pruefer nicht kann**: Typen lesen. Ob ein `switch` ueber eine
 * geschlossene Menge laeuft oder ueber eine Zeichenkette von aussen, weiss nur
 * der Compiler. Also fragt er, was er fragen kann: jeder Standardzweig ist
 * entweder erschoepfend (`never` darin) oder hier begruendet - in einem Satz,
 * dem man widersprechen kann. Ein `switch` ohne Standardzweig ist erlaubt: am
 * Ende einer Funktion mit Rueckgabetyp haelt ihn der Compiler (TS2366), und
 * die sechs Zweige aus B272 stehen seither genau so.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const roots = ['apps', 'packages', 'modules'];

/**
 * `datei` + `switch (...)`-Ausdruck -> warum der Standardzweig offen bleibt.
 * Ein Eintrag faellt, wenn es den `switch` nicht mehr gibt oder er ein
 * `never` bekommen hat: eine Begruendung, die ihren Gegenstand ueberlebt,
 * liest sich wie ein Urteil ueber heute.
 */
const argued = new Map([
  ['apps/core/src/app.ts|args.resource', 'the resource name arrives as a string inside a request, and an unknown one is a named refusal (`unknown_authority_resource`), not a sentence about a known one'],
  ['apps/vault-daemon/src/protocol.ts|family', 'the reader branches over a string from the socket; an unknown family is refused by name, and `ceremony-family.test.ts` holds that every declared family reaches a case (B271)'],
  ['apps/relay/src/operator.ts|route', 'a URL path from outside; everything unknown answers 404 exactly as an unknown public route does (ADR 0154)'],
  ['packages/protocol/src/planner-reader.ts|type', 'a value type from a record being read; an unknown one throws `invalid_pico_reader_value_type`'],
  ['apps/companion-shell/src/linux-process-tree.ts|type', 'a process type Chromium reports; the set is Chromium\'s, not ours, and `other` is a true answer for one we do not name'],
  ['apps/companion/src/enrolment-steps.ts|code', 'a refusal code from the Home; the fallback is the one shrug that keeps the code visible, which is the only thing that helps with a code nobody wrote a sentence for'],
  ['apps/companion-shell/src/contract.ts|reason', 'a service failure reason; the fallback says Pico could not tell more precisely, which is true of any reason without its own sentence'],
  ['apps/companion-shell/src/contract.ts|state', 'a model provider state; states without a sentence say nothing on purpose - a machine doing its job is not news'],
  ['apps/core/src/static-web.ts|extname(filePath)', 'a file extension on disk; octet-stream is the honest type for bytes this server does not name, and it keeps a browser from guessing'],
  ['apps/companion-shell/src/contract.ts|presenceType', 'a presence type from the Home; a type this window does not know is still one of the person\'s devices, and hiding it would hide a device'],
]);

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.c?ts$/u.test(entry) && !entry.endsWith('.d.ts') && !entry.includes('.test.')) {
      found.push(path);
    }
  }
  return found;
}

const errors = [];
const seen = new Set();
let switches = 0;
let exhaustive = 0;
let withoutDefault = 0;
for (const root of roots) {
  for (const path of sourceFiles(join(repoRoot, root))) {
    const file = relative(repoRoot, path);
    const source = readFileSync(path, 'utf8');
    const flat = blankStringsAndComments(source, file);
    for (const match of flat.matchAll(/\bswitch\s*\(/gu)) {
      // Der Ausdruck in den Klammern, aus dem Original gelesen.
      let depth = 1;
      let index = match.index + match[0].length;
      const exprStart = index;
      while (depth > 0 && index < flat.length) {
        if (flat[index] === '(') depth += 1;
        if (flat[index] === ')') depth -= 1;
        index += 1;
      }
      const subject = source.slice(exprStart, index - 1).trim().replace(/\s+as\s+\w+$/u, '');
      const open = flat.indexOf('{', index);
      depth = 1;
      let end = open + 1;
      while (depth > 0 && end < flat.length) {
        if (flat[end] === '{') depth += 1;
        if (flat[end] === '}') depth -= 1;
        end += 1;
      }
      const body = flat.slice(open, end);
      switches += 1;
      const key = `${file}|${subject}`;
      if (!/\bdefault\s*:/u.test(body)) {
        /**
         * **Ohne Standardzweig ist nur dann gehalten, wenn der Compiler es
         * haelt**: der `switch` muss das Letzte in einer Funktion sein, die
         * etwas zurueckgibt - dann bricht ein fehlender Fall den Bau (TS2366).
         * In einer `void`-Funktion faellt er still durch, und genau so stand
         * der Verteiler des Daemons vor B271 da.
         */
        const after = flat.slice(end).match(/^\s*(\S)/u)?.[1];
        const before = flat.slice(0, match.index);
        const signature = [...before.matchAll(/\)\s*:\s*([^{;=]+?)\s*\{/gu)].at(-1)?.[1] ?? '';
        const line = source.slice(0, match.index).split('\n').length;
        if (after !== '}' || signature === '' || /\bvoid\b|\bundefined\b/u.test(signature)) {
          errors.push(
            `${file}:${line} switch (${subject}) has no default and nothing makes the compiler hold it: `
            + 'it is not the last statement of a function that returns a value. A missing case falls '
            + 'through in silence (B271) - add `default` with `never`.',
          );
          continue;
        }
        withoutDefault += 1;
        continue;
      }
      if (/:\s*never\b/u.test(body)) {
        exhaustive += 1;
        if (argued.has(key)) {
          errors.push(`${key} is argued as open and is exhaustive now; drop the argument.`);
        }
        continue;
      }
      seen.add(key);
      if (!argued.has(key)) {
        const line = source.slice(0, match.index).split('\n').length;
        errors.push(
          `${file}:${line} switch (${subject}) has a default that is neither exhaustive nor argued. `
          + 'If the subject is a closed set, name the last case and let the compiler hold it (B272); '
          + 'if it comes from outside, say here why the fallback is true.',
        );
      }
    }
  }
}
for (const key of argued.keys()) {
  if (!seen.has(key)) {
    errors.push(`${key} is argued here, and no such switch with an open default exists. A reason that outlives its subject reads like a judgement about today.`);
  }
}
if (switches === 0) {
  errors.push('scripts/check-switch-defaults.mjs found no switch at all - a reader with no subject is broken, not clean (B166).');
}

if (errors.length > 0) {
  console.error('Switch-default check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}
console.log(
  `Switch-default check passed (${switches} switches in product code: ${withoutDefault} without a default, `
  + `held by their return type; ${exhaustive} exhaustive through never; ${seen.size} with an open default, `
  + 'each argued as input from outside).',
);
