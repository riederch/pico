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
 * **Erweitert am 2026-09-22, Befund B252.** Dieses Produkt hat nicht eine
 * Tabelle mit Personeninhalt, sondern drei - und `domain-shred.ts` sagt selbst
 * welche, weil ein Shred alle drei erreichen muss. Zwei Gestalten:
 *
 * `clears` - die Zeile bleibt stehen und einzelne Spalten werden geleert. Dann
 * ist **jede** Spalte eine Entscheidung, und genau dort ist B251 passiert.
 *
 * `deletes` - die Zeile verschwindet. Das ist von Bauart vollstaendig und
 * braucht keine Spaltenliste; gefragt wird nur, ob es wirklich ein `DELETE`
 * ist. Ein `UPDATE`, das sich als Loeschen ausgibt, waere der Unterschied, um
 * den es hier geht.
 */
const tables = [
  {
    table: 'memory_item',
    shape: 'clears',
    source: join('apps', 'core', 'src', 'memory-store.ts'),
    method: 'deleteInDomain',
  },
  {
    table: 'pico_model_job_queue',
    shape: 'clears',
    source: join('apps', 'core', 'src', 'model-job-queue.ts'),
    method: 'forgetRecall',
  },
  {
    table: 'pico_observation',
    shape: 'deletes',
    source: join('apps', 'core', 'src', 'event-store.ts'),
    method: 'deletePicoObservationsInDomain',
  },
];

/**
 * Warum eine Spalte eine Loeschung ueberlebt.
 *
 * Drei Sorten: **Identitaet** (ohne sie ist die Zeile nicht mehr die Antwort
 * auf eine Referenz), **Zustand** (sie sagt gerade, dass geloescht wurde) und
 * **Gestalt** (sie beschreibt das Stueck, nicht seinen Inhalt).
 */
const keptByTable = new Map();
keptByTable.set('memory_item', new Map([
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
]));

/**
 * ADR 0049 mit ADR 0116 W3. Die Warteschlange ist kein Protokoll neben dem
 * Produkt - sie *ist* die Rueckrufgeschichte, die einem Menschen gezeigt wird,
 * und haelt die Frage, die Antwort und das erinnerte Material (Befund B17).
 * `forgetRecall` leert diese drei; die uebrigen fuenfzehn sind hier
 * entschieden (Befund B252).
 */
keptByTable.set('pico_model_job_queue', new Map([
  ['job_id', 'Identitaet: die Zeile bleibt als Auskunft, dass es den Job gab'],
  ['pico_identity_fingerprint_hex', 'Identitaet: wessen Job es war - ohne sie beantwortet die Zeile niemandem etwas'],
  ['entry_id', 'Gestalt: welcher Modellanbieter-Eintrag ihn ausfuehrte, nicht was gefragt wurde'],
  ['kind', 'Gestalt: welche Art Job, eine von wenigen Klassen'],
  ['attempts', 'Gestalt: wie oft es versucht wurde'],
  ['outcome', 'Zustand: wie er endete - der Vergessenspfad setzt ihn selbst auf `taken_back`, wenn er offen war'],
  ['forgotten_at', 'Zustand: diese Spalte *ist* die Auskunft, dass vergessen wurde'],
  ['enqueued_at', 'Gestalt: wann der Job in die Schlange kam'],
  ['settled_at', 'Zustand: wann er endete; der Vergessenspfad fuellt ihn, wenn er offen war'],
  ['last_attempt_at', 'Gestalt: wann zuletzt versucht wurde'],
  ['derived_from_supplier', 'Herkunftsmarke: welcher Zulieferer, nicht was er lieferte'],
  ['derived_pin_value', 'Herkunftsmarke: der Anker selbst, ein Hash oder eine Commit-Id'],
  ['derived_pin_covers_content', 'Herkunftsmarke: ob der Anker den Inhalt mit abdeckte'],
  // Dieselbe offene Frage wie `source_ref` bei `memory_item`.
  ['kept_memory_item_id', 'Offene Frage (B252): sagt, dass eine Antwort behalten wurde und welche. Der Verweis bleibt, auch wenn die Worte gehen'],
  ['kept_privacy_domain', 'Offene Frage (B252): und in welchem Raum sie behalten wurde'],
]));

const errors = [];

/** Jede Spalte, die eine Tabelle je bekommen hat. */
function columnsOf(table) {
  const text = readFileSync(join(repoRoot, 'apps', 'core', 'src', 'migrations.ts'), 'utf8');
  const found = [];
  /**
   * Bis zur **ersten** schliessenden Klammer, nicht bis zur naechsten Zeile
   * mit einer: `memory_item` endet mit `accuracy_m REAL NULL);` auf derselben
   * Zeile wie seine letzte Spalte, und eine Endemarke, die eine eigene Zeile
   * verlangt, lief in die naechste Tabelle hinein und meldete deren sechs
   * Spalten als unklassifiziert (Befund B251).
   */
  const created = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\);`, 'u').exec(text);
  if (created !== null) {
    for (const line of created[1].split('\n')) {
      const head = /^\s*,?\s*([a-z_]+) (?:TEXT|REAL|INTEGER|BLOB)\b/u.exec(line);
      if (head !== null) found.push(head[1]);
      for (const inline of line.matchAll(/, ([a-z_]+) (?:TEXT|REAL|INTEGER|BLOB) /gu)) {
        found.push(inline[1]);
      }
    }
  }
  const added = new RegExp(`ALTER TABLE ${table}\\s*\\n?\\s*ADD COLUMN ([a-z_]+)`, 'gu');
  for (const match of text.matchAll(added)) found.push(match[1]);
  return [...new Set(found)];
}

/**
 * Was eine Methode mit einer Tabelle tut: welche Spalten sie **leert**, und ob
 * sie die Zeile ganz entfernt.
 *
 * Geleert heisst auf `NULL` oder auf ein leeres Literal - `job_json = '{}'` ist
 * ein Leeren, `forgotten_at = ?` ist ein Schreiben und muss begruendet sein.
 */
function forgetPathOf(entry) {
  const source = ts.createSourceFile(
    entry.source,
    readFileSync(join(repoRoot, entry.source), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  let text;
  (function walk(node) {
    if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node))
      && node.name !== undefined
      && ts.isIdentifier(node.name)
      && node.name.text === entry.method) {
      text = node.getText(source);
    }
    node.forEachChild(walk);
  })(source);
  if (text === undefined) {
    return undefined;
  }
  const cleared = new Set();
  for (const [, column] of text.matchAll(/([a-z_]+)\s*=\s*(?:NULL|'\{\}'|'')/gu)) {
    cleared.add(column);
  }
  return {
    cleared,
    deletes: new RegExp(`DELETE FROM ${entry.table}\\b`, 'u').test(text),
    updates: new RegExp(`UPDATE ${entry.table}\\b`, 'u').test(text),
  };
}

let columnsChecked = 0;
let clearedTotal = 0;
let keptTotal = 0;
let openTotal = 0;

for (const entry of tables) {
  const path = forgetPathOf(entry);
  if (path === undefined) {
    errors.push(
      `${entry.source}: \`${entry.method}\` was not found, so the forget path for `
      + `\`${entry.table}\` was compared against nothing (B166).`,
    );
    continue;
  }

  if (entry.shape === 'deletes') {
    if (!path.deletes) {
      errors.push(
        `\`${entry.method}\` is listed as removing rows from \`${entry.table}\` and issues `
        + 'no DELETE. A row that stays needs every one of its columns decided; that is what '
        + 'the other shape is for.',
      );
    }
    if (path.updates) {
      errors.push(
        `\`${entry.method}\` is listed as removing rows from \`${entry.table}\` and also `
        + 'updates it. An update that passes for a deletion is exactly the difference this '
        + 'check exists for.',
      );
    }
    continue;
  }

  const columns = columnsOf(entry.table);
  const kept = keptByTable.get(entry.table) ?? new Map();
  if (columns.length === 0 || path.cleared.size === 0) {
    errors.push(
      `\`${entry.table}\`: read ${columns.length} columns and ${path.cleared.size} cleared `
      + 'by its forget path. A check that has lost its subject is broken rather than '
      + 'satisfied (B166).',
    );
    continue;
  }
  columnsChecked += columns.length;
  clearedTotal += path.cleared.size;
  keptTotal += kept.size;
  for (const reason of kept.values()) {
    if (reason.startsWith('Offene Frage')) openTotal += 1;
  }

  for (const column of columns) {
    if (path.cleared.has(column)) {
      if (kept.has(column)) {
        errors.push(
          `\`${entry.table}.${column}\` is both cleared by \`${entry.method}\` and argued as `
          + 'kept. One of the two is out of date, and a reader cannot tell which.',
        );
      }
      continue;
    }
    if (!kept.has(column)) {
      errors.push(
        `\`${entry.table}.${column}\` is neither cleared by \`${entry.method}\` nor argued as `
        + 'kept. The row survives on purpose, so every column in it is a decision: say '
        + 'whether a person forgetting this meant to keep that value, and why. This is the '
        + 'check ADR 0129 SR3 would have needed when it added three place columns and '
        + 'nobody asked the delete path (B251).',
      );
    }
  }
  for (const column of kept.keys()) {
    if (!columns.includes(column)) {
      errors.push(
        `\`${entry.table}.${column}\` is argued as kept and the table has no such column. `
        + 'An argument about a column that is gone describes nothing.',
      );
    }
  }
}

if (columnsChecked < 40) {
  errors.push(
    `Only ${columnsChecked} columns classified across the tables that hold person content, `
    + 'and 42 were measured on 2026-09-22. A check that has lost its subject is broken '
    + 'rather than satisfied (B166).',
  );
}

if (errors.length > 0) {
  console.error('Forget-column check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Forget-column check passed (${tables.length} tables hold person content, as `
  + `\`domain-shred.ts\` itself names them; ${tables.filter((entry) => entry.shape === 'deletes').length} `
  + `remove the row outright and ${tables.filter((entry) => entry.shape === 'clears').length} keep it, `
  + `so their ${columnsChecked} columns are each decided: ${clearedTotal} cleared by the forget `
  + `path and ${keptTotal} argued as kept - of those, ${openTotal} carry an open question for a `
  + 'person rather than a settled reason).',
);
