import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePicoModuleManifest } from '../packages/protocol/dist/module.js';

/**
 * Every surface a module claims is one that exists, or one that says it does
 * not yet.
 *
 * **The occasion** (2026-09-18, finding B194). A manifest's `surfaces` list is
 * the module's promise about what a person can actually reach. The protocol's
 * parser checks it is a non-empty list of distinct strings and nothing checks
 * it further - and `PicoModuleView` does not carry it, so the list never
 * reaches a person either. Measured: six of fourteen sentences named something
 * no product code builds, and two modules of four had no true sentence at all.
 *
 * **A sentence's prefix says where to look.** Four layers, and an unknown
 * prefix fails rather than passes: a vocabulary that grows silently stops being
 * one. `Pico Link: <operation>` needs no entry below at all - the operation
 * name is in the sentence, and this check finds its `case` in the Home.
 *
 * **Everything else names an anchor here, or is argued as unbuilt.** And an
 * unbuilt entry is **verified, not trusted**: it names a word that must stay
 * absent from its layer, so the day somebody builds the surface, the stale
 * entry fails instead of quietly outliving the gap it described.
 *
 * What this cannot do is read a sentence. `which depots are attached, and the
 * commit each runs at` is prose, and no checker will know whether a table
 * shows the commit. It can know whether the word `depot` occurs in the
 * dashboard at all - and that was enough to find all six.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));

/** Where a sentence's prefix says its surface lives. */
const layers = new Map([
  ['Foundation API', ['apps/core/src']],
  ['Foundation dashboard', ['apps/web/src']],
  ['Companion', ['apps/companion/src', 'apps/companion-shell/src']],
]);

/**
 * Where each surface lives, or why it does not live anywhere yet.
 *
 * Keyed by module and the sentence verbatim: reword a surface and the entry
 * stops matching, which is the point - a promise that changed is a promise
 * nobody has checked since.
 */
const anchors = [
  {
    module: 'calendar',
    surface: 'Foundation API: recording a memory item with a due instant',
    anchor: 'memory.time_bound_entry_recorded',
  },
  {
    module: 'calendar',
    surface: 'Foundation dashboard: the entry list and its waiting, overdue and raised states',
    anchor: 'renderTimeBoundEntries',
  },
  {
    module: 'calendar',
    surface: 'Companion: the time_bound_entry_due presentation state',
    anchor: 'time_bound_entry_due',
  },
  {
    module: 'calendar',
    surface: 'Foundation API: what will not happen if this module is switched off',
    anchor: 'toPicoModuleDeactivationStatement',
  },
  {
    module: 'depot',
    surface: 'Foundation API: attaching a depot at a commit and detaching it',
    anchor: 'home.depot.detach',
  },
  {
    module: 'depot',
    surface: 'Foundation API: the two reach decisions, both off until someone grants them',
    anchor: 'home.depot.reach.decide',
  },
  {
    module: 'depot',
    surface: 'Foundation API: what will not happen if this module is switched off',
    anchor: 'toPicoModuleDeactivationStatement',
  },
  {
    module: 'depot',
    surface: 'Foundation dashboard: which depots are attached, and the commit each runs at',
    unbuilt: 'depot',
    why: 'the Home has the attachments and the dashboard has no word for them. B194 '
      + 'measured it: `depot` occurs in no source of apps/web/src, only in a render '
      + 'test naming it as the dependency of another module',
  },
  {
    module: 'depot',
    surface: 'Foundation dashboard: a newer commit shown as an offer, with what it would move from and to',
    unbuilt: 'depot',
    why: 'the same absence. home.depot.offer.accept exists in the Home and nothing '
      + 'shows the offer, so the operation can only be reached by something that '
      + 'already knows it is there',
  },
  {
    module: 'home-assistant',
    surface: 'Foundation API: entity observations recorded as memory items',
    unbuilt: 'recordPicoConnectorObservations',
    except: 'apps/core/src/connector-intake.ts',
    why: 'the intake is written and its only caller is its own test. This is the one '
      + 'surface the module declares, so it is the whole module: what ships is a '
      + 'transport with nothing behind it',
  },
  {
    module: 'spatial-recall',
    surface: 'Foundation API: the last likely parking place, with its certainty',
    unbuilt: 'parking',
    why: 'picoParkingAnswer derives the sentence and nothing calls it. B194: the word '
      + '`parking` occurs in no source of apps/core/src',
  },
  {
    module: 'spatial-recall',
    surface: 'Foundation API: confirming or rejecting a parking candidate',
    unbuilt: 'parking',
    why: 'there is nothing to confirm, because the surface above does not exist. '
      + 'Confirming is the half that makes the derivation improve, so its absence is '
      + 'why the thresholds in parking.ts have never been wrong in public',
  },
  {
    module: 'spatial-recall',
    surface: 'Companion: answering where the vehicle was left, offline',
    unbuilt: 'picoParkingAnswer',
    why: 'the answer exists as a function in the module and no companion code calls '
      + 'it. The capture ports it would need have no implementation either, which '
      + 'ports.ts says outright and dates to a deferred product decision',
  },
];

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (path.endsWith('.ts') && !path.includes('.test.')) found.push(path);
  }
  return found;
}

/** A layer read once, because fourteen sentences ask it the same questions. */
const layerFiles = new Map();
for (const [prefix, roots] of layers) {
  layerFiles.set(
    prefix,
    roots.flatMap((root) => sourceFiles(join(repoRoot, root)))
      .map((path) => ({ path: relative(repoRoot, path), text: readFileSync(path, 'utf8') })),
  );
}

/**
 * The layer, optionally without the file that declares the watched word.
 *
 * An unbuilt surface is missing a **caller**, and a function defined inside its
 * own layer would otherwise find itself and make every argument look stale -
 * the first run of this check failed exactly that way. `except` names the
 * declaring file, and naming a file the layer does not have is itself a
 * failure, so moving the declaration reopens the question rather than hiding
 * it.
 */
function layerText(prefix, except) {
  const files = layerFiles.get(prefix);
  if (except === undefined) return files.map((file) => file.text).join('\n');
  if (!files.some((file) => file.path === except)) return undefined;
  return files.filter((file) => file.path !== except).map((file) => file.text).join('\n');
}
const homeRoutes = readFileSync(join(repoRoot, 'apps', 'core', 'src', 'app.ts'), 'utf8');

const modulesDirectory = join(repoRoot, 'modules');
const manifests = [];
for (const entry of readdirSync(modulesDirectory)) {
  const built = join(modulesDirectory, entry, 'dist', 'manifest.js');
  if (!existsSync(built)) continue;
  const exported = Object.values(await import(built))
    .find((value) => typeof value === 'object' && value !== null && 'identifier' in value);
  if (exported !== undefined) manifests.push(parsePicoModuleManifest(exported));
}

const failures = [];
if (manifests.length === 0) {
  failures.push(
    'no built module manifest was found. This check reads the declaration the product '
    + 'loads, so it runs after build - with nothing to read it would pass by having no '
    + 'subject.',
  );
}

/**
 * The key is module and sentence with a newline between them. A surface is one
 * line of prose, so neither half can hold the separator.
 */
const keyOf = (module, surface) => `${module}\n${surface}`;
const byKey = new Map(anchors.map((entry) => [keyOf(entry.module, entry.surface), entry]));
const used = new Set();
let linkSurfaces = 0;
let anchored = 0;
const unbuilt = [];

for (const manifest of manifests) {
  for (const surface of manifest.surfaces) {
    const separator = surface.indexOf(': ');
    const prefix = separator < 0 ? surface : surface.slice(0, separator);
    const key = keyOf(manifest.identifier, surface);

    if (prefix === 'Pico Link') {
      const operation = surface.slice(separator + 2).trim();
      if (homeRoutes.includes(`case '${operation}':`)) linkSurfaces += 1;
      else failures.push(`${manifest.identifier}: "${surface}" names no operation the Home answers`);
      continue;
    }
    if (!layers.has(prefix)) {
      failures.push(
        `${manifest.identifier}: "${surface}" begins with "${prefix}", which names no layer. `
        + `Known: ${[...layers.keys()].join(', ')}, Pico Link.`,
      );
      continue;
    }
    const entry = byKey.get(key);
    if (entry === undefined) {
      failures.push(
        `${manifest.identifier}: "${surface}" says where a person can reach this module and `
        + 'nothing says where that is. Add an anchor, or argue it as unbuilt.',
      );
      continue;
    }
    used.add(key);
    const text = layerText(prefix, entry.except);
    if (text === undefined) {
      failures.push(
        `${manifest.identifier}: "${surface}" excepts ${entry.except} from ${prefix}, and no `
        + 'such source is in that layer. The declaration moved, so what the argument watches '
        + 'has to be decided again.',
      );
      continue;
    }
    if (entry.unbuilt !== undefined) {
      if (text.includes(entry.unbuilt)) {
        failures.push(
          `${manifest.identifier}: "${surface}" is argued as unbuilt, but ${entry.unbuilt} now `
          + `occurs in ${prefix}. Either it was built - then drop the entry - or the word `
          + 'stopped being the right absence to watch.',
        );
        continue;
      }
      unbuilt.push(`${manifest.identifier}: ${surface}`);
      continue;
    }
    if (!text.includes(entry.anchor)) {
      failures.push(
        `${manifest.identifier}: "${surface}" is anchored on ${entry.anchor}, which is in no `
        + `source of ${prefix}. The surface was removed or renamed and the promise stayed.`,
      );
      continue;
    }
    anchored += 1;
  }
}

for (const [key, entry] of byKey) {
  if (used.has(key)) continue;
  failures.push(
    `${entry.module} has an entry for "${entry.surface}" and declares no such surface. A `
    + 'sentence that was reworded takes its argument with it.',
  );
}

if (failures.length > 0) {
  console.error('Module surface check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const total = anchored + linkSurfaces + unbuilt.length;
  console.log(
    `Module surface check passed (${total} surfaces declared by ${manifests.length} shipped `
    + `modules - Pico Link operations the Home demonstrably answers: ${linkSurfaces}; `
    + `anchored on code that is there: ${anchored}; argued as unbuilt: ${unbuilt.length}, each `
    + 'watching a word that must stay absent, so building the surface fails the argument '
    + 'rather than outliving it).',
  );
  for (const line of unbuilt) console.log(`  unbuilt: ${line}`);
}
