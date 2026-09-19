import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0104 S5, enforced rather than written down once.
 *
 * That gate said "the twelve `PICO_*` environment variables are not separated
 * anywhere into deployment parameters and settings". There are twenty-two.
 * Nobody miscounted: ten were added afterwards, each by somebody who had no
 * reason to open this ADR, and the number rotted quietly for months.
 *
 * **A list a document keeps and nothing reads is a list that drifts**, and
 * this one drifting is not cosmetic: S2 makes introducing a person-facing
 * setting as an environment variable a defect, and the only way anybody
 * notices is if every variable has to be classified before it can ship.
 *
 * So this reads both sides. Every `PICO_*` the config parser knows must appear
 * in the ADR's S5 tables, and every entry in those tables must still exist in
 * the parser - the second direction because a stale row is a classification of
 * something that is gone, which reads as knowledge and is furniture.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const ts = createRequire(import.meta.url)('typescript');
const errors = [];

/**
 * Every `PICO_*` a source really reads out of the environment.
 *
 * **Through the syntax tree, because a regular expression reads names and not
 * reads** (finding B220, and B188 before it). Both halves of this check used
 * to match `\bPICO_[A-Z0-9_]+\b` in a file's text, so
 * `PICO_RELAY_REQUEST_TIMEOUT_MS` - an exported constant in the relay's
 * server - counted as an environment entry. ADR 0104 then classified three
 * such constants as deployment parameters, which promised three knobs no
 * deployment can turn: a documented setting that does not exist, which is the
 * mirror of an undocumented one and reads as knowledge just the same.
 *
 * Three shapes, and they are the three this tree uses: `env.NAME`,
 * `env['NAME']`, and a helper that takes the environment and the name as
 * arguments (`readNonEmptyString(env, 'PICO_X', fallback)`).
 */
function environmentReads(path) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  if (!text.includes('PICO_')) return new Set();
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found = new Set();
  const add = (name) => {
    if (/^PICO_[A-Z0-9_]+$/u.test(name)) found.add(name);
  };
  const isEnvironment = (node) => /(^|\.)env$/u.test(node.getText());
  (function scan(node) {
    if (ts.isPropertyAccessExpression(node) && isEnvironment(node.expression)) {
      add(node.name.text);
    }
    if (ts.isElementAccessExpression(node)
      && isEnvironment(node.expression)
      && node.argumentExpression !== undefined
      && ts.isStringLiteral(node.argumentExpression)) {
      add(node.argumentExpression.text);
    }
    if (ts.isCallExpression(node) && node.arguments.some(isEnvironment)) {
      for (const argument of node.arguments) {
        if (ts.isStringLiteral(argument)) add(argument.text);
      }
    }
    node.forEachChild(scan);
  })(source);
  return found;
}

/** Every shipped source, because every one of them can read the environment. */
const shipped = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => /^(apps|packages|modules)\/.*\.ts$/u.test(path))
  .filter((path) => !path.includes('.test.'));

const adr = readFileSync(
  join(repoRoot, 'docs/architecture/0104-settings-belong-to-pico-not-to-host-configuration.md'),
  'utf8',
);

/** Everything the core reads from the environment. */
const inConfig = new Set(shipped
  .filter((path) => path.startsWith('apps/core/src/'))
  .flatMap((path) => [...environmentReads(path)]));

/**
 * **And the relay's own, which this check did not look at until 2026-08-24.**
 *
 * Its passing line said "22 environment entries, each classified" - true, and
 * reading as though it were all of them. Pico Relay reads twelve more, none of
 * them classified anywhere, and S2 makes a person's setting in the environment
 * a defect that nobody can notice while the entry is unsorted.
 *
 * They are all deployment parameters, and the reason is worth the sentence: a
 * relay holds no Pico identity and decides nothing for anybody, so it has no
 * setting to misplace. That emptiness is now checkable rather than assumed.
 */
const inRelay = new Set(shipped
  .filter((path) => path.startsWith('apps/relay/src/'))
  .flatMap((path) => [...environmentReads(path)]));

/**
 * And everything else, which nothing looked at until 2026-09-19 (B220).
 *
 * The relay block below was written when this check learned to look past the
 * core, and its passing line then read as though *those two* were all of them.
 * They were not: the companion, the shell and the vault daemon read five more.
 * This group is defined by exclusion rather than by a list of directories, so
 * a new app is inside it on the day it is written.
 */
const inRest = new Set(shipped
  .filter((path) => !path.startsWith('apps/core/src/') && !path.startsWith('apps/relay/src/'))
  .flatMap((path) => [...environmentReads(path)]));

/**
 * Everything S5 classifies. Read from the gate's own section rather than the
 * whole file, so a variable mentioned in passing somewhere else does not count
 * as classified - being talked about and being sorted are different.
 */
const s5Start = adr.indexOf('- **S5 - Deployment parameters documented as such');
const s5End = s5Start === -1 ? -1 : adr.indexOf('\n## ', s5Start);
if (s5Start === -1) {
  errors.push(
    'ADR 0104 has no S5 gate to read. The classification is the gate, so a '
    + 'missing section is a missing rule rather than a formatting change.',
  );
}
const s5 = s5Start === -1 ? '' : adr.slice(s5Start, s5End === -1 ? undefined : s5End);
const inAdr = new Set([...s5.matchAll(/`(PICO_[A-Z0-9_]+)`/gu)].map(([, name]) => name));

/**
 * Der Relay-Block wird an seiner Überschrift gefunden, nicht am ganzen
 * Dokument - aus demselben Grund wie oben: erwähnt werden und einsortiert sein
 * sind zwei verschiedene Dinge.
 */
const relayStart = adr.indexOf('**S5 (relay), 2026-08-24 - deployment parameters, every one:**');
/**
 * Bis zur nächsten Statusnotiz oder Überschrift, was zuerst kommt. Der erste
 * Entwurf las bis zur nächsten `##` und verschluckte dabei die ältere Notiz
 * darunter, in der `PICO_MEMORY_ENCRYPTION` vorkommt - womit ein Name aus
 * einer anderen Geschichte als Relay-Klassifikation galt und sofort als
 * veraltet gemeldet wurde. Der Prüfer hatte recht und der Block war falsch
 * geschnitten.
 */
const relayEnd = relayStart === -1 ? -1 : [
  adr.indexOf('\n## ', relayStart),
  adr.indexOf('\nStatus note', relayStart),
  // Und am naechsten S5-Block, seit es einen dritten gibt (B220): ohne diese
  // Grenze verschluckte der Relay-Schnitt die Klassifikation darunter und
  // meldete jeden ihrer Namen als veraltete Relay-Zeile.
  adr.indexOf('\n**S5 (', relayStart + 4),
].filter((index) => index !== -1).sort((left, right) => left - right)[0] ?? -1;
if (relayStart === -1) {
  errors.push(
    'ADR 0104 has no relay classification block to read. The classification is the gate, '
    + 'so a missing block is a missing rule.',
  );
}
const relaySection = relayStart === -1
  ? ''
  : adr.slice(relayStart, relayEnd === -1 ? undefined : relayEnd);
const inRelayAdr = new Set(
  [...relaySection.matchAll(/`(PICO_[A-Z0-9_]+)`/gu)].map(([, name]) => name),
);

/**
 * Der dritte Block, nach derselben Regel wie die beiden darueber: an seiner
 * Ueberschrift gefunden, nicht im ganzen Dokument - erwaehnt werden und
 * einsortiert sein sind zwei verschiedene Dinge.
 */
const restStart = adr.indexOf('**S5 (companion, shell and vault daemon), 2026-09-19');
const restEnd = restStart === -1 ? -1 : [
  adr.indexOf('\n## ', restStart),
  adr.indexOf('\nStatus note', restStart),
  adr.indexOf('\n**S5 (relay)', restStart),
].filter((index) => index !== -1).sort((left, right) => left - right)[0] ?? -1;
if (restStart === -1) {
  errors.push(
    'ADR 0104 has no block for what the companion, the shell and the vault daemon read. '
    + 'The classification is the gate, so a missing block is a missing rule.',
  );
}
const restSection = restStart === -1
  ? ''
  : adr.slice(restStart, restEnd === -1 ? undefined : restEnd);
const inRestAdr = new Set(
  [...restSection.matchAll(/`(PICO_[A-Z0-9_]+)`/gu)].map(([, name]) => name),
);

for (const name of [...inConfig].sort()) {
  if (!inAdr.has(name)) {
    errors.push(
      `${name} is read by the config parser and classified nowhere in ADR 0104 S5. `
      + 'Every environment entry is a deployment parameter or a setting, and S2 '
      + 'makes the second one a defect - which nobody can notice while the entry '
      + 'is unclassified.',
    );
  }
}
for (const name of [...inAdr].sort()) {
  if (!inConfig.has(name)) {
    errors.push(
      `${name} is classified in ADR 0104 S5 and no longer read by the config `
      + 'parser. A stale row is a classification of something that is gone; it '
      + 'reads as knowledge and is furniture.',
    );
  }
}

for (const name of [...inRelay].sort()) {
  if (!inRelayAdr.has(name)) {
    errors.push(
      `${name} is read by Pico Relay and classified nowhere in ADR 0104. A relay knob is a `
      + 'deployment parameter or it is somebody\'s decision in the wrong place, and S2 '
      + 'makes the second one a defect - which nobody can notice while the entry is '
      + 'unclassified.',
    );
  }
}
for (const name of [...inRelayAdr].sort()) {
  if (!inRelay.has(name)) {
    errors.push(
      `${name} is classified as a relay deployment parameter and Pico Relay no longer reads `
      + 'it. A stale row reads as knowledge and is furniture.',
    );
  }
}
for (const name of [...inRest].sort()) {
  if (!inRestAdr.has(name)) {
    errors.push(
      `${name} is read from the environment outside the core and the relay, and classified `
      + 'nowhere in ADR 0104. A knob nobody sorted is a knob nobody can call a defect.',
    );
  }
}
for (const name of [...inRestAdr].sort()) {
  if (!inRest.has(name)) {
    errors.push(
      `${name} is classified in ADR 0104's third block and nothing outside the core and the `
      + 'relay reads it. A stale row reads as knowledge and is furniture.',
    );
  }
}
if (inRest.size === 0) {
  errors.push(
    'nothing outside the core and the relay reads the environment, so the third part of this '
    + 'check ran over nothing.',
  );
}
if (inRelay.size === 0) {
  errors.push(
    'apps/relay/src: no environment entry was read, so the relay half of this check ran '
    + 'over nothing.',
  );
}

if (errors.length > 0) {
  console.error('Settings boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Settings boundary check passed: ${inConfig.size + inRelay.size + inRest.size} environment `
  + `entries across ${shipped.length} shipped sources - ${inConfig.size} the Home reads, `
  + `${inRelay.size} the relay, ${inRest.size} the companion, the shell and the vault daemon - `
  + 'each classified in ADR 0104, and each one a real read of `env` out of the syntax tree '
  + 'rather than a name that looked like one.',
);
