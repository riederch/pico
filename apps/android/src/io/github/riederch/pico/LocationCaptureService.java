package io.github.riederch.pico;

import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.CancellationSignal;
import java.io.File;
import java.io.FileOutputStream;

/**
 * ADR 0129 SR5 - die eine Stelle, an der ein Standort-API vorkommt.
 *
 * SR5s tragender Satz ist, dass aus der Ableitung kein
 * Betriebssystem-Standort-API erreichbar ist, und `offline-floor.json` verbietet
 * die Sensorpakete der Familie `spatial_recall` ausdrücklich. Das Verbot ist
 * bewusst *nicht* global: eine mobile Laufzeit, die Standorte erfasst, muss
 * eines aufrufen. Diese Klasse ist diese Laufzeit, und sie ist auch alles, was
 * sie ist - sie misst und schreibt eine Zeile.
 *
 * **Java misst, Node liest eine Datei.** Der Übergang vom System nach Pico ist
 * damit eine Bauform statt einer Disziplin: `capture.mjs` könnte gar nichts
 * anderes tun, als Zeilen zu lesen.
 *
 * **Was hier nicht steht**, obwohl es naheliegt: ob gemessen werden darf. Das
 * ist eine dauerhafte Entscheidung über das Leben einer Person (SR6), sie
 * liegt im Home, und das Home lehnt die Übergabe ab, solange sie nicht
 * getroffen ist. Ein Sensoradapter, der sie mitträfe, hätte die Einwilligung
 * in die Schicht gelegt, die sie am wenigsten durchsetzen kann.
 */
public final class LocationCaptureService extends PicoService {
  @Override protected String script() { return "stage/capture.mjs"; }
  @Override protected String log() { return "capture.log"; }
  @Override protected String notice() { return "Noting where this device is"; }
  @Override protected boolean offersKeystorePort() { return true; }
  @Override protected String keystoreSocket() { return "keystore-capture.sock"; }

  /**
   * Eine Messung, dann das Skript.
   *
   * **Vor Node und nicht daneben**: die Datei muss geschrieben sein, bevor
   * jemand sie liest, und ein Warten, das nur meistens reicht, ist ein
   * Wettlauf mit gutem Ausgang. Schlägt die Messung fehl, läuft das Skript
   * trotzdem - es findet dann nichts und sagt das, was eine ehrlichere
   * Auskunft ist als ein Dienst, der stumm bleibt.
   */
  @Override public int onStartCommand(android.content.Intent intent, int flags, int startId) {
    measureOnce();
    return super.onStartCommand(intent, flags, startId);
  }

  private void measureOnce() {
    try {
      LocationManager manager = getSystemService(LocationManager.class);
      if (manager == null) {
        return;
      }
      /**
       * `getCurrentLocation` statt `requestLocationUpdates`: eine Sonde, die
       * auf einem Takt läuft, will eine Messung und keinen Strom. Ein Strom
       * müsste beendet werden, und ein Dienst, der vergisst ihn zu beenden,
       * misst weiter, wenn niemand mehr fragt - genau das, was eine Person
       * beim Wort „Standort" befürchtet.
       */
      manager.getCurrentLocation(
        LocationManager.FUSED_PROVIDER,
        new CancellationSignal(),
        getMainExecutor(),
        location -> {
          if (location != null) {
            write(location);
          }
        });
    } catch (SecurityException refused) {
      /**
       * Verweigerte Berechtigung ist keine Messung und kein Absturz. Ohne
       * diesen Fang risse eine fehlende Zeile im Manifest den Dienst mit,
       * bevor Node überhaupt liefe - derselbe Fehler, den `ACCESS_NETWORK_STATE`
       * am 2026-08-24 einmal verursacht hat.
       */
    } catch (IllegalArgumentException noProvider) {
      // Ein Gerät ohne diesen Anbieter misst hier nichts. Auch das ist eine
      // Antwort und kein Fehler.
    }
  }

  /**
   * Eine Zeile je Messung, in den Feldnamen, die `PicoPlace` verlangt.
   *
   * Angehängt statt überschrieben, weil zwischen zwei Läufen des Skripts
   * mehrere Messungen liegen können - und geleert wird erst, wenn das Home
   * sie alle hat.
   */
  private void write(Location location) {
    String line = "{\"at\":\"" + java.time.Instant.ofEpochMilli(location.getTime()).toString()
      + "\",\"latitudeDeg\":" + location.getLatitude()
      + ",\"longitudeDeg\":" + location.getLongitude()
      + ",\"accuracyM\":" + (location.hasAccuracy() ? location.getAccuracy() : 0f)
      + "}\n";
    try (FileOutputStream out =
        new FileOutputStream(new File(getFilesDir(), "fixes.jsonl"), true)) {
      out.write(line.getBytes("UTF-8"));
    } catch (java.io.IOException unwritable) {
      // Eine Messung, die nicht auf die Platte kommt, ist verloren - und das
      // ist die richtige Richtung: erfunden wird hier nichts.
    }
  }
}
