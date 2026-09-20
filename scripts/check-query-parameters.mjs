import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A query parameter is a thing that lands in logs, so each one is judged.
 *
 * **The occasion** (2026-09-20, finding B231). A URL is the part of a request
 * that gets written down - by this Home's own request log, and by anything
 * between. The Foundation already knows it: its log serializer cuts `ticket`
 * out of the recorded address, because a realtime ticket is a credential.
 * Measured at a running Home, the line reads
 * `/api/system/version?ticket=%5Bredacted%5D&limit=5`, and the secret is
 * nowhere in the output.
 *
 * What was missing is anything that makes the **next** parameter face the same
 * question. The whole shipped tree reads exactly three, and a fourth would
 * arrive without a word.
 *
 * **What it cannot see, measured while planting against it.** It reads the
 * serializer's source for the parameter and the redaction marker, so removing
 * the *call* - `url: request.url` instead of `url: redactTicketQueryValue(...)`
 * - leaves both words standing and this check green. That case belongs to a
 * test (`app.test.ts`, B231), which drives a real Home with a real ticket and
 * looks at what the log actually says. Two nets: this one asks whether a
 * parameter was judged, the test asks whether the judgement is wired up.
 *
 * **This check does not judge secrecy** - it cannot. It makes the judgement
 * exist: every parameter the product reads is listed here with what it is, a
 * credential one must be cut from the logged address, and a harmless one must
 * *not* be - an argument that says "nothing secret" while the code redacts it
 * is two people disagreeing in one file.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');

/**
 * Every query parameter the product reads, and what it carries.
 *
 * `redacted` is the load-bearing field and it is checked both ways against the
 * serializer that writes the request log.
 */
const judged = [
  {
    name: 'ticket',
    redacted: true,
    why: 'ADR 0038. A short-lived single-use realtime ticket, minted through '
      + '/api/realtime/tickets and spent on the WebSocket upgrade. It is a credential, and a '
      + 'credential in a URL is a credential in a log file',
  },
  {
    name: 'limit',
    redacted: false,
    why: 'how many rows a diagnostic list returns. A number a person could shout across a room',
  },
  {
    name: 'after',
    redacted: false,
    why: 'a paging cursor - a lamport value, a wall time and an event id, all of which the '
      + 'answer to the previous page already carried. It says where a reader stopped, never '
      + 'that they were allowed to start; the authority is in the credential',
  },
  {
    name: 'domainAuthorityId',
    redacted: false,
    why: 'which privacy domain a read is asked about. It names a domain rather than proving '
      + 'anything about it - the authority is in the credential, never in the address',
  },
];

/** Where the request log decides what a recorded address says. */
const serializerPath = join('apps', 'core', 'src', 'app.ts');
const serializer = readFileSync(join(repoRoot, serializerPath), 'utf8');

const shipped = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => /^(apps|packages|modules)\/.*\.ts$/u.test(path))
  .filter((path) => !path.includes('/dist/') && !path.includes('.test.'));

/**
 * The names, out of the syntax tree rather than out of a text search: a
 * parameter is read either by asking `searchParams` for it or by typing
 * `request.query`, and both shapes are nodes rather than spellings.
 */
const read = new Map();
for (const path of shipped) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  if (!text.includes('searchParams') && !text.includes('.query')) continue;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const note = (name) => {
    if (!read.has(name)) read.set(name, new Set());
    read.get(name).add(path);
  };
  (function scan(node) {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'get'
      && /searchParams$/u.test(node.expression.expression.getText())
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])) {
      note(node.arguments[0].text);
    }
    if (ts.isAsExpression(node)
      && /(^|\.)query$/u.test(node.expression.getText())
      && ts.isTypeLiteralNode(node.type)) {
      for (const member of node.type.members) {
        if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) note(member.name.text);
      }
    }
    node.forEachChild(scan);
  })(source);
}

const errors = [];
if (read.size === 0) {
  errors.push(
    'not one query parameter was found in the whole product. Either nothing reads one any more '
    + 'or this reader stopped recognising how, and a check with no subject passes by having '
    + 'nothing to say.',
  );
}

const judgedByName = new Map(judged.map((entry) => [entry.name, entry]));
for (const [name, where] of [...read].sort()) {
  const entry = judgedByName.get(name);
  if (entry === undefined) {
    errors.push(
      `${name} is read from the query string in ${[...where].join(', ')} and nothing says what it `
      + 'carries. A URL is written into this Home\'s own request log; say whether this one is a '
      + 'credential, and cut it from the logged address if it is.',
    );
    continue;
  }
  const cut = serializer.includes(`${name}=`) && serializer.includes('[redacted]');
  if (entry.redacted && !cut) {
    errors.push(
      `${name} is judged a credential and the request-log serializer in ${serializerPath} does `
      + 'not cut it out. The address goes into the log as it arrived.',
    );
  }
  if (!entry.redacted && cut) {
    errors.push(
      `${name} is judged to carry nothing secret and the serializer redacts it anyway. One of the `
      + 'two is wrong, and a file that disagrees with itself teaches the next reader the wrong one.',
    );
  }
}
for (const entry of judged) {
  if (!read.has(entry.name)) {
    errors.push(`${entry.name} is judged here and no shipped source reads it any more`);
  }
}

if (errors.length > 0) {
  console.error('Query parameter check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Query parameter check passed (${read.size} query parameters read by the product, each judged: `
  + `${judged.filter((entry) => entry.redacted).length} carrying a credential and cut out of the `
  + `recorded address, ${judged.filter((entry) => !entry.redacted).length} carrying nothing secret `
  + 'and deliberately left in it).',
);
