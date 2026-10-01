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
const errors = [];

/**
 * **Two manifests since 2026-09-27, and one source tree under both.** ADR
 * 0131's status note of that day made the probe's product half the shipped
 * app: its classes moved to `apps/android/src` under the app's own package,
 * and the probe builds from them plus its measuring services. So there are two
 * promises to read now, and each is read against the Java that can actually
 * end up in its APK - the app against its own sources, the probe against both.
 */
const subjects = [
  {
    label: 'the app',
    manifest: 'apps/android/AndroidManifest.xml',
    sources: ['apps/android/src'],
    shipped: true,
  },
  {
    label: 'the probe',
    manifest: 'tools/android-runtime-probe/apk/AndroidManifest.xml',
    sources: ['apps/android/src', 'tools/android-runtime-probe/apk/src'],
    shipped: false,
  },
];

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

const trackedUnder = (root) => execFileSync('git', ['ls-files', root], { cwd: repoRoot, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '');

const frameworkBases = new Set(['Service', 'Activity', 'JobService', 'BroadcastReceiver', 'ContentProvider']);
const declaredAnywhere = new Set();
const summary = [];

for (const subject of subjects) {
  let manifest;
  try {
    manifest = readFileSync(join(repoRoot, subject.manifest), 'utf8');
  } catch {
    errors.push(`${subject.label}: ${subject.manifest} is missing, so this check has nothing to read.`);
    continue;
  }
  // The comments go before anything is read: the probe's manifest explains a
  // `<receiver>` it does not have, and a comment is not a declaration (B188).
  manifest = manifest.replace(/<!--[\s\S]*?-->/gu, '');
  const javaFiles = subject.sources.flatMap(trackedUnder).filter((path) => path.endsWith('.java'));
  const java = new Map(javaFiles.map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')]));
  const corpora = { java: [...java.values()].join('\n'), manifest };

  const declaredPermissions = [...new Set(
    [...manifest.matchAll(/<uses-permission[^>]*android:name="android\.permission\.([A-Z_]+)"/gu)]
      .map(([, name]) => name),
  )];
  if (declaredPermissions.length === 0) {
    errors.push(`${subject.label}: the manifest declares no permission at all, so half this check has no subject`);
  }
  for (const permission of declaredPermissions) {
    declaredAnywhere.add(permission);
    const entry = evidence.get(permission);
    if (entry === undefined) {
      errors.push(
        `${subject.label}: ${permission} is declared and nothing here says what redeems it. Name `
        + 'the token that proves it is used, or take the permission out - a right nobody can use '
        + 'is a right nobody should ask for.',
      );
      continue;
    }
    if (!corpora[entry.where].includes(entry.token)) {
      errors.push(
        `${subject.label}: ${permission} is declared because of \`${entry.token}\` in the `
        + `${entry.where}, which no longer says it. The permission outlived what it was for.`,
      );
    }
  }

  /**
   * Components by their full name. The manifests name classes fully since
   * the sources live in two packages, so a class is known by its package
   * declaration plus its file name.
   */
  const declaredComponents = [...manifest.matchAll(
    /<(service|activity|receiver|provider)\b([^>]*)>/gu,
  )].map(([, kind, attributes]) => ({
    kind,
    name: /android:name="([A-Za-z0-9_.]+)"/u.exec(attributes)?.[1] ?? '',
    exported: /android:exported="true"/u.test(attributes),
  }));

  const bases = new Map();
  for (const [path, text] of java) {
    const pkg = /^package ([a-z0-9_.]+);/mu.exec(text)?.[1] ?? '';
    const name = basename(path, '.java');
    const declaration = new RegExp(`(abstract )?class ${name} extends ([A-Za-z0-9_]+)`, 'u').exec(text);
    bases.set(name, {
      full: `${pkg}.${name}`,
      abstract: declaration !== null && declaration[1] !== undefined,
      base: declaration === null ? undefined : declaration[2],
    });
  }
  const isComponent = (name, seen = new Set()) => {
    if (seen.has(name)) return false;
    seen.add(name);
    const entry = bases.get(name);
    if (entry === undefined || entry.base === undefined) return false;
    return frameworkBases.has(entry.base) || isComponent(entry.base, seen);
  };
  const fullNames = new Set([...bases.values()].map((entry) => entry.full));
  for (const component of declaredComponents) {
    if (!fullNames.has(component.name)) {
      errors.push(
        `${subject.label}: the manifest declares ${component.kind} ${component.name} and no such `
        + 'class is in its sources. Android fails to start a component whose class is gone.',
      );
    }
  }
  let components = 0;
  for (const [name, entry] of bases) {
    if (entry.abstract || !isComponent(name)) continue;
    components += 1;
    if (!declaredComponents.some((component) => component.name === entry.full)) {
      errors.push(
        `${subject.label}: ${entry.full} is a component and the manifest does not declare it, so `
        + 'nothing can start it.',
      );
    }
  }
  if (components === 0) {
    errors.push(`${subject.label}: no component class was found, so the other half of this check has no subject`);
  }

  /**
   * What the shipped app owes on top (ADR 0131, 2026-09-27). Each of these
   * is right for a probe driven over adb and wrong for an app a person
   * installs, and each was the probe's setting when its classes moved.
   */
  if (subject.shipped) {
    if (/android:debuggable="true"/u.test(manifest)) {
      errors.push(
        `${subject.label}: it is debuggable, which hands its private files, the custody socket `
        + 'and the keystore port to anybody with adb.',
      );
    }
    for (const component of declaredComponents) {
      const launcher = component.kind === 'activity'
        && new RegExp(`android:name="${component.name.replace(/\./gu, '\\.')}"[\\s\\S]*?category\\.LAUNCHER`, 'u')
          .test(manifest.slice(manifest.indexOf(`android:name="${component.name}"`)).split('</activity>')[0] ?? '');
      if (component.exported && !launcher) {
        errors.push(
          `${subject.label}: ${component.name} is exported, so any app on the phone can start it. `
          + 'Only the launcher is reachable from outside; the probe exports its services because '
          + 'adb starts them, and an app has no adb.',
        );
      }
    }
    if (!/android:allowBackup="false"/u.test(manifest)) {
      errors.push(
        `${subject.label}: it allows Android's backup, which would put the vault's keyfiles into one `
        + 'artifact with the data they protect - the thing ADR 0072 forbids.',
      );
    }
  }
  summary.push(`${subject.label}: ${declaredComponents.length} components, ${components} classes, `
    + `${declaredPermissions.length} permissions`);
}

/**
 * Every native method has its symbol in the JNI shim, and every symbol its
 * method (2026-10-01). JNI finds a native method by a name that spells out
 * the Java package; when NodeRuntime moved to the app's package on 2026-09-27
 * the shim kept the probe's, and every service of the app died on its first
 * Node start. Nothing compiled wrong and nothing linked wrong - the mismatch is
 * only resolved at runtime, so this reads both sides instead.
 */
const jniShim = 'apps/android/pico_node_jni.cpp';
const exported = new Set(
  [...readFileSync(join(repoRoot, jniShim), 'utf8')
    .replace(/\/\/.*$/gmu, '')
    .matchAll(/\b(Java_[A-Za-z0-9_]+)\s*\(/gu)].map(([, symbol]) => symbol),
);
const jniEscape = (name) => name.replace(/_/gu, '_1');
const natives = new Set();
for (const path of trackedUnder('apps/android/src').filter((file) => file.endsWith('.java'))) {
  const text = readFileSync(join(repoRoot, path), 'utf8');
  const pkg = /^package ([a-z0-9_.]+);/mu.exec(text)?.[1] ?? '';
  const owner = basename(path, '.java');
  for (const [, method] of text.matchAll(/\bnative\s+[\w.<>\[\]]+\s+(\w+)\s*\(/gu)) {
    natives.add(`Java_${pkg.split('.').map(jniEscape).join('_')}_${jniEscape(owner)}_${jniEscape(method)}`);
  }
}
for (const symbol of natives) {
  if (!exported.has(symbol)) {
    errors.push(
      `${symbol} is what JNI looks for and ${jniShim} does not export it - the call fails at `
      + 'runtime with UnsatisfiedLinkError, on the phone, not at build time.',
    );
  }
}
for (const symbol of exported) {
  if (!natives.has(symbol)) {
    errors.push(`${jniShim} exports ${symbol} and no Java class declares that native method.`);
  }
}
if (natives.size === 0) {
  errors.push('no native method found in apps/android/src, so the JNI half of this check has no subject');
}

for (const permission of evidence.keys()) {
  if (!declaredAnywhere.has(permission)) {
    errors.push(`${permission} is argued here and no manifest declares it any more`);
  }
}

if (errors.length > 0) {
  console.error('Android manifest check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Android manifest check passed (${summary.join('; ')}; every component named by its class and `
  + 'every permission redeemed by a token its sources still carry; the app is not debuggable, '
  + `exports only its launcher and keeps out of Android backup; ${natives.size} native method(s), `
  + 'each exported by the JNI shim under its package\'s name).',
);
