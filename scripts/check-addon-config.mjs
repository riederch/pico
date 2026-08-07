import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Home Assistant add-on metadata gate.
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
const configPath = 'pico_core/config.yaml';
const errors = [];

const config = readFileSync(join(repoRoot, configPath), 'utf8');
const options = readTopLevelMapping(config, 'options');
const schema = readTopLevelMapping(config, 'schema');

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
const dockerfilePath = 'docker/core.Dockerfile';
const dockerfile = readFileSync(join(repoRoot, dockerfilePath), 'utf8');
const cmdMatch = /^CMD\s+\[([^\]]*)\]/mu.exec(dockerfile);

if (cmdMatch === null) {
  errors.push(`${dockerfilePath}: no exec-form CMD found.`);
} else {
  const argv = [...cmdMatch[1].matchAll(/"([^"]*)"/gu)].map((match) => match[1]);
  const entry = argv.find((argument) => argument.endsWith('.js'));

  if (entry === undefined) {
    errors.push(`${dockerfilePath}: CMD names no JavaScript entry.`);
  } else {
    const source = entry.replace(/\/dist\//u, '/src/').replace(/\.js$/u, '.ts');
    if (!existsSync(join(repoRoot, source))) {
      errors.push(
        `${dockerfilePath}: CMD runs ${entry}, but ${source} does not exist. `
        + 'A stale dist/ keeps a removed entry working locally; a clean image '
        + 'build does not.',
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Home Assistant add-on config check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Home Assistant add-on config check passed.');

/**
 * Reads a flat top-level `key:` block. The add-on options and schema are both
 * flat string maps, so this stays a targeted reader rather than a YAML
 * dependency - the same tradeoff the other check scripts make.
 */
function readTopLevelMapping(source, name) {
  const lines = source.split('\n');
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
