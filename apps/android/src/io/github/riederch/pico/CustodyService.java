package io.github.riederch.pico;

/** The custody process (android:process=":custody"): the real vault daemon. */
public final class CustodyService extends PicoService {
  @Override protected String script() { return "stage/daemon.mjs"; }

  /**
   * Der eine Bewohner hier. Sein Skript kehrt nie zurück - der Vault-Daemon
   * lauscht, bis jemand ihn beendet -, und wer ihn beendet, soll ihn
   * wiederbekommen: alles andere in dieser App hängt an seinem Anschluss.
   */
  @Override protected boolean staysResident() { return true; }
  @Override protected String log() { return "daemon.log"; }
}
