import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export const configuredChromiumSandboxHelperEnvironment =
  'PICO_COMPANION_CHROMIUM_SANDBOX_HELPER';

export function selectChromiumSandboxProbe({
  helperPath = process.env[configuredChromiumSandboxHelperEnvironment],
  expectedHelperSha256,
  helperExists = existsSync,
  hashHelper = sha256File,
  inspectHelper = lstatSync,
  inheritedSandboxPath = process.env.CHROME_DEVEL_SANDBOX,
} = {}) {
  assert(inheritedSandboxPath === undefined,
    'Tray probe refuses an inherited, unvalidated CHROME_DEVEL_SANDBOX path.');
  if (helperPath === undefined || helperPath === null) {
    return {
      arguments: ['--disable-setuid-sandbox'],
      environment: {},
      mode: 'user_namespace',
    };
  }

  assert(isAbsolute(helperPath),
    'Configured Chromium sandbox helper path must be absolute.');
  assert(helperExists(helperPath),
    `Configured Chromium sandbox helper does not exist: ${helperPath}`);
  const helper = inspectHelper(helperPath);
  assert(helper.isFile() && !helper.isSymbolicLink(),
    `Chromium sandbox helper must be a regular file: ${helperPath}`);
  assert(helper.uid === 0 && helper.gid === 0,
    `Chromium sandbox helper must be owned by root:root: ${helperPath}`);
  assert((helper.mode & 0o7777) === 0o4755,
    `Chromium sandbox helper must have mode 4755: ${helperPath}`);
  assert(typeof expectedHelperSha256 === 'string'
    && /^[0-9a-f]{64}$/.test(expectedHelperSha256),
  'Packaged Chromium sandbox helper digest is missing or invalid.');
  assert(hashHelper(helperPath) === expectedHelperSha256,
    'Configured Chromium sandbox helper differs from the packaged Electron helper.');
  return {
    arguments: [],
    environment: { CHROME_DEVEL_SANDBOX: helperPath },
    mode: 'installed_exact_setuid_helper',
  };
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
