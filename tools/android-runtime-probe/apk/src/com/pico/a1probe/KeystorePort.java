package com.pico.a1probe;

import android.net.LocalServerSocket;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * ADR 0131 A3 / ADR 0081 P3. Der Plattformanschluss, den
 * `PicoCompanionAndroidSecretPort` im Kern beschreibt.
 *
 * Der Kern hält das *Entsperrgeheimnis* nicht selbst; er lässt es versiegeln.
 * Auf Linux tut das Electrons `safeStorage` gegen den Schlüsselbund der
 * angemeldeten Sitzung. Hier tut es ein Schlüssel, der das TEE nie verlässt -
 * und weil es keinen NDK-Weg zum Android-Keystore gibt, kann das nur Java
 * tun. Node fragt, Java antwortet.
 *
 * **Die Grenze ist ein AF_UNIX-Socket im privaten Verzeichnis der App**, so
 * wie eine Ebene weiter der Beitritt mit seiner Oberfläche spricht. Kein
 * Loopback-Port: auf Android erreicht jede App `127.0.0.1`, und ein Port
 * würde dieses Versiegeln jeder anderen App auf dem Telefon anbieten.
 * Umgekehrt zur Oberfläche ist hier Java der Server, weil hier Java die
 * Auskunft hat.
 *
 * **Zwei Schlüssel, nicht einer, und das hat einen Grund.** Versiegelt wird
 * mit AES-GCM; für symmetrische Schlüssel gibt der Keystore keine
 * Attestierungskette heraus. Also entsteht daneben ein EC-Schlüssel mit
 * Challenge, der als Zeuge dient: er wird im selben Keystore, im selben
 * Moment, mit denselben Eigenschaften erzeugt, und seine Kette beweist, was
 * dieser Keystore ist. Der Beleg nennt darum beides getrennt - was der
 * Keystore über den Siegelschlüssel *sagt* (`KeyInfo`), und was eine
 * Unterschrift, die das Gerät nicht fälschen kann, über denselben Keystore
 * *beweist*.
 *
 * **`setUnlockedDeviceRequired` statt eines biometrischen Prompts.** Der
 * Desktop fragt auch nicht bei jedem Entsperren; sein Schlüsselbund hängt an
 * der angemeldeten Sitzung. Das genaue Gegenstück dazu ist ein Schlüssel, der
 * nur bei entsperrtem Gerät arbeitet - nicht einer, der jedes Mal einen
 * Fingerabdruck verlangt. Ein Prompt an dieser Stelle wäre eine andere
 * Entscheidung als die, die der Desktop getroffen hat, und ADR 0131 sagt,
 * dass zwei Clients derselben Person nicht zwei verschiedene Dinge tun.
 */
public final class KeystorePort {
  private static final String SEAL_ALIAS = "pico_unlock_secret_v1";
  private static final String WITNESS_ALIAS = "pico_unlock_witness_v1";

  /** GCM auf dem AndroidKeyStore: 12 Byte IV, 128 Bit Tag. */
  private static final int IV_BYTES = 12;
  private static final int TAG_BITS = 128;

  private KeystorePort() {}

  /**
   * Horcht, bis der Prozess endet. Läuft auf einem eigenen Thread, weil
   * `accept()` blockiert und der Dienst danach noch Node starten muss.
   */
  public static void serve(final File socketFile, final File logFile) {
    new Thread(new Runnable() {
      @Override public void run() {
        try {
          if (socketFile.exists() && !socketFile.delete()) {
            note(logFile, "{\"step\":\"keystore_port\",\"refusal\":\"stale_socket\"}");
            return;
          }
          LocalSocket bound = new LocalSocket();
          bound.bind(new LocalSocketAddress(
            socketFile.getAbsolutePath(), LocalSocketAddress.Namespace.FILESYSTEM));
          LocalServerSocket server = new LocalServerSocket(bound.getFileDescriptor());
          note(logFile, "{\"step\":\"keystore_port\",\"listening\":\""
            + socketFile.getAbsolutePath() + "\"}");
          while (true) {
            LocalSocket connection = server.accept();
            answer(connection, logFile);
          }
        } catch (Throwable stopped) {
          note(logFile, "{\"step\":\"keystore_port\",\"refusal\":\""
            + stopped.getClass().getSimpleName() + "\"}");
        }
      }
    }, "pico-keystore-port").start();
  }

  /**
   * Eine Verbindung, Zeile für Zeile, bis der Frager geht.
   *
   * Nacheinander und nicht nebenläufig: der Keystore hat einen Zustand, und
   * die einzige Frage, die hier gestellt wird, gehört zu einer Zeremonie, die
   * ohnehin nur einmal läuft.
   */
  private static void answer(LocalSocket connection, File logFile) {
    try {
      BufferedReader in = new BufferedReader(
        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
      OutputStream out = connection.getOutputStream();
      String line;
      while ((line = in.readLine()) != null) {
        String reply;
        try {
          reply = handle(line);
        } catch (Throwable refused) {
          // Der Klassenname, nicht die Meldung: eine
          // `UserNotAuthenticatedException` ist etwas anderes als eine
          // `KeyPermanentlyInvalidatedException`, und die Meldung sagt das
          // oft mit demselben Satz.
          reply = "{\"ok\":false,\"refusal\":\""
            + refused.getClass().getSimpleName() + "\"}";
        }
        out.write((reply + "\n").getBytes(StandardCharsets.UTF_8));
        out.flush();
      }
    } catch (Throwable closed) {
      note(logFile, "{\"step\":\"keystore_port\",\"connectionEnded\":\""
        + closed.getClass().getSimpleName() + "\"}");
    } finally {
      try { connection.close(); } catch (Throwable ignored) {}
    }
  }

  /**
   * Eine Zeile ins eigene Protokoll. Der Port läuft in Java, sein Gegenüber
   * schreibt nach `stdout`, und die beiden Ströme zu mischen hieße, eine
   * Reihenfolge zu behaupten, die es zwischen zwei Threads nicht gibt.
   */
  private static synchronized void note(File logFile, String line) {
    try (java.io.FileWriter out = new java.io.FileWriter(logFile, true)) {
      out.write(line + "\n");
    } catch (Throwable ignored) {
      // Ein Anschluss, der an seinem eigenen Protokoll scheitert, versiegelt
      // nichts mehr - und das wäre der teurere Fehler.
    }
  }

  private static String handle(String request) throws Exception {
    String verb = field(request, "v");
    if ("evidence".equals(verb)) {
      return "{\"ok\":true,\"evidence\":{" + evidence() + "}}";
    }
    if ("seal".equals(verb)) {
      return "{\"ok\":true,\"sealedBase64\":\"" + seal(field(request, "text")) + "\"}";
    }
    if ("open".equals(verb)) {
      return "{\"ok\":true,\"text\":\"" + escape(open(field(request, "sealedBase64"))) + "\"}";
    }
    return "{\"ok\":false,\"refusal\":\"unknown_verb\"}";
  }

  /**
   * Der Siegelschlüssel, einmal erzeugt und danach wiedergefunden.
   *
   * Dass er den Prozesstod überlebt, ist die halbe Aufgabe: ein Schlüssel,
   * der bei jedem Start neu entsteht, versiegelt nichts, er verliert es nur
   * langsamer.
   */
  private static SecretKey sealingKey() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (store.containsAlias(SEAL_ALIAS)) {
      return (SecretKey) store.getKey(SEAL_ALIAS, null);
    }
    KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
      SEAL_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      spec.setUnlockedDeviceRequired(true);
    }
    KeyGenerator generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(spec.build());
    return generator.generateKey();
  }

  private static String seal(String text) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, sealingKey());
    byte[] iv = cipher.getIV();
    if (iv.length != IV_BYTES) {
      throw new IllegalStateException("unexpected_iv_length");
    }
    byte[] sealed = cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
    byte[] both = new byte[iv.length + sealed.length];
    System.arraycopy(iv, 0, both, 0, iv.length);
    System.arraycopy(sealed, 0, both, iv.length, sealed.length);
    return android.util.Base64.encodeToString(both, android.util.Base64.NO_WRAP);
  }

  private static String open(String sealedBase64) throws Exception {
    byte[] both = android.util.Base64.decode(sealedBase64, android.util.Base64.NO_WRAP);
    if (both.length <= IV_BYTES) {
      throw new IllegalStateException("sealed_too_short");
    }
    byte[] iv = new byte[IV_BYTES];
    System.arraycopy(both, 0, iv, 0, IV_BYTES);
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.DECRYPT_MODE, sealingKey(), new GCMParameterSpec(TAG_BITS, iv));
    byte[] plain = cipher.doFinal(both, IV_BYTES, both.length - IV_BYTES);
    return new String(plain, StandardCharsets.UTF_8);
  }

  /**
   * Der Beleg über den Keystore, in dem der Siegelschlüssel liegt.
   *
   * Die Challenge ist an den Siegel-Alias gebunden und ändert sich nicht: sie
   * beantwortet hier nicht "ist diese Kette frisch", sondern "gehört diese
   * Kette zu dieser Anfrage" - eine wiedereingespielte Kette von einem
   * anderen Telefon trägt eine andere.
   */
  private static String evidence() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    SecretKey sealing = sealingKey();
    javax.crypto.SecretKeyFactory factory = javax.crypto.SecretKeyFactory.getInstance(
      sealing.getAlgorithm(), "AndroidKeyStore");
    KeyInfo sealingInfo = (KeyInfo) factory.getKeySpec(sealing, KeyInfo.class);
    String keyInfoLevel = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
      ? KeystoreEvidence.securityLevelName(sealingInfo.getSecurityLevel())
      : (sealingInfo.isInsideSecureHardware() ? "trusted_environment" : "software");

    // Der Zeuge: derselbe Keystore, dieselbe Erzeugung, aber asymmetrisch und
    // damit attestierbar. Jedes Mal neu, weil die Challenge sonst die eines
    // früheren Laufs wäre - und eine Challenge, die man wiederverwendet, ist
    // keine.
    if (store.containsAlias(WITNESS_ALIAS)) {
      store.deleteEntry(WITNESS_ALIAS);
    }
    String challenge = "pico_unlock_" + SEAL_ALIAS;
    java.security.KeyPairGenerator keys = java.security.KeyPairGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
    KeyGenParameterSpec.Builder witness = new KeyGenParameterSpec.Builder(
      WITNESS_ALIAS, KeyProperties.PURPOSE_SIGN)
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setAttestationChallenge(challenge.getBytes(StandardCharsets.UTF_8));
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      witness.setUnlockedDeviceRequired(true);
    }
    keys.initialize(witness.build());
    keys.generateKeyPair();

    Certificate[] chain = store.getCertificateChain(WITNESS_ALIAS);
    String root = "none";
    if (chain != null && chain.length > 0) {
      // Erst die Kette durchprüfen, dann die Wurzel benennen. Eine Wurzel, die
      // am Ende einer Kette steht, deren Unterschriften nicht durchlinken,
      // beweist nichts - sie liegt nur dort.
      boolean linked = true;
      for (int i = 0; i + 1 < chain.length; i++) {
        try {
          chain[i].verify(chain[i + 1].getPublicKey());
        } catch (Throwable broken) {
          linked = false;
          break;
        }
      }
      if (linked) {
        root = KeystoreEvidence.pinnedRootVerdict(chain[chain.length - 1]);
      }
    }
    KeystoreEvidence.Attested attested = chain == null || chain.length == 0
      ? new KeystoreEvidence.Attested()
      : KeystoreEvidence.read((X509Certificate) chain[0], challenge);
    PrivateKey unused = (PrivateKey) store.getKey(WITNESS_ALIAS, null);
    if (unused == null) {
      throw new IllegalStateException("witness_key_absent");
    }
    return KeystoreEvidence.json(keyInfoLevel, root, attested);
  }

  /**
   * Ein Feld aus der Anfrage, ohne JSON-Parser.
   *
   * Die Anfragen kommen aus genau einem Prozess - demselben, in dem dieser
   * Code läuft - und haben genau drei Formen. Einen Parser dafür zu ziehen
   * hieße, eine Abhängigkeit zwischen diese Grenze und das zu legen, was sie
   * schützt. Was zurückgeht, ist eine andere Sache: dort steht echtes JSON,
   * weil Node es liest.
   */
  private static String field(String request, String name) {
    String marker = "\"" + name + "\":\"";
    int at = request.indexOf(marker);
    if (at < 0) {
      throw new IllegalArgumentException("missing_field_" + name);
    }
    int from = at + marker.length();
    StringBuilder value = new StringBuilder();
    for (int i = from; i < request.length(); i++) {
      char c = request.charAt(i);
      if (c == '\\' && i + 1 < request.length()) {
        char next = request.charAt(++i);
        value.append(next == 'n' ? '\n' : next == 't' ? '\t' : next);
        continue;
      }
      if (c == '"') {
        return value.toString();
      }
      value.append(c);
    }
    throw new IllegalArgumentException("unterminated_field_" + name);
  }

  private static String escape(String value) {
    StringBuilder escaped = new StringBuilder();
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      if (c == '"' || c == '\\') {
        escaped.append('\\').append(c);
      } else if (c < 0x20) {
        escaped.append(String.format("\\u%04x", (int) c));
      } else {
        escaped.append(c);
      }
    }
    return escaped.toString();
  }
}
