import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export const rootOwnedPackageProbeEnvironment =
  'PICO_COMPANION_ROOT_OWNED_PACKAGE_PROBE';

export function rootOwnedPackageProbeRequested(
  value = process.env[rootOwnedPackageProbeEnvironment],
) {
  assert(value === undefined || value === '1',
    `${rootOwnedPackageProbeEnvironment} must be unset or exactly 1.`);
  return value === '1';
}

export function selectChromiumSandboxProbe({
  packagedHelperPath,
  rootOwnedPackageProbe = rootOwnedPackageProbeRequested(),
  helperExists = existsSync,
  inspectHelper = lstatSync,
  inheritedSandboxPath = process.env.CHROME_DEVEL_SANDBOX,
} = {}) {
  assert(inheritedSandboxPath === undefined,
    'Tray probe refuses an inherited, unvalidated CHROME_DEVEL_SANDBOX path.');
  if (!rootOwnedPackageProbe) {
    return {
      arguments: ['--disable-setuid-sandbox'],
      environment: {},
      mode: 'user_namespace',
    };
  }

  assert(typeof packagedHelperPath === 'string' && isAbsolute(packagedHelperPath),
    'Packaged Chromium sandbox helper path must be absolute.');
  assert(helperExists(packagedHelperPath),
    `Packaged Chromium sandbox helper does not exist: ${packagedHelperPath}`);
  const helper = inspectHelper(packagedHelperPath);
  assert(helper.isFile() && !helper.isSymbolicLink(),
    `Packaged Chromium sandbox helper must be a regular file: ${packagedHelperPath}`);
  assert(helper.uid === 0 && helper.gid === 0,
    `Packaged Chromium sandbox helper must be owned by root:root: ${packagedHelperPath}`);
  assert((helper.mode & 0o7777) === 0o4755,
    `Packaged Chromium sandbox helper must have mode 4755: ${packagedHelperPath}`);
  return {
    arguments: [],
    environment: {},
    mode: 'root_owned_packaged_setuid_helper',
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
