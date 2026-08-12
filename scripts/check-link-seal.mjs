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
];

let scannedFiles = 0;
for (const directory of searched) {
  for (const file of listSourceFiles(directory)) {
    scannedFiles += 1;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      // String contents are stripped first, and that correction is the useful
      // part of this check. Written naively it fired on
      // `throw new Error('pico_link_inbound_shared_between_peers')` - an error
      // *code* that happens to contain the word, carrying no address at all.
      // A check whose failures are mostly wrong teaches people to skip it.
      // Template interpolations survive the strip, because `${inbound}` is
      // exactly the leak this looks for.
      const code = withoutStringContents(line);
      const mentionsAddress = addressBearingNames.some((name) => code.includes(name));
      if (!mentionsAddress) {
        continue;
      }
      for (const sink of forbiddenSinks) {
        if (sink.pattern.test(line)) {
          errors.push(
            `${relative(repoRoot, file)}:${index + 1}: a relay mailbox address must not reach ${sink.why} `
            + '(ADR 0148 EX4); it travels inside the ADR 0107 seal and nowhere else.',
          );
        }
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

if (errors.length > 0) {
  console.error('Pico Link seal check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Pico Link seal check passed (${scannedFiles} files; no mailbox address reaches a log, an error or a URL).`,
);
