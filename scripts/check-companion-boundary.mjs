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

/**
 * The two channel lists, against each other.
 *
 * `preload.cts` is CommonJS loaded by Electron before the app's own module
 * graph exists, so it cannot import `contract.ts` and keeps its own copy of
 * the names. That makes this the case where a check has to stand in for an
 * import: two closed lists over one subject drift, and here the drift is
 * silent - a channel the main process handles and the preload never names is
 * a surface nobody can reach, and a channel the preload names and nothing
 * handles is a call that hangs.
 *
 * Names *and* values, because either half can drift alone: the same key
 * pointing at two different strings is the version of this that still reads
 * correctly in both files.
 */
const channelEntries = (source, block) => {
  const body = new RegExp(`${block}[\\s\\S]*?\\n\\}\\)`, 'u').exec(source)?.[0] ?? '';
  return new Map([...body.matchAll(/^\s{2}(\w+):\s*'([^']+)',$/gmu)]
    .map(([, name, value]) => [name, value]));
};
const contractPath = join(shellRoot, 'src', 'contract.ts');
const contractChannels = channelEntries(
  readFileSync(contractPath, 'utf8'),
  'picoCompanionIpcChannels = Object\\.freeze\\(\\{',
);
const preloadChannels = channelEntries(preload, 'const channels = Object\\.freeze\\(\\{');

if (contractChannels.size === 0 || preloadChannels.size === 0) {
  errors.push('apps/companion-shell: could not read an IPC channel list to compare.');
}
for (const [name, value] of contractChannels) {
  if (!preloadChannels.has(name)) {
    errors.push(
      `apps/companion-shell preload does not name the \`${name}\` channel the contract `
      + 'declares. A channel the main process handles and the bridge never exposes is a '
      + 'surface nobody can reach.',
    );
  } else if (preloadChannels.get(name) !== value) {
    errors.push(
      `apps/companion-shell: channel \`${name}\` is '${value}' in the contract and `
      + `'${preloadChannels.get(name)}' in the preload.`,
    );
  }
}
for (const name of preloadChannels.keys()) {
  if (!contractChannels.has(name)) {
    errors.push(
      `apps/companion-shell contract does not declare the \`${name}\` channel the preload `
      + 'exposes. A call with nothing behind it hangs.',
    );
  }
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

/**
 * ADR 0131 A1. What the shell-free core would have to carry onto a phone.
 *
 * The tray walk above asks what an Electron main process starts with. This
 * one asks a different question with the same technique: what does
 * `apps/companion` itself reach, since that is the code an Android runtime
 * would host. Measured on 2026-08-18, it reached the vault CLI, the daemon
 * *server* and `reader-access` - the last of which needs
 * `node:worker_threads`, the built-in least likely to exist on a mobile JS
 * runtime - because two modules imported the `@pico/vault-daemon` barrel to
 * open a socket.
 *
 * Forbidding them here rather than remembering: the same import will look
 * harmless again the next time somebody needs one symbol from that package.
 */
const clientForbidden = [
  {
    file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'cli.ts'),
    why: 'the vault CLI, which is a tool rather than part of any client (ADR 0105)',
  },
  {
    file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'daemon.ts'),
    why: 'the daemon server, which a client talks to rather than contains',
  },
  {
    file: join(repoRoot, 'apps', 'vault-daemon', 'src', 'reader-access.ts'),
    why: 'the reader-access worker, which reaches node:worker_threads',
  },
];

const clientReached = new Set();
const clientQueue = listSourceFiles(join(repoRoot, 'apps', 'companion', 'src'))
  .filter((file) => !file.endsWith('.test.ts'));
while (clientQueue.length > 0) {
  const file = clientQueue.pop();
  if (clientReached.has(file)) {
    continue;
  }
  clientReached.add(file);
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:^|[^\w$])(?:from\s+|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
    const preceding = source.slice(0, match.index + match[0].length - match[1].length - 2);
    if (typeOnly.test(preceding)) {
      continue;
    }
    const resolved = resolveTrayImport(match[1], file);
    if (resolved !== null) {
      clientQueue.push(resolved);
    }
  }
}

for (const { file, why } of clientForbidden) {
  if (clientReached.has(file)) {
    errors.push(
      `apps/companion must not statically reach ${relative(repoRoot, file)} (${why}); `
      + 'import a narrow subpath from @pico/vault-daemon.',
    );
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

/**
 * Two rules used to live here, and both have moved for the same reason.
 *
 * How a key fingerprint is shown to a person, and how an instant is, were
 * checked over `apps/companion` and `apps/companion-shell` - so on 2026-08-20
 * this check found three spellings of the first and could see no further. The
 * Vault daemon renders the sentence a person actually approves (ADR 0106),
 * right beside what the companion shows them, and it held a fourth spelling
 * of the fingerprint rule and eleven raw instants. A check named after one of
 * two surfaces that share a reader is a check with a blind spot where the
 * reader is.
 *
 * They are `check-fingerprint-display.mjs` and `check-instant-rules.mjs`
 * now, over every app and package, and the rules they guard are
 * `@pico/protocol/fingerprint-display` and `@pico/protocol/when-display`. The
 * list of renderer-reachable files all three needed is stated once, in
 * `companion-window.mjs`.
 *
 * What stays here is what was always this check's own subject: what the tray
 * start may reach, what the shell-free core may reach, and that both sides of
 * the IPC boundary name the same channels.
 *
 * **And one more, added the same day, which is the same subject seen from the
 * other side.** A prompt's `maximumLength` is the boundary between a person
 * and a parser, and the shell owns it. Seven of them were bare numbers: four
 * passphrase fields typed `1_024` against a bound `@pico/vault` enforces, the
 * membership field typed `64` against the rule beside it, and two more were
 * nobody's decision at all. They all agreed, which is the point - a field and
 * a rule holding the same number agree by coincidence, and the coincidence
 * ends the first time one of them is revisited. Then somebody chooses a
 * passphrase a prompt accepted and the Vault refuses, during founding, after
 * they have committed to it.
 *
 * So a cap must be a name. If a rule enforces it, the name comes from there;
 * if nothing does, naming it is what turns a number somebody picked into a
 * decision somebody can ask about.
 */

const promptCap = /maximumLength:\s*([0-9][0-9_]*)/g;
let namedCaps = 0;
for (const file of listSourceFiles(join(shellRoot, 'src'))) {
  const path = relative(repoRoot, file);
  if (path.endsWith('.test.ts')) {
    continue;
  }
  const content = readFileSync(file, 'utf8');
  namedCaps += (content.match(/maximumLength:/g) ?? []).length;
  for (const [, literal] of content.matchAll(promptCap)) {
    errors.push(`${path}: caps a field at the literal ${literal}. A field cap is the boundary `
      + 'between a person and a parser: if something else enforces that length, this has to read '
      + "it from there - a refusal that arrives one layer later, after somebody has typed and "
      + 'committed, is the failure this rule exists for. If nothing else enforces it, name it '
      + 'here with the reason, because a bare number beside a prompt is a decision nobody can '
      + 'find to question.');
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
  + ` (tray start reaches ${trayReached.size} modules,`
  + ` the shell-free core ${clientReached.size};`
  + ` ${contractChannels.size} IPC channels, named identically on both sides;`
  + ` ${namedCaps} field caps, each a name rather than a number;`
  + ' fingerprints and instants are checked product-wide next door).',
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
