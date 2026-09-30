package io.github.riederch.pico;

import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;

/**
 * ADR 0131 A7, die laufende Hälfte: der Lauf, der das Home wirklich fragt.
 *
 * `ReachabilityJobService` daneben misst seit A4 nur, *ob das System ihn
 * laufen ließ* - ausdrücklich ohne Link-Werk. Das beantwortet die Frage nach
 * der Kadenz und nicht die nach der Aussage. Dieser Dienst macht die Aussage
 * möglich: er öffnet das Versiegelte wieder, liest authentifiziert beim Home
 * und lässt den Kern sagen, was das bedeutet.
 *
 * **Was hier entschieden wird und was nicht.** Ob dieses Telefon ein Netz hat,
 * weiß das System; `ConnectivityManager` ist die Stelle, an der Android es
 * sagt. Was daraus für eine Person folgt - ob das „no network" heißt oder
 * „dein Home antwortet nicht" und welcher der beiden Sätze fällt, wenn beides
 * zutrifft - entscheidet der schalenfreie Kern. Diese Klasse reicht eine
 * Tatsache weiter und schreibt keinen Satz.
 */
public final class ReachabilityConditionService extends PicoService {
  @Override protected String script() { return "stage/reachability.mjs"; }
  @Override protected String log() { return "reachability-conditions.log"; }
  @Override protected String notice() { return "Checking that your Pico Home answers"; }

  /** Ohne Anschluss ließe sich die Passphrase nicht entsiegeln. */
  @Override protected boolean offersKeystorePort() { return true; }

  /**
   * Ein eigener Pfad, weil der Beitritt seinen hält. Zwei Prozesse auf einem
   * AF_UNIX-Socket heißt: der zweite hängt den ersten aus, und der Erste
   * bekommt `ECONNREFUSED` auf etwas, das er gerade noch hatte.
   */
  @Override protected String keystoreSocket() { return "keystore-conditions.sock"; }

  @Override protected String[] scriptArguments() {
    return new String[] { online() };
  }

  /**
   * `unknown` statt `offline`, wenn das System nichts sagt.
   *
   * Ein Telefon ohne Auskunft ist nicht dasselbe wie eines ohne Netz, und der
   * Kern lässt `no_network` bei einem unbekannten Wert weg, statt es zu raten -
   * dieselbe Unterscheidung, die ADR 0118 O4 zwischen „nichts wartet" und
   * „niemand hat nachgesehen" macht.
   */
  private String online() {
    /**
     * Verweigerte Auskunft ist `unknown`, kein Absturz.
     *
     * Ohne `ACCESS_NETWORK_STATE` wirft `getActiveNetwork` eine
     * SecurityException, und die riss den ganzen Dienst mit, bevor Node
     * überhaupt lief - eine fehlende Zeile im Manifest wurde so zu einer
     * Prüfung, die nichts sagt. Die Berechtigung steht jetzt da; dass die
     * Auskunft trotzdem ausbleiben darf, steht hier. Eine Tatsache, die das
     * System nicht hergibt, ist nicht dasselbe wie eine, die falsch ist.
     */
    try {
      ConnectivityManager manager = getSystemService(ConnectivityManager.class);
      if (manager == null) {
        return "unknown";
      }
      Network active = manager.getActiveNetwork();
      if (active == null) {
        return "offline";
      }
      NetworkCapabilities capabilities = manager.getNetworkCapabilities(active);
      if (capabilities == null) {
        return "unknown";
      }
      return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        ? "online"
        : "offline";
    } catch (SecurityException refused) {
      return "unknown";
    }
  }
}
