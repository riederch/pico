package com.pico.a1probe;

import io.github.riederch.pico.*;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.IBinder;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.security.keystore.UserNotAuthenticatedException;
import java.io.File;
import java.io.FileWriter;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * ADR 0131 A3 / ADR 0081 P3, Android tranche - the measurement half.
 *
 * ADR 0081 lets a platform keystore hold the *unlock secret*, never the keys
 * as their canonical form, and the Linux tranche earns that by refusing
 * Electron's `basic_text`: a backend that "encrypts" with a hardcoded key is
 * a file with a lock painted on it. Android's version of `basic_text` is a
 * key the AndroidKeyStore provider created in software, and the difference
 * is not visible from the API that created it - `KeyStore.getInstance(
 * "AndroidKeyStore")` succeeds either way.
 *
 * So this asks the three questions a P3 analysis for Android has to answer,
 * and asks them of the device rather than of the documentation:
 *
 *  1. Where does a key actually live - software, TEE, or StrongBox? Read
 *     from `KeyInfo.getSecurityLevel()` *and*, independently, from the
 *     attestation chain, because the first is the platform describing itself
 *     and the second is a certificate chain that a software-only keystore
 *     cannot forge a hardware root for.
 *  2. Does the keystore fail *closed* when the person is not there? A key
 *     with `setUserAuthenticationRequired(true)` must refuse to initialise a
 *     cipher without a fresh authentication - that refusal is the entire
 *     value of the biometric prompt, and an implementation that silently
 *     works without it would be worse than no keystore at all.
 *  3. Does a hardware-held key round-trip the bytes an unlock secret is?
 *
 * Writes one JSON object per finding to `keystore.log` in the app's private
 * files dir, then `KEYSTORE_PROBE_OK`. A throw ends it with a `failure` line,
 * because a probe that swallows its own errors measures nothing.
 */
public final class KeystoreProbeService extends Service {
  private static final String TEE_ALIAS = "pico_probe_tee";
  private static final String STRONGBOX_ALIAS = "pico_probe_strongbox";
  private static final String AUTH_ALIAS = "pico_probe_auth_required";
  private static final String ATTEST_ALIAS = "pico_probe_attested";

  private FileWriter out;
  private boolean started = false;

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (started) {
      return START_NOT_STICKY;
    }
    started = true;
    NotificationManager manager = getSystemService(NotificationManager.class);
    manager.createNotificationChannel(new NotificationChannel(
      "pico_a3", "Pico A3 Keystore Probe", NotificationManager.IMPORTANCE_LOW));
    startForeground(0xa3,
      new Notification.Builder(this, "pico_a3")
        .setSmallIcon(android.R.drawable.stat_notify_sync)
        .setContentTitle("KeystoreProbeService")
        .build());
    new Thread(new Runnable() {
      @Override public void run() { probe(); }
    }, "pico-keystore-probe").start();
    return START_NOT_STICKY;
  }

  @Override public IBinder onBind(Intent intent) { return null; }

  private void probe() {
    try {
      out = new FileWriter(new File(getFilesDir(), "keystore.log"), false);
      report("environment",
        "\"sdkInt\":" + Build.VERSION.SDK_INT
        + ",\"device\":\"" + Build.MODEL + "\""
        + ",\"securityPatch\":\"" + Build.VERSION.SECURITY_PATCH + "\"");

      PackageManager packages = getPackageManager();
      report("declared_features",
        "\"strongBox\":" + packages.hasSystemFeature(
          PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        + ",\"hardwareKeystore\":" + packages.hasSystemFeature(
          PackageManager.FEATURE_HARDWARE_KEYSTORE)
        + ",\"fingerprint\":" + packages.hasSystemFeature(
          PackageManager.FEATURE_FINGERPRINT));

      // 1a. A plain AES key: what the platform gives when nothing is asked for.
      SecretKey tee = generateAes(TEE_ALIAS, false, false);
      report("default_key", "\"securityLevel\":\"" + securityLevelOf(tee) + "\"");

      // 1b. StrongBox explicitly, which throws where there is no secure element.
      String strongBoxResult;
      try {
        SecretKey strongBox = generateAes(STRONGBOX_ALIAS, true, false);
        strongBoxResult = "\"available\":true,\"securityLevel\":\""
          + securityLevelOf(strongBox) + "\"";
      } catch (Throwable error) {
        strongBoxResult = "\"available\":false,\"refusal\":\""
          + error.getClass().getSimpleName() + "\"";
      }
      report("strongbox_key", strongBoxResult);

      // 1c. Attestation: the platform's claim about itself, checked against a
      // chain it would have to forge a hardware root to fake.
      report("attestation", attestationFindings());
      // Nach der Messung, weil sie die Felder füllt: der Beleg ist eine
      // Sicht auf das Gemessene, keine zweite Messung.
      report("pico_keystore_evidence", picoKeystoreEvidence());

      // 2. Fail-closed. The cipher must refuse without a fresh authentication.
      String failClosed;
      try {
        SecretKey guarded = generateAes(AUTH_ALIAS, false, true);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, guarded);
        failClosed = "\"failsClosed\":false,\"note\":\"cipher initialised with no authentication\"";
      } catch (UserNotAuthenticatedException expected) {
        failClosed = "\"failsClosed\":true,\"refusal\":\"UserNotAuthenticatedException\"";
      } catch (Throwable error) {
        failClosed = "\"failsClosed\":true,\"refusal\":\""
          + error.getClass().getSimpleName() + "\"";
      }
      report("user_authentication_required", failClosed);

      // 3. The round trip an unlock secret actually needs.
      byte[] secret = new byte[32];
      new java.security.SecureRandom().nextBytes(secret);
      Cipher sealing = Cipher.getInstance("AES/GCM/NoPadding");
      sealing.init(Cipher.ENCRYPT_MODE, tee);
      byte[] nonce = sealing.getIV();
      byte[] sealed = sealing.doFinal(secret);
      Cipher opening = Cipher.getInstance("AES/GCM/NoPadding");
      opening.init(Cipher.DECRYPT_MODE, tee, new GCMParameterSpec(128, nonce));
      byte[] opened = opening.doFinal(sealed);
      report("unlock_secret_round_trip",
        "\"bytes\":" + secret.length
        + ",\"sealedBytes\":" + sealed.length
        + ",\"identical\":" + java.util.Arrays.equals(secret, opened));

      // A keystore key survives process death; that is the point of it.
      KeyStore store = KeyStore.getInstance("AndroidKeyStore");
      store.load(null);
      report("persistence", "\"aliasFound\":" + store.containsAlias(TEE_ALIAS));

      out.write("KEYSTORE_PROBE_OK\n");
      out.flush();
      cleanUp();
    } catch (Throwable error) {
      try {
        if (out != null) {
          report("failure", "\"error\":\"" + error.getClass().getName()
            + ": " + String.valueOf(error.getMessage()).replace('"', '\'') + "\"");
          out.write("KEYSTORE_PROBE_FAILED\n");
          out.flush();
        }
      } catch (Throwable ignored) {
        // The log is the only channel; nothing further to say.
      }
    }
  }

  private SecretKey generateAes(String alias, boolean strongBox, boolean authRequired)
      throws Exception {
    KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
      alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256);
    if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      spec.setIsStrongBoxBacked(true);
    }
    if (authRequired) {
      spec.setUserAuthenticationRequired(true);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        spec.setUserAuthenticationParameters(30, KeyProperties.AUTH_BIOMETRIC_STRONG);
      }
    }
    KeyGenerator generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(spec.build());
    return generator.generateKey();
  }

  private String securityLevelOf(SecretKey key) throws Exception {
    javax.crypto.SecretKeyFactory factory = javax.crypto.SecretKeyFactory.getInstance(
      key.getAlgorithm(), "AndroidKeyStore");
    KeyInfo info = (KeyInfo) factory.getKeySpec(key, KeyInfo.class);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      switch (info.getSecurityLevel()) {
        case KeyProperties.SECURITY_LEVEL_SOFTWARE: return "software";
        case KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT: return "trusted_environment";
        case KeyProperties.SECURITY_LEVEL_STRONGBOX: return "strongbox";
        case KeyProperties.SECURITY_LEVEL_UNKNOWN_SECURE: return "unknown_secure";
        default: return "unknown";
      }
    }
    return info.isInsideSecureHardware() ? "secure_hardware_pre_31" : "software";
  }

  /** The key attestation extension, and the only OID this parser knows. */
  private static final String ATTEST_CHALLENGE = "pico-a3-probe";

  /**
   * What the extension says, as opposed to what the platform says about itself.
   *
   * `KeyInfo.getSecurityLevel()` and `attestationSecurityLevel` answer the same
   * question, and on a keystore that is software all the way down the first one
   * lies while the second cannot: it sits inside bytes signed by a key the
   * device does not hold. Reading both and requiring them to agree is the
   * point, and it is why this measurement exists at all.
   *
   * The challenge is read back for the same reason a nonce exists: without it,
   * a replayed certificate chain from some other, genuinely hardware-backed
   * phone would attest just as well.
   */
  private String keyInfoLevel = "absent";
  private String attestationRoot = "none";
  private KeystoreEvidence.Attested attested = new KeystoreEvidence.Attested();

  /**
   * Die Messnotiz - dieselbe Erweiterung, nur ausführlicher gelesen.
   *
   * Der DER-Lauf liegt seit dem 2026-08-21 in `KeystoreEvidence`, weil der
   * Beitritt ihn ebenfalls braucht. Hier stehen die Zahlen, die ein Mensch
   * beim Messen sehen will und nach denen kein Produkt entscheidet:
   * Versionsnummern, die Länge des Verified-Boot-Schlüssels, und die
   * Ablehnung mit Namen, falls der Lauf abbricht.
   */
  private String attestationExtensionFindings(X509Certificate leaf, String challenge) {
    this.attested = KeystoreEvidence.read(leaf, challenge);
    if (!attested.extensionPresent) {
      return "\"extensionPresent\":false";
    }
    if (!"none".equals(attested.refusal)) {
      return "\"extensionPresent\":true,\"parsed\":false,\"refusal\":\""
        + attested.refusal + "\"";
    }
    return "\"extensionPresent\":true"
      + ",\"attestationVersion\":" + attested.attestationVersion
      + ",\"attestationSecurityLevel\":\"" + attested.attestationLevel + "\""
      + ",\"keyMintVersion\":" + attested.keyMintVersion
      + ",\"keyMintSecurityLevel\":\"" + attested.attestedKeyLevel + "\""
      + ",\"challengeMatches\":" + attested.challengeMatches
      + ",\"verifiedBootState\":\"" + attested.verifiedBootState + "\""
      + ",\"deviceLocked\":" + attested.deviceLockedText
      + ",\"verifiedBootKeyBytes\":" + attested.verifiedBootKeyBytes
      + ",\"osPatchLevel\":" + attested.osPatchLevel
      + ",\"bootPatchLevel\":" + attested.bootPatchLevel;
  }

  /**
   * Derselbe Befund noch einmal, aber in der Form, die der Kern liest -
   * `PicoCompanionAndroidKeystoreEvidence` in `apps/companion`.
   *
   * ADR 0131 A3 sagt, warum das hier entsteht und nicht dort: das Urteil
   * hängt an einem `KeyInfo` und an einer Zertifikatskette, und der
   * schalenfreie Kern sieht keins von beidem. Was übergeht, ist ein Verdikt
   * **mit seinen Belegen**, und der Kern prüft nicht, ob der Schlüssel im TEE
   * liegt - das kann er nicht -, sondern ob die Belege zusammenpassen.
   *
   * Deshalb steht hier auch nichts drin, was diese Klasse nicht gemessen hat.
   * Ein Feld mit einem plausiblen Vorgabewert wäre genau die Lüge, gegen die
   * die zweite Quelle überhaupt gelesen wird - `absent` fällt im Kern durch,
   * ein erfundenes `trusted_environment` nicht.
   */
  private String picoKeystoreEvidence() {
    return KeystoreEvidence.json(keyInfoLevel, attestationRoot, attested);
  }


  private String attestationFindings() {
    try {
      java.security.KeyPairGenerator generator = java.security.KeyPairGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
      generator.initialize(new KeyGenParameterSpec.Builder(
        ATTEST_ALIAS, KeyProperties.PURPOSE_SIGN)
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setAttestationChallenge(ATTEST_CHALLENGE.getBytes("UTF-8"))
        .build());
      generator.generateKeyPair();

      KeyStore store = KeyStore.getInstance("AndroidKeyStore");
      store.load(null);
      Certificate[] chain = store.getCertificateChain(ATTEST_ALIAS);
      PrivateKey key = (PrivateKey) store.getKey(ATTEST_ALIAS, null);
      java.security.KeyFactory factory = java.security.KeyFactory.getInstance(
        key.getAlgorithm(), "AndroidKeyStore");
      KeyInfo info = factory.getKeySpec(key, KeyInfo.class);

      String root = ((X509Certificate) chain[chain.length - 1])
        .getSubjectX500Principal().getName();
      boolean softwareRoot = root.toLowerCase().contains("software");
      // Als **Name**, nicht als Zahl. `String.valueOf(1)` war hier bis zum
      // 2026-08-21 richtig für einen Messwert und falsch für einen Beleg:
      // die Attestierung nennt dasselbe Niveau `trusted_environment`, und
      // zwei Quellen, die dasselbe verschieden schreiben, kann niemand
      // vergleichen. `SECURITY_LEVEL_UNKNOWN_SECURE` (-1) wird dabei zu
      // `unknown_-1` - sichere Hardware, die nicht sagt welche, und der Kern
      // lehnt sie ab, weil eine geschlossene Liste sonst keine wäre.
      String level = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        ? KeystoreEvidence.securityLevelName(info.getSecurityLevel()) : "pre_31";

      /**
       * Each certificate against the next one's key. Reading the last
       * subject only tells us what the last certificate calls itself;
       * checking the signatures is what makes "this key was attested by
       * something that chains to that root" a claim rather than a label.
       *
       * The root *is* pinned, since 2026-08-21. It was not, and the gate
       * text named that distance rather than papering over it; closing it
       * turned out to be the cheaper half of the measurement and it changed
       * the answer - there are two Google roots, not one, and this device
       * chains to the newer of them.
       */
      boolean linked = true;
      String linkFailure = "none";
      for (int i = 0; i + 1 < chain.length; i++) {
        try {
          chain[i].verify(chain[i + 1].getPublicKey());
        } catch (Throwable broken) {
          linked = false;
          linkFailure = "index " + i + ": " + broken.getClass().getSimpleName();
          break;
        }
      }
      this.keyInfoLevel = level;
      this.attestationRoot = KeystoreEvidence.pinnedRootVerdict(chain[chain.length - 1]);

      return "\"chainLength\":" + chain.length
        + ",\"rootSubject\":\"" + root.replace('"', '\'') + "\""
        + ",\"softwareAttestationRoot\":" + softwareRoot
        + ",\"signaturesLinkToRoot\":" + linked
        + ",\"linkFailure\":\"" + linkFailure + "\""
        + ",\"pinnedRoot\":\"" + KeystoreEvidence.pinnedRootVerdict(chain[chain.length - 1]) + "\""
        + ",\"keyInfoSecurityLevel\":\"" + level + "\""
        + "," + attestationExtensionFindings((X509Certificate) chain[0], ATTEST_CHALLENGE);
    } catch (Throwable error) {
      return "\"available\":false,\"refusal\":\"" + error.getClass().getSimpleName() + "\"";
    }
  }

  /** A probe leaves no keys behind; the device is the user's, not the test's. */
  private void cleanUp() {
    try {
      KeyStore store = KeyStore.getInstance("AndroidKeyStore");
      store.load(null);
      for (String alias : new String[] { TEE_ALIAS, STRONGBOX_ALIAS, AUTH_ALIAS, ATTEST_ALIAS }) {
        if (store.containsAlias(alias)) {
          store.deleteEntry(alias);
        }
      }
    } catch (Throwable ignored) {
      // Best effort: the aliases are probe-named and overwritten next run.
    }
  }

  private void report(String step, String fields) throws Exception {
    out.write("{\"step\":\"" + step + "\"," + fields + "}\n");
    out.flush();
  }
}
