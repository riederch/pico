import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0130 E6. Pico is operated through the background companion, and no
 * product path may require a terminal (ADR 0105; `AGENTS.md` carries it as a
 * standing invariant). `pico-vault` keeps every command it has - it is the
 * setup, diagnosis, scripting and development tool, and removing it is an
 * explicit ADR 0105 non-goal. What this check enforces is narrower and is the
 * part that can rot silently: a *product-facing document* must not instruct a
 * person to run it.
 *
 * The distinction it draws is between describing the tool and routing someone
 * through it. "`pico-vault` remains a tool for setup and diagnosis" is a true
 * sentence that belongs in product documentation. "Run `pico-vault
 * claim-home`" is a product path through a terminal, and it is the sentence
 * this check exists to catch - today no document contains one, so this starts
 * green and stays useful by refusing the first regression rather than by
 * finding an existing wrong.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/**
 * Documents a person who *uses* Pico might read to learn how to do something.
 * Enumerated rather than globbed so every exemption is visible here instead of
 * being an accident of a pattern.
 *
 * Deliberately absent, each for its own reason:
 *
 * - `docs/architecture/**` and `docs/architecture/implementation-status.md`
 *   are records. An ADR that says a ceremony runs through `pico-vault ceremony
 *   claim-home` documents what was built, and rewriting a record makes it less
 *   true rather than more current (ADR 0128).
 * - `AGENTS.md`, `.agent-context.md`, `TODO.md`, `progress.md` address agents
 *   and maintainers, and `progress.md` in particular *must* be able to state
 *   that founding currently requires the CLI - that gap is exactly what it
 *   exists to report.
 * - `docs/development/**` is the runbook and the briefs: the tool's home.
 * - `docs/release/**` is maintainer procedure, not a person using Pico.
 * - `docs/protocol/**` specifies wire contracts and instructs nobody.
 * - `docs/design-system/**` is an imported package.
 * - `CONTRIBUTING.md` addresses developers by definition.
 */
const productFacingDocuments = [
  'README.md',
  'ReadmeTech.md',
  'SECURITY.md',
  'COMMERCIAL.md',
  'LICENSE-FAQ.md',
  'TRADEMARK.md',
  'pico_core/README.md',
  'pico_core/DOCS.md',
  'pico_core/CHANGELOG.md',
];

const cli = 'pico-vault';

/**
 * Returns every place the text routes a reader through the CLI.
 *
 * Two shapes count, and one deliberately does not. Inside a fenced code block
 * any mention is an invocation, because that is what a code block is for.
 * Outside one, the name followed by a subcommand is an instruction even in
 * prose - "run `pico-vault status`" routes just as surely as a fence does. A
 * bare mention outside a fence is left alone: it is how the tool gets
 * described, which ADR 0105 requires product documentation to be able to do.
 *
 * `pico-vault-` followed by a letter is never a command. It is a longer
 * hyphenated token - the ADR filename
 * `0081-pico-vault-person-role-key-custody-...` is the one in this tree - and
 * matching it would make the check fire on every document that cites an ADR.
 */
export function scanProductPath(text) {
  const violations = [];
  let inFence = false;
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    const pattern = new RegExp(`${cli}(-?)`, 'gu');
    let match;
    while ((match = pattern.exec(line)) !== null) {
      const rest = line.slice(match.index + cli.length);
      if (/^-[A-Za-z]/u.test(rest)) {
        continue;
      }
      if (inFence) {
        violations.push({
          line: index + 1,
          reason: `${cli} is invoked inside a code block`,
        });
        break;
      }
      if (/^\s+[a-z]/u.test(rest)) {
        violations.push({
          line: index + 1,
          reason: `${cli} is given a subcommand in prose`,
        });
        break;
      }
    }
  }
  return violations;
}

const errors = [];

for (const path of productFacingDocuments) {
  let text;
  try {
    text = readFileSync(join(repoRoot, path), 'utf8');
  } catch {
    errors.push(`${path} is listed as product-facing but does not exist.`);
    continue;
  }
  for (const violation of scanProductPath(text)) {
    errors.push(
      `${path}:${violation.line}: ${violation.reason}. `
      + 'No product path may require a terminal (ADR 0105, ADR 0130 E6); '
      + 'describe the tool if you must, but do not route a person through it.',
    );
  }
}

// --- Probes: a checker that cannot fail is worse than none -------------------

const mustCatch = [
  {
    name: 'an invocation inside a code block',
    text: '# Setup\n\n```bash\npico-vault ceremony claim-home\n```\n',
  },
  {
    name: 'a bare invocation inside a code block',
    text: '```\npico-vault\n```\n',
  },
  {
    name: 'a subcommand in prose',
    text: 'Run `pico-vault status` to see the current state.\n',
  },
];

const mustPass = [
  {
    name: 'a prose mention that only describes the tool',
    text: '`pico-vault` remains the setup and diagnosis tool and is not the product.\n',
  },
  {
    name: 'an ADR filename containing the tool name',
    text:
      'See `docs/architecture/0081-pico-vault-person-role-key-custody-'
      + 'threat-model-and-direction.md` for the custody model.\n',
  },
  {
    name: 'that same filename inside a code block',
    text: '```text\ndocs/architecture/0081-pico-vault-person-role-key-custody.md\n```\n',
  },
];

for (const probe of mustCatch) {
  if (scanProductPath(probe.text).length === 0) {
    errors.push(`Self-probe failed: the scanner did not catch ${probe.name}.`);
  }
}
for (const probe of mustPass) {
  const found = scanProductPath(probe.text);
  if (found.length > 0) {
    errors.push(
      `Self-probe failed: the scanner wrongly flagged ${probe.name} `
      + `(${found[0].reason}).`,
    );
  }
}

if (errors.length > 0) {
  console.error('Product-path check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Product-path check passed (${productFacingDocuments.length} product-facing `
  + 'documents route nobody through the CLI).',
);
