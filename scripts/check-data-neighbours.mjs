import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { picoAddons } from './workspace-members.mjs';

/**
 * Everything a Home puts beside its database is either kept out of a backup or
 * argued into one.
 *
 * **The occasion** (2026-09-18, finding B216). `pico_home/config.yaml` excludes
 * three directories from Supervisor backups and writes down why for each. The
 * question nobody could answer was how many there are to decide about.
 * Measured: ten paths under `/data`, three of them decided. The other seven
 * travelled in every backup because nothing had ever looked.
 *
 * **Two instruments, and the second one earned its place immediately.** The
 * first asks the product: load the add-on's config with the database path its
 * Dockerfile sets, and read back every path it puts under the data directory.
 * The second reads the source: every `join(dirname(<…databasePath>), …)` in the
 * app, through the syntax tree rather than a regular expression (B188). The
 * first run disagreed - the relay builds an `operator-reset` marker inside its
 * entrypoint, so no loaded config knows about it, and a probe that only asks
 * the product would have called that add-on complete. Asking both is the check.
 *
 * **What a neighbour is compared against is its first segment.** A backup rule
 * names `recovery-anchor`, and the product names
 * `/data/recovery-anchor/anchor.json`; the directory is what a tar filter
 * excludes. So every measured path is cut to its first segment under the data
 * directory, and that name is what must be decided.
 *
 * What this cannot decide is whether a path *should* travel. It can insist that
 * somebody said so once, in the file where the Supervisor reads the answer.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * How to ask each add-on where it puts things, and which sources are its own.
 *
 * `variable` is the environment name its Dockerfile sets; the value is read
 * from there rather than written here, because a data path that moved and a
 * backup rule that did not is the next shape of this same finding.
 */
const addons = [
  {
    slug: 'pico_home',
    dockerfile: 'docker/home.Dockerfile',
    variable: 'PICO_DATABASE_PATH',
    sources: 'apps/core/src',
    async ask(databasePath) {
      const dist = (name) => join(repoRoot, 'apps', 'core', 'dist', name);
      const { loadConfig } = await import(dist('config.js'));
      const setup = await import(dist('home-setup.js'));
      const bootstrap = await import(dist('operator-bootstrap.js'));
      return [
        ...Object.values(loadConfig({ [this.variable]: databasePath })),
        setup.homeResetMarkerPath(databasePath),
        setup.recoveryAnchorReseedMarkerPath(databasePath),
        bootstrap.operatorResetMarkerPath(databasePath),
      ];
    },
  },
  {
    slug: 'pico_relay',
    dockerfile: 'docker/relay.Dockerfile',
    variable: 'PICO_RELAY_DATABASE_PATH',
    sources: 'apps/relay/src',
    async ask(databasePath) {
      const dist = (name) => join(repoRoot, 'apps', 'relay', 'dist', name);
      const { loadPicoRelayConfig } = await import(dist('config.js'));
      const { picoRelayOperatorResetMarkerPath } = await import(dist('operator-claim.js'));
      const config = loadPicoRelayConfig({
        [this.variable]: databasePath,
        // Required, and rightly so: a relay with no operator hostname refuses
        // to start. Any valid one answers the question this check is asking.
        PICO_RELAY_OPERATOR: 'relay.example.org',
      });
      return [...Object.values(config), picoRelayOperatorResetMarkerPath(databasePath)];
    },
  },
];

/**
 * A neighbour that travels in a backup on purpose, and why.
 *
 * Empty today, and that is the honest state after B216: every one of the ten
 * measured paths is either the database itself or excluded. An entry here is
 * how somebody says "this belongs in the artifact" without the gate having to
 * guess it.
 */
const argued = [];

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith('.ts') && !path.includes('.test.')) found.push(path);
  }
  return found;
}

/**
 * The name a `join(dirname(…databasePath), <first argument>, …)` builds.
 *
 * A string literal is itself; an identifier is looked up as a `const` with a
 * string initialiser in the same file, which is how all three marker names are
 * written. Anything else returns undefined and is reported rather than skipped:
 * a site this reader cannot name is a neighbour nobody is checking.
 */
function neighbourName(argument, source) {
  if (ts.isStringLiteral(argument)) return argument.text;
  if (!ts.isIdentifier(argument)) return undefined;
  let found;
  (function scan(node) {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === argument.text
      && node.initializer !== undefined
      && ts.isStringLiteral(node.initializer)) {
      found = node.initializer.text;
    }
    node.forEachChild(scan);
  })(source);
  return found;
}

/** Every name the source builds beside a database path, for one add-on. */
function namesInSource(directory) {
  const names = [];
  const unreadable = [];
  for (const path of sourceFiles(join(repoRoot, directory))) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    (function scan(node) {
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'join'
        && node.arguments.length >= 2) {
        const first = node.arguments[0];
        if (ts.isCallExpression(first)
          && ts.isIdentifier(first.expression)
          && first.expression.text === 'dirname'
          && first.arguments.length === 1
          && /atabasePath/u.test(first.arguments[0].getText())) {
          const name = neighbourName(node.arguments[1], source);
          const where = `${relative(repoRoot, path)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          if (name === undefined) unreadable.push(where);
          else names.push({ name, where });
        }
      }
      node.forEachChild(scan);
    })(source);
  }
  return { names, unreadable };
}

/** The value of an `ENV NAME=value` line, which is where a data path is set. */
function dockerfileValue(path, variable) {
  const line = new RegExp(`^ENV ${variable}=(\\S+)\\s*$`, 'mu').exec(readFileSync(path, 'utf8'));
  return line === null ? undefined : line[1];
}

/** Every `backup_exclude` entry of one add-on config, as written. */
function backupExclusions(text) {
  const start = /^backup_exclude:\s*$/mu.exec(text);
  if (start === null) return [];
  const rest = text.slice(start.index + start[0].length).split('\n');
  const found = [];
  for (const line of rest) {
    const entry = /^\s+-\s+(\S+)\s*$/u.exec(line);
    if (entry === null) {
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      break;
    }
    found.push(entry[1]);
  }
  return found;
}

const failures = [];
const decided = [];

const declared = new Set(picoAddons(repoRoot).map((addon) => addon.directory));
for (const slug of declared) {
  if (!addons.some((addon) => addon.slug === slug)) {
    failures.push(
      `${slug} is an add-on in this repository and this check does not know how to ask it where `
      + 'it puts things. A new add-on is unchecked on the day it is written, which is the day it '
      + 'is most likely to be wrong.',
    );
  }
}

for (const addon of addons) {
  if (!declared.has(addon.slug)) {
    failures.push(`${addon.slug} is asked about here and is no add-on of this repository any more`);
    continue;
  }
  const databasePath = dockerfileValue(join(repoRoot, addon.dockerfile), addon.variable);
  if (databasePath === undefined) {
    failures.push(`${addon.dockerfile} sets no ${addon.variable}, so where its data lives is unknown`);
    continue;
  }
  const dataDirectory = dirname(databasePath);
  const exclusions = new Set(
    backupExclusions(readFileSync(join(repoRoot, addon.slug, 'config.yaml'), 'utf8'))
      .map((entry) => entry.split('/')[0]),
  );

  const measured = new Map();
  for (const value of await addon.ask(databasePath)) {
    if (typeof value !== 'string' || value === databasePath) continue;
    const inside = relative(dataDirectory, value);
    if (inside === '' || inside.startsWith('..') || inside.startsWith(sep)) continue;
    const segment = inside.split(sep)[0];
    if (!measured.has(segment)) measured.set(segment, value);
  }

  const { names, unreadable } = namesInSource(addon.sources);
  for (const site of unreadable) {
    failures.push(`${site} puts something beside the database under a name this check cannot read`);
  }
  if (names.length === 0) {
    failures.push(
      `${addon.sources} builds no path beside a database path. Either the app stopped doing that `
      + 'or this reader stopped finding it, and a check with no subject passes by having nothing '
      + 'to say.',
    );
  }
  for (const { name, where } of names) {
    if (measured.has(name)) continue;
    failures.push(
      `${where} puts ${name} beside ${addon.slug}'s database, and asking the product where it puts `
      + 'things never mentions it. Give it a named, exported path function the way the Home does, '
      + 'or teach this check the entry point that builds it.',
    );
  }

  for (const [segment, path] of measured) {
    const entry = argued.find((one) => one.slug === addon.slug && one.name === segment);
    if (exclusions.has(segment)) {
      if (entry !== undefined) {
        failures.push(`${addon.slug} argues ${segment} into the backup and also excludes it; drop the entry`);
      } else {
        decided.push(`${addon.slug}: ${path} stays out of the backup`);
      }
      continue;
    }
    if (entry === undefined) {
      failures.push(
        `${addon.slug} puts ${path} beside its database and no backup rule decides about it. Every `
        + `Supervisor backup carries it. Either add ${segment} to backup_exclude with the reason, `
        + 'or argue here why it belongs in the artifact.',
      );
      continue;
    }
    decided.push(`${addon.slug}: ${path} travels - ${entry.why}`);
  }
}

if (failures.length > 0) {
  console.error('Data neighbour check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Data neighbour check passed (${decided.length} paths the add-ons put beside their databases, `
    + `each decided about; ${argued.length} argued into the backup, the rest excluded - and the set `
    + 'is measured twice, once by asking the product and once by reading every join beside a '
    + 'database path out of the syntax tree).',
  );
  for (const line of decided) console.log(`  ${line}`);
}
