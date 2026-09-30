package io.github.riederch.pico;

/**
 * ADR 0131 A5. The ceremony's own process-resident home.
 *
 * It lived in the Activity until 2026-08-19, and pressing Back ended it: the
 * process had nothing left to keep it alive, Android reclaimed it, and the
 * next launch began again at "choose a passphrase" - after the person had
 * already chosen one and shown a code to another device.
 *
 * A walk between two devices is not a screen. It outlives looking at it, the
 * way custody already does one process over, and for the same reason: what
 * is in flight is a ceremony somebody else is waiting on.
 */
public final class JoinService extends PicoService {
  @Override protected String script() { return "stage/join.mjs"; }
  @Override protected String log() { return "join.log"; }
  @Override protected String notice() { return "Adding this device to your Pico"; }

  /**
   * **Teilt den Prozess mit der Fläche** (Manifest: kein `android:process`),
   * weil nodejs-mobile eine Node-Instanz je Prozess hält und die Zeremonie
   * dieselbe braucht, an der das Fenster hängt. Damit darf hier nichts den
   * Prozess beenden: `System.exit` nähme das Fenster mitten in einer
   * Zeremonie mit, auf die ein zweites Gerät wartet.
   */
  @Override protected boolean staysResident() { return true; }

  /**
   * ADR 0131 A3: hier entsteht die Passphrase, also hier steht der Keystore
   * offen. Der einzige Dienst, für den das gilt.
   */
  @Override protected boolean offersKeystorePort() { return true; }
}
