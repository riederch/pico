import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0150 PU4. A push wakes a device, never a person.
 *
 * Receiving a push causes a **read** and nothing else. What the read finds is
 * what decides whether somebody is interrupted, through the ADR 0112 alarm
 * rules that already weigh that carefully - a Home that pushes has decided
 * that looking now beats looking in six hours, and has not decided to disturb
 * anyone.
 *
 * That is an absence, and an absence nobody measures is a comment. So this
 * asserts that nothing on the push path can reach a notification, a tray, a
 * window, a sound or a badge: not by import, and not by name.
 *
 * It is a floor rather than a proof - a surface reached through three
 * indirections escapes any such reading - and it is written that way on
 * purpose. What it buys is that the *next* one is a named error in a second
 * rather than a person woken at four in the morning by a design nobody meant.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const errors = [];

/** The files a push actually travels through on the device. */
const pushPath = [
  'apps/companion/src/link-push-gate.ts',
];

/** Modules that end in somebody's attention. */
const forbiddenImports = [
  './notify.js',
  '@pico/companion/notify',
  'electron',
  'node:child_process',
];

/**
 * Names that mean a person is being reached. Matched against code with
 * comments and strings stripped, so the paragraph explaining the rule does not
 * trip the check enforcing it.
 */
const forbiddenNames = [
  'Notification',
  'notify',
  'notification',
  'presentation',
  'Presentation',
  'showWindow',
  'tray',
  'Tray',
  'alarm',
  'Alarm',
  'sound',
  'badge',
];

function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

let scanned = 0;
for (const path of pushPath) {
  const absolute = join(repoRoot, path);
  if (!existsSync(absolute)) {
    errors.push(`push-boundary: ${path} is named as the push path and does not exist.`);
    continue;
  }
  scanned += 1;
  const source = readFileSync(absolute, 'utf8');
  const code = codeOnly(source);

  for (const match of source.matchAll(importPattern)) {
    if (forbiddenImports.some((forbidden) => match[1] === forbidden
      || match[1].startsWith(`${forbidden}/`))) {
      errors.push(
        `${relative(repoRoot, absolute)}: the push path must not import ${match[1]} (ADR 0150 PU4); `
        + 'a push wakes a device, and whether a person is disturbed is ADR 0112\'s to decide.',
      );
    }
  }

  for (const name of forbiddenNames) {
    if (code.includes(name)) {
      errors.push(
        `${relative(repoRoot, absolute)}: the push path must not name ${name} (ADR 0150 PU4); `
        + 'receiving a push causes a read and nothing else.',
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Push boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Push boundary check passed (${scanned} files; a push reaches no surface that reaches a person).`,
);
