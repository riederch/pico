import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { picoAddons, picoDockerfiles } from './workspace-members.mjs';

/**
 * Home Assistant add-on metadata and published-image gate.
 *
 * The add-on options were never checked by anything: `check-version.mjs` only
 * reads the version line, and the container smoke tests mount a finished
 * `/data/options.json`, which bypasses Supervisor schema validation entirely.
 * A `null` default for an optional option therefore shipped and only failed on
 * a real Home Assistant install, at the point where the Supervisor refuses to
 * start the add-on:
 *
 *   Missing required option 'pico_foundation_token' ... Got {'pico_foundation_token': None}
 *
 * These rules encode what that install taught us. They are deliberately narrow:
 * this validates the options/schema contract, not the whole add-on config.
 */

const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
/**
 * Every add-on in this repository, not the one this file was written for.
 * ADR 0155 added a second one, and a gate that guarded the first only would
 * have left the new config unchecked on the day it was written - which is the
 * day it is most likely to be wrong. The same reasoning as the Dockerfile list
 * below, which ADR 0153 taught this file once already.
 *
 * **Und seit dem 2026-09-10 haelt der Satz sich selbst** (externes Review vom
 * 2026-09-09, §8). Er stand ueber zwei von Hand geschriebenen Pfaden, also
 * stimmte er, solange jemand ihn nachfuehrte - eine Liste sagt, was erlaubt
 * ist, nie, ob es das noch gibt. `picoAddons` entdeckt sie so, wie der
 * Supervisor sie entdeckt: ein Verzeichnis oberster Ebene mit einer
 * `config.yaml`, die einen `slug` traegt.
 */
const errors = [];
let configPaths;
let dockerfilePaths;
try {
  configPaths = picoAddons(repoRoot).map((addon) => addon.configPath);
  dockerfilePaths = picoDockerfiles(repoRoot);
} catch (error) {
  console.error(`Home Assistant add-on config check failed: ${String(error?.message ?? error)}`);
  process.exit(1);
}

/**
 * Was ein Add-on vom Wirt verlangen kann, ohne dass jemand hinsieht
 * (Befund B92).
 *
 * Der Absatz oben sagt, was diese Datei prueft: den Vertrag zwischen `options`
 * und `schema`, „not the whole add-on config". Die Felder, mit denen ein
 * Add-on aus seinem Container heraustritt, standen damit ausserhalb - und sie
 * sind heute alle abwesend, was der gute Zustand ohne Netz ist.
 *
 * Ein Produkt, dessen ganze These „Ihre Daten bleiben bei Ihnen" ist, sollte
 * keines davon stillschweigend gewinnen. Die Regel verbietet sie nicht: sie
 * verlangt, dass die Entscheidung in derselben Datei steht. Wer `map` braucht,
 * schreibt hin wofuer; wer `privileged` schreibt, muss es begruenden, und wer
 * das liest, sieht sofort, worueber zu reden ist.
 */
const hostReach = [
  'privileged', 'full_access', 'host_network', 'host_pid', 'host_ipc', 'host_dbus',
  'docker_api', 'kernel_modules', 'devices', 'udev', 'usb', 'gpio', 'uart', 'video',
  'audio', 'map', 'auth_api', 'hassio_api', 'homeassistant_api', 'hassio_role',
];
let hostReachAsked = 0;

for (const configPath of configPaths) {
  const config = readFileSync(join(repoRoot, configPath), 'utf8');
  const options = readTopLevelMapping(config, 'options');
  const schema = readTopLevelMapping(config, 'schema');

  const comments = config
    .split('\n')
    .filter((line) => line.trimStart().startsWith('#'))
    .join('\n');
  for (const field of hostReach) {
    if (!new RegExp(`^${field}:`, 'mu').test(config)) {
      continue;
    }
    hostReachAsked += 1;
    if (!new RegExp(`\\b${field}\\b`, 'u').test(comments)) {
      errors.push(
        `${configPath}: asks the Supervisor for \`${field}\` and says nothing about `
        + 'it. A field that takes an add-on out of its own container is a decision, '
        + 'and a decision nobody wrote down is one nobody made. Say what it is for, '
        + 'in this file, where the next reader meets it.',
      );
    }
  }

  if (options === undefined) {
    errors.push(`${configPath}: missing an \`options\` mapping.`);
  }
  if (schema === undefined) {
    errors.push(`${configPath}: missing a \`schema\` mapping.`);
  }

  if (options !== undefined && schema !== undefined) {
    for (const [key, value] of options) {
      // The failure this gate exists for. The Supervisor reads a null default
      // back as an absent value and rejects the add-on, optional schema or not.
      if (value === 'null' || value === '~' || value === '') {
        errors.push(
          `${configPath}: option \`${key}\` has a null default. `
          + 'An option with no real default belongs in `schema` alone; the Supervisor '
          + 'reads a null default as a missing value and refuses to start the add-on.',
        );
      }

      if (!schema.has(key)) {
        errors.push(`${configPath}: option \`${key}\` has no \`schema\` entry, so it cannot be validated.`);
      }
    }

    // A required schema entry with no default leaves a fresh install unstartable
    // until the person guesses what to type.
    for (const [key, type] of schema) {
      if (!type.endsWith('?') && !options.has(key)) {
        errors.push(
          `${configPath}: schema entry \`${key}\` is required (\`${type}\`) but has no default in \`options\`, `
          + 'so a fresh install cannot start until someone fills it in. Give it a default or mark it optional.',
        );
      }
    }
  }

  /**
   * ADR 0153 PK1. Home Assistant identifies an add-on by its slug and finds it
   * by its directory, so the two disagreeing is a rename that stopped halfway.
   * The Supervisor's own failure for this is obscure and arrives on an install.
   */
  const slug = /^slug:\s*(\S+)/mu.exec(config)?.[1];
  const directory = configPath.split('/')[0];
  if (slug === undefined) {
    errors.push(`${configPath}: no \`slug\` declared.`);
  } else if (slug !== directory) {
    errors.push(
      `${configPath}: slug \`${slug}\` does not match its directory \`${directory}\`. `
      + 'Home Assistant finds an add-on by directory and identifies it by slug; '
      + 'a mismatch is a half-finished rename.',
    );
  }

  /**
   * The image name carries no tag, because the version does.
   *
   * The Supervisor appends `:${version}` from this same file. A literal tag
   * here would produce `image:0.2.1:0.2.1` or, worse, a pin that quietly
   * stopped following the version line and kept installing an old release
   * while every version-bearing document in the tree said otherwise.
   */
  const image = /^image:\s*(\S+)/mu.exec(config)?.[1];
  if (image === undefined) {
    errors.push(`${configPath}: no \`image\` declared.`);
  } else if (/:[^/]+$/u.test(image)) {
    errors.push(
      `${configPath}: image \`${image}\` carries a literal tag. The Supervisor appends `
      + 'the add-on version, so the tag belongs to `version:` and nowhere else.',
    );
  }
}

/**
 * ADR 0128 H5. The container's CMD names a file that exists in the source.
 *
 * The entry moved from `addon-entrypoint.js` to `index.js` when host detection
 * stopped being a separate file. Nothing would have caught a CMD left pointing
 * at the old name: `tsc` does not remove outputs for deleted sources, so a
 * stale `dist/` keeps a broken CMD working locally, and the failure surfaces
 * first in a clean image build - which is to say, on someone's install.
 *
 * The check maps back to `src/` rather than looking in `dist/`, so it does
 * not depend on a build having run and cannot be satisfied by a leftover.
 */
/**
 * Every published image, not just the one this file was written for. ADR 0153
 * added a second deliverable, and a check that guarded the first one only
 * would have left the new image's CMD unguarded on the day it was written -
 * which is the day it is most likely to be wrong. Discovered above rather than
 * listed here, by the same reader `check-workflow-pinning.mjs` uses - one
 * truth about which images this repository publishes, not two.
 */

for (const dockerfilePath of dockerfilePaths) {
  if (!existsSync(join(repoRoot, dockerfilePath))) {
    errors.push(`${dockerfilePath}: missing. A published deliverable has no image to build from.`);
    continue;
  }
  const dockerfile = readFileSync(join(repoRoot, dockerfilePath), 'utf8');
  const cmdMatch = /^CMD\s+\[([^\]]*)\]/mu.exec(dockerfile);

  if (cmdMatch === null) {
    errors.push(`${dockerfilePath}: no exec-form CMD found.`);
    continue;
  }
  const argv = [...cmdMatch[1].matchAll(/"([^"]*)"/gu)].map((match) => match[1]);
  const entry = argv.find((argument) => argument.endsWith('.js'));

  if (entry === undefined) {
    errors.push(`${dockerfilePath}: CMD names no JavaScript entry.`);
    continue;
  }
  const source = entry.replace(/\/dist\//u, '/src/').replace(/\.js$/u, '.ts');
  if (!existsSync(join(repoRoot, source))) {
    errors.push(
      `${dockerfilePath}: CMD runs ${entry}, but ${source} does not exist. `
      + 'A stale dist/ keeps a removed entry working locally; a clean image '
      + 'build does not.',
    );
  }
}

if (errors.length > 0) {
  console.error('Home Assistant add-on config check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Home Assistant add-on config check passed for ${configPaths.length} add-ons; `
  + `${hostReach.length} fields that would take one out of its container are `
  + `watched, ${hostReachAsked} in use, each with a reason in its own file.`,
);

/**
 * Reads a flat top-level `key:` block. The add-on options and schema are both
 * flat string maps, so this stays a targeted reader rather than a YAML
 * dependency - the same tradeoff the other check scripts make.
 */
/**
 * A top-level mapping, with **empty and absent told apart**.
 *
 * `options: {}` is a statement - this add-on has no person-facing option, and
 * under ADR 0104 S2 that is the goal rather than an oversight. A missing
 * `options:` is an omission. The first version of this reader could not see
 * the difference, and reported the goal as a fault on the day the tree reached
 * it: `memory_encryption` was the last option, and removing it made the file
 * look unfinished to the check that was meant to keep it honest.
 *
 * ADR 0117 X1's construction, in a YAML reader.
 */
function readTopLevelMapping(source, name) {
  const lines = source.split('\n');
  const inline = lines.findIndex((line) => line === `${name}: {}`);
  if (inline !== -1) {
    return new Map();
  }
  const start = lines.findIndex((line) => line === `${name}:`);

  if (start === -1) {
    return undefined;
  }

  const entries = new Map();

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue;
    }
    // Any non-indented line ends the block.
    if (!/^\s/.test(line)) {
      break;
    }

    const match = /^\s+([^:\s]+):\s*(.*)$/.exec(line);
    if (match) {
      entries.set(match[1], match[2].trim());
    }
  }

  return entries;
}
