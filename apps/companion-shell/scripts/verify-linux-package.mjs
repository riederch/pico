import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildPicoCompanionLinuxPackage } from './package-linux.mjs';
import { selectChromiumSandboxProbe } from './chromium-sandbox-probe.mjs';

const temporaryRoots = new Set();
process.once('exit', cleanupTemporaryRoots);

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..', '..');
const packageJson = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
const support = JSON.parse(
  readFileSync(join(appRoot, 'electron-support.json'), 'utf8'),
);
const { artifact, checksum } = buildPicoCompanionLinuxPackage();
const extractionRoot = temporaryRoot('pico-companion-extract-');
const packageContents = run('dpkg-deb', ['--contents', artifact]).stdout;
run('dpkg-deb', ['--extract', artifact, extractionRoot]);

const installRoot = join(extractionRoot, 'opt', 'pico-companion');
const appResources = join(installRoot, 'resources', 'app');
const executable = join(installRoot, 'pico-companion');
const electronBinary = join(installRoot, 'pico-companion-bin');
const desktopEntry = readFileSync(
  join(extractionRoot, 'usr', 'share', 'applications', 'pico-companion.desktop'),
  'utf8',
);
const autostartEntry = readFileSync(
  join(extractionRoot, 'etc', 'xdg', 'autostart', 'pico-companion.desktop'),
  'utf8',
);

assert(packageContents.includes('-rwsr-xr-x root/root')
  && packageContents.includes('./opt/pico-companion/chrome-sandbox'),
'Debian package must retain the root-owned setuid Chromium sandbox helper.');
assert(!packageContents.includes('./home/') && !packageContents.includes('./root/'),
  'Debian package must not own a person profile or Vault home.');
assert((statSync(executable).mode & 0o111) !== 0, 'Packaged companion executable is not executable.');
assert((statSync(electronBinary).mode & 0o111) !== 0,
  'Packaged Electron binary is not executable.');
const launcher = readFileSync(executable, 'utf8');
assert(launcher.includes('ulimit -S -c 0')
  && launcher.includes('ulimit -H -c 0')
  && launcher.includes('exec "$pico_install_dir/pico-companion-bin" "$@"'),
'Every packaged launch must disable core dumps before Electron starts.');
assert(!launcher.includes('--no-sandbox')
  && !desktopEntry.includes('--no-sandbox')
  && !autostartEntry.includes('--no-sandbox'),
'Production launch surfaces must never disable Chromium sandboxing.');
assert(desktopEntry.includes('Exec=/opt/pico-companion/pico-companion'),
  'Desktop entry does not launch the packaged executable.');
assert(autostartEntry.includes('X-GNOME-Autostart-enabled=true'),
  'XDG autostart entry is not enabled.');
assert(!desktopEntry.includes('\nIcon='),
  'Desktop entry must not invent an unregistered production app icon.');

const packagedApp = JSON.parse(readFileSync(join(appResources, 'package.json'), 'utf8'));
assert(packagedApp.main === 'apps/companion-shell/dist/main.js'
  && packagedApp.version === packageJson.version
  && packagedApp.type === 'module', 'Packaged Electron app metadata is invalid.');
assert(!fileNames(appResources).some((name) => (
  name === '.env' || name.endsWith('/.env') || name.endsWith('/profile.json')
)), 'Package contains a local environment or companion profile file.');
assertRuntimeOnlyPicoPackages(appResources);
assertInternalLinks(appResources);
assertNoBuildMachinePath(appResources);
const lifecycle = verifyDebianLifecycle(artifact);

const probeRoot = temporaryRoot('pico-companion-probe-');
const sandboxProbe = selectChromiumSandboxProbe();
const probeArgs = [
  ...sandboxProbe.arguments,
  `--user-data-dir=${join(probeRoot, 'user-data')}`,
];
let command = executable;
let args = probeArgs;
if (process.env.DISPLAY === undefined && process.env.WAYLAND_DISPLAY === undefined) {
  assert(run('which', ['xvfb-run']).stdout.trim() !== '',
    'A display or xvfb-run is required for the Linux tray release measurement.');
  command = 'xvfb-run';
  args = ['-a', executable, ...probeArgs];
}
// Status 1 is the probe's intentional "measurement exceeded" result; parse
// its signed-off JSON before the release assertion reports the exact metrics.
const probe = run(command, args, {
  ...sandboxProbe.environment,
  PICO_COMPANION_RELEASE_PROBE: 'tray-memory-v1',
  XDG_CACHE_HOME: join(probeRoot, 'cache'),
  XDG_CONFIG_HOME: join(probeRoot, 'config'),
}, 'pipe', 30_000, [0, 1]);
const reportLine = probe.stdout.split('\n').find((line) => (
  line.includes('"schema":"pico.companion.tray-memory.v1"')
));
assert(reportLine !== undefined, `Tray memory probe emitted no report: ${probe.stdout}`);
const report = JSON.parse(reportLine);
assert(report.electronVersion === support.latestStableVersion,
  'Tray memory probe used an unreviewed Electron version.');
assert(report.packaged === true,
  'Tray memory probe did not run as a packaged Electron app.');
assert(report.processCount >= 1, 'Tray memory probe measured no processes.');
assert(report.coreDumpSoftLimitBytes === 0 && report.coreDumpHardLimitBytes === 0,
  'Packaged companion launch did not inherit a zero soft and hard core-dump limit.');
assert(report.proportionalBudgetBytes === 225_000_000
  && report.proportionalBytes < report.proportionalBudgetBytes,
`Tray PSS ${report.proportionalBytes} bytes exceeds the strict 225 MB budget `
  + `(summed RSS ${report.rssBytes}, private ${report.privateBytes}).`);
assert(report.privateBudgetBytes === 110_000_000
  && report.privateBytes < report.privateBudgetBytes,
`Tray private memory ${report.privateBytes} bytes exceeds the strict 110 MB budget `
  + `(summed RSS ${report.rssBytes}, PSS ${report.proportionalBytes}).`);
assert(report.underBudget === true,
  'Tray memory probe did not pass its own PSS/private budget gates.');

const retainedReport = {
  ...report,
  schema: 'pico.companion.tray-memory-release.v1',
  measuredAt: new Date().toISOString(),
  platform: 'linux',
  architecture: 'amd64',
  chromiumSandboxProbe: sandboxProbe.mode,
  artifact: artifact.split('/').at(-1),
  sha256: checksum,
  lifecycle,
};
writeFileSync(
  join(appRoot, 'out', 'tray-memory-linux-amd64.json'),
  `${JSON.stringify(retainedReport, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(retainedReport)}\n`);
removeTemporaryRoot(extractionRoot);
removeTemporaryRoot(probeRoot);

function fileNames(root) {
  const names = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const name = relative(root, path);
    names.push(name);
    if (entry.isDirectory()) {
      for (const child of fileNames(path)) {
        names.push(join(entry.name, child));
      }
    }
  }
  return names;
}

function assertRuntimeOnlyPicoPackages(root) {
  const names = fileNames(root);
  assert(!names.includes('node_modules/.modules.yaml')
    && !names.includes('node_modules/.pnpm/lock.yaml')
    && !names.includes('node_modules/.bin'),
  'Package contains pnpm deployment metadata or build-only command links.');
  for (const workspacePath of [
    'apps/companion-shell',
    'apps/companion',
    'apps/vault-daemon',
    'packages/identity',
    'packages/protocol',
    'packages/vault',
  ]) {
    assert(names.includes(`${workspacePath}/package.json`)
      && names.includes(`${workspacePath}/dist`),
    `Package is missing the runtime workspace ${workspacePath}.`);
  }
  assert(!names.some((name) => (
    name === 'apps/core'
    || name.startsWith('apps/core/')
    || name === 'apps/web'
    || name.startsWith('apps/web/')
    || name === 'packages/appearance'
    || name.startsWith('packages/appearance/')
    || name === 'packages/sync'
    || name.startsWith('packages/sync/')
  )), 'Package contains a workspace outside the companion production closure.');
  const picoPackageFiles = names.filter((name) => (
    name.startsWith('apps/')
    || name.startsWith('packages/')
    || name.includes('/node_modules/@pico/')
  ));
  assert(!picoPackageFiles.some((name) => (
    name.includes('/src/')
    || name.includes('/scripts/')
    || name.includes('/node_modules/.bin/')
    || name.endsWith('/tsconfig.json')
    || name.includes('.test.')
    || name.endsWith('.d.ts')
    || name.endsWith('.d.cts')
    || name.endsWith('.map')
  )), 'Package contains source, tests or type/build output from a Pico runtime package.');
}

function verifyDebianLifecycle(artifactPath) {
  const lifecycleRoot = temporaryRoot('pico-companion-lifecycle-');
  const upgrade = createSyntheticUpgradePackage(artifactPath);
  const adminDirectory = join(lifecycleRoot, 'var', 'lib', 'dpkg');
  const personHome = join(lifecycleRoot, 'home', 'pico');
  const profilePath = join(personHome, '.pico', 'companion', 'profile.json');
  const vaultPath = join(personHome, '.pico', 'vault', 'keyfiles', 'identity-root.key');
  const sentinels = [
    createSentinel(profilePath, 'synthetic-profile-binding\n'),
    createSentinel(vaultPath, 'synthetic-vault-secret\n'),
  ];
  mkdirSync(adminDirectory, { recursive: true });
  writeFileSync(join(adminDirectory, 'status'), '');

  const dpkg = (...args) => run('fakeroot', [
    'dpkg',
    `--root=${lifecycleRoot}`,
    `--admindir=${adminDirectory}`,
    '--force-depends',
    '--force-not-root',
    '--no-triggers',
    ...args,
  ], { HOME: personHome });

  try {
    dpkg('--install', artifactPath);
    assertLifecycleInstalled(lifecycleRoot);
    assertSentinelsUnchanged(sentinels);

    dpkg('--install', upgrade.artifact);
    assertLifecycleInstalled(lifecycleRoot);
    assertSentinelsUnchanged(sentinels);
    const status = dpkg('--status', 'pico-companion').stdout;
    assert(status.includes(`Version: ${upgrade.version}`)
      && status.includes('Status: install ok installed'),
    'Synthetic Debian upgrade did not replace the installed package version.');

    dpkg('--remove', 'pico-companion');
    assertLifecycleRemoved(lifecycleRoot);
    assertSentinelsUnchanged(sentinels);
    dpkg('--purge', 'pico-companion');
    assertSentinelsUnchanged(sentinels);
    return {
      schema: 'pico.companion.debian-lifecycle.v1',
      installed: true,
      upgraded: true,
      removed: true,
      personDataPreserved: true,
    };
  } finally {
    removeTemporaryRoot(lifecycleRoot);
    removeTemporaryRoot(upgrade.workRoot);
  }
}

function createSyntheticUpgradePackage(artifactPath) {
  const workRoot = temporaryRoot('pico-companion-upgrade-');
  const packageRoot = join(workRoot, 'package-root');
  const upgradeArtifact = join(workRoot, `upgrade-${basename(artifactPath)}`);
  run('dpkg-deb', ['--raw-extract', artifactPath, packageRoot]);
  const controlPath = join(packageRoot, 'DEBIAN', 'control');
  const version = `${packageJson.version}+c3verify1`;
  const control = readFileSync(controlPath, 'utf8').replace(
    /^Version: .+$/m,
    `Version: ${version}`,
  );
  writeFileSync(controlPath, control);
  const appPackagePath = join(
    packageRoot,
    'opt',
    'pico-companion',
    'resources',
    'app',
    'package.json',
  );
  const appPackage = JSON.parse(readFileSync(appPackagePath, 'utf8'));
  writeFileSync(appPackagePath, `${JSON.stringify({
    ...appPackage,
    version,
  }, null, 2)}\n`);
  run('dpkg-deb', [
    '--root-owner-group',
    '--build',
    packageRoot,
    upgradeArtifact,
  ], { SOURCE_DATE_EPOCH: '0' });
  return { artifact: upgradeArtifact, version, workRoot };
}

function createSentinel(path, contents) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
  return {
    path,
    hash: createHash('sha256').update(contents).digest('hex'),
    mode: 0o600,
  };
}

function assertSentinelsUnchanged(sentinels) {
  for (const sentinel of sentinels) {
    assert(existsSync(sentinel.path),
      `Package lifecycle removed person data: ${sentinel.path}`);
    const hash = createHash('sha256').update(readFileSync(sentinel.path)).digest('hex');
    assert(hash === sentinel.hash && (statSync(sentinel.path).mode & 0o777) === sentinel.mode,
      `Package lifecycle modified person data: ${sentinel.path}`);
  }
}

function assertLifecycleInstalled(root) {
  for (const path of [
    join(root, 'opt', 'pico-companion', 'pico-companion'),
    join(root, 'opt', 'pico-companion', 'pico-companion-bin'),
    join(root, 'usr', 'share', 'applications', 'pico-companion.desktop'),
    join(root, 'etc', 'xdg', 'autostart', 'pico-companion.desktop'),
  ]) {
    assert(existsSync(path), `Debian lifecycle did not install ${path}.`);
  }
}

function assertLifecycleRemoved(root) {
  for (const path of [
    join(root, 'opt', 'pico-companion', 'pico-companion'),
    join(root, 'opt', 'pico-companion', 'pico-companion-bin'),
    join(root, 'usr', 'share', 'applications', 'pico-companion.desktop'),
    join(root, 'etc', 'xdg', 'autostart', 'pico-companion.desktop'),
  ]) {
    assert(!existsSync(path), `Debian lifecycle did not remove ${path}.`);
  }
}

function temporaryRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.add(root);
  return root;
}

function removeTemporaryRoot(root) {
  rmSync(root, { recursive: true, force: true });
  temporaryRoots.delete(root);
}

function cleanupTemporaryRoots() {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
}

function assertInternalLinks(root) {
  const absoluteRoot = `${resolve(root)}${sep}`;
  for (const path of walk(root)) {
    if (!lstatSync(path).isSymbolicLink()) {
      continue;
    }
    assert(existsSync(path),
      `Packaged dependency link is dangling: ${relative(root, path)}`);
    const target = realpathSync(path);
    assert(target.startsWith(absoluteRoot),
      `Packaged dependency link escapes resources/app: ${relative(root, path)}`);
  }
}

function assertNoBuildMachinePath(root) {
  for (const path of walk(root)) {
    if (!lstatSync(path).isFile() || statSync(path).size > 2_000_000) {
      continue;
    }
    if (!/\.(?:c?js|json|html|css|svg|txt|md)$/.test(path)) {
      continue;
    }
    assert(!readFileSync(path, 'utf8').includes(repoRoot),
      `Package leaks the build-machine repository path in ${relative(root, path)}.`);
  }
}

function walk(root) {
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    paths.push(path);
    if (entry.isDirectory()) {
      paths.push(...walk(path));
    }
  }
  return paths;
}

function run(
  command,
  args,
  extraEnvironment = {},
  stdio = 'pipe',
  timeout,
  acceptedStatuses = [0],
) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnvironment },
    stdio,
    timeout,
  });
  if (result.error !== undefined || !acceptedStatuses.includes(result.status)) {
    const details = [result.error?.message, result.stderr, result.stdout]
      .filter((value) => typeof value === 'string' && value.length > 0)
      .join('\n');
    throw new Error(
      `${command} ${args.join(' ')} failed: `
        + `${details || result.status}`,
    );
  }
  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
