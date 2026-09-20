import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The probe asks Android for what it uses, and starts what it declares.
 *
 * **The occasion** (2026-09-20, finding B228). `AndroidManifest.xml` is the
 * probe's promise about itself, written twice by construction: once as a list
 * of components and permissions, once as the Java that uses them. Measured:
 * fourteen components declared and fourteen concrete component classes, name
 * for name - and one permission, `RECEIVE_BOOT_COMPLETED`, with **no
 * `<receiver>` in the manifest and no `BroadcastReceiver` in the sources**. It
 * could not be redeemed by anything. Asked for, unusable.
 *
 * A measuring probe is not the shipped product, and nothing was broken by it.
 * But a product whose thesis is restraint does not ask Android for a right it
 * has nothing to do with, and the manifest is exactly where that restraint is
 * visible to anybody who installs the thing.
 *
 * **Every permission names its evidence, and the evidence is verified.** The
 * table below says which token must appear somewhere the probe is written -
 * the Java, the manifest, or the scripts that drive a device - for a
 * permission to stay declared. A permission whose evidence disappears fails
 * here rather than sitting in the manifest as a reason nobody can check.
 *
 * What this cannot do is judge whether a use is *warranted*. It can say that
 * the thing the permission exists for is somewhere in this probe, which is the
 * question the one that failed could not answer.
 */
const repoRoot = join(fileURLToPath(new URL('..', import.meta.url)));
const probeRoot = 'tools/android-runtime-probe';
const errors = [];

const tracked = execFileSync('git', ['ls-files', probeRoot], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '');
const manifestPath = tracked.find((path) => path.endsWith('AndroidManifest.xml'));
if (manifestPath === undefined) {
  console.error('Android manifest check failed:');
  console.error(`- ${probeRoot} has no AndroidManifest.xml, so this check has nothing to read.`);
  process.exit(1);
}
const manifest = readFileSync(join(repoRoot, manifestPath), 'utf8');

const javaFiles = tracked.filter((path) => path.endsWith('.java'));
const java = new Map(javaFiles.map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')]));
const corpora = { java: [...java.values()].join('\n'), manifest };

/**
 * What must be there for a permission to stay declared, **and where**.
 *
 * The `where` half was missing in the first draft and a planting found it: the
 * corpus was everything the probe is written in, so renaming
 * `canUseFullScreenIntent` out of the Java left the permission standing -
 * `run-reachability-probe.sh` says the same word while toggling an app op.
 * A script that *grants* a right is not a use of it. So each entry names its
 * corpus, and the two that point at the manifest are not circular: a
 * foreground-service type is the declaration that uses the permission.
 */
const evidence = new Map([
  ['INTERNET', { where: 'java', token: 'Socket' }],
  ['ACCESS_NETWORK_STATE', { where: 'java', token: 'ConnectivityManager' }],
  ['FOREGROUND_SERVICE', { where: 'java', token: 'startForeground' }],
  ['FOREGROUND_SERVICE_SPECIAL_USE', { where: 'manifest', token: 'foregroundServiceType="specialUse"' }],
  ['FOREGROUND_SERVICE_LOCATION', { where: 'manifest', token: 'foregroundServiceType="location"' }],
  ['POST_NOTIFICATIONS', { where: 'java', token: 'NotificationManager' }],
  ['USE_FULL_SCREEN_INTENT', { where: 'java', token: 'canUseFullScreenIntent' }],
  ['PACKAGE_USAGE_STATS', { where: 'java', token: 'UsageStatsManager' }],
  ['CAMERA', { where: 'java', token: 'Camera' }],
  ['ACCESS_FINE_LOCATION', { where: 'java', token: 'LocationManager' }],
]);

const declaredPermissions = [...new Set(
  [...manifest.matchAll(/<uses-permission[^>]*android:name="android\.permission\.([A-Z_]+)"/gu)]
    .map(([, name]) => name),
)];
if (declaredPermissions.length === 0) {
  errors.push('the manifest declares no permission at all, so half this check has no subject');
}
for (const permission of declaredPermissions) {
  const entry = evidence.get(permission);
  if (entry === undefined) {
    errors.push(
      `${permission} is declared and nothing here says what redeems it. Name the token that `
      + 'proves this probe uses it, or take the permission out - a right nobody can use is a '
      + 'right nobody should ask for.',
    );
    continue;
  }
  if (!corpora[entry.where].includes(entry.token)) {
    errors.push(
      `${permission} is declared because of \`${entry.token}\` in the ${entry.where}, which no `
      + 'longer says it. The permission outlived what it was for.',
    );
  }
}
for (const permission of evidence.keys()) {
  if (!declaredPermissions.includes(permission)) {
    errors.push(`${permission} is argued here and the manifest no longer declares it`);
  }
}

/** Every component the manifest declares, with the dot Android writes. */
const declaredComponents = [...manifest.matchAll(
  /<(service|activity|receiver|provider)[^>]*android:name="\.([A-Za-z0-9_]+)"/gu,
)].map(([, kind, name]) => ({ kind, name }));

/** A class is a component when it reaches a framework base, directly or through one of its own. */
const bases = new Map();
for (const [path, text] of java) {
  const name = basename(path, '.java');
  const declaration = new RegExp(`(abstract )?class ${name} extends ([A-Za-z0-9_]+)`, 'u').exec(text);
  bases.set(name, {
    abstract: declaration !== null && declaration[1] !== undefined,
    base: declaration === null ? undefined : declaration[2],
  });
}
const frameworkBases = new Set(['Service', 'Activity', 'JobService', 'BroadcastReceiver', 'ContentProvider']);
function isComponent(name, seen = new Set()) {
  if (seen.has(name)) return false;
  seen.add(name);
  const entry = bases.get(name);
  if (entry === undefined || entry.base === undefined) return false;
  return frameworkBases.has(entry.base) || isComponent(entry.base, seen);
}

for (const component of declaredComponents) {
  if (!bases.has(component.name)) {
    errors.push(
      `the manifest declares ${component.kind} .${component.name} and no such class is in the `
      + 'probe. Android fails to start a component whose class is gone, at the moment somebody '
      + 'is running a measurement.',
    );
  }
}
let components = 0;
for (const [name, entry] of bases) {
  if (entry.abstract || !isComponent(name)) continue;
  components += 1;
  if (!declaredComponents.some((component) => component.name === name)) {
    errors.push(
      `${name} is a component and the manifest does not declare it, so nothing can start it. A `
      + 'probe service that cannot run is a measurement that silently did not happen.',
    );
  }
}
if (components === 0) {
  errors.push('no component class was found, so the other half of this check has no subject');
}

if (errors.length > 0) {
  console.error('Android manifest check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Android manifest check passed (${declaredComponents.length} components declared and `
  + `${components} concrete component classes, each named by the other; `
  + `${declaredPermissions.length} permissions, every one of them redeemed by a token this probe `
  + 'still carries).',
);
