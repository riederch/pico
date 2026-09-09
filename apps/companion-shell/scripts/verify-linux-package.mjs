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

/**
 * Wie lange ein Dienst, der schon geht, noch schreiben darf - siehe
 * `removeDirectoryWhileSomethingMayStillWrite` weiter unten.
 *
 * Steht hier oben und nicht dort, weil `const` nicht hochgezogen wird: der
 * erste Aufruf kommt aus `verifyDebianLifecycle`, und das laeuft in Zeile 106,
 * lange bevor die Zeile neben der Funktion ausgewertet waere. Genau daran ist
 * der erste Anlauf dieser Reparatur gerissen (Befund B114).
 */
const temporaryRootRemovalDeadlineMs = 10_000;

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
  // `which` exits 1 for a missing tool; without accepting that, run() throws
  // its generic error first and this message is dead code.
  assert(run('which', ['xvfb-run'], {}, 'pipe', undefined, [0, 1]).stdout.trim() !== '',
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
/**
 * Both sides expressed as full installed paths, directories included. The
 * launcher resolves its own directory at run time (`pico_install_dir=${0%/*}`),
 * which after a real install is the entry's; the probe ran out of a temporary
 * extraction, so its executable is translated by stripping that root - and a
 * probe raised from outside the extraction is refused there. Reduced to
 * basenames, this chain would certify a launcher that hardcoded a stale
 * system-wide binary: reachability.mjs names that mistake - a path-insensitive
 * test calls /usr/local/bin/pico-companion a match for
 * /opt/pico-companion/pico-companion.
 */
const desktopEntryExecutable = launcherTarget.startsWith('$pico_install_dir/')
  ? join(dirname(entryCommand), launcherTarget.slice('$pico_install_dir/'.length))
  : launcherTarget;
assert(desktopEntryExecutable.startsWith('/'),
  `The installed launcher execs ${launcherTarget}, which resolves to no absolute `
  + 'installed path.');
const singletonExecutable = installedSingletonExecutable(reachabilityProbe);
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
/**
 * **Declared, not measured.** `Notification.isSupported()` answers a question
 * about the *host* - whether libnotify is there to load - and this gate
 * builds a package. It was asserted directly and passed on the machine it was
 * written on, then failed on a CI runner where nothing installs the runtime
 * dependencies: the lifecycle probe unpacks into a temporary root with
 * `dpkg --root`, which resolves nothing on purpose.
 *
 * What the package owes is the dependency, and that is checkable anywhere.
 * Whether a given desktop can then show a notification is weighed by the
 * two-door rule below, where every other host fact is weighed.
 */
const declaredDependencies = run('dpkg-deb', ['--field', artifact, 'Depends']).stdout;
assert(/(^|[\s,])libnotify4([\s,|]|$)/u.test(declaredDependencies),
  'The package does not depend on libnotify4, so an install can leave the '
  + `notification door shut on a desktop that would host it: ${declaredDependencies.trim()}`);
process.stdout.write(`ADR 0130 E1: the packaged runtime reports notifications ${
  reachabilityProbe.notificationsSupported === true ? 'supported' : 'unsupported'
} on this host, which is a fact about the host and not about the package.\n`);

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
// Required like xvfb-run above rather than skipped when absent: a release
// gate that silently downgrades its one GNOME-shaped assertion to a stdout
// line stops running it forever on the machine that lost the tool. Found
// through PATH, because /usr/bin is not where every distribution keeps it.
assert(run('which', ['dbus-run-session'], {}, 'pipe', undefined, [0, 1]).stdout.trim() !== '',
  'dbus-run-session is required for the ADR 0130 E1 no-tray-host negative test.');
const withoutHost = temporaryRoot('pico-companion-nohost-');
const negative = runReachabilityProbe(withoutHost, ['dbus-run-session', '--']);
assert(negative.secondLaunchRaisedTheFirst === true,
  'On a session with no tray host, launching the companion a second time did not '
  + 'raise the running one - which would leave stock GNOME with no door at all.');
assert(negative.notificationOpensTheWindow === true,
  'On a session with no tray host, the notification does not open the window.');
/**
 * The shipping rule itself, run against the desktop this test constructs.
 * Stock GNOME is "no tray host, and the shell owns org.freedesktop.
 * Notifications": the private bus provides the absence and the product facts
 * were measured under it; the daemon is the one constructed fact, because
 * dbus-run-session's bare bus hosts nothing and GNOME does. Without this,
 * ADR 0130 E1's two-door contract was only ever machine-checked against a
 * developer session with every door open.
 */
const gnomeShapedDoors = readPicoCompanionDoors({
  statusNotifierHost: false,
  desktopEntryInstalled,
  desktopEntryExecutable,
  singletonExecutable: installedSingletonExecutable(negative),
  secondLaunchRaisedTheFirst: negative.secondLaunchRaisedTheFirst,
  notificationDaemon: true,
  /**
   * Constructed with the daemon, and for the same reason: stock GNOME has
   * libnotify and a notification service, and this test asks what the package
   * ships on *that* desktop. A build machine without libnotify is not the
   * desktop under test - measuring it here would make the GNOME-shaped
   * assertion depend on which packages the runner happens to carry.
   */
  notificationsSupported: true,
  notificationOpensTheWindow: negative.notificationOpensTheWindow,
});
const shipsWithoutTray = assertPicoCompanionReachability(gnomeShapedDoors);
process.stdout.write('ADR 0130 E1: with no tray host, the package still ships through '
  + `${shipsWithoutTray.join(' and ')}.\n`);
removeTemporaryRoot(withoutHost);

/**
 * ADR 0130 E1's two-door rule against the desktop this actually runs on -
 * and only when there is one.
 *
 * A desktop session names itself: every environment sets
 * `XDG_CURRENT_DESKTOP`, and a build machine running an X server under
 * `xvfb-run` does not. Without that test the rule would be applied to a
 * runner whose bus was autolaunched by the first `gdbus` call and owns
 * nothing - a machine with no tray host, no notification daemon and no
 * person, which fails the contract for a reason that says nothing about the
 * package. A gate that is expected to fail where it is run is a gate people
 * learn to explain away (ADR 0113 C3 records what that costs).
 */
const namedDesktop = (process.env.XDG_CURRENT_DESKTOP ?? '').trim() !== '';
const sessionBus = namedDesktop
  ? dbusNameOwners([
    'org.kde.StatusNotifierWatcher',
    'org.freedesktop.Notifications',
  ])
  : null;
if (sessionBus === null) {
  process.stdout.write(`ADR 0130 E1: ${namedDesktop
    ? 'no session bus answered here'
    : 'no desktop session names itself here'}, so which doors a desktop hosts was `
    + 'not measured. The product-side facts above were asserted, and the '
    + 'GNOME-shaped negative test ran; run this on a desktop session to check the '
    + 'two-door contract against a real one.\n');
} else {
  const doors = readPicoCompanionDoors({
    statusNotifierHost: sessionBus['org.kde.StatusNotifierWatcher'] === true
      && statusNotifierHostRegistered(),
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
    assert(run('which', ['xvfb-run'], {}, 'pipe', undefined, [0, 1]).stdout.trim() !== '',
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
  } catch (error) {
    // With file-descriptor stdio, run() has no stdout or stderr to quote; the
    // evidence is in the output file, which the exit cleanup deletes with the
    // temporary root. Quoted here or lost.
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}\nReachability probe output (tail):\n${
      reachabilityOutputTail(outputPath)}`);
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

function reachabilityOutputTail(path) {
  try {
    return readFileSync(path, 'utf8').slice(-4_000) || '(the probe wrote nothing)';
  } catch {
    return '(no probe output file was written)';
  }
}

/**
 * The probe's lock-holding executable, translated into installed-path space.
 *
 * The probe runs out of a temporary extraction, so the path it reports starts
 * there; after a real install the same file lives at that path with the root
 * stripped. A probe raised by anything outside this extraction - a stale
 * system-wide companion, say - is refused rather than translated, because its
 * doors would have been measured on last month's binary.
 */
function installedSingletonExecutable(report) {
  const executablePath = String(report.executable);
  const prefix = `${extractionRoot}${sep}`;
  assert(executablePath.startsWith(prefix),
    `The companion holding the single-instance lock ran from ${executablePath}, `
    + 'which is outside the extracted package under test.');
  return `/${relative(extractionRoot, executablePath)}`;
}

/**
 * Which of these bus names somebody owns, or `null` when there is no desktop
 * session to ask - a headless build machine, which is a different thing from
 * a desktop that hosts nothing.
 *
 * Two ways to be headless, and both are `null`. No graphical session:
 * systemd's dbus-user-session exports a bus address over plain ssh, where "no
 * tray host and no notification daemon" is the machine's normal state rather
 * than a broken desktop, so the address alone proves nothing. And a bus that
 * does not answer: the tools exit 1 for a dead socket exactly as they do for
 * an unowned name, so only their error text separates "nobody owns it" from
 * "nobody answered" - anything but the named no-owner error stays unmeasured.
 *
 * `gdbus` then `busctl`, because neither is guaranteed and the answer is
 * worth a second attempt. A missing tool is also `null`: an unmeasured name
 * must not read as an absent one, or a build box without glib would report
 * every desktop as broken.
 */
function dbusNameOwners(names) {
  if (process.env.DBUS_SESSION_BUS_ADDRESS === undefined
    || (process.env.DISPLAY === undefined && process.env.WAYLAND_DISPLAY === undefined)) {
    return null;
  }
  const ask = (name) => {
    const viaGdbus = spawnSync('gdbus', [
      'call', '--session', '--dest', 'org.freedesktop.DBus',
      '--object-path', '/org/freedesktop/DBus',
      '--method', 'org.freedesktop.DBus.GetNameOwner', name,
    ], { encoding: 'utf8', timeout: 10_000 });
    if (viaGdbus.error === undefined) {
      if (viaGdbus.status === 0) {
        return true;
      }
      if (viaGdbus.status === 1
        && viaGdbus.stderr.includes('org.freedesktop.DBus.Error.NameHasNoOwner')) {
        return false;
      }
    }
    const viaBusctl = spawnSync('busctl', ['--user', 'status', name], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (viaBusctl.error === undefined) {
      if (viaBusctl.status === 0) {
        return true;
      }
      // ENXIO is busctl's "the name resolved to nobody"; connection failures
      // word themselves differently and must stay unmeasured.
      if (viaBusctl.status === 1
        && viaBusctl.stderr.includes('Failed to get credentials')) {
        return false;
      }
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

/**
 * Whether the watcher has a host, which is not whether a watcher exists.
 *
 * The StatusNotifier protocol splits them: panels register as hosts with the
 * watcher, and the watcher exposes `IsStatusNotifierHostRegistered` precisely
 * because it can outlive every panel. A leftover watcher after a crashed
 * panel still owns the name while an icon would render nowhere, so ownership
 * alone is not the fact the tray door needs. An unreadable property counts as
 * no host - an unmeasured fact is a closed door.
 */
function statusNotifierHostRegistered() {
  const viaGdbus = spawnSync('gdbus', [
    'call', '--session', '--dest', 'org.kde.StatusNotifierWatcher',
    '--object-path', '/StatusNotifierWatcher',
    '--method', 'org.freedesktop.DBus.Properties.Get',
    'org.kde.StatusNotifierWatcher', 'IsStatusNotifierHostRegistered',
  ], { encoding: 'utf8', timeout: 10_000 });
  if (viaGdbus.error === undefined && viaGdbus.status === 0) {
    return viaGdbus.stdout.includes('true');
  }
  const viaBusctl = spawnSync('busctl', [
    '--user', 'get-property', 'org.kde.StatusNotifierWatcher',
    '/StatusNotifierWatcher', 'org.kde.StatusNotifierWatcher',
    'IsStatusNotifierHostRegistered',
  ], { encoding: 'utf8', timeout: 10_000 });
  if (viaBusctl.error === undefined && viaBusctl.status === 0) {
    return viaBusctl.stdout.includes('true');
  }
  return false;
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

/**
 * Ein Verzeichnis entfernen, in das noch jemand schreibt (Befund B114).
 *
 * **Der Anlass ist ein Riss im letzten Kettenschritt** (2026-09-09):
 * `ENOTEMPTY: directory not empty, rmdir '/tmp/pico-companion-nohost-...'`.
 * Die Ursache steht dreissig Zeilen ueber der Probe in dieser Datei: ein
 * privater Bus aktiviert `xdg-desktop-portal` bei Bedarf, und der aktivierte
 * Dienst *ueberlebt den Begleiter*. Sein `XDG_CACHE_HOME` zeigt in genau
 * dieses Verzeichnis - `rmSync` loescht die Kinder, der Dienst legt eines
 * nach, und `rmdir` scheitert.
 *
 * **Warum nicht aufzaehlen und beenden:** welche Dienste ein Bus aktiviert,
 * entscheidet der Bus. "Bei Bedarf" heisst, dass diese Menge uns nicht
 * gehoert.
 *
 * **Und warum nicht `maxRetries`**, obwohl Node es genau fuer `ENOTEMPTY`
 * anbietet: es wiederholt die *fehlgeschlagene Operation*, also das `rmdir`
 * auf einem Verzeichnis, dessen neue Kinder der Gang nie wieder ansieht.
 * Nachgestellt gegen einen fremden Prozess, der weiterschreibt:
 *
 * | | Schreiber 0,5 s | Schreiber 3 s |
 * |---|---|---|
 * | einmal | `ENOTEMPTY` nach 0,12 s | `ENOTEMPTY` nach 0,12 s |
 * | `maxRetries: 6` | `ENOTEMPTY` nach 2,2 s | `ENOTEMPTY` nach 2,2 s |
 * | ganzer Gang wiederholt | **entfernt nach 0,72 s** | **entfernt nach 3,3 s** |
 *
 * Nodes Wiederholung half in keinem Fall. Wiederholt wird deshalb der *ganze*
 * Gang, bis er durchgeht oder zehn Sekunden um sind - danach faellt es weiter,
 * denn ein Verzeichnis, in das nach zehn Sekunden noch geschrieben wird, ist
 * eine Auskunft und kein Aufraeumproblem.
 */
function sleepMs(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function removeDirectoryWhileSomethingMayStillWrite(root) {
  const deadline = Date.now() + temporaryRootRemovalDeadlineMs;
  for (;;) {
    try {
      rmSync(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error;
      }
      sleepMs(100);
    }
  }
}

function removeTemporaryRoot(root) {
  reclaimTemporaryRoot(root);
  removeDirectoryWhileSomethingMayStillWrite(root);
  temporaryRoots.delete(root);
}

function cleanupTemporaryRoots() {
  for (const root of temporaryRoots) {
    try {
      reclaimTemporaryRoot(root, false);
      removeDirectoryWhileSomethingMayStillWrite(root);
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
