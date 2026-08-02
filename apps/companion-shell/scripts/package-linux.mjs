import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import electronExecutable from 'electron';

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = join(dirname(scriptPath), '..');
const repoRoot = join(appRoot, '..', '..');
const packageJson = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));

export function buildPicoCompanionLinuxPackage() {
  assertLinuxAmd64();
  const workRoot = mkdtempSync(join(tmpdir(), 'pico-companion-package-'));
  const deployedApp = join(workRoot, 'deployed-app');
  const packageRoot = join(workRoot, 'package-root');
  const installRoot = join(packageRoot, 'opt', 'pico-companion');
  const outputRoot = join(appRoot, 'out');
  const artifact = join(
    outputRoot,
    `pico-companion_${packageJson.version}_amd64.deb`,
  );

  try {
    deployProductionWorkspace(deployedApp);
    sanitizeDeployedApp(deployedApp);
    mkdirSync(installRoot, { recursive: true });
    cpSync(dirname(electronExecutable), installRoot, {
      recursive: true,
      preserveTimestamps: true,
    });
    renameSync(
      join(installRoot, basename(electronExecutable)),
      join(installRoot, 'pico-companion-bin'),
    );
    cpSync(deployedApp, join(installRoot, 'resources', 'app'), {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    writeLauncher(installRoot);
    chmodSync(join(installRoot, 'pico-companion-bin'), 0o755);
    chmodSync(join(installRoot, 'chrome-sandbox'), 0o4755);

    writeDesktopEntries(packageRoot);
    writeDebianControl(packageRoot, directorySizeBytes(installRoot));
    mkdirSync(outputRoot, { recursive: true });
    const result = run('dpkg-deb', [
      '--root-owner-group',
      '--build',
      packageRoot,
      artifact,
    ], {
      SOURCE_DATE_EPOCH: sourceDateEpoch(),
    });
    if (!existsSync(artifact)) {
      throw new Error(`Linux package was not created: ${result.stdout}`);
    }
    const checksum = run('sha256sum', [artifact]).stdout.trim().split(/\s+/)[0];
    writeFileSync(`${artifact}.sha256`, `${checksum}  ${basename(artifact)}\n`);
    return { artifact, checksum };
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

function assertLinuxAmd64() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error(
      `ADR 0113 C3 currently packages the reference linux/amd64 build, got `
        + `${process.platform}/${process.arch}.`,
    );
  }
  const electronVersion = readFileSync(
    join(dirname(electronExecutable), 'version'),
    'utf8',
  ).trim();
  const expectedVersion = JSON.parse(
    readFileSync(join(appRoot, 'electron-support.json'), 'utf8'),
  ).latestStableVersion;
  if (electronVersion !== expectedVersion) {
    throw new Error(
      `Electron distribution ${electronVersion} does not match reviewed ${expectedVersion}.`,
    );
  }
}

function deployProductionWorkspace(target) {
  const modulesYaml = readFileSync(join(repoRoot, 'node_modules', '.modules.yaml'), 'utf8');
  const installedStore = /^storeDir:\s*(.+)$/m.exec(modulesYaml)?.[1]?.trim();
  if (installedStore === undefined) {
    throw new Error('Cannot locate the pnpm store used by the installed workspace.');
  }
  const storeDir = installedStore.replace(/\/v\d+$/, '');
  run('pnpm', [
    '--offline',
    '--store-dir',
    storeDir,
    '--filter',
    '@pico/companion-shell',
    'deploy',
    '--prod',
    target,
  ], {}, 'inherit');
}

function sanitizeDeployedApp(target) {
  for (const path of ['src', 'scripts', 'tsconfig.json']) {
    rmSync(join(target, path), { recursive: true, force: true });
  }
  // pnpm deploy retains a convenience link back to the selected workspace
  // package. It is never needed at runtime and would leak the build path.
  rmSync(
    join(target, 'node_modules', '.pnpm', 'node_modules', '@pico', 'companion-shell'),
    { force: true },
  );
  rmSync(join(target, 'node_modules', '.modules.yaml'), { force: true });
  rmSync(join(target, 'node_modules', '.bin'), { recursive: true, force: true });
  rmSync(join(target, 'node_modules', '.pnpm', 'lock.yaml'), { force: true });
  removeBuildOnlyFiles(join(target, 'dist'));
  sanitizeDeployedPicoPackages(target);
  writeFileSync(join(target, 'package.json'), `${JSON.stringify({
    name: 'pico-companion',
    version: packageJson.version,
    private: true,
    license: packageJson.license,
    type: 'module',
    main: 'dist/main.js',
  }, null, 2)}\n`);
  cpSync(join(repoRoot, 'LICENSE'), join(target, 'LICENSE'));
}

function sanitizeDeployedPicoPackages(target) {
  const virtualStore = join(target, 'node_modules', '.pnpm');
  for (const entry of readdirSync(virtualStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('@pico+')) {
      continue;
    }
    const scopeRoot = join(virtualStore, entry.name, 'node_modules', '@pico');
    if (!existsSync(scopeRoot)) {
      continue;
    }
    for (const packageEntry of readdirSync(scopeRoot, { withFileTypes: true })) {
      if (!packageEntry.isDirectory() && !packageEntry.isSymbolicLink()) {
        continue;
      }
      const packageRoot = join(scopeRoot, packageEntry.name);
      for (const path of ['src', 'scripts', 'tsconfig.json']) {
        rmSync(join(packageRoot, path), { recursive: true, force: true });
      }
      rmSync(join(packageRoot, 'node_modules', '.bin'), {
        recursive: true,
        force: true,
      });
      const dist = join(packageRoot, 'dist');
      if (existsSync(dist)) {
        removeBuildOnlyFiles(dist);
      }
    }
  }
}

function removeBuildOnlyFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      removeBuildOnlyFiles(path);
    } else if (
      entry.name.includes('.test.')
      || entry.name.startsWith('electron-smoke.')
      || entry.name.endsWith('.map')
      || entry.name.endsWith('.d.ts')
      || entry.name.endsWith('.d.cts')
    ) {
      rmSync(path);
    }
  }
}

function writeDesktopEntries(packageRoot) {
  const desktopEntry = `[Desktop Entry]
Type=Application
Version=1.0
Name=Pico Companion
Comment=Local-first Pico companion
Exec=/opt/pico-companion/pico-companion
Terminal=false
Categories=Utility;
StartupNotify=false
`;
  const applicationDirectory = join(packageRoot, 'usr', 'share', 'applications');
  const autostartDirectory = join(packageRoot, 'etc', 'xdg', 'autostart');
  mkdirSync(applicationDirectory, { recursive: true });
  mkdirSync(autostartDirectory, { recursive: true });
  writeFileSync(join(applicationDirectory, 'pico-companion.desktop'), desktopEntry, {
    mode: 0o644,
  });
  writeFileSync(
    join(autostartDirectory, 'pico-companion.desktop'),
    `${desktopEntry}X-GNOME-Autostart-enabled=true\n`,
    { mode: 0o644 },
  );
}

function writeLauncher(installRoot) {
  const launcher = `#!/bin/sh
set -eu
# ADR 0123 Z3: every supported launch path disables core dumps before
# Electron or the companion's secret-bearing service core starts.
ulimit -S -c 0
ulimit -H -c 0
pico_install_dir=\${0%/*}
exec "$pico_install_dir/pico-companion-bin" "$@"
`;
  writeFileSync(join(installRoot, 'pico-companion'), launcher, { mode: 0o755 });
}

function writeDebianControl(packageRoot, installedBytes) {
  const debianDirectory = join(packageRoot, 'DEBIAN');
  mkdirSync(debianDirectory, { recursive: true });
  writeFileSync(join(debianDirectory, 'control'), `Package: pico-companion
Version: ${packageJson.version}
Section: utils
Priority: optional
Architecture: amd64
Installed-Size: ${Math.ceil(installedBytes / 1_024)}
Maintainer: Pico Project
Depends: libasound2 | libasound2t64, libatspi2.0-0, libdrm2, libgbm1, libgtk-3-0 | libgtk-3-0t64, libnotify4, libnss3, libxss1, libxtst6, xdg-utils
Description: Local-first Pico companion shell
 Background tray shell for the local Pico companion service core.
`, { mode: 0o644 });
}

function directorySizeBytes(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeBytes(path);
    } else if (!entry.isSymbolicLink()) {
      total += statSync(path).size;
    }
  }
  return total;
}

function sourceDateEpoch() {
  const configured = process.env.SOURCE_DATE_EPOCH;
  if (configured !== undefined) {
    if (!/^\d+$/.test(configured)) {
      throw new Error('SOURCE_DATE_EPOCH must be an unsigned integer.');
    }
    return configured;
  }
  return run('git', ['show', '-s', '--format=%ct', 'HEAD']).stdout.trim();
}

function run(command, args, extraEnvironment = {}, stdio = 'pipe') {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnvironment },
    stdio,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: `
        + `${result.error?.message ?? result.stderr ?? result.stdout ?? result.status}`,
    );
  }
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildPicoCompanionLinuxPackage();
  process.stdout.write(`${JSON.stringify({
    schema: 'pico.companion.linux-package.v1',
    artifact: result.artifact,
    checksum: result.checksum,
  })}\n`);
}
