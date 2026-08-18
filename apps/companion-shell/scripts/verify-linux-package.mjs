import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  closeSync,
  mkdtempSync,
  openSync,
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
import {
  rootOwnedPackageProbeEnvironment,
  rootOwnedPackageProbeRequested,
  selectChromiumSandboxProbe,
} from './chromium-sandbox-probe.mjs';
import { assertPicoTrayMemoryBudgets } from './tray-memory-budget.mjs';
import {
  assertPicoCompanionReachability,
  picoDesktopEntryExec,
  picoLauncherExecTarget,
  readPicoCompanionDoors,
} from './reachability.mjs';

const temporaryRoots = new Set();
const rootOwnedTemporaryRoots = new Set();
process.once('exit', cleanupTemporaryRoots);

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..', '..');
const packageJson = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
const support = JSON.parse(
  readFileSync(join(appRoot, 'electron-support.json'), 'utf8'),
);
const rootOwnedPackageProbe = rootOwnedPackageProbeRequested();
const { artifact, checksum } = buildPicoCompanionLinuxPackage();
const extractionRoot = temporaryRoot('pico-companion-extract-');
const packageContents = run('dpkg-deb', ['--contents', artifact]).stdout;
if (rootOwnedPackageProbe) {
  makeTemporaryRootOwned(extractionRoot);
  run('sudo', ['dpkg-deb', '--extract', artifact, extractionRoot]);
} else {
  run('dpkg-deb', ['--extract', artifact, extractionRoot]);
}

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
// The entry's `Exec` is checked below, where ADR 0130 E1 follows it through
// the installed launcher to the process that holds the single-instance lock.
// A substring test here would also accept `Exec=...pico-companion-something`,
// and two checks over one subject drift until the weaker one is the only one
// anybody reads.
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
const packagedSandboxHelper = join(installRoot, 'chrome-sandbox');
const sandboxProbe = selectChromiumSandboxProbe({
  packagedHelperPath: packagedSandboxHelper,
  rootOwnedPackageProbe,
});
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
  PICO_COMPANION_RELEASE_PROBE: 'tray-memory-v2',
  XDG_CACHE_HOME: join(probeRoot, 'cache'),
  XDG_CONFIG_HOME: join(probeRoot, 'config'),
}, 'pipe', 30_000, [0, 1]);
const reportLine = probe.stdout.split('\n').find((line) => (
  line.includes('"schema":"pico.companion.tray-memory.v2"')
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
assert(report.privateBytes === report.privateCleanBytes
  + report.privateDirtyBytes + report.privateHugetlbBytes,
  'Tray memory report private total does not match its clean/dirty/hugetlb classes.');
assert(report.privateDirtyAndHugetlbBytes === report.privateDirtyBytes
  + report.privateHugetlbBytes,
  'Tray memory report budgeted private total does not match dirty plus hugetlb.');

const retainedReport = {
  ...report,
  schema: 'pico.companion.tray-memory-release.v2',
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
const memoryContext = `sandbox ${sandboxProbe.mode}, ${report.processCount} processes; `
  + `private total ${report.privateBytes}, clean ${report.privateCleanBytes}, `
  + `dirty ${report.privateDirtyBytes}, hugetlb ${report.privateHugetlbBytes}`;

for (const line of assertPicoTrayMemoryBudgets({
  report,
  mode: sandboxProbe.mode,
  memoryContext,
  environmentVariable: rootOwnedPackageProbeEnvironment,
})) {
  process.stdout.write(`${line}\n`);
}
/**
 * ADR 0130 E1. The doors, measured where they either exist or do not.
 *
 * **The tray is one door and on stock GNOME it is not there at all**, so a
 * companion that is only reachable through it is invisible to most Linux users
 * while looking healthy from inside its own process. What is asserted here in
 * every environment are the product's own facts - the installed entry names
 * the executable that holds the single-instance lock, launching it twice
 * raises the first, and the notification carries an action that opens the
 * window. What depends on the session is asserted when there is a session to
 * ask, and reported otherwise, for the reason ADR 0113 C3 records one screen
 * above: a gate that is red for the environment trains its reader to shrug.
 */
const reachabilityRoot = temporaryRoot('pico-companion-reach-');
const reachabilityProbe = runReachabilityProbe(reachabilityRoot);
const desktopEntryPath = join(
  extractionRoot, 'usr', 'share', 'applications', 'pico-companion.desktop',
);
const desktopEntryInstalled = existsSync(desktopEntryPath);
assert(desktopEntryInstalled,
  'The package installs no desktop entry, so the launcher door does not exist.');

/**
 * Followed rather than compared. The entry names a launcher script, because
 * ADR 0123 Z3 needs somewhere to drop the core-dump limits before Electron
 * starts, so the entry and the running process carry names that are correctly
 * different. Asserting them equal would have been a check that passes forever
 * without looking at anything; the chain that matters is entry -> installed
 * launcher -> the binary it execs -> the process that holds the lock.
 */
const entryCommand = picoDesktopEntryExec(readFileSync(desktopEntryPath, 'utf8'));
assert(entryCommand === '/opt/pico-companion/pico-companion',
  `The desktop entry runs ${entryCommand} rather than the installed launcher `
  + '/opt/pico-companion/pico-companion. ADR 0123 Z3 drops the core-dump limits in '
  + 'that script, so an entry that reaches Electron another way is a launch path '
  + 'that can write a core file holding the vault.');
const installedLauncher = join(installRoot, basename(entryCommand));
assert(existsSync(installedLauncher),
  `The desktop entry runs ${entryCommand}, which this package does not install.`);
const launcherTarget = picoLauncherExecTarget(readFileSync(installedLauncher, 'utf8'));
assert(launcherTarget !== null,
  `The installed launcher ${entryCommand} execs nothing.`);
// Both sides expressed as installed paths: the probe ran out of a temporary
// extraction directory, and its own directory is the one it would hold a lock
// against after a real install.
const desktopEntryExecutable = join(dirname(entryCommand), launcherTarget);
const singletonExecutable = join(
  dirname(entryCommand), basename(String(reachabilityProbe.executable)),
);
assert(desktopEntryExecutable === singletonExecutable,
  `The desktop entry reaches ${desktopEntryExecutable} while the companion that holds `
  + `the single-instance lock is ${singletonExecutable}: launching the entry would `
  + 'start a second companion rather than raise the first.');
assert(reachabilityProbe.secondLaunchRaisedTheFirst === true,
  'Launching the packaged companion a second time did not raise the running one: '
  + 'the desktop entry is not a door, it is a way to start a second companion.');
assert(reachabilityProbe.notificationOpensTheWindow === true,
  'The notification the companion raises does not open its window. A notification '
  + 'without an action is an announcement, and on a desktop with no tray host it is '
  + 'the difference between reachable and not.');
assert(reachabilityProbe.notificationsSupported === true,
  'The packaged runtime reports notifications as unsupported.');

/**
 * ADR 0130 E1's reference negative test, constructed rather than waited for.
 *
 * GNOME has shipped with no StatusNotifierItem host since 3.26, so the tray
 * door is absent on the largest Linux desktop. Nobody here runs GNOME - this
 * was written on KDE, which hosts one - and a contract that is only ever
 * checked where it holds is not checked. `dbus-run-session` gives a private
 * bus that owns nothing, which is the same absence from the companion's side.
 *
 * What must survive it are the two doors that do not need a tray host. The
 * tray itself is *not* asserted absent: Electron accepts an icon on a bus
 * nobody watches and reports success, which is exactly why reachability is
 * measured at the session and not from inside the process.
 */
if (existsSync('/usr/bin/dbus-run-session') || existsSync('/bin/dbus-run-session')) {
  const withoutHost = temporaryRoot('pico-companion-nohost-');
  const negative = runReachabilityProbe(withoutHost, ['dbus-run-session', '--']);
  assert(negative.secondLaunchRaisedTheFirst === true,
    'On a session with no tray host, launching the companion a second time did not '
    + 'raise the running one - which would leave stock GNOME with no door at all.');
  assert(negative.notificationOpensTheWindow === true,
    'On a session with no tray host, the notification does not open the window.');
  process.stdout.write('ADR 0130 E1: on a bus that hosts no tray, the desktop entry '
    + 'and the notification still open the window.\n');
  removeTemporaryRoot(withoutHost);
} else {
  process.stdout.write('ADR 0130 E1: dbus-run-session is absent, so the no-tray-host '
    + 'negative test did not run.\n');
}

const sessionBus = dbusNameOwners([
  'org.kde.StatusNotifierWatcher',
  'org.freedesktop.Notifications',
]);
if (sessionBus === null) {
  process.stdout.write('ADR 0130 E1: no session bus reachable, so which doors this '
    + 'desktop hosts was not measured. The product-side facts above were asserted; '
    + 'run this on a desktop session to check the two-door contract.\n');
} else {
  const doors = readPicoCompanionDoors({
    statusNotifierHost: sessionBus['org.kde.StatusNotifierWatcher'],
    desktopEntryInstalled,
    desktopEntryExecutable,
    singletonExecutable,
    secondLaunchRaisedTheFirst: reachabilityProbe.secondLaunchRaisedTheFirst,
    notificationDaemon: sessionBus['org.freedesktop.Notifications'],
    notificationsSupported: reachabilityProbe.notificationsSupported,
    notificationOpensTheWindow: reachabilityProbe.notificationOpensTheWindow,
  });
  const open = assertPicoCompanionReachability(doors);
  process.stdout.write(`ADR 0130 E1: reachable through ${open.join(', ')} on this `
    + `session (${process.env.XDG_CURRENT_DESKTOP ?? 'unnamed desktop'}).\n`);
}

removeTemporaryRoot(reachabilityRoot);
removeTemporaryRoot(extractionRoot);
removeTemporaryRoot(probeRoot);

/**
 * The packaged companion, asked what its own doors do. It spawns a second copy
 * of itself, so the executable path here is the installed one and not a
 * development build.
 */
function runReachabilityProbe(root, prefix = []) {
  const probeArguments = [
    ...sandboxProbe.arguments,
    `--user-data-dir=${join(root, 'user-data')}`,
  ];
  let probeCommand = executable;
  let probeArgs = probeArguments;
  if (process.env.DISPLAY === undefined && process.env.WAYLAND_DISPLAY === undefined) {
    assert(run('which', ['xvfb-run']).stdout.trim() !== '',
      'A display or xvfb-run is required for the ADR 0130 E1 reachability probe.');
    probeCommand = 'xvfb-run';
    probeArgs = ['-a', executable, ...probeArguments];
  }
  if (prefix.length > 0) {
    probeArgs = [...prefix.slice(1), probeCommand, ...probeArgs];
    probeCommand = prefix[0];
  }
  /**
   * Collected through a file rather than a pipe, and that is not a style
   * choice. A private bus activates `xdg-desktop-portal` on demand; the
   * activated service inherits this process's descriptors and outlives the
   * companion, so a piped `spawnSync` keeps reading an open write end long
   * after the probe has answered - which arrives as `ETIMEDOUT` and reads
   * exactly like a companion that hung. It cost two hours here.
   */
  const outputPath = join(root, 'probe-output.txt');
  mkdirSync(root, { recursive: true });
  const output = openSync(outputPath, 'w');
  try {
    run(probeCommand, probeArgs, {
      ...sandboxProbe.environment,
      PICO_COMPANION_RELEASE_PROBE: 'reachability-v1',
      XDG_CACHE_HOME: join(root, 'cache'),
      XDG_CONFIG_HOME: join(root, 'config'),
    }, ['ignore', output, output], 120_000);
  } finally {
    closeSync(output);
  }
  const written = readFileSync(outputPath, 'utf8');
  const line = written.split('\n').find((candidate) => (
    candidate.includes('"schema":"pico.companion.reachability.v1"')
  ));
  assert(line !== undefined,
    `The reachability probe emitted no report: ${written}`);
  const parsed = JSON.parse(line);
  assert(parsed.packaged === true,
    'The reachability probe did not run as a packaged Electron app.');
  return parsed;
}

/**
 * Which of these bus names somebody owns, or `null` when there is no bus to
 * ask - a headless build machine, which is a different thing from a desktop
 * that hosts nothing.
 *
 * `gdbus` then `busctl`, because neither is guaranteed and the answer is worth
 * a second attempt. A missing tool is also `null`: an unmeasured name must not
 * read as an absent one, or a build box without glib would report every
 * desktop as broken.
 */
function dbusNameOwners(names) {
  if (process.env.DBUS_SESSION_BUS_ADDRESS === undefined) {
    return null;
  }
  const ask = (name) => {
    const viaGdbus = spawnSync('gdbus', [
      'call', '--session', '--dest', 'org.freedesktop.DBus',
      '--object-path', '/org/freedesktop/DBus',
      '--method', 'org.freedesktop.DBus.GetNameOwner', name,
    ], { encoding: 'utf8', timeout: 10_000 });
    if (viaGdbus.error === undefined && (viaGdbus.status === 0 || viaGdbus.status === 1)) {
      return viaGdbus.status === 0;
    }
    const viaBusctl = spawnSync('busctl', ['--user', 'status', name], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (viaBusctl.error === undefined && (viaBusctl.status === 0 || viaBusctl.status === 1)) {
      return viaBusctl.status === 0;
    }
    return undefined;
  };
  const owners = {};
  for (const name of names) {
    const owned = ask(name);
    if (owned === undefined) {
      return null;
    }
    owners[name] = owned;
  }
  return owners;
}

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

function makeTemporaryRootOwned(root) {
  assertManagedTemporaryRoot(root);
  rootOwnedTemporaryRoots.add(root);
  run('sudo', ['chown', 'root:root', '--', root]);
  run('sudo', ['chmod', '0755', '--', root]);
  const metadata = lstatSync(root);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink()
    && metadata.uid === 0 && metadata.gid === 0
    && (metadata.mode & 0o7777) === 0o755,
  `Root-owned package extraction directory is not secured: ${root}`);
}

function removeTemporaryRoot(root) {
  reclaimTemporaryRoot(root);
  rmSync(root, { recursive: true, force: true });
  temporaryRoots.delete(root);
}

function cleanupTemporaryRoots() {
  for (const root of temporaryRoots) {
    try {
      reclaimTemporaryRoot(root, false);
      rmSync(root, { recursive: true, force: true });
    } catch {
      // A failed best-effort exit cleanup is confined to an exact mkdtemp root.
    }
  }
}

function reclaimTemporaryRoot(root, strict = true) {
  if (!rootOwnedTemporaryRoots.has(root)) {
    return;
  }
  const cleanup = spawnSync('sudo', [
    'chown',
    '--recursive',
    '--no-dereference',
    `${process.getuid()}:${process.getgid()}`,
    '--',
    root,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: 'pipe',
  });
  if (strict) {
    assert(cleanup.error === undefined && cleanup.status === 0,
      `Could not reclaim root-owned temporary package extraction: ${root}`);
  }
  if (cleanup.error === undefined && cleanup.status === 0) {
    rootOwnedTemporaryRoots.delete(root);
  }
}

function assertManagedTemporaryRoot(root) {
  const temporaryDirectory = `${realpathSync(tmpdir())}${sep}`;
  assert(temporaryRoots.has(root)
    && resolve(root).startsWith(temporaryDirectory),
  `Refusing privileged operation outside a managed temporary root: ${root}`);
  const metadata = lstatSync(root);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink()
    && metadata.uid === process.getuid() && metadata.gid === process.getgid(),
  `Managed temporary root has unexpected ownership or type: ${root}`);
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
