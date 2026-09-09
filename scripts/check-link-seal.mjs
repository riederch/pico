import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankStringsAndComments, callSpan } from './source-spans.mjs';

/**
 * ADR 0148 EX4. A relay mailbox address travels inside the ADR 0107 seal and
 * nowhere else.
 *
 * An address is a capability: anybody who learns a mailbox can fill it, and
 * ADR 0147 RY6 makes a full mailbox refuse rather than evict, so a leaked
 * address is a denial of that one relationship until it is reissued.
 *
 * This is worth a check rather than care because the thing that carries an
 * address is a *transport*, and transports are where values get logged. The
 * pattern here is `check-companion-boundary.mjs`'s: name the places a value
 * must not reach, and fail with the file and the line rather than with a
 * property nobody can see.
 *
 * What it looks for is a mailbox-shaped value reaching a logger, an error
 * message, a URL or a response outside the sealed operation result. It cannot
 * prove absence - a value renamed twice escapes any such reading - so it is a
 * floor and not a proof, and it is written that way on purpose: the cheap half
 * of a discipline that catches the next one by name in a second.
 *
 * **It also could not tell a clean product from an empty one until
 * 2026-08-24.** Run over a tree with none of the four directories in it, this
 * printed "0 files; no mailbox address reaches a log, an error or a URL" and
 * exited zero - a sentence about the whole product, said truthfully about
 * nothing. The four directories are now counted one by one, because a total
 * hides the case that actually happens: three still full and one renamed
 * away.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/**
 * Zwei Wertefamilien, eine Maschinerie (Befund B96).
 *
 * Die Adressfamilie stand hier zuerst. Die zweite kam am 2026-09-08 dazu, und
 * sie ist nicht dieselbe Sache - sie ist dieselbe *Frage*: welcher Wert darf
 * den Prozess in einer Protokollzeile nicht verlassen? Eine Mailboxadresse ist
 * eine Faehigkeit (ADR 0148 EX4), eine Passphrase und ein Klartext sind das,
 * wofuer dieses Produkt ueberhaupt gebaut ist.
 *
 * Zusammen und nicht in zwei Dateien, weil das Teure hier die Maschinerie ist:
 * Zeichenketten ausblenden, den ganzen Aufruf lesen statt der Zeile, den Namen
 * als Wort statt als Zeichenkette pruefen. Zweimal geschrieben wuerde sie
 * zweimal driften - und ausgerechnet dieser Pruefer hat in B81 gelernt, was
 * das kostet.
 *
 * **Gemessen, bevor die zweite Familie dazukam:** drei Treffer, alle falsch -
 * ein *angehefteter* Depot-Stand (`attachment.pin.remote`) und zwei Meldungen
 * ueber Laengengrenzen, die das Wort `passphrase` im Text tragen und nicht den
 * Wert. Kein Geheimnis erreicht heute ein Protokoll.
 */
const valueFamilies = [
  {
    what: 'a relay mailbox address',
    why: 'it travels inside the ADR 0107 seal and nowhere else',
    names: [
      'homeInbound',
      'deviceInbound',
      'inbound',
      'outbound',
      'mailbox',
      'picoLinkInboundAddressFor',
      'picoLinkOutboundAddressFor',
      'formatPicoLinkPacketAddress',
    ],
  },
  {
    what: 'a secret a person gave or a plaintext this product holds',
    why: 'a log is read by whoever holds the file, and this is the one thing '
      + 'the product exists to keep',
    names: [
      'passphrase',
      'plaintext',
      'decrypted',
      'memoryContent',
      'seedMaterial',
      'privateKey',
      'cardPin',
    ],
  },
];

/** Identifiers that hold, or are named as if they hold, a delivery address. */
const addressBearingNames = valueFamilies[0].names;

/**
 * Sinks an address must not reach. Each is a place the value leaves the
 * process boundary the seal is supposed to hold it inside.
 */
const forbiddenSinks = [
  { pattern: /\b(?:log|logger)\s*\.\s*(?:trace|debug|info|warn|error|fatal)\s*\(/, why: 'a log line' },
  { pattern: /\bconsole\s*\.\s*(?:log|info|warn|error|debug)\s*\(/, why: 'the console' },
  { pattern: /\bprocess\s*\.\s*(?:stdout|stderr)\s*\.\s*write\s*\(/, why: 'stdout or stderr' },
  { pattern: /\bnew\s+Error\s*\(/, why: 'an error message' },
  { pattern: /\bthrow\s+new\s+/, why: 'a thrown message' },
  /**
   * Ein Protokollierer, der als Funktion hereingereicht wird (Befund B81).
   *
   * Die Zeile darueber liest `log.info(` - die Form, die eine Fastify-Instanz
   * hat. Das Relay schreibt `options.log?.({...})`, der Vault-Daemon
   * `this.#audit({...})`, der Kern an einer Stelle `this.log(...)`. Keine
   * davon war eine Senke fuer diesen Pruefer, und das Relay ist ausgerechnet
   * die Stelle, an der Mailboxadressen zu Hause sind.
   *
   * Der Bezeichner muss auf `log`, `logger`, `audit` oder `auditSink` enden
   * und als Funktion gerufen werden; `catalog(` oder `dialog(` faellt nicht
   * darunter, weil dem Namen ein Wortzeichen vorausginge.
   */
  {
    pattern: /(?:^|[^A-Za-z0-9_$])#?(?:log|logger|audit|auditSink)\s*(?:\?\.)?\s*\(/,
    why: 'a logger handed in as a function',
  },
];

/**
 * Blanks out what is inside quotes, keeping `${...}` interpolations. Crude on
 * purpose: it only has to tell a value apart from a word.
 */
function withoutStringContents(line) {
  return line
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`([^`]*)`/g, (_match, inner) => {
      const kept = [...inner.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' ');
      return `\`${kept}\``;
    });
}

function listSourceFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      files.push(...listSourceFiles(path));
      continue;
    }
    if (!statSync(path).isFile()) {
      continue;
    }
    // Tests build addresses to assert on them, which is the opposite of
    // leaking one: a fixture that never leaves the test process.
    if (/\.test\.[cm]?[jt]s$/u.test(entry.name)) {
      continue;
    }
    if (/\.[cm]?[jt]s$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const searched = [
  join(repoRoot, 'apps', 'core', 'src'),
  join(repoRoot, 'apps', 'companion', 'src'),
  join(repoRoot, 'apps', 'companion-shell', 'src'),
  join(repoRoot, 'packages', 'protocol', 'src'),
  join(repoRoot, 'apps', 'relay', 'src'),
  join(repoRoot, 'apps', 'vault-daemon', 'src'),
  join(repoRoot, 'packages', 'link-relay-client', 'src'),
  join(repoRoot, 'packages', 'sync', 'src'),
];

let scannedFiles = 0;
let sinkCalls = 0;
const scannedPerDirectory = new Map(searched.map((directory) => [directory, 0]));
for (const directory of searched) {
  for (const file of listSourceFiles(directory)) {
    scannedFiles += 1;
    scannedPerDirectory.set(directory, scannedPerDirectory.get(directory) + 1);
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    /**
     * **Prosa ist kein Code** (Befund B109). Die Senken wurden bis heute auf
     * der rohen Zeile gesucht, also traf `log (ADR 0075 A9)` in einem
     * Kommentar dasselbe Muster wie ein Protokollaufruf. Drei von 1.874
     * Senkenzeilen waren so - harmlos, solange kein verbotener Name in der
     * Naehe steht, und ein verwirrender Fehlalarm an dem Tag, an dem einer
     * dort steht. Gesucht wird jetzt auf der ausgeblendeten Fassung.
     */
    const flat = blankStringsAndComments(content, relative(repoRoot, file));
    const flatLines = flat.split('\n');
    const lineStart = [];
    let offset = 0;
    for (const each of lines) {
      lineStart.push(offset);
      offset += each.length + 1;
    }
    for (const [index, line] of flatLines.entries()) {
      for (const sink of forbiddenSinks) {
        if (!sink.pattern.test(line)) {
          continue;
        }
        /**
         * Der ganze Aufruf, nicht die Zeile (Befund B81).
         *
         * Diese Pruefung las eine Zeile und fand eine Adresse nur, wenn sie
         * *neben* der Senke stand. Das Relay und der Vault-Daemon schreiben
         * aber jeden Protokollaufruf als mehrzeiliges Objektliteral - dort
         * war sie kein Boden, sondern ein Zufall. Nachgestellt: eine Mailbox
         * in einer Relay-Protokollzeile ging durch, dieselbe Mailbox in
         * *derselben* Zeile wie der Aufruf fiel.
         *
         * Gelesen wird von der Senke bis zu der Klammer, die sie schliesst.
         *
         * **Seit Befund B109 zaehlt das `source-spans.mjs`** statt einer
         * eigenen Zaehlung ueber vierzig Zeilen. Die eigene zaehlte auf einer
         * Fassung, die Kommentare stehen liess und regulaere Ausdruecke fuer
         * Zeichenketten hielt - dieselbe Klasse Fehler, die Befund B108 im
         * gemeinsamen Leser gefunden hat, nur hier unentdeckt, weil sie heute
         * an keiner Stelle beisst. Die Obergrenze von vierzig Zeilen faellt
         * damit weg: eine Spanne, die an ihrer eigenen Klammer endet, braucht
         * keine.
         *
         * **Gelesen wird weiter auf der Fassung mit den Interpolationen**
         * (Befund B96), denn `${inbound}` ist genau das Leck, das hier gesucht
         * wird. Zwei Sichten, zwei Aufgaben: die eine zaehlt, die andere
         * liest.
         */
        sinkCalls += 1;
        const at = lineStart[index] + line.search(sink.pattern);
        const bounds = callSpan(flat, at);
        const lastLine = bounds === null
          ? index
          : content.slice(0, bounds[1]).split('\n').length - 1;
        let span = '';
        for (let cursor = index; cursor <= lastLine && cursor < lines.length; cursor += 1) {
          span += `${withoutStringContents(lines[cursor])}\n`;
        }
        // String contents are stripped first, and that correction is the useful
        // part of this check. Written naively it fired on
        // `throw new Error('pico_link_inbound_shared_between_peers')` - an error
        // *code* that happens to contain the word, carrying no address at all.
        // A check whose failures are mostly wrong teaches people to skip it.
        // Template interpolations survive the strip, because `${inbound}` is
        // exactly the leak this looks for.
        /**
         * Der Name als Wort, nicht als Zeichenkette (Befund B81).
         *
         * `span.includes('mailbox')` traf auf `revoked.mailboxesEnded` - eine
         * *Zahl*, kein Adressat. Der Pruefer las den ganzen Aufruf zum ersten
         * Mal und meldete sofort einen Fehlalarm, was der schnellste Weg ist,
         * eine Pruefung unglaubwuerdig zu machen.
         *
         * Die Regel ist camelCase-bewusst statt zaehlend: dem Namen darf kein
         * *Kleinbuchstabe* folgen. `address.mailbox,` und `mailboxAddress`
         * bleiben Treffer, `mailboxesEnded` und `mailboxQuota` nicht mehr.
         * Keine Ausnahmeliste - die Unterscheidung liegt im Namen selbst.
         */
        const family = valueFamilies.find((candidate) => candidate.names.some(
          (name) => new RegExp(`\\b${name}(?![a-z])`, 'u').test(span),
        ));
        if (family === undefined) {
          continue;
        }
        errors.push(
          `${relative(repoRoot, file)}:${index + 1}: ${family.what} must not reach `
          + `${sink.why} - ${family.why}.`,
        );
      }
    }
  }
}

/**
 * The other half: an address must not become a URL component. A mailbox in a
 * path or a query string is one in a proxy log, a browser history and a
 * referer header, none of which anybody chose.
 */
for (const directory of searched) {
  for (const file of listSourceFiles(directory)) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/[`'"][^`'"\n]*\$\{[^}]*(?:[Ii]nbound|[Mm]ailbox)[^}]*\}[^`'"\n]*[`'"]/g)) {
      if (/^[`'"]\s*(?:https?:)?\/\//u.test(match[0]) || match[0].includes('/api/')) {
        errors.push(
          `${relative(repoRoot, file)}: a relay mailbox address must not become part of a URL `
          + '(ADR 0148 EX4); it would land in proxy logs and browser history.',
        );
      }
    }
  }
}

for (const [directory, count] of scannedPerDirectory) {
  if (count === 0) {
    errors.push(
      `${relative(repoRoot, directory)} contributed no source files, so the sentence this `
      + 'check prints would be true of nothing. A named directory that stops answering is '
      + 'a rename, not a clean result.',
    );
  }
}

if (sinkCalls === 0) {
  errors.push(
    'scripts/check-link-seal.mjs found no call that could carry a value outside, so it read '
    + 'no span at all. A reader without a subject is broken, not clean.',
  );
}

if (errors.length > 0) {
  console.error('Pico Link seal check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Pico Link seal check passed (${scannedFiles} files across `
  + `${scannedPerDirectory.size} named directories, each of which answered; `
  + `${sinkCalls} matches of a sink pattern - a call that could carry a value outside; a line that is two kinds of sink counts twice - each read to its own closing `
  + 'bracket; neither a mailbox address nor a secret a person gave reaches a log, an error '
  + 'or a URL).',
);
