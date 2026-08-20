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
 * One rule for how a key fingerprint is shown to a person.
 *
 * **Written 2026-08-20 after finding three spellings in one client.** The
 * shell-free core shortened head-and-tail; the Electron main process carried
 * a byte-identical private copy of that rule; the renderer contract took a
 * bare twelve-character prefix. A host-key rotation therefore reached one
 * person as `a1b2c3d4…7f8e9d0c` in the notification and `a1b2c3d4e5f6` in the
 * window - one key, one event, two names.
 *
 * ADR 0079 I5 leaves the display form to "the surfaces that show them", so
 * this is that decision for this surface, made once in
 * `@pico/companion/fingerprint` and checked here because ADR 0131 A5 makes
 * Android the second client that will show these strings.
 *
 * **The renderer is checked too, and told something different.** Renderer-
 * reachable files resolve relative paths only - the window loads plain ESM
 * under a `script-src 'self'` policy - so a bare `@pico/companion/...`
 * specifier there compiles, passes every test and breaks the window. For a
 * few hours on 2026-08-20 that was an exemption and two sites kept their own
 * slice; then the records started crossing IPC with the rendered string
 * beside the hex, which is what ADR 0113 C2 asks for anyway, and the
 * exemption became a worse answer than the fix. What is left is the advice:
 * a window that shortens is a window deciding a rendering, and the main
 * process is where that decision belongs.
 */
const rendererReachable = new Set(['contract.ts', 'renderer.ts', 'model-provider-views.ts']);
/**
 * Two files shorten a fingerprint and are right to.
 *
 * An id derived from a fingerprint is not a fingerprint shown to a person: it
 * is a key in a record, never read aloud, never compared by eye, and changing
 * its length would rename every row that already exists. Both are already
 * one derivation with one caller each, argued in their own doc comments, and
 * the check found the second of them on its first run - which is the useful
 * kind of false positive, because it made the distinction explicit instead of
 * leaving it in somebody's head. A third one appearing here should be argued
 * the same way rather than appended.
 */
const derivesAnIdentifier = new Map([
  ['presence.ts', 'picoPresenceIdForDeviceSigningKey - the row a device is joined on'],
  ['domain-read-grant.ts', 'the grant id a privacy domain is recorded under'],
]);
const fingerprintSlice = /(\w*[Ff]ingerprintHex)\s*(?:\}\s*)?\.slice\s*\(/g;
/**
 * And the same defect one field over: an instant cut to ten characters.
 *
 * `'2027-01-01T23:30:00.000Z'.slice(0, 10)` is the *UTC* calendar day wearing
 * no label, which is the wrong day for every reader east of UTC after their
 * evening - roughly one row in twelve for Vienna, and a day and a half out on
 * Kiritimati. The window did it in six places and the core printed the raw
 * instant into an alarm a person has forty-eight hours to act on. One rule
 * now, `picoCompanionDisplayDate` and `picoCompanionDisplayInstant` in
 * `@pico/companion/when`, ICU-free because the runtime Android uses has no
 * `Intl` at all (ADR 0131 A1).
 */
const instantSlice = /(\w*(?:At|Until))\s*(?:\}\s*)?\.slice\s*\(0,\s*10\)/g;
/**
 * And the arithmetic behind it, which the window also did.
 *
 * "That is today", printed under a row whose own date said tomorrow: the
 * expiry warning divided the difference by twenty-four hours, and an
 * authority ending at 00:30 the next night is an hour and a half away at
 * 23:00. Days a person counts are midnights, not blocks, and a day is not
 * always twenty-four hours anyway - Vienna has one of twenty-three every
 * March. The count crosses IPC now, from `picoCompanionCalendarDaysUntil`.
 *
 * Only the window is asked about this: a day-length constant in the main
 * process or the core is ordinary (`first-run.ts` builds a year from one),
 * and it is the *rendering* side doing calendar arithmetic that has been
 * wrong twice.
 */
const dayArithmetic = /(?:24\s*\*\s*60\s*\*\s*60|86_?400_?000)/g;
let fingerprintRuleFiles = 0;
for (const root of [join(companionRoot, 'src'), join(shellRoot, 'src')]) {
  for (const file of listSourceFiles(root)) {
    const name = file.slice(file.lastIndexOf('/') + 1);
    if (name.endsWith('.test.ts') || name === 'fingerprint.ts' || derivesAnIdentifier.has(name)) {
      continue;
    }
    const content = readFileSync(file, 'utf8');
    if (rendererReachable.has(name)) {
      for (const _ of content.matchAll(dayArithmetic)) {
        fingerprintRuleFiles += 1;
        errors.push(
          `${relative(repoRoot, file)}: counts days from a length in milliseconds, in the window. `
          + 'Days a person counts are midnights - a day is twenty-three hours once a year - and '
          + 'this is how "That is today" came to sit under a date that said tomorrow. '
          + '`picoCompanionCalendarDaysUntil` counts them, in the main process, and the number '
          + 'crosses with the row.',
        );
      }
    }
    for (const [, symbol] of content.matchAll(instantSlice)) {
      fingerprintRuleFiles += 1;
      errors.push(
        `${relative(repoRoot, file)}: cuts \`${symbol}\` to ten characters. That is the UTC `
        + 'calendar day with nothing saying so, and it is the wrong day for a reader whose '
        + 'evening is past midnight in UTC. `picoCompanionDisplayDate` in `@pico/companion/when` '
        + `answers in the reader's own day${rendererReachable.has(name)
          ? ', and this file runs in the window - so the main process has to render it and send '
            + 'it across (ADR 0113 C2).'
          : '.'}`,
      );
    }
    for (const [, symbol] of content.matchAll(fingerprintSlice)) {
      fingerprintRuleFiles += 1;
      errors.push(rendererReachable.has(name)
        ? `${relative(repoRoot, file)}: shortens \`${symbol}\` in the window. This file runs in `
          + 'the renderer, where a bare `@pico/companion/...` import breaks at runtime and passes '
          + 'every test - so it cannot reach the one rule, and it must not invent a second. Send '
          + 'the shortened string across IPC beside the hex, rendered in the main process (ADR '
          + '0113 C2).'
        : `${relative(repoRoot, file)}: shortens \`${symbol}\` with its own slice. How a key is `
          + 'shown to a person is one decision for this client - `picoCompanionDisplayFingerprint` '
          + 'in `@pico/companion/fingerprint` - because a second spelling means one key reaches one '
          + 'person under two names, which is how this check came to exist.');
    }
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
  + `${fingerprintRuleFiles === 0 ? ' one rule each for showing a fingerprint and a day' : ` ${fingerprintRuleFiles} home-made renderings`}`
  + ', the window included).',
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
