#!/usr/bin/env node
/**
 * The built APK, taken apart and checked - what `release:verify` does for the
 * Linux package, for the Android one (ADR 0131, status note 2026-09-27).
 *
 * `manifest:check` holds the manifest *source*. This holds what came out of
 * the build, because the two can differ: aapt2 compiles the manifest, the
 * version is stamped at link time, and the signature is added last. What a
 * person installs is the file, so the file is what is read.
 *
 * Usage: check-apk.mjs APK [--release]
 *
 * Checked, from the compiled manifest read as a tree (aapt2 dump xmltree):
 *   - the package is the app's permanent identity, io.github.riederch.pico;
 *   - versionName is the workspace version and versionCode is derived from it
 *     the way build-apk.sh derives it, so an update installs over the last;
 *   - not debuggable, no Android backup, and no component reachable from
 *     outside except the launcher activity;
 * from the archive:
 *   - the shell-free core is inside, with the scripts the services start;
 * from the signature:
 *   - apksigner verifies it, and with --release the signing certificate is
 *     the one pinned in release-certificate.sha256 - so an APK signed with
 *     any other key, a throwaway one included, never becomes a release asset.
 *
 * Writes APK.sha256 beside it on success.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const apk = process.argv[2];
const release = process.argv.includes('--release');
const errors = [];

if (apk === undefined || !existsSync(apk)) {
  console.error('usage: check-apk.mjs APK [--release]');
  process.exit(2);
}

const sdk = process.env.ANDROID_SDK ?? process.env.ANDROID_SDK_ROOT
  ?? join(process.env.HOME ?? '', 'Android/Sdk');
const buildTools = join(sdk, 'build-tools');
const newest = readdirSync(buildTools)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .at(-1);
const tool = (name) => join(buildTools, newest, name);
const run = (command, args) => execFileSync(command, args, {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
});

/** The compiled manifest as a tree of elements with their attributes. */
function manifestTree() {
  const text = run(tool('aapt2'), ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
  const root = { name: '#root', attributes: new Map(), children: [], depth: -1 };
  const stack = [root];
  for (const line of text.split('\n')) {
    const element = /^(\s*)E: ([a-z-]+)/u.exec(line);
    if (element !== null) {
      const node = { name: element[2], attributes: new Map(), children: [], depth: element[1].length };
      while (stack.at(-1).depth >= node.depth) stack.pop();
      stack.at(-1).children.push(node);
      stack.push(node);
      continue;
    }
    const attribute = /^\s*A: (?:http:\/\/schemas\.android\.com\/apk\/res\/android:)?([A-Za-z]+)(?:\(0x[0-9a-f]+\))?=(.*)$/u.exec(line);
    if (attribute !== null) {
      const raw = attribute[2];
      const quoted = /^"([^"]*)"/u.exec(raw);
      stack.at(-1).attributes.set(attribute[1], quoted === null ? raw.trim() : quoted[1]);
    }
  }
  return root.children.find((node) => node.name === 'manifest');
}

const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);

const manifest = manifestTree();
if (manifest === undefined) {
  errors.push('the APK has no readable manifest');
} else {
  const version = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version;
  const [major, minor, patch] = version.split('-')[0].split('.').map(Number);
  const expectedCode = String(major * 1_000_000 + minor * 1_000 + patch);
  if (manifest.attributes.get('package') !== 'io.github.riederch.pico') {
    errors.push(`package is ${manifest.attributes.get('package')}, not the app's permanent io.github.riederch.pico`);
  }
  if (manifest.attributes.get('versionName') !== version) {
    errors.push(`versionName is ${manifest.attributes.get('versionName')}, the workspace is ${version}`);
  }
  if (manifest.attributes.get('versionCode') !== expectedCode) {
    errors.push(`versionCode is ${manifest.attributes.get('versionCode')}, ${version} derives ${expectedCode}`);
  }

  const application = manifest.children.find((node) => node.name === 'application');
  if (application === undefined) {
    errors.push('the manifest has no application');
  } else {
    if (application.attributes.get('debuggable') === 'true') {
      errors.push('the APK is debuggable - its files, custody socket and keystore port are open to adb');
    }
    if (application.attributes.get('allowBackup') !== 'false') {
      errors.push('the APK allows Android backup - keyfiles and data in one artifact (ADR 0072)');
    }
    const components = application.children
      .filter((node) => ['activity', 'service', 'receiver', 'provider'].includes(node.name));
    for (const component of components) {
      if (component.attributes.get('exported') !== 'true') continue;
      const launcher = component.name === 'activity' && descendants(component).some(
        (node) => node.name === 'category'
          && node.attributes.get('name') === 'android.intent.category.LAUNCHER',
      );
      if (!launcher) {
        errors.push(`${component.attributes.get('name')} is exported - any app on the phone can start it`);
      }
    }
    if (components.length === 0) {
      errors.push('no component in the application - this check read nothing (B166)');
    }
  }
}

const entries = run('unzip', ['-Z1', apk]).split('\n');
if (!entries.includes('assets/stage.tar')) {
  errors.push('the shell-free core (assets/stage.tar) is not inside - the app would have nothing to start');
} else {
  const inside = run('sh', ['-c', `unzip -p "$1" assets/stage.tar | tar -t`, 'sh', apk]).split('\n');
  for (const script of ['daemon.mjs', 'join.mjs', 'entries.mjs', 'capture.mjs', 'reachability.mjs',
    'keystore-port.mjs', 'preload.cjs']) {
    if (!inside.includes(`app-stage/${script}`)) {
      errors.push(`the core carries no ${script}, which a service of the app starts`);
    }
  }
}
if (!entries.includes('lib/arm64-v8a/libnode.so')) {
  errors.push('the APK carries no Node runtime');
}

let certificate = '';
try {
  const printed = run(tool('apksigner'), ['verify', '--print-certs', apk]);
  certificate = /Signer #1 certificate SHA-256 digest: ([0-9a-f]{64})/u.exec(printed)?.[1] ?? '';
  if (certificate === '') errors.push('apksigner verified but printed no certificate digest');
} catch (error) {
  errors.push(`apksigner refused the signature: ${String(error.stderr ?? error.message).trim()}`);
}
const pinPath = join(here, 'release-certificate.sha256');
if (release) {
  if (!existsSync(pinPath)) {
    errors.push('--release and no release-certificate.sha256 - a release is checked against a pinned key');
  } else if (readFileSync(pinPath, 'utf8').trim() !== certificate) {
    errors.push(`signed by ${certificate}, which is not the pinned release certificate`);
  }
}

if (errors.length > 0) {
  console.error(`APK check failed for ${apk}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const digest = createHash('sha256').update(readFileSync(apk)).digest('hex');
writeFileSync(`${apk}.sha256`, `${digest}  ${basename(apk)}\n`);
console.log(
  `APK check passed (${basename(apk)}: ${manifest.attributes.get('package')} `
  + `${manifest.attributes.get('versionName')} (${manifest.attributes.get('versionCode')}), `
  + `only the launcher exported, not debuggable, no backup, core inside; signed by ${certificate}`
  + `${release ? ', the pinned release certificate' : ''}).`,
);
