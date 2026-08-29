import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A capability that nothing calls is a capability nobody has.
 *
 * The sibling of `check-store-writers.mjs` and `check-link-reachability.mjs`,
 * one layer further out. Those ask whether a store method and a Link operation
 * have a caller. This asks it of the layer where the answer decides what a
 * *person* can do: the shell-free companion core is the product's capability
 * surface, and an export nothing reaches is a feature that exists in the test
 * suite and nowhere else.
 *
 * **This repository has found that shape by accident five times.**
 * `attachPicoSupplier` had no caller, so the supplier list was empty on every
 * Home; `detachPicoSupplier` had none either; `setPicoSupplierReach` left both
 * defaults the only reachable state in the ADR whose title is that they exist;
 * `put()` on the presence registry left it empty on every real Home;
 * `appendPicoObservations` still has none, and that one is an argued deferral.
 * Four of the five were caught by `store:check` or by somebody noticing. This
 * one is written so the sixth is caught by name.
 *
 * **What it found on the day it was written, 2026-08-24:** fifteen of 134
 * exports, and thirteen of them are one subsystem. The other two were the
 * reader-custody pair, argued here for half a day until the window got a
 * panel for them; the arguments went stale the moment it did, and this check
 * said so. The device side of Pico
 * Relay - issue a mailbox, exchange addresses, sweep, admit a push, correlate
 * a reply - is four modules with tests and no product path into any of them.
 * ADR 0149's status says "Both loops run"; the Home's loop runs, and the
 * device's runs in its tests.
 *
 * **Scope, measured rather than assumed - and the first assumption was
 * wrong.** The day this was written it covered only `apps/companion/src`, on
 * the argument that `apps/core` is reached through one dispatcher and that
 * `packages/*` are libraries whose callers are other packages. That argument
 * was never measured. Measured the same day: `apps/core/src` has nine
 * unreached exports and `apps/vault-daemon/src` three, and every one of them
 * is the code edge of a gap this repository already records in prose - no
 * bridge, no Home Assistant transport, no sensor runtime, no platform anchor,
 * no reader-custody writer, no operator surface for the migration audit - or
 * a seam a test opened. Nine documented absences that nothing connected to
 * their code; they are connected below.
 *
 * `apps/companion-shell/src` (90 exports), `apps/relay/src` and `apps/web/src`
 * were measured too and have none, so they are in scope and silent.
 *
 * **`modules/` was left out the same way, by assumption, and measured later
 * the same day - the second time in one day that a scope of mine was a claim
 * nobody had checked.** A module is exactly the thing this rule is about: ADR
 * 0127 calls it vocabulary, composition and surface, and the core imports its
 * functions by name. Six of thirteen exports are unreached, four of them the
 * code edge of an absence already recorded (the Home Assistant transport, the
 * spatial-recall deferral) and two of them a module's own way of saying
 * something to a person that the product never asks for. Every module's `src`
 * is read, so a fifth module is in scope the day it exists.
 *
 * `packages/*` stay out: there an unreached export is module hygiene, not a
 * capability nobody has.
 *
 * An argument is not a permission. Each entry below says why a capability has
 * no caller *today*, in a form somebody can disagree with.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const roots = [
  ...readdirSync(join(repoRoot, 'modules'))
    .filter((entry) => statSync(join(repoRoot, 'modules', entry, 'src')).isDirectory())
    .map((entry) => join('modules', entry, 'src')),
  join('apps', 'companion', 'src'),
  join('apps', 'companion-shell', 'src'),
  join('apps', 'core', 'src'),
  join('apps', 'vault-daemon', 'src'),
  join('apps', 'relay', 'src'),
  join('apps', 'web', 'src'),
];

/**
 * Modules whose whole surface is unreached, with the argument for it. A module
 * is listed rather than each of its names, because the reason is the same
 * sentence for all of them and repeating it would invite the copies this
 * repository keeps finding.
 */
const argued = [
  {
    module: 'apps/companion/src/link-mailbox.ts',
    why: 'ADR 0148. The device half of the relay path: a mailbox this device owns, and the '
      + 'exchange that hands its address to the Home. Nothing starts it because nothing '
      + 'starts the sweep below it, and the sweep waits on the same thing',
  },
  {
    module: 'apps/companion/src/link-relay-sweep.ts',
    why: 'ADR 0149\'s collecting side on the device. Starting it is a product decision that '
      + 'has not been made - when a device begins asking a relay, and what it costs a phone '
      + 'to keep asking - and there is no operated relay to ask. The Home\'s loop runs; this '
      + 'one runs in its tests',
  },
  {
    module: 'apps/companion/src/link-push-gate.ts',
    why: 'ADR 0150. What a device admits when a push arrives, which is downstream of a sweep '
      + 'that nothing starts',
  },
  {
    module: 'apps/companion/src/pending-reply.ts',
    why: 'ADR 0149\'s reply correlation, reached only from the sweep above it. Its four '
      + 'unreached exports are the book\'s lifecycle; the sweep uses the other five',
  },
];

/** Single names, where the module around them is reached and one export is not. */
const arguedNames = [
  [
    'createLinuxNotifySendAdapter',
    'ADR 0112 with ADR 0113 C2, and `notify.ts`\'s own comment says it: the Electron shell '
      + 'supplies its own adapter, so this is the notification path of a companion running '
      + 'without a shell. That the shell-free core can do this at all is ADR 0113\'s claim; '
      + 'no product runs it without a shell yet',
  ],
  [
    'clearPicoCompanionRecoveryState',
    'ADR 0112 S3. A completed recovery writes its receipt *over* the pending state instead '
      + 'of deleting the file, so `completed` is the terminal status and the receipt is what '
      + 'the person is shown afterwards. Clearing is an end to that lifecycle which the '
      + 'product does not have',
  ],
];

/**
 * The nine in `apps/core/src` and three in `apps/vault-daemon/src`, each the
 * code edge of an absence this repository records elsewhere in prose. The
 * point of writing them here is that prose and code stop being two documents.
 */
const arguedModuleNames = [
  [
    'picoCalendarAgenda',
    'ADR 0127. Die Ordnung, in der ein Mensch seine zeitgebundenen Einträge sehen soll - '
      + 'Überfälliges zuerst, darin das Älteste. Der Core bedient `picoCalendarDueEntriesView`, '
      + 'und keine Fläche sortiert; das Modul kann etwas sagen, wonach das Produkt nicht fragt, '
      + 'und niemand baut es woanders nach',
  ],
  [
    'toPicoHomeAssistantObservations',
    'ADR 0128 H4. Der Connector-Eingang, dessen Transport die Matrix als deklariert und '
      + 'nicht implementiert führt',
  ],
  [
    'picoHomeAssistantChangedEntities',
    'ADR 0128 H4, dieselbe fehlende Seite: was sich geändert hat, für einen Transport, den '
      + 'es nicht gibt',
  ],
  [
    'picoDeriveParkingCandidate',
    'ADR 0129 SR2/SR5, Befund B4 - **und der Grund ist seit dem 2026-08-26 ein anderer, '
      + 'kleinerer**. Er lautete: "Wo habe ich geparkt" braucht Beobachtungen, und '
      + '`appendPicoObservations` hat außerhalb seiner Tests keinen Aufrufer. Den hat es '
      + 'jetzt: `home.observations.submit` füllt den Puffer von einem Telefon aus, am Gerät '
      + 'bewiesen, mit echten Messungen des `LocationManager`. Was der Ableitung fehlt, ist '
      + 'die zweite Hälfte ihrer Eingabe - Bewegungsarten. Die kommen bei Android aus den '
      + 'Play-Diensten, die diese handgebaute Sonde nicht hat, und ohne den Übergang von '
      + '"fahrend" zu "gehend" hat ein Parkplatz kein Merkmal, an dem er zu erkennen wäre. '
      + 'Ein Aufrufer, der sie ohne diesen Übergang fragte, bekäme "nichts gefunden" und '
      + 'nicht "hier war es"',
  ],
  [
    'picoParkingAnswer',
    'ADR 0129, dieselbe Stelle: die Antwort auf eine Ableitung, deren Eingabe zur Hälfte da '
      + 'ist. Die Messungen kommen an, die Bewegungsarten nicht',
  ],
];

const arguedCoreNames = [
  [
    'intakePicoSupplierContent',
    'ADR 0136 BR3. What a supplier hands inward, labelled `external_content` by the core '
      + 'without asking. A tracked library does not come this way - `library-read.ts` '
      + 'classes an excerpt as `own_pico` on purpose - so the only caller would be a Bridge, '
      + 'and no real bridge exists',
  ],
  [
    'recordPicoConnectorObservations',
    'ADR 0128 H4. The Home Assistant connector\'s intake, whose transport the matrix lists '
      + 'as declared and unimplemented',
  ],
  [
    'condensePicoObservations',
    'ADR 0129, **und der Grund ist seit dem 2026-08-26 ein anderer** - der Satz hier sagte '
      + 'bis zum 2026-08-29, kein Gerät mit Sensor fülle den Puffer, und das stimmte schon '
      + 'seit drei Tagen nicht: `home.observations.submit` füllt ihn von einem Telefon aus, '
      + 'am Gerät bewiesen und seit dem 2026-08-28 auch gegen ein laufendes Home gegangen. '
      + 'Was fehlt, ist dasselbe wie bei `picoDeriveParkingCandidate` daneben: die zweite '
      + 'Hälfte der Eingabe, die Bewegungsarten, und ohne den Übergang von fahrend zu gehend '
      + 'verdichtet ein Lauf Messungen zu nichts, woran ein Ort zu erkennen wäre',
  ],
  [
    'openPicoTpm2AnchorCounter',
    'ADR 0122. The platform anchor, named as missing wherever this tree reports its '
      + 'production-blocking limits',
  ],
  [
    'restoreSqliteBackup',
    'The migration run is one SQLite transaction, so a failed migration rolls back and the '
      + 'backup covers what a transaction cannot - a kill mid-commit, a corrupt file. '
      + 'Nothing plays one back: no code path and no command. Six tests use it, ADR 0136 '
      + 'BR3\'s backup-and-restore comparison among them, so it is a seam a test opened '
      + 'and not an operator surface. Whether it should be one is decided nowhere',
  ],
  [
    'listMigrationAuditRecords',
    'ADR 0121/0122. The migration audit is written on every run and read by no surface; '
      + 'the operator view that would show it does not exist',
  ],
  [
    'describeMigrationState',
    'The same audit, summarised, and the same missing surface',
  ],
  [
    'picoLinkDirectKeyRecordFingerprintHex',
    'A fingerprint helper beside the Direct listener that the listener does not use. Its '
      + 'test pins the derivation; nothing in the product derives one this way',
  ],
  [
    'picoLinkRelayMailboxOf',
    'One line over `parsePicoLinkPacketAddress`, for a relay path on the Home side that '
      + 'reads the address itself',
  ],
  [
    'createPicoVaultDaemonReaderAccessUnlockPort',
    'ADR 0117 mit ADR 0085. **Der Satz hier war überholt** und sagte bis zum 2026-08-29, '
      + 'nichts im Produkt erteile eine Leserberechtigung, was ADR 0130 E5 halb offen lasse '
      + '- beides hat am 2026-08-26 aufgehört zu stimmen, und seit dem 2026-08-27 trägt E5 '
      + 'alle vier Bedienelemente. Ohne Aufrufer ist die Stelle trotzdem, aus dem engeren '
      + 'Grund: die Besitzerin liest ihren eigenen Raum über den Umschlag, der ihr gehört, '
      + 'und diesen Port braucht ein Gerät, das die Berechtigung *einer anderen Person* '
      + 'hält. Genau dieser Fall bleibt offen, weil ADR 0085 verlangt, dass deren Gerät '
      + 'binnen fünf Minuten wach ist',
  ],
  [
    'picoRecoveryCardQrPayload',
    'A public name over `picoRecoveryCardContent(card).qrPayload`, opened so the PDF '
      + 'writer\'s test can pin the payload without the PDF around it',
  ],
  [
    'createPicoRecoveryCardQrMatrix',
    'The same seam one step further: the matrix the card carries, reachable by its test '
      + 'while the writer uses the private `picoRecoveryCardQrMatrixFor`',
  ],
];

const errors = [];
/**
 * A file this repository already names `test-` is a helper for tests, and its
 * callers are tests by construction - the same convention
 * `check-link-reachability.mjs` reads.
 */
const sources = roots.flatMap((root) => readdirSync(join(repoRoot, root))
  .filter((entry) => entry.endsWith('.ts')
    && !entry.endsWith('.test.ts')
    && !entry.startsWith('test-'))
  .map((entry) => join(root, entry)))
  .sort();

/** Every non-test file in the tree, which is where a caller would be. */
const callerFiles = [];
const collect = (directory) => {
  for (const entry of readdirSync(directory)) {
    /**
     * `scripts/` is excluded because a check is not a caller. This one names
     * `issuePicoCompanionRecoveryCard` in the paragraph above to explain
     * itself, and that sentence made the capability look reached - planting
     * the removal of its only real call passed twice before this line existed.
     * A check that reads its own prose as evidence is the shape this whole
     * file is about.
     */
    if (entry === 'node_modules' || entry === 'dist' || entry === 'out'
      || (directory === repoRoot && entry === 'scripts')) {
      continue;
    }
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      collect(path);
    } else if (/\.(ts|mjs)$/u.test(path) && !/\.test\.(ts|mjs)$/u.test(path)) {
      callerFiles.push(path);
    }
  }
};
collect(repoRoot);
/**
 * A re-export is not a caller, and the first version of this check counted one.
 * `apps/companion/src/index.ts` carries `export { name } from './module.js'`
 * for much of the core, so every re-exported capability looked reached whether
 * or not anybody imported it - the barrel makes the reaching set look complete
 * while nothing walks it. Planting the removal of `main.ts`'s only call to
 * `issuePicoCompanionRecoveryCard` passed, which is how this was found.
 */
const withoutReExports = (text) => text
  .replace(/export\s*(?:type\s*)?\{[^}]*\}\s*from\s*'[^']*';?/gu, '');
/** Prose is not a caller either; a doc comment explains a name, it does not use it. */
const withoutComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:])\/\/.*$/gmu, '$1');
const callerText = new Map(
  callerFiles.map((path) => [
    path,
    withoutComments(withoutReExports(readFileSync(path, 'utf8'))),
  ]),
);

const arguedModules = new Set(argued.map((entry) => entry.module));
const arguedNameSet = new Map([...arguedNames, ...arguedCoreNames, ...arguedModuleNames]);
let exportsChecked = 0;
let reachedOnlyByItsOwnFile = 0;
/**
 * Which arguments still describe something. An argument for a name that has
 * since found a caller, or that no longer exists, is a sentence about nothing
 * - the same defect one level up, and the plant that removed a name from a
 * check rather than from the code is what showed this half was missing.
 */
const arguedNamesFound = new Set();
const unreached = [];

for (const entry of sources) {
  const path = join(repoRoot, entry);
  const own = readFileSync(path, 'utf8');
  /**
   * Auch innen ist Prosa keine Benutzung. Die Aufruferseite strippt Kommentare
   * seit dem Tag, an dem der Kopfkommentar dieses Prüfers eine Fähigkeit
   * erreicht aussehen ließ; der Zähler unten tat es nicht, und ein Name, der
   * einmal in seinem eigenen Doc-Kommentar steht, rutschte damit in den
   * harmlosen Topf statt in die Meldung (2026-08-24, an `picoParkingAnswer`
   * gefunden - und zwar dadurch, dass seine Begründung als veraltet gemeldet
   * wurde, was sie nicht war).
   */
  const ownCode = withoutComments(own);
  for (const [, name] of own.matchAll(/^export (?:async )?function (\w+)/gmu)) {
    exportsChecked += 1;
    let reached = false;
    for (const [callerPath, text] of callerText) {
      if (callerPath === path) {
        continue;
      }
      if (new RegExp(`\\b${name}\\b`, 'u').test(text)) {
        reached = true;
        break;
      }
    }
    if (reached) {
      continue;
    }
    /**
     * Used by its own file and exported anyway: the test wanted a smaller
     * subject than the export that reaches it. Counted rather than refused -
     * the capability above it is reachable, so nobody is missing anything.
     */
    if ((ownCode.match(new RegExp(`\\b${name}\\b`, 'gu')) ?? []).length > 1) {
      reachedOnlyByItsOwnFile += 1;
      continue;
    }
    if (arguedModules.has(entry) || arguedNameSet.has(name)) {
      arguedNamesFound.add(name);
      continue;
    }
    unreached.push(`${relative(repoRoot, path)}: ${name}`);
  }
}

if (exportsChecked === 0) {
  errors.push(
    `scripts/check-capability-reach.mjs found no exports across ${roots.length} roots, so `
    + 'it passed over nothing. Either those roots stopped exporting functions or the '
    + 'reading of them broke.',
  );
}
for (const name of unreached) {
  errors.push(
    `${name} is exported and named by nothing outside its own file. `
    + 'A capability nobody can reach is a capability nobody has: give it a caller, or put '
    + 'the reason it has none beside the others in this check, in a sentence somebody can '
    + 'disagree with.',
  );
}
for (const [name] of arguedNameSet) {
  if (arguedNamesFound.has(name)) {
    continue;
  }
  errors.push(
    `${name} is argued here as unreached and is either reached now or gone. An argument `
    + 'outliving its subject reads like a judgement somebody made about today.',
  );
}

/** An argument for a module that has become reachable is a stale exemption. */
for (const entry of argued) {
  if (!sources.includes(entry.module)) {
    errors.push(
      `${entry.module} is argued here as unreached and no longer exists. An argument `
      + 'outliving its subject is the same defect this check exists for.',
    );
  }
}

if (errors.length > 0) {
  console.error('Capability reach check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Capability reach check passed (${exportsChecked} exported capabilities across `
  + `${roots.length} roots, ${reachedOnlyByItsOwnFile} exported for their own tests, `
  + `${argued.length} modules and ${arguedNameSet.size} single names argued unreached).`,
);
