import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Identifiers that hold, or are named as if they hold, a delivery address. */
const addressBearingNames = [
  'homeInbound',
  'deviceInbound',
  'inbound',
  'outbound',
  'mailbox',
  'picoLinkInboundAddressFor',
  'picoLinkOutboundAddressFor',
  'formatPicoLinkPacketAddress',
];

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
const scannedPerDirectory = new Map(searched.map((directory) => [directory, 0]));
for (const directory of searched) {
  for (const file of listSourceFiles(directory)) {
    scannedFiles += 1;
    scannedPerDirectory.set(directory, scannedPerDirectory.get(directory) + 1);
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
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
         * Gelesen wird jetzt von der Senke bis zu der Klammer, die sie
         * schliesst, mit einer Obergrenze - ein Aufruf, der laenger ist als
         * vierzig Zeilen, ist kein Aufruf mehr, sondern eine Datei.
         */
        let depth = 0;
        let seenOpen = false;
        let span = '';
        for (let cursor = index; cursor < lines.length && cursor < index + 40; cursor += 1) {
          const here = withoutStringContents(lines[cursor]);
          span += `${here}\n`;
          for (const character of here) {
            if (character === '(') {
              depth += 1;
              seenOpen = true;
            } else if (character === ')') {
              depth -= 1;
            }
          }
          if (seenOpen && depth <= 0) {
            break;
          }
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
        if (!addressBearingNames.some(
          (name) => new RegExp(`\\b${name}(?![a-z])`, 'u').test(span),
        )) {
          continue;
        }
        errors.push(
          `${relative(repoRoot, file)}:${index + 1}: a relay mailbox address must not reach ${sink.why} `
          + '(ADR 0148 EX4); it travels inside the ADR 0107 seal and nowhere else.',
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
  + 'no mailbox address reaches a log, an error or a URL).',
);
