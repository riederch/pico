package com.pico.a1probe;

/**
 * ADR 0118 O1s andere Hälfte: das Gerät sagt, dass es die Person erreicht hat.
 *
 * **Nur ein Gerät kann das sagen**, und deshalb sagt es der Home nicht: er
 * kann nicht beobachten, dass ein Satz auf jemandes Bildschirm stand. Dieser
 * Dienst läuft, wenn ein Mensch den Knopf gedrückt hat - nicht, wenn eine
 * Datei geschrieben wurde. Eine geschriebene Datei ist kein gesehener Satz,
 * und eine frühere Fassung des Schedulers hat genau daran eine Zusage still
 * verloren.
 *
 * Ein eigener Dienst statt eines Arguments an den Leser, weil beide Läufe
 * einen eigenen Node-Prozess brauchen und ein Dienst hier ein Prozess ist.
 */
public final class DueEntryAcknowledgeService extends ProbeService {
  @Override protected String script() { return "stage/entries.mjs"; }
  @Override protected String log() { return "entries-acknowledge.log"; }
  @Override protected boolean offersKeystorePort() { return true; }
  @Override protected String keystoreSocket() { return "keystore-ack.sock"; }

  /** Dasselbe Skript, die andere Hälfte. */
  @Override protected String[] scriptArguments() {
    return new String[] { "acknowledge" };
  }
}
