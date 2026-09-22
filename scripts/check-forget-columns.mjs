import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Jede Spalte eines Erinnerungsstuecks ist entweder beim Loeschen geleert
 * oder es steht dabei, warum sie bleibt.
 *
 * **Der Anlass** (2026-09-22, Befund B251). `deleteInDomain` behaelt die Zeile
 * absichtlich - der Store soll weiterhin sagen koennen, was aus einer Referenz
 * wurde - und leerte davon genau **eine** Spalte: `content`. ADR 0129 SR3 hat
 * spaeter drei Spalten dazugestellt, `latitude_deg`, `longitude_deg`,
 * `accuracy_m`, und in seinem eigenen Satz behauptet, ein Ort werde "von den
 * Pfaden regiert, die ein Erinnerungsstueck ohnehin regieren". Der Loeschpfad
 * tat es nicht. Gemessen an einem laufenden Store: nach dem Loeschen war der
 * Ort weiter **ueber die oeffentliche API lesbar**.
 *
 * Niemand hat etwas falsch gemacht. Eine Spalte kam dazu, und der Pfad, der
 * sie haette kennen muessen, liegt in einer anderen Datei. Genau dafuer ist
 * diese Pruefung da: eine **neue** Spalte zwingt zu einer Entscheidung, statt
 * stillschweigend zu bleiben.
 *
 * **Was hier nicht entschieden wird.** Ob eine behaltene Spalte behalten
 * *bleiben soll*, ist eine Produktfrage und keine Zeile in einem Pruefer. Die
 * Liste unten sagt, was heute gilt und warum; vier Eintraege tragen
 * ausdruecklich eine offene Frage, und die steht im Handoff, nicht hier.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

/**
 * Warum eine Spalte eine Loeschung ueberlebt.
 *
 * Drei Sorten: **Identitaet** (ohne sie ist die Zeile nicht mehr die Antwort
 * auf eine Referenz), **Zustand** (sie sagt gerade, dass geloescht wurde) und
 * **Gestalt** (sie beschreibt das Stueck, nicht seinen Inhalt).
 */
const kept = new Map([
  ['memory_item_id', 'Identitaet: ohne sie beantwortet die Zeile keine Referenz mehr, und genau dafuer bleibt sie stehen'],
  ['privacy_domain', 'Identitaet: eine Referenz ist auf einen Raum bezogen, und ohne ihn ist sie nicht aufloesbar'],
  ['deletion_state', 'Zustand: diese Spalte *ist* die Auskunft, dass geloescht wurde'],
  ['created_at', 'Gestalt: wann das Stueck entstand, ohne zu sagen was darin stand'],
  ['updated_at', 'Zustand: wann zuletzt geschrieben wurde - beim Loeschen also der Loeschzeitpunkt selbst'],
  ['content_type', 'Gestalt: welche Art Stueck es war, nicht was darin stand'],
  ['owner', 'Identitaet: wessen Stueck es war - die Auskunft, wer eine Referenz beantworten darf'],
  ['controller', 'Identitaet: dieselbe Frage fuer die Verfuegung darueber'],
  ['content_posture', 'Gestalt: ob der Inhalt verschluesselt lag; ohne Inhalt eine Aussage ueber die Vergangenheit der Zeile'],
  ['key_envelope_ref', 'Der Umschlag selbst wird von `deleteKeyEnvelope` entfernt; die Referenz zeigt danach ins Leere und ist kein Schluessel'],
  ['retention_policy_ref', 'Gestalt: unter welcher Aufbewahrungsregel das Stueck stand'],
  ['origin', 'Gestalt: aus welcher Herkunftsklasse es kam - eine von sechs Kategorien, kein Inhalt'],
  ['derived_from_supplier', 'Herkunftsmarke: welcher Zulieferer, nicht was er lieferte'],
  ['derived_pin_kind', 'Herkunftsmarke: ob der Anker ein Inhalts-Hash oder ein Commit war'],
  ['derived_pin_value', 'Herkunftsmarke: der Anker selbst, ein Hash oder eine Commit-Id'],
  ['derived_pin_covers_content', 'Herkunftsmarke: ob der Anker den Inhalt mit abdeckte'],
  // Die vier mit offener Frage. Sie bleiben heute, und dass sie bleiben, ist
  // eine Entscheidung, die ein Mensch treffen muss - sie steht im Handoff.
  ['source_ref', 'Offene Frage (B251): eine Referenz auf die Herkunft. Sie sagt, woher etwas kam, und das kann verraten, was jemand gelesen hat. Bleibt heute, weil der Store "was aus einer Referenz wurde" beantworten koennen soll'],
  ['due_at', 'Offene Frage (B251): wann etwas faellig war. Ein Zeitpunkt ohne Inhalt, aber ein Zeitpunkt, den eine Person gesetzt hat'],
  ['raised_at', 'Offene Frage (B251): wann es vorgelegt wurde, dieselbe Lage'],
  ['announced_at', 'Offene Frage (B251): wann es angekuendigt wurde, dieselbe Lage'],
]);

const errors = [];

/** Jede Spalte, die `memory_item` je bekommen hat. */
function columnsOfMemoryItem() {
  const text = readFileSync(join(repoRoot, 'apps', 'core', 'src', 'migrations.ts'), 'utf8');
  const found = [];
  /**
   * Bis zur **ersten** schliessenden Klammer, nicht bis zur naechsten Zeile
   * mit einer: `memory_item` endet mit `accuracy_m REAL NULL);` auf derselben
   * Zeile wie seine letzte Spalte, und eine Endemarke, die eine eigene Zeile
   * verlangt, lief in die naechste Tabelle hinein und meldete deren sechs
   * Spalten als unklassifiziert.
   */
  const created = /CREATE TABLE memory_item \(([\s\S]*?)\);/u.exec(text);
  if (created !== null) {
    for (const line of created[1].split('\n')) {
      const head = /^\s*,?\s*([a-z_]+) (?:TEXT|REAL|INTEGER|BLOB)\b/u.exec(line);
      if (head !== null) found.push(head[1]);
      for (const inline of line.matchAll(/, ([a-z_]+) (?:TEXT|REAL|INTEGER|BLOB) /gu)) {
        found.push(inline[1]);
      }
    }
  }
  for (const added of text.matchAll(/ALTER TABLE memory_item\s*\n?\s*ADD COLUMN ([a-z_]+)/gu)) {
    found.push(added[1]);
  }
  return [...new Set(found)];
}

/** Welche Spalten `deleteInDomain` auf NULL setzt. */
function clearedByDelete() {
  const path = join('apps', 'core', 'src', 'memory-store.ts');
  const source = ts.createSourceFile(
    path,
    readFileSync(join(repoRoot, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const cleared = new Set();
  (function walk(node) {
    if (ts.isMethodDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === 'deleteInDomain') {
      /**
       * Gelesen wird der Text der Methode, nicht der ganzen Datei: eine
       * andere Methode, die dieselbe Spalte nullt, beweist nichts ueber
       * diesen Pfad. Und gesucht wird die Zuweisung, nicht der Spaltenname -
       * `WHERE latitude_deg IS NOT NULL` ist kein Leeren.
       */
      for (const [, column] of node.getText(source).matchAll(/([a-z_]+)\s*=\s*NULL/gu)) {
        cleared.add(column);
      }
    }
    node.forEachChild(walk);
  })(source);
  return cleared;
}

const columns = columnsOfMemoryItem();
const cleared = clearedByDelete();

if (columns.length < 20 || cleared.size === 0) {
  errors.push(
    `Read ${columns.length} columns and ${cleared.size} cleared by the delete path; the `
    + 'table has twenty-four and the path clears four. A check that has lost its subject is '
    + 'broken rather than satisfied (B166).',
  );
}

for (const column of columns) {
  if (cleared.has(column)) {
    if (kept.has(column)) {
      errors.push(
        `\`${column}\` is both cleared by \`deleteInDomain\` and argued as kept. One of the `
        + 'two is out of date, and a reader cannot tell which.',
      );
    }
    continue;
  }
  if (!kept.has(column)) {
    errors.push(
      `\`memory_item.${column}\` is neither cleared by \`deleteInDomain\` nor argued as kept. `
      + 'The row survives a deletion on purpose, so every column in it is a decision: say '
      + 'whether a person deleting this item meant to keep that value, and why. This is the '
      + 'check that ADR 0129 SR3 would have needed when it added three place columns and '
      + 'nobody asked the delete path (B251).',
    );
  }
}

for (const column of kept.keys()) {
  if (!columns.includes(column)) {
    errors.push(
      `\`${column}\` is argued as kept on deletion and \`memory_item\` has no such column. `
      + 'An argument about a column that is gone describes nothing.',
    );
  }
}

if (errors.length > 0) {
  console.error('Forget-column check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const open = [...kept.values()].filter((reason) => reason.startsWith('Offene Frage')).length;
console.log(
  `Forget-column check passed (${columns.length} columns of \`memory_item\`, ${cleared.size} `
  + `cleared by \`deleteInDomain\` and ${kept.size} argued as kept - of those, ${open} carry an `
  + 'open question for a person rather than a settled reason).',
);
