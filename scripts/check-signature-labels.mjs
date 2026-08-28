import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Was ein Aufrufer unterschreiben lässt, muss der Vault-Daemon bauen können.
 *
 * **Der Anlass** (2026-08-28, gegen ein laufendes Home gefunden, Befund B36).
 * ADR 0106 hat die Unterschrift umgedreht: seit dem 2026-07-29 schickt ein
 * Aufrufer *keine Bytes* mehr, sondern einen Familiennamen und die Felder, und
 * der Daemon baut die Bytes selbst und schreibt den Satz der Person aus
 * denselben Feldern. Genau darin liegt R5 - ein Satz, der neben den Bytes
 * entsteht, kann etwas anderes sagen als sie.
 *
 * `grantPicoCompanionDomainRead` wurde achtzehn Tage danach geschrieben und
 * gab die alte Gestalt weiter: als Familienname stand dort der Satz „Let this
 * device read one part of your memory", dazu zwei der zehn Felder. Der Daemon
 * antwortete `unknown_signature_input_label`, und zwar bei jedem Druck seit es
 * den Knopf gibt. Kein Test sah es, weil alle über einen erfundenen Signierer
 * unterschreiben - der nimmt jeden String.
 *
 * **Drei Aussagen, die zusammengehören**, und keine davon hält der Compiler:
 * `sign` nimmt `label: string`, weil die Familien in mehreren Paketen stehen.
 *
 * 1. Ein Familienname an einer Signierstelle ist eine Konstante, kein Literal.
 *    Ein Literal ist entweder ein Tippfehler oder ein Satz - und beides endet
 *    in derselben Ablehnung.
 * 2. Jeder so genannte Name hat einen Bauer in `sign-rendering.ts`. Ohne ihn
 *    gibt es keine Bytes, und der Daemon lehnt ab, bevor jemand gefragt wird.
 * 3. Und einen Renderer, solange die Familie nicht auf der geschlossenen
 *    Freistellungsliste steht: für eine bewilligungspflichtige Familie ist der
 *    Satz Pflicht, denn ein Nachweis, den niemand darstellen kann, ist einer,
 *    dem niemand sinnvoll zustimmen konnte.
 *
 * **Was diese Prüfung nicht kann.** Sie liest den Ausdruck hinter `label:` und
 * löst ihn gegen die Konstanten des Protokolls auf. Ein Name, der über eine
 * Variable oder einen Parameter hereinkommt, geht an ihr vorbei - und wird
 * deshalb gezählt und genannt, damit die Zahl nicht so aussieht, als sei sie
 * die Wahrheit über alle. Ob der Vault die Familie für diese *Schlüsselrolle*
 * unterschreiben darf, entscheidet weiter `picoVaultCanSignLabel` zur Laufzeit:
 * das hängt von der Rolle ab, die an der Aufrufstelle nicht steht.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

const protocolSources = [
  'packages/protocol/src/index.ts',
  'packages/protocol/src/recovery.ts',
];
const signRenderingPath = 'apps/vault-daemon/src/sign-rendering.ts';
const approvalPolicyPath = 'apps/vault-daemon/src/protocol.ts';

/**
 * Jede Familienkonstante des Protokolls, als `Pfad -> Wert`.
 *
 * Beide Gestalten, weil das Protokoll beide benutzt: ein Objekt mit benannten
 * Familien (`picoHomeSignatureInputLabels.claim`) und eine einzelne Konstante
 * (`picoLinkDirectRequestSignatureInputLabel`). Wer nur nach einer Gestalt
 * suchte, fände die andere nicht.
 */
function labelConstants() {
  const found = new Map();
  for (const path of protocolSources) {
    const source = readFileSync(join(repoRoot, path), 'utf8');
    for (const [, name, body] of source.matchAll(
      /export const (pico[A-Za-z0-9]*(?:SignatureInputLabels|CanonicalLabels)) = \{([\s\S]*?)\n\} as const/gu,
    )) {
      for (const [, key, value] of body.matchAll(/^\s*([A-Za-z0-9_]+): '([^']+)',/gmu)) {
        found.set(`${name}.${key}`, value);
      }
    }
    for (const [, name, value] of source.matchAll(
      /export const (pico[A-Za-z0-9]*SignatureInputLabel) =\s*\n?\s*'([^']+)' as const;/gu,
    )) {
      found.set(name, value);
    }
  }
  return found;
}

/** Die Schlüssel einer `…ByLabel`-Tabelle, als Konstantenpfade. */
function tableKeys(source, tableName) {
  const block = new RegExp(
    String.raw`const ${tableName}[^\n]*= \{([\s\S]*?)\n\};`,
    'u',
  ).exec(source);
  if (block === null) {
    return undefined;
  }
  return new Set(
    [...block[1].matchAll(/^\s{2}\[([A-Za-z0-9_.]+)\]:/gmu)].map(([, path]) => path),
  );
}

const constants = labelConstants();
if (constants.size === 0) {
  errors.push(`${protocolSources[0]}: no signature-input label constants found, so every `
    + 'sentence below is about nothing.');
}

const signRendering = readFileSync(join(repoRoot, signRenderingPath), 'utf8');
const builders = tableKeys(signRendering, 'buildersByLabel');
const renderers = tableKeys(signRendering, 'renderersByLabel');
if (builders === undefined || renderers === undefined) {
  errors.push(`${signRenderingPath}: could not read buildersByLabel and renderersByLabel.`);
}

const exemptBlock = /picoVaultDaemonApprovalExemptLabels: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\);/u
  .exec(readFileSync(join(repoRoot, approvalPolicyPath), 'utf8'));
const exempt = new Set(
  exemptBlock === null ? [] : [...exemptBlock[1].matchAll(/'([^']+)'/gu)].map(([, value]) => value),
);
if (exempt.size === 0) {
  errors.push(`${approvalPolicyPath}: could not read the closed approval-exemption list.`);
}

/**
 * Die rollenabhängigen Ausnahmen, die dieser Prüfer nicht entscheiden kann.
 *
 * `picoVaultDaemonSignatureNeedsApproval` stellt drei Familien frei, wenn ein
 * *Gerät* sie unterschreibt, und lässt sie für die Identitätswurzel bewilligt.
 * An der Aufrufstelle steht die Schlüsselrolle nicht, also ist die Frage nach
 * dem Satz hier unbeantwortbar - und eine Prüfung, die sie trotzdem
 * beantwortete, hätte `pico.home.device-activation.v1` als Fehler gemeldet, wo
 * ADR 0109 genau diese Freistellung entschieden hat.
 */
const roleDependentBlock = /export function picoVaultDaemonSignatureNeedsApproval\([\s\S]*?\n\}/u
  .exec(readFileSync(join(repoRoot, approvalPolicyPath), 'utf8'));
const roleDependent = new Set(
  roleDependentBlock === null
    ? []
    : [...roleDependentBlock[0].matchAll(/label === ([A-Za-z0-9_.]+)/gu)].map(([, path]) => path),
);
if (roleDependent.size === 0) {
  errors.push(`${approvalPolicyPath}: could not read the role-aware approval exceptions.`);
}

function sourceFiles(root) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    // Tests sign through stand-ins on purpose; a stand-in takes any string,
    // which is exactly why this check exists for the product side only.
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(path);
    }
  }
  return found;
}

const roots = [];
for (const group of ['apps', 'packages', 'modules']) {
  for (const entry of readdirSync(join(repoRoot, group))) {
    const sourceRoot = join(repoRoot, group, entry, 'src');
    try {
      if (statSync(sourceRoot).isDirectory()) {
        roots.push(sourceRoot);
      }
    } catch {
      // Kein `src` ist kein Fehler - nicht jedes Verzeichnis ist ein Paket.
    }
  }
}

/**
 * Eine Signierstelle: `.sign(` und das erste `label:` in den achthundert
 * Zeichen danach.
 *
 * Ein Fenster statt einer Klammerzählung, und die Grenze wird gesagt statt
 * geglaubt: die Aufrufe gehen über mehrere Zeilen, das längste heute
 * gemessene `label:` steht 349 Zeichen hinter seinem `.sign(`, und ein
 * Aufruf, der es weiter wegschöbe, ginge an dieser Prüfung vorbei. Sie
 * bemerkt das nicht - sie fände dort nur kein `label:` und ginge weiter -,
 * also steht die Zahl hier und nicht in einem Kommentar über der Absicht.
 */
const signCall = /\.sign\(/gu;
let checked = 0;
let roleBound = 0;
/** Ausdrücke, die dieser Leser nicht auflösen konnte - genannt, nicht gezählt. */
const unresolved = [];

for (const root of roots) {
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, 'utf8');
    signCall.lastIndex = 0;
    for (const call of source.matchAll(signCall)) {
      const window = source.slice(call.index, call.index + 800);
      const label = /\blabel:\s*([^,\n]+)/u.exec(window);
      if (label === null) {
        continue;
      }
      const line = source.slice(0, call.index).split('\n').length;
      const where = `${relative(repoRoot, path)}:${line}`;
      const expression = label[1].trim();
      checked += 1;

      if (expression.startsWith("'") || expression.startsWith('"') || expression.startsWith('`')) {
        errors.push(
          `${where} names the signature family as the literal ${expression}. Since ADR 0106 the `
          + 'label selects the builder that makes the bytes and the renderer that makes the '
          + "person's sentence; a literal is either a typo or a sentence, and the daemon answers "
          + '`unknown_signature_input_label` to both - before anybody is ever asked.',
        );
        continue;
      }
      if (!constants.has(expression)) {
        // Named rather than counted as clean: this reader followed the
        // expression and could not resolve it, which is not the same as
        // finding it correct.
        unresolved.push(`${where} names \`${expression}\``);
        continue;
      }
      const value = constants.get(expression);
      if (builders !== undefined && !builders.has(expression)) {
        errors.push(
          `${where} signs the family \`${value}\`, and \`${signRenderingPath}\` has no builder `
          + 'for it. Without one the daemon has no bytes to sign and refuses with '
          + '`unknown_signature_input_label`, so the call can never succeed.',
        );
      }
      if (roleDependent.has(expression)) {
        // Die Bewilligung hängt hier an der Rolle, die an dieser Stelle nicht
        // steht. Gezählt statt beurteilt.
        roleBound += 1;
        continue;
      }
      if (renderers !== undefined && !exempt.has(value) && !renderers.has(expression)) {
        errors.push(
          `${where} signs the family \`${value}\`, which is not on the closed approval-exemption `
          + `list, and \`${signRenderingPath}\` has no renderer for it. A gated family without a `
          + 'statement is unsignable by design: a record nobody can render is one nobody could '
          + 'have meaningfully approved.',
        );
      }
    }
  }
}

if (checked === 0) {
  errors.push(
    'scripts/check-signature-labels.mjs found no signing call at all, so it compared nothing. '
    + 'A reader that finds no subject is broken, not clean.',
  );
}

if (errors.length > 0) {
  console.error('Signature-label check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Signature-label check passed (${checked - unresolved.length - roleBound} signing calls name a `
  + 'protocol label constant that the daemon can build and, unless exempt, render; '
  + `${roleBound} name a family whose approval depends on the key role and were judged on the `
  + `builder alone; ${unresolved.length} name an expression this reader could not resolve and `
  + `were not judged${unresolved.length === 0 ? '' : ` - ${unresolved.join(', ')}`}).`,
);
