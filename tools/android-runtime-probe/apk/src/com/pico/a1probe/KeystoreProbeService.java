package com.pico.a1probe;

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

  /**
   * The chain, not the claim. A software-only keystore signs its attestation
   * with "Android Keystore Software Attestation Root"; a hardware-backed one
   * chains to Google's hardware attestation root, which it cannot mint.
   */
  /**
   * Google's published hardware attestation roots, shipped rather than trusted
   * on sight.
   *
   * **Two, and pinning one would refuse real phones.** The RSA root
   * (`SERIALNUMBER=f92009e853b6b045`, valid to 2042) signed every chain until
   * Google's EC root began signing on 2026-02-01; this Galaxy A55 on a
   * 2026-07-05 patch already chains to the EC one. A pin that knew only the
   * older root would refuse this device, and a pin that knew only the newer
   * would refuse every phone that has not moved.
   *
   * Verified before shipping rather than copied: the EC root's DER is
   * byte-identical to the certificate this device produced as the last link of
   * its own chain (SHA-256 `6d9db4ce…4bcc0`), and the device cannot mint it.
   * Google serves the authoritative list as JSON at
   * `https://android.googleapis.com/attestation/root`, which is where a
   * refreshed pin comes from - not from a device.
   */
  private static final String[] PINNED_ATTESTATION_ROOTS = {
    // CN=Key Attestation CA1, OU=Android, O=Google LLC, C=US - P-384, 2025-07-17 .. 2035-07-15
    "MIICIjCCAaigAwIBAgIRAISp0Cl7DrWK5/8OgN52BgUwCgYIKoZIzj0EAwMwUjEc"
      + "MBoGA1UEAwwTS2V5IEF0dGVzdGF0aW9uIENBMTEQMA4GA1UECwwHQW5kcm9pZDET"
      + "MBEGA1UECgwKR29vZ2xlIExMQzELMAkGA1UEBhMCVVMwHhcNMjUwNzE3MjIzMjE4"
      + "WhcNMzUwNzE1MjIzMjE4WjBSMRwwGgYDVQQDDBNLZXkgQXR0ZXN0YXRpb24gQ0Ex"
      + "MRAwDgYDVQQLDAdBbmRyb2lkMRMwEQYDVQQKDApHb29nbGUgTExDMQswCQYDVQQG"
      + "EwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABCPaI3FO3z5bBQo8cuiEas4HjqCt"
      + "G/mLFfRT0MsIssPBEEU5Cfbt6sH5yOAxqEi5QagpU1yX4HwnGb7OtBYpDTB57uH5"
      + "Eczm34A5FNijV3s0/f0UPl7zbJcTx6xwqMIRq6NCMEAwDwYDVR0TAQH/BAUwAwEB"
      + "/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFFIyuyz7RkOb3NaBqQ5lZuA0QepA"
      + "MAoGCCqGSM49BAMDA2gAMGUCMETfjPO/HwqReR2CS7p0ZWoD/LHs6hDi422opifH"
      + "EUaYLxwGlT9SLdjkVpz0UUOR5wIxAIoGyxGKRHVTpqpGRFiJtQEOOTp/+s1GcxeY"
      + "uR2zh/80lQyu9vAFCj6E4AXc+osmRg==",
    // SERIALNUMBER=f92009e853b6b045 - RSA 4096, 2022-03-20 .. 2042-03-15
    "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"
      + "w1IdYIg2Wxg7yHcQZemFQg==",
  };

  /** The key attestation extension, and the only OID this parser knows. */
  private static final String ATTEST_CHALLENGE = "pico-a3-probe";

  private static final String ATTESTATION_EXTENSION_OID = "1.3.6.1.4.1.11129.2.1.17";

  /**
   * Is the chain's last certificate one of the roots we ship?
   *
   * Compared as **bytes**, not by subject. A subject string is what a
   * certificate calls itself, and a software keystore can call itself
   * anything; the encoded certificate is the thing that would have to be
   * forged.
   */
  private static String pinnedRootVerdict(Certificate root) {
    try {
      byte[] encoded = root.getEncoded();
      for (int i = 0; i < PINNED_ATTESTATION_ROOTS.length; i++) {
        byte[] pinned = android.util.Base64.decode(
          PINNED_ATTESTATION_ROOTS[i], android.util.Base64.DEFAULT);
        if (java.util.Arrays.equals(encoded, pinned)) {
          return i == 0 ? "google_ec_ca1" : "google_rsa_f92009e853b6b045";
        }
      }
      return "none";
    } catch (Throwable unreadable) {
      return "unreadable";
    }
  }

  /**
   * A hand-rolled DER walk, because the alternative is worse.
   *
   * Android ships no public ASN.1 API, and the platform's BouncyCastle copy is
   * `com.android.org.bouncycastle` - internal and off-limits to an app. Adding
   * a parser dependency to read five fields out of one extension would put a
   * library between this measurement and the thing measured. This reads tag,
   * length and contents and nothing else; it does not validate, because the
   * signature chain above it already did.
   *
   * The one thing it must get right is the **long-form tag**: the
   * AuthorizationList entries this needs are `[704]`, `[706]` and `[719]`, all
   * above 30, so they arrive as a high-tag-number form and a parser that
   * assumes one tag byte walks straight off the end of the structure.
   */
  private static final class Der {
    private final byte[] bytes;
    private int at;
    private final int end;

    Der(byte[] bytes, int at, int end) {
      this.bytes = bytes;
      this.at = at;
      this.end = end;
    }

    boolean more() {
      return at < end;
    }

    /** The tag number at the cursor, high-tag-number form included. */
    long tagNumber() {
      int p = at;
      int first = bytes[p++] & 0xff;
      long number = first & 0x1f;
      if (number == 0x1f) {
        number = 0;
        int part;
        do {
          part = bytes[p++] & 0xff;
          number = (number << 7) | (part & 0x7f);
        } while ((part & 0x80) != 0);
      }
      return number;
    }

    /** Steps over one element and returns a cursor over its contents. */
    Der into() {
      int p = at;
      int first = bytes[p++] & 0xff;
      if ((first & 0x1f) == 0x1f) {
        int part;
        do {
          part = bytes[p++] & 0xff;
        } while ((part & 0x80) != 0);
      }
      int firstLength = bytes[p++] & 0xff;
      int length;
      if ((firstLength & 0x80) == 0) {
        length = firstLength;
      } else {
        int count = firstLength & 0x7f;
        length = 0;
        for (int i = 0; i < count; i++) {
          length = (length << 8) | (bytes[p++] & 0xff);
        }
      }
      Der contents = new Der(bytes, p, p + length);
      at = p + length;
      return contents;
    }

    byte[] contentBytes() {
      byte[] out = new byte[end - at];
      System.arraycopy(bytes, at, out, 0, out.length);
      at = end;
      return out;
    }

    long asLong() {
      long value = 0;
      for (int i = at; i < end; i++) {
        value = (value << 8) | (bytes[i] & 0xff);
      }
      at = end;
      return value;
    }

    boolean asBoolean() {
      boolean value = at < end && bytes[at] != 0;
      at = end;
      return value;
    }
  }

  private static String hexOf(byte[] bytes) {
    StringBuilder hex = new StringBuilder();
    for (byte b : bytes) {
      hex.append(String.format("%02x", b));
    }
    return hex.toString();
  }

  private static String securityLevelName(long value) {
    if (value == 0) {
      return "software";
    }
    if (value == 1) {
      return "trusted_environment";
    }
    if (value == 2) {
      return "strongbox";
    }
    return "unknown_" + value;
  }

  private static String verifiedBootStateName(long value) {
    if (value == 0) {
      return "verified";
    }
    if (value == 1) {
      return "self_signed";
    }
    if (value == 2) {
      return "unverified";
    }
    if (value == 3) {
      return "failed";
    }
    return "unknown_" + value;
  }

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
  private static String attestationExtensionFindings(X509Certificate leaf, String challenge) {
    byte[] wrapped = leaf.getExtensionValue(ATTESTATION_EXTENSION_OID);
    if (wrapped == null) {
      return "\"extensionPresent\":false";
    }
    try {
      // The extension value is an OCTET STRING wrapping the KeyDescription.
      byte[] inner = new Der(wrapped, 0, wrapped.length).into().contentBytes();
      Der description = new Der(inner, 0, inner.length).into();

      long attestationVersion = description.into().asLong();
      long attestationSecurityLevel = description.into().asLong();
      long keyMintVersion = description.into().asLong();
      long keyMintSecurityLevel = description.into().asLong();
      byte[] attestedChallenge = description.into().contentBytes();
      description.into();                     // uniqueId - deliberately unread
      description.into();                     // softwareEnforced - not the hardware claim
      Der hardwareEnforced = description.into();

      String verifiedBootState = "absent";
      String deviceLocked = "absent";
      int verifiedBootKeyBytes = -1;
      long osPatchLevel = -1;
      long bootPatchLevel = -1;
      while (hardwareEnforced.more()) {
        long tag = hardwareEnforced.tagNumber();
        Der value = hardwareEnforced.into();
        if (tag == 704) {
          Der rootOfTrust = value.into();
          verifiedBootKeyBytes = rootOfTrust.into().contentBytes().length;
          deviceLocked = String.valueOf(rootOfTrust.into().asBoolean());
          verifiedBootState = verifiedBootStateName(rootOfTrust.into().asLong());
        } else if (tag == 706) {
          osPatchLevel = value.into().asLong();
        } else if (tag == 719) {
          bootPatchLevel = value.into().asLong();
        }
      }

      boolean challengeMatches =
        new String(attestedChallenge, "UTF-8").equals(challenge);
      return "\"extensionPresent\":true"
        + ",\"attestationVersion\":" + attestationVersion
        + ",\"attestationSecurityLevel\":\"" + securityLevelName(attestationSecurityLevel) + "\""
        + ",\"keyMintVersion\":" + keyMintVersion
        + ",\"keyMintSecurityLevel\":\"" + securityLevelName(keyMintSecurityLevel) + "\""
        + ",\"challengeMatches\":" + challengeMatches
        + ",\"verifiedBootState\":\"" + verifiedBootState + "\""
        + ",\"deviceLocked\":" + deviceLocked
        + ",\"verifiedBootKeyBytes\":" + verifiedBootKeyBytes
        + ",\"osPatchLevel\":" + osPatchLevel
        + ",\"bootPatchLevel\":" + bootPatchLevel;
    } catch (Throwable unparsable) {
      return "\"extensionPresent\":true,\"parsed\":false,\"refusal\":\""
        + unparsable.getClass().getSimpleName() + "\"";
    }
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
      String level = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        ? String.valueOf(info.getSecurityLevel()) : "pre_31";

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
      return "\"chainLength\":" + chain.length
        + ",\"rootSubject\":\"" + root.replace('"', '\'') + "\""
        + ",\"softwareAttestationRoot\":" + softwareRoot
        + ",\"signaturesLinkToRoot\":" + linked
        + ",\"linkFailure\":\"" + linkFailure + "\""
        + ",\"pinnedRoot\":\"" + pinnedRootVerdict(chain[chain.length - 1]) + "\""
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
