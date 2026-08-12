import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR 0113: the companion service core is shell-free, and the boundary is
 * checked, not aspired to. A later Electron shell layer lives outside
 * `apps/companion/src` (or in an explicitly allowlisted `src/shell/`
 * directory once C2 lands); until then no shell dependency and no shell
 * import may appear in the service core at all.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const companionRoot = join(repoRoot, 'apps', 'companion');
const shellRoot = join(repoRoot, 'apps', 'companion-shell');
const shellModulePattern = /^(electron|@electron\/|electron-)/;
const importPattern = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

const errors = [];

const packageJson = JSON.parse(readFileSync(join(companionRoot, 'package.json'), 'utf8'));
for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const name of Object.keys(packageJson[section] ?? {})) {
    if (shellModulePattern.test(name)) {
      errors.push(`apps/companion/package.json ${section} must not contain the shell dependency ${name}.`);
    }
  }
}

for (const file of listSourceFiles(join(companionRoot, 'src'))) {
  const content = readFileSync(file, 'utf8');
  for (const match of content.matchAll(importPattern)) {
    if (shellModulePattern.test(match[1])) {
      errors.push(`${relative(repoRoot, file)}: service core must not import shell module ${match[1]}.`);
    }
  }
}

const shellPackageJson = JSON.parse(readFileSync(join(shellRoot, 'package.json'), 'utf8'));
const electronSupport = JSON.parse(
  readFileSync(join(shellRoot, 'electron-support.json'), 'utf8'),
);
if (shellPackageJson.devDependencies?.electron !== electronSupport.latestStableVersion) {
  errors.push('apps/companion-shell must pin the reviewed Electron runtime exactly.');
}
for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  if (shellPackageJson[section]?.electron !== undefined) {
    errors.push(`apps/companion-shell keeps Electron in devDependencies, not ${section}.`);
  }
}

for (const rendererFile of ['contract.ts', 'renderer.ts']) {
  const path = join(shellRoot, 'src', rendererFile);
  const content = readFileSync(path, 'utf8');
  for (const match of content.matchAll(importPattern)) {
    if (match[1] === 'electron' || match[1].startsWith('node:')) {
      errors.push(`${relative(repoRoot, path)}: renderer-reachable code must not import ${match[1]}.`);
    }
  }
}

const preload = readFileSync(join(shellRoot, 'src', 'preload.cts'), 'utf8');
if (!preload.includes("contextBridge.exposeInMainWorld('picoCompanion'")) {
  errors.push('apps/companion-shell preload must expose the named picoCompanion bridge.');
}
if (/exposeInMainWorld\([^\n]+ipcRenderer/.test(preload)
  || /\b(?:send|invoke)\s*:\s*ipcRenderer\./.test(preload)) {
  errors.push('apps/companion-shell preload must not expose raw or generic ipcRenderer access.');
}

const rendererHtml = readFileSync(join(shellRoot, 'src', 'renderer', 'index.html'), 'utf8');
for (const requiredDirective of [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
]) {
  if (!rendererHtml.includes(requiredDirective)) {
    errors.push(`apps/companion-shell renderer CSP must contain ${requiredDirective}.`);
  }
}
if (/https?:\/\//.test(rendererHtml) || /<script(?![^>]+\bsrc=)[^>]*>/i.test(rendererHtml)) {
  errors.push('apps/companion-shell renderer must contain no remote or inline script content.');
}

/**
 * ADR 0113 C3. The Electron tray runs against a measured memory budget, and
 * that budget is checked by packaging the app, installing it and reading PSS -
 * a twenty-minute round trip that reports "225,261,568 exceeds 225,000,000"
 * and nothing about why.
 *
 * This is the cheap half of that check. It walks the tray's *static* import
 * graph and fails on a module that has no business being started with the
 * tray: the vault CLI, the daemon server, or a protocol surface published as a
 * subpath precisely so the barrel would not carry it. None of them is wrong to
 * exist - they are wrong to be loaded before the tray has done anything.
 *
 * It caught nothing when it was written, because the narrowing that prompted
 * it had already landed. It exists so the next one is a named error in a
 * second rather than a number in CI.
 *
 * The next one was `recovery-card-pdf`, and the list is what found it. The
 * tray statically reached `pdf-lib` - 1.7 MB of bundle whose parsed form is
 * private dirty memory - to issue a card during a ceremony nobody had asked
 * for yet. `main.ts` now imports it dynamically at the ceremony, and the entry
 * below keeps it that way. Worth naming how it surfaced: not from this check,
 * which did not know about the module, but from walking the hull and asking
 * what was in it. A list of forbidden modules only ever holds what someone
 * thought to forbid.
 *
 * `time-bound-entry` was on this list and came off it deliberately: the tray
 * now reads which entries are due and needs that vocabulary. The list is for
 * modules with no business starting with the tray, not a freeze on the graph -
 * so coming off it is a decision someone has to make and write down, which is
 * the whole value of having it.
 */
const trayEntry = join(shellRoot, 'src', 'main.ts');
const trayForbidden = [
  { file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'cli.ts'), why: 'the vault CLI' },
  { file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'daemon.ts'), why: 'the daemon server' },
  { file: join(repoRoot, 'packages', 'protocol', 'src', 'planner-reader.ts'), why: 'a subpath-published protocol surface' },
  { file: join(repoRoot, 'packages', 'protocol', 'src', 'offline-floor.ts'), why: 'a subpath-published protocol surface' },
  { file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'recovery-card-pdf.ts'), why: 'the Recovery Card PDF generator, which reaches pdf-lib' },
];

const workspaceRoots = new Map();
for (const group of ['packages', 'apps']) {
  for (const entry of readdirSync(join(repoRoot, group))) {
    const manifest = join(repoRoot, group, entry, 'package.json');
    if (!existsSync(manifest)) {
      continue;
    }
    workspaceRoots.set(
      JSON.parse(readFileSync(manifest, 'utf8')).name,
      join(repoRoot, group, entry, 'src'),
    );
  }
}

// `import type` is erased before anything runs, so it costs the tray nothing
// and must not be walked - flagging one would be a false positive whose
// natural fix is an exemption.
const typeOnly = /(?:^|[^\w$])(?:import|export)\s+type\s[^'"]*$/u;

function resolveTrayImport(specifier, fromFile) {
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(fromFile), specifier).replace(/\.js$/u, '');
    for (const candidate of [`${base}.ts`, join(base, 'index.ts'), `${base}.cts`]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  }
  for (const [name, root] of workspaceRoots) {
    if (specifier === name) {
      const candidate = join(root, 'index.ts');
      return existsSync(candidate) ? candidate : null;
    }
    if (specifier.startsWith(`${name}/`)) {
      const rest = specifier.slice(name.length + 1).replace(/\.js$/u, '');
      for (const candidate of [join(root, `${rest}.ts`), join(root, rest, 'index.ts')]) {
        if (existsSync(candidate)) {
          return candidate;
        }
      }
      return null;
    }
  }
  return null;
}

const trayReached = new Set();
const trayQueue = [trayEntry];
while (trayQueue.length > 0) {
  const file = trayQueue.pop();
  if (trayReached.has(file)) {
    continue;
  }
  trayReached.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:^|[^\w$])(?:from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const preceding = source.slice(0, match.index + match[0].length - match[1].length - 2);
    if (typeOnly.test(preceding)) {
      continue;
    }
    const resolved = resolveTrayImport(match[1], file);
    if (resolved !== null) {
      trayQueue.push(resolved);
    }
  }
}

for (const { file, why } of trayForbidden) {
  if (trayReached.has(file)) {
    errors.push(
      `apps/companion-shell tray start must not statically reach ${relative(repoRoot, file)} (${why}); `
      + 'import a narrow subpath, or load it dynamically where it is used.',
    );
  }
}

if (errors.length > 0) {
  console.error('Companion shell-boundary check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  'Companion shell-boundary check passed'
  + ` (tray start reaches ${trayReached.size} modules).`,
);

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.mjs')) {
      files.push(path);
    }
  }
  return files;
}
