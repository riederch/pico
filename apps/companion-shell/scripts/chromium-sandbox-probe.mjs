import { existsSync, lstatSync } from 'node:fs';

export const systemChromiumSandboxHelper = '/opt/google/chrome/chrome-sandbox';

export function selectChromiumSandboxProbe({
  helperPath = systemChromiumSandboxHelper,
  helperExists = existsSync,
  inspectHelper = lstatSync,
  inheritedSandboxPath = process.env.CHROME_DEVEL_SANDBOX,
} = {}) {
  if (helperExists(helperPath)) {
    const helper = inspectHelper(helperPath);
    assert(helper.isFile() && !helper.isSymbolicLink(),
      `Chromium sandbox helper must be a regular file: ${helperPath}`);
    assert(helper.uid === 0 && helper.gid === 0,
      `Chromium sandbox helper must be owned by root:root: ${helperPath}`);
    assert((helper.mode & 0o7777) === 0o4755,
      `Chromium sandbox helper must have mode 4755: ${helperPath}`);
    return {
      arguments: [],
      environment: { CHROME_DEVEL_SANDBOX: helperPath },
      mode: 'system_setuid_helper',
    };
  }

  assert(inheritedSandboxPath === undefined,
    'Tray probe refuses an inherited, unvalidated CHROME_DEVEL_SANDBOX path.');
  return {
    arguments: ['--disable-setuid-sandbox'],
    environment: {},
    mode: 'user_namespace',
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
