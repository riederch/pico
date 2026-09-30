# Signing the Android app

ADR 0131, status note 2026-09-27: the Android app is published as an APK on
the GitHub release, beside the Linux `.deb`, and signed in CI with a key kept
as an encrypted repository secret. This page is the one-time setup of that key
and what follows from it.

## Why the key matters more than anything else here

Android recognises an app by two things: its application id
(`io.github.riederch.pico`) and the key that signed it. An update installs
only when both are unchanged. A lost key therefore cannot be replaced: every
phone would have to uninstall Pico - and with it the vault and the device's
membership - and join its Home again. A leaked key lets whoever holds it sign
an update every installed copy accepts.

So the key has exactly two homes: the CI secret, which signs, and one backup
that the person who owns the project keeps. Nobody else - no agent, no chat,
no repository file - ever sees the key or its password.

## One-time setup (the project owner, on their own machine)

1. **Make the key.** `keytool` asks for a password; choose a long one and keep
   it with the backup.

   ```bash
   keytool -genkeypair -keystore ~/pico-release.keystore -alias pico \
     -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Pico"
   ```

   Ten thousand days is about 27 years: longer than any phone that installs
   this app will live, so the key never expires under it.

2. **Back it up** - the keystore file *and* its password, together, somewhere
   that survives this machine (a password manager's file attachment, or
   encrypted offline storage). Without the backup, step 1 is a single point
   of failure for every installed copy.

3. **Hand it to CI** as two repository secrets. `gh` prompts for the password
   so it never lands in the shell history:

   ```bash
   base64 -w0 ~/pico-release.keystore | gh secret set PICO_APK_KEYSTORE_BASE64
   gh secret set PICO_APK_KEYSTORE_PASS
   ```

4. **Pin its certificate in the repository.** This is public - a hash of the
   certificate, not the key - and it is what makes CI refuse an APK signed by
   anything else:

   ```bash
   keytool -exportcert -keystore ~/pico-release.keystore -alias pico \
     | sha256sum | cut -d' ' -f1 > apps/android/release-certificate.sha256
   ```

   Commit that file. `apps/android/check-apk.mjs --release` compares it with
   the digest `apksigner` prints for the built APK; a release without the file,
   or with a different certificate, fails before anything is attached.

## What CI does with it

- **Every push** (`android_package`): builds the APK with a throwaway key made
  on the runner and checks it with `check-apk.mjs` - package id, version,
  not debuggable, no Android backup, only the launcher exported, the core
  inside. The release key is not in this job.
- **A tag** (`android_release`): builds again with the release key, checks it
  against the pinned certificate, and attaches `pico-android-<version>.apk`
  and its `.sha256` to a draft release, once, never replacing an asset that is
  already there. Like the `.deb`, the draft is published by hand.

The repository is private, so GitHub stores no provenance attestation for it
(ADR 0122 Y2 is unmet here exactly as for the `.deb`). The checksum says which
bytes were checked; it does not say who built them.

## On the phone

The APK is installed from the release page. Android asks once to allow
installs from the browser or file manager used ("install unknown apps").
Updates are installed the same way until the app checks for them itself.

## If the key is ever lost or leaked

- **Lost, with no backup:** there is no recovery. Publish under a new key
  and application id, and every phone installs it as a new app and joins its
  Home again.
- **Leaked:** rotate with APK Signature Scheme v3 key rotation, which lets
  installed copies accept a new key vouched for by the old one, and replace
  the pinned certificate. This is a separate, deliberate procedure and is not
  automated here.
