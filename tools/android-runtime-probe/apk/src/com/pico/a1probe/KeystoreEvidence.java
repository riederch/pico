package com.pico.a1probe;

import java.security.cert.Certificate;
import java.security.cert.X509Certificate;

/**
 * ADR 0131 A3. Was ein Android-Keystore über sich beweisen kann, und in
 * welcher Form der Kern es liest.
 *
 * **Diese Klasse entstand am 2026-08-21 durch Herausziehen aus
 * `KeystoreProbeService`**, und der Grund ist derselbe, aus dem es sie gibt:
 * die Messung war eine Messung, solange nur ein Laborlauf sie las. Sobald der
 * Beitritt denselben Beleg braucht, um eine Passphrase zu versiegeln, wäre
 * eine zweite Kopie der Regel entstanden - und eine Wahrheit, die zweimal
 * geschrieben steht, driftet. Genau das war hier schon einmal passiert, bevor
 * die beiden Hälften sich überhaupt begegnet waren.
 *
 * Was hier liegt, ist die Regel: die gepinnten Wurzeln, der DER-Lauf durch
 * die Attestierungserweiterung, die Namen der Sicherheitsniveaus, und die
 * Zusammenstellung des Belegsatzes in der Form, die
 * `apps/companion/src/platform-secrets.ts` erwartet. Was dort blieb, ist die
 * Messung: Kettenlänge, Wurzelsubjekt, ob die Signaturen durchlinken - Zahlen,
 * die ein Mensch liest, und keine, nach denen ein Produkt entscheidet.
 */
public final class KeystoreEvidence {
  private KeystoreEvidence() {}

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
  static final String[] PINNED_ATTESTATION_ROOTS = {
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

  static final String ATTESTATION_EXTENSION_OID = "1.3.6.1.4.1.11129.2.1.17";

  /**
   * Is the chain's last certificate one of the roots we ship?
   *
   * Compared as **bytes**, not by subject. A subject string is what a
   * certificate calls itself, and a software keystore can call itself
   * anything; the encoded certificate is the thing that would have to be
   * forged.
   */
  static String pinnedRootVerdict(Certificate root) {
    try {
      byte[] encoded = root.getEncoded();
      for (int i = 0; i < PINNED_ATTESTATION_ROOTS.length; i++) {
        byte[] pinned = android.util.Base64.decode(
          PINNED_ATTESTATION_ROOTS[i], android.util.Base64.DEFAULT);
        if (java.util.Arrays.equals(encoded, pinned)) {
          // Die Namen stehen im Kern, in `picoCompanionAndroidAttestationRoots`.
          // Hier stehen sie ein zweites Mal, weil Java und TypeScript keine
          // Konstante teilen können - und deshalb bewacht
          // `scripts/check-android-keystore-names.mjs` die Gleichheit.
          return i == 0
            ? "google_ec_key_attestation_ca1"
            : "google_rsa_f92009e853b6b045";
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
  static final class Der {
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

  static String hexOf(byte[] bytes) {
    StringBuilder hex = new StringBuilder();
    for (byte b : bytes) {
      hex.append(String.format("%02x", b));
    }
    return hex.toString();
  }

  static String securityLevelName(long value) {
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

  static String verifiedBootStateName(long value) {
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
   * Was in der signierten Erweiterung steht - einmal gelesen, von beiden
   * Nutzern verwendet.
   *
   * Die Vorgaben sind `absent` und `false`, nicht etwas Plausibles. Ein Feld,
   * das die Erweiterung nicht enthielt, muss im Kern durchfallen; ein
   * vorgetäuschtes `trusted_environment` täte das nicht, und dann wäre die
   * zweite Quelle, deren ganzer Zweck das Widersprechen ist, eine Quelle, die
   * immer zustimmt.
   */
  public static final class Attested {
    public boolean extensionPresent = false;
    public long attestationVersion = -1;
    public long keyMintVersion = -1;
    public String attestationLevel = "absent";
    public String attestedKeyLevel = "absent";
    public boolean challengeMatches = false;
    public String verifiedBootState = "absent";
    public String deviceLockedText = "absent";
    public int verifiedBootKeyBytes = -1;
    public String osPatchLevel = "absent";
    public String bootPatchLevel = "absent";
    public String refusal = "none";
  }

  /**
   * Der DER-Lauf durch die Erweiterung des Blattzertifikats.
   *
   * Er validiert nichts - die Signaturkette darüber hat das getan. Was er
   * muss, ist die **Langform des Tags** richtig lesen: die interessanten
   * Felder tragen 704, 706 und 719, alle über 30, und wer nur die kurze Form
   * kennt, liest ab da Unsinn und merkt es nicht.
   */
  public static Attested read(X509Certificate leaf, String challenge) {
    Attested found = new Attested();
    byte[] wrapped = leaf.getExtensionValue(ATTESTATION_EXTENSION_OID);
    if (wrapped == null) {
      return found;
    }
    found.extensionPresent = true;
    try {
      byte[] inner = new Der(wrapped, 0, wrapped.length).into().contentBytes();
      Der description = new Der(inner, 0, inner.length).into();

      found.attestationVersion = description.into().asLong();
      found.attestationLevel = securityLevelName(description.into().asLong());
      found.keyMintVersion = description.into().asLong();
      found.attestedKeyLevel = securityLevelName(description.into().asLong());
      byte[] attestedChallenge = description.into().contentBytes();
      description.into();                     // uniqueId - deliberately unread
      description.into();                     // softwareEnforced - not the hardware claim
      Der hardwareEnforced = description.into();

      while (hardwareEnforced.more()) {
        long tag = hardwareEnforced.tagNumber();
        Der value = hardwareEnforced.into();
        if (tag == 704) {
          Der rootOfTrust = value.into();
          found.verifiedBootKeyBytes = rootOfTrust.into().contentBytes().length;
          found.deviceLockedText = String.valueOf(rootOfTrust.into().asBoolean());
          found.verifiedBootState = verifiedBootStateName(rootOfTrust.into().asLong());
        } else if (tag == 706) {
          found.osPatchLevel = String.valueOf(value.into().asLong());
        } else if (tag == 719) {
          found.bootPatchLevel = String.valueOf(value.into().asLong());
        }
      }
      found.challengeMatches =
        new String(attestedChallenge, "UTF-8").equals(challenge);
    } catch (Throwable unparsable) {
      found.refusal = unparsable.getClass().getSimpleName();
    }
    return found;
  }

  /**
   * Der Belegsatz in der Form, die der Kern liest -
   * `PicoCompanionAndroidKeystoreEvidence`.
   *
   * `keyInfoLevel` kommt von woanders her als der Rest, und das ist der Punkt:
   * die eine Auskunft gibt der Keystore über sich selbst, die andere steht in
   * Bytes, die ein Schlüssel signiert hat, den das Gerät nicht besitzt. Auf
   * einem Keystore, der durchgehend Software ist, sagt die erste dasselbe und
   * die zweite kann es nicht.
   *
   * Die Feldnamen stehen ein zweites Mal in `platform-secrets.ts`, weil Java
   * und TypeScript keine Konstante teilen - `scripts/check-android-keystore-names.mjs`
   * hält beide Seiten gleich.
   */
  public static String json(String keyInfoLevel, String attestationRoot, Attested attested) {
    return "\"platform\":\"android\""
      + ",\"keyInfoLevel\":\"" + keyInfoLevel + "\""
      + ",\"attestedKeyLevel\":\"" + attested.attestedKeyLevel + "\""
      + ",\"attestationLevel\":\"" + attested.attestationLevel + "\""
      + ",\"attestationRoot\":\"" + attestationRoot + "\""
      + ",\"challengeMatches\":" + attested.challengeMatches
      + ",\"verifiedBootState\":\"" + attested.verifiedBootState + "\""
      + ",\"deviceLocked\":" + "true".equals(attested.deviceLockedText)
      + ",\"osPatchLevel\":\"" + attested.osPatchLevel + "\""
      + ",\"bootPatchLevel\":\"" + attested.bootPatchLevel + "\"";
  }
}
