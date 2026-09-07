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

/**
 * Die Grenze aus ADR 0113 C2 hinterlaesst eine Spur, bevor sie wirft
 * (Befund B76).
 *
 * `assertRendererSender` antwortete bis zum 2026-09-07 nur dem Absender - im
 * Ernstfall also dem, der die Grenze umgehen wollte. Electron lehnt den
 * Aufruf ab und der Hauptprozess laeuft weiter; niemand sonst erfuhr, dass es
 * versucht wurde. Dieselbe Frage ist am selben Tag im Home, im Vault-Daemon
 * und im Relay gestellt worden, und die Antwort war dreimal dieselbe: nach
 * aussen schweigen ist Absicht, nach innen schweigen war keine.
 *
 * **Was diese Regel nicht kann.** `main.ts` wird von keinem Test ausgefuehrt -
 * die Schale hat Prozess-Tests fuer das Fenster, aber keinen, der einen
 * fremden Absender erzeugt. Diese Pruefung haelt deshalb fest, dass die Zeile
 * *dasteht*, nicht dass sie laeuft. Das ist weniger, als ein Gang waere, und
 * es steht hier, statt dass jemand es fuer einen Gang haelt.
 */
const mainSource = readFileSync(join(shellRoot, 'src', 'main.ts'), 'utf8');
const senderGuard = /function assertRendererSender\([\s\S]*?\n\}/u.exec(mainSource)?.[0] ?? '';
if (!/process\.stderr\.write\(/.test(senderGuard)) {
  errors.push(
    'apps/companion-shell assertRendererSender must leave a trace before it throws: '
    + 'a refused sender is told, and nobody else is.',
  );
}
if (/senderFrame\?\.url\}|\$\{[^}]*url/u.test(senderGuard)) {
  errors.push(
    'apps/companion-shell assertRendererSender must not put the sender URL in that trace.',
  );
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

/**
 * The other two sides of the same door, added 2026-08-24.
 *
 * The comparison above holds the contract against the preload and says why:
 * "a channel the main process handles and the bridge never exposes is a
 * surface nobody can reach". It never checked that the main process handles
 * one, or that the window calls it - the two ends of the wire whose absence
 * would be exactly that.
 *
 * Measured before being written: all 57 channels were handled or sent, and all
 * 57 exposed methods called by `renderer.ts`. So this direction started green
 * with **no exemptions at all**, which is the cheapest a rule in this
 * repository gets - and it is worth having because the same shape (a door
 * with nobody behind it, or nobody in front) has been found five times in
 * other layers this month.
 *
 * **Nachgezaehlt am 2026-09-02: es sind 68**, und weiter ohne eine einzige
 * Ausnahme. Die Zahl steht datiert daneben statt an ihrer Stelle: ein Satz,
 * der eine Entscheidung mit einer Zahl begruendet, ist nur so lange wahr wie
 * die Zahl - und im Nachbarpruefer stand deshalb bis heute die Behauptung,
 * es gebe 44 (Befund B58).
 *
 * Two channels are `send` rather than `handle`: the main process pushes them
 * at the window, so a handler would be the wrong end to look for.
 */
const mainProcess = readFileSync(join(shellRoot, 'src', 'main.ts'), 'utf8');
const rendererScript = readFileSync(join(shellRoot, 'src', 'renderer.ts'), 'utf8');
let channelsAnswered = 0;
for (const [name] of contractChannels) {
  const answered = new RegExp(
    `ipcMain\\.(?:handle|on)\\(\\s*picoCompanionIpcChannels\\.${name}\\b`,
    'u',
  ).test(mainProcess);
  const pushed = new RegExp(`send\\(\\s*picoCompanionIpcChannels\\.${name}\\b`, 'u')
    .test(mainProcess);
  if (answered || pushed) {
    channelsAnswered += 1;
    continue;
  }
  errors.push(
    `apps/companion-shell: the main process neither answers nor pushes the \`${name}\` `
    + 'channel the contract declares. A call with nothing behind it hangs, which is what '
    + 'the person sees.',
  );
}

const exposed = /exposeInMainWorld\('picoCompanion', Object\.freeze\(\{([\s\S]*?)\n\}\)\)/u
  .exec(preload);
const exposedMethods = exposed === null
  ? []
  : [...exposed[1].matchAll(/^ {2}(\w+):/gmu)].map(([, name]) => name);
if (exposedMethods.length === 0) {
  errors.push(
    'apps/companion-shell: could not read the exposed bridge, so the window side of this '
    + 'comparison passed over nothing.',
  );
}
for (const method of exposedMethods) {
  if (new RegExp(`\\b${method}\\b`, 'u').test(rendererScript)) {
    continue;
  }
  errors.push(
    `apps/companion-shell: the window never calls \`${method}\`, which the bridge offers `
    + 'it. An offered call nobody makes is a surface that exists only in the preload.',
  );
}

const rendererHtml = readFileSync(join(shellRoot, 'src', 'renderer', 'index.html'), 'utf8');
/**
 * Und die Tür innerhalb des Fensters, ergänzt am 2026-08-24.
 *
 * `requireElement` wirft bei einem fehlenden Element - fail-closed, und das
 * ist die richtige Richtung. Nur wirft es **im Fenster einer Person**: ein
 * umbenanntes `id` im HTML wird zu einem Fenster, das aufgeht und nicht
 * arbeitet. Zur Commit-Zeit kostet dieselbe Frage nichts.
 *
 * Vor dem Schreiben gemessen: 101 verlangte Elemente, alle 101 im HTML, 104
 * `id`s insgesamt. Diese Richtung startet grün und ohne Ausnahme. Die andere
 * Richtung - ein `id`, das niemand verlangt - wird bewusst *nicht* geprüft:
 * drei davon sind ein Abschnitt, ein zweiter Abschnitt und der Absendeknopf
 * eines Formulars, dessen Handler am Formular hängt. Eine Regel, die die drei
 * meldet, hätte drei falsche Fehlschläge und keinen richtigen.
 *
 * **Nachgezaehlt am 2026-09-02: 114 verlangte Elemente, 118 `id`s, vier nicht
 * verlangt** - und die vier haben dieselbe Gestalt wie die drei von damals:
 * `measure-host`, `reader-custody` und `relay-claim` sind Abschnitte, und
 * `recall-ask` ist der Absendeknopf von `recall-form`, dessen Handler am
 * Formular haengt. Das Argument gilt also weiter; nur die Zahl war alt.
 */
const rendererScriptForElements = readFileSync(join(shellRoot, 'src', 'renderer.ts'), 'utf8');
const declaredIds = new Set(
  [...rendererHtml.matchAll(/id="([^"]+)"/gu)].map(([, id]) => id),
);
const requiredIds = [...new Set(
  [...rendererScriptForElements.matchAll(/require[A-Za-z]*\(\s*'([a-z0-9-]+)'\s*\)/gu)]
    .map(([, id]) => id),
)];
if (requiredIds.length === 0 || declaredIds.size === 0) {
  errors.push(
    'apps/companion-shell: read no required elements or no ids, so the window side of this '
    + 'comparison ran over nothing.',
  );
}
for (const id of requiredIds) {
  if (declaredIds.has(id)) {
    continue;
  }
  errors.push(
    `apps/companion-shell: the window script requires the element \`${id}\` and `
    + 'index.html declares no such id. `requireElement` throws, so this is a window that '
    + 'opens and does not work - and it throws where a person is looking rather than here.',
  );
}

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

/**
 * ADR 0131 A3. Ein Link-Client signiert, und Signieren braucht einen offenen
 * Vault.
 *
 * **Am 2026-08-21 gefunden, von Hand, an der einzigen Stelle, die es vergaß.**
 * Jede Operation der Runtime ruft `ensureUnlocked()`, bevor sie den
 * Geräteschlüssel braucht - der *Startpfad* nicht. Er ging direkt an den
 * Lifecycle-Reader, der Reader baut einen Link-Client, der Client signiert,
 * und ein Geräteschlüssel in einem gesperrten Vault verweigert. Die Person
 * sah "the local companion service could not start" auf einem Gerät, dessen
 * automatischer Unlock eingerichtet war, funktionierte und nie gefragt wurde.
 *
 * Der kalte Vault ist der Normalzustand eines Laptops am Morgen. Jeder Lauf,
 * der auf einen entsperrten folgte, sah gesund aus - deshalb überlebte das so
 * lange.
 *
 * Nachgemessen, nachdem der Fund behoben war: **einundfünfzig Operationen,
 * zweiundvierzig fragen selbst, neun nicht** - und die neun zu Recht. Fünf
 * Relay-Operationen brauchen den Keystore und nicht den Vault (ADR 0154),
 * `lockVault` und `stop` tun das Gegenteil, `status` liest nur, und `checkNow`
 * reicht an einen Carrier weiter, dessen fünf Ports jeder selbst fragen. Der
 * Start war der letzte, der fehlte.
 *
 * Diese Regel ist die engere Fassung des Fundes: nicht "jede Operation fragt",
 * sondern **jeder Link-Client steht hinter einem `ensureUnlocked()`**. Das ist
 * die Bedingung, an der es tatsächlich hing, und sie hält auch für die
 * zweiundfünfzigste Operation, die jemand dazuschreibt.
 *
 * **Was sie nicht bewacht:** nur `runtime.ts`. Die Zeremonien im
 * schalenfreien Kern - Gründung, Beitritt, erste Einrichtung - bauen ebenfalls
 * Link-Clients, aber dort hält der Aufrufer die Passphrase gerade in der Hand
 * und es gibt noch keinen automatischen Unlock, den man fragen könnte.
 */
/**
 * **Der erste Entwurf dieser Regel fing den Fehler nicht, für den er
 * geschrieben war** - und das ist der Grund, warum sie so aussieht, wie sie
 * aussieht.
 *
 * Er suchte `createPicoCompanionLinkClient(` und verlangte ein
 * `ensureUnlocked()` davor. Zurückgepflanzt fiel der ursprüngliche Fund
 * *nicht* durch: der Startpfad baut gar keinen Link-Client, er baut einen
 * `createPicoCompanionLifecycleReader`, und **der** baut ihn eine Datei
 * weiter. Ein Gate, das weniger bewacht, als es behauptet, ist schlimmer als
 * keins - dieselbe Klasse, die diese Woche schon vier andere Gates traf.
 *
 * Also wird die Menge ausgerechnet statt genannt: welche Ausfuhren des
 * schalenfreien Kerns erreichen `createPicoLinkDirectClient`, direkt oder über
 * eine andere? Das ist die Bedingung, an der es hängt - ein Link-Client
 * signiert mit dem Geräteschlüssel, ganz gleich, wer ihn baut.
 */
const signingEntryPoints = (() => {
  const bodies = new Map();
  for (const file of listSourceFiles(join(repoRoot, 'apps', 'companion', 'src'))) {
    if (file.endsWith('.test.ts')) {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    // Oberste Ebene: `export function x(`, `export async function x(` und
    // `const x = async (`. Verschachtelte Helfer zählen über ihren Modulnamen
    // mit, weil ihr Aufrufer im selben Modul steht.
    for (const found of source.matchAll(
      /^(?:export )?(?:async )?function (\w+)|^(?:export )?const (\w+)\s*=\s*(?:async\s*)?[(<]/gmu)) {
      const name = found[1] ?? found[2];
      const from = found.index ?? 0;
      const next = source.indexOf('\n}\n', from);
      bodies.set(name, source.slice(from, next < 0 ? source.length : next));
    }
  }
  const reaching = new Set();
  for (const [name, body] of bodies) {
    if (body.includes('createPicoLinkDirectClient(')) {
      reaching.add(name);
    }
  }
  // Abschluss: wer eine erreichende Funktion ruft, erreicht sie auch.
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, body] of bodies) {
      if (reaching.has(name)) {
        continue;
      }
      for (const reached of reaching) {
        if (new RegExp(`(?:^|[^\\w.])${reached}\\s*\\(`, 'u').test(body)) {
          reaching.add(name);
          grew = true;
          break;
        }
      }
    }
  }
  return reaching;
})();
if (signingEntryPoints.size === 0) {
  errors.push('the set of core entry points that reach a Link client came out empty, '
    + 'which means this rule is guarding nothing');
}

const runtimeSource = readFileSync(join(shellRoot, 'src', 'runtime.ts'), 'utf8')
  .split('\n');
const signingCall = new RegExp(
  `(?:^|[^\\w.])(?:${[...signingEntryPoints].join('|')})\\s*\\(`, 'u');
let guardedClients = 0;
for (let index = 0; index < runtimeSource.length; index += 1) {
  if (!signingCall.test(runtimeSource[index])) {
    continue;
  }
  guardedClients += 1;
  const indent = runtimeSource[index].search(/\S/);
  /**
   * Zurück bis zum Beginn der umschließenden **Funktion**, nicht bis zum
   * nächstbesten Blockanfang.
   *
   * Der erste Entwurf nahm jede Zeile, die einen Block öffnet, und meldete
   * darauf achtunddreißig Fehlalarme: unmittelbar vor dem Aufruf steht oft ein
   * Geschwisterausdruck wie `return await readPicoCompanionModelProviders({`,
   * der ebenfalls eine Klammer öffnet und niedriger eingerückt ist. Er ist
   * kein Rumpf, sondern ein Nachbar - und der Rumpf, in dem das
   * `ensureUnlocked()` steht, lag davor.
   */
  let start = index;
  while (start > 0) {
    start -= 1;
    const line = runtimeSource[start];
    if (line.trim() === '') {
      continue;
    }
    if (line.search(/\S/) < indent && /(?:=>|function\b[^(]*\([^)]*\))\s*\{\s*$/.test(line)) {
      break;
    }
  }
  /**
   * **Ohne Kommentare**, und das ist keine Feinheit.
   *
   * Der zweite Entwurf ging durch, als der ursprüngliche Fund zurückgepflanzt
   * wurde - weil der Doc-Kommentar, den der Fix mitbrachte, den Aufruf
   * *beschreibt* und dabei buchstäblich `ensureUnlocked()` schreibt. Ein Gate,
   * das seine eigene Begründung als Erfüllung liest, ist genau die Sorte,
   * die man nie wieder anfassen muss und die nichts mehr hält.
   */
  const body = runtimeSource.slice(start, index)
    .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
    .join('\n');
  if (!body.includes('ensureUnlocked()')) {
    errors.push(`apps/companion-shell/src/runtime.ts:${index + 1}: reaches a Link client `
      + 'without asking the automatic unlock first. A Link client signs with the device key, '
      + 'and a device key in a locked vault refuses - so this reads to a person as "the local '
      + 'companion service could not start" on a device whose automatic unlock is configured, '
      + 'working, and never asked. A cold vault is the normal state of a laptop in the '
      + 'morning.');
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
  + ` ${contractChannels.size} IPC channels, named identically on both sides,`
  + ` ${channelsAnswered} answered or pushed by the main process and`
  + ` ${exposedMethods.length} offered methods each called by the window,`
  + ` ${requiredIds.length} elements the window requires and index.html declares;`
  + ` ${namedCaps} field caps, each a name rather than a number;`
  + ` ${guardedClients} calls that reach a Link client`
  + ` through ${signingEntryPoints.size} core entry points, each behind an unlock;`
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
