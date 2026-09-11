import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A wire label is spelled once, in the protocol.
 *
 * `@pico/protocol` exports the strings that travel: signature-input labels,
 * schema names, the prefixes a person's device reads off another person's
 * screen. Every one of them is exported, and every one of them can be
 * imported. Spelling one out a second time creates a copy that no compiler
 * compares, and this repository has been finding those copies all year.
 *
 * On 2026-08-19 six of them sat in the companion shell's `main.ts`, spelling
 * the three device-enrolment prefixes the protocol already exported - and the
 * cost of that shape had just been demonstrated a few lines away, where the
 * same file demanded `pico-recovery-card-v2:` for a Recovery Card whose
 * transport prefix is v1. Every printed card was refused, and refused
 * silently.
 *
 * **What this check cannot do**, said plainly because a check that is trusted
 * for more than it does is worse than none: it cannot catch that invented
 * spelling. `pico-recovery-card-v2:` matches no constant, and a rule against
 * labels matching no constant was measured before being written - 46 in
 * product code, nearly all of them a package naming its *own* schema, which
 * is exactly right. So this catches the copy, not the invention. The
 * invention is caught by a test that builds a real value and requires the
 * surface to accept it, which is what `recovery-card-entry.test.ts` now does.
 *
 * **One shape of invention it can catch, added 2026-08-24: the wrong version
 * of a right label.** `pico.recovery.card.v2` is not a copy of anything and
 * matches no constant, so the rule above is blind to it - but the protocol
 * exports `pico.recovery.card.v1`, and a label sharing a stem with an
 * exported one while carrying a version the protocol does not have is a
 * spelling left behind by a version that went away. The broad rule was
 * measured before being written and rejected at 46 false positives; this
 * narrow one was measured the same way and has none: three product hits,
 * two of them the defect it was written for.
 *
 * ADR 0134 F2 collapsed `pico.recovery.card.v1`/`v2` and
 * `pico.home.founding-record.v1`/`v2` into their surviving `v1` names on
 * 2026-08-10. Fourteen days later the companion's public card metadata still
 * *required* the `v2` name in its type, and its test built a card carrying
 * it - code and test agreeing with each other rather than with the protocol,
 * which is why neither said anything.
 *
 * **Tests are excluded from this rule too, and the measurement says why:** of
 * nine test hits, eight spell a `.v0` - the idiom for a version that must be
 * refused. A negative test naming a version that does not exist is doing its
 * job.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const protocolRoot = join(repoRoot, 'packages', 'protocol', 'src');

/**
 * Where a label may be spelled out anyway, and why. Each entry is an argument
 * rather than a permission - the two here are different arguments.
 */
const allowed = [
  {
    file: join(repoRoot, 'apps', 'core', 'src', 'migrations.ts'),
    why: 'a migration describes what a database already holds, so it must *not* follow a '
      + 'renamed constant - the old rows keep the old word. Concretely, since 2026-08-24: '
      + 'the baseline\'s founding-record CHECK still admits '
      + '\'pico.home.founding-record.v2\', a schema ADR 0134 F2 collapsed away and nothing '
      + 'writes. It stays because that baseline is *derived* - read back from sqlite_master '
      + 'after the seventeen steps it folds - and retyping a statement by hand is exactly '
      + 'the property its comment gives up',
  },
  {
    file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'protocol.ts'),
    why: 'ADR 0099\'s approval-exempt list must fail closed: importing the constants would '
      + 'carry an exemption onto a renamed label, while a literal turns the rename into '
      + '"ask the person", which is the safe direction',
  },
];

/** A label that looks like it travels: a prefix, a schema, a family name. */
const wireLabel = /(-v\d+:$|\.v\d+$)/u;
const exported = /export const (\w+)\s*=\s*'([^']{6,})'/gu;
/**
 * A label declared as a member of a table rather than on its own.
 *
 * **This is where the check was blind until 2026-08-21.** It read only
 * `export const NAME = '...'`, and the protocol keeps most of its families in
 * object literals - `picoHomeSignatureInputLabels`,
 * `picoHomeDeviceRecoveryCanonicalLabels`, the appearance capabilities, the
 * supplier transport. Seventy-two labels were guarded and forty-seven were
 * not, including the family a person's approval statement is keyed by. The
 * summary said "72 protocol labels spelled once", which was true and read as
 * though it were all of them.
 */
const tabled = /(\w+)\s*:\s*'([^']{6,})'/gu;
/**
 * And the backstop, for a label that is neither: the value alone, with no
 * name to suggest importing. Reported anyway, because a copy nothing compares
 * is the defect whether or not this check can say what to import instead.
 */
const anyLabel = /'(pico[^']{5,})'/gu;

const labels = new Map();
/**
 * Stem to the versions the protocol actually exports, for the second rule.
 *
 * Built from the protocol's non-test sources only, unlike `labels` above: a
 * label appearing solely in a protocol test is a version being refused, not a
 * version being offered. `pico.recovery.card.v3` lives in `recovery.test.ts`
 * for exactly that reason, and counting it would license the spelling this
 * rule exists to refuse.
 */
const versions = new Map();
const stemOf = (value) => value.replace(/(-v\d+:|\.v\d+)$/u, '');
for (const file of sourceFiles(protocolRoot)) {
  const source = readFileSync(file, 'utf8');
  if (!file.endsWith('.test.ts')) {
    for (const [, value] of source.matchAll(anyLabel)) {
      if (!wireLabel.test(value)) {
        continue;
      }
      const stem = stemOf(value);
      if (!versions.has(stem)) {
        versions.set(stem, new Set());
      }
      versions.get(stem).add(value);
    }
  }
  for (const [, name, value] of source.matchAll(exported)) {
    if (wireLabel.test(value) && value.startsWith('pico')) {
      labels.set(value, name);
    }
  }
  for (const [, name, value] of source.matchAll(tabled)) {
    if (wireLabel.test(value) && value.startsWith('pico') && !labels.has(value)) {
      labels.set(value, name);
    }
  }
  for (const [, value] of source.matchAll(anyLabel)) {
    if (wireLabel.test(value) && !labels.has(value)) {
      labels.set(value, null);
    }
  }
}

const errors = [];
if (labels.size === 0) {
  errors.push('scripts/check-wire-labels.mjs found no protocol labels to protect; the '
    + 'export shape it reads must have changed.');
}
if (versions.size === 0) {
  errors.push('scripts/check-wire-labels.mjs found no versioned protocol label stems; the '
    + 'version rule would pass over anything and must not report that as clean.');
}

for (const root of ['apps', 'modules', 'packages']) {
  for (const file of sourceFiles(join(repoRoot, root))) {
    if (file.startsWith(protocolRoot)) {
      continue;
    }
    /**
     * Tests may name a value: pinning the exact bytes is what a test is for,
     * and a fixture that follows a rename would stop noticing it.
     */
    const exemption = allowed.find((entry) => entry.file === file);
    if (exemption !== undefined) {
      /**
       * Was die Ausnahme deckt, wird gezaehlt statt nur uebersprungen: eine
       * Liste sagt, was erlaubt ist - nie, ob es das noch gibt (Befund B149,
       * 2026-09-11). Ohne diese Zaehlung bleibt ein Eintrag stehen, wenn die
       * Datei ihren ausgeschriebenen Label verliert, und liest sich dann wie
       * ein Urteil ueber heute.
       */
      for (const [value] of labels) {
        if (readFileSync(file, 'utf8').includes(`'${value}'`)) {
          exemption.covered = (exemption.covered ?? 0) + 1;
        }
      }
      continue;
    }
    if (file.endsWith('.test.ts')) {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    for (const [value, name] of labels) {
      if (source.includes(`'${value}'`)) {
        errors.push(
          `${relative(repoRoot, file)}: spells out the protocol label '${value}'. `
          + `${name === null ? 'Import it' : `Import ${name}`} from @pico/protocol instead `
          + '- a second spelling is a copy nothing compares, and the surfaces that read '
          + 'these values refuse a correct input without saying why.',
        );
      }
    }
    for (const [, value] of source.matchAll(anyLabel)) {
      if (!wireLabel.test(value) || labels.has(value)) {
        continue;
      }
      const known = versions.get(stemOf(value));
      if (known === undefined || known.has(value)) {
        continue;
      }
      errors.push(
        `${relative(repoRoot, file)}: names '${value}', a version of a protocol label `
        + `that the protocol does not have. It spells ${[...known]
          .map((one) => `'${one}'`)
          .join(' and ')}. A surviving name with a retired version still written beside `
        + 'it is what a collapsed format leaves behind, and a literal type built on the '
        + 'retired one makes the false name mandatory for everything downstream.',
      );
    }
  }
}

/**
 * Befund B149. Eine Liste sagt, was erlaubt ist - nie, ob es das noch gibt.
 * Deckt ein Eintrag nichts mehr, ist er ein Satz ueber nichts, und das ist
 * derselbe Fehler eine Ebene hoeher: `check-capability-reach.mjs` hat diese
 * Haelfte erst bekommen, nachdem eine Pflanzung einen Namen aus dem *Pruefer*
 * statt aus dem Code entfernt hatte und niemand es merkte.
 */
for (const entry of allowed) {
  if ((entry.covered ?? 0) > 0) {
    continue;
  }
  errors.push(
    `${relative(repoRoot, entry.file)} is argued here as spelling a protocol label out `
    + 'anyway, and it spells none. Take the entry out: an exemption that covers nothing '
    + 'reads like a judgement somebody made about today.',
  );
}

if (errors.length > 0) {
  console.error('Wire label check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Wire label check passed (${labels.size} protocol labels spelled once, `
  + `${versions.size} versioned stems held to the versions the protocol exports, `
  + `${allowed.length} argued exemptions, each still covering something).`,
);

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (path.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}
