package com.pico.a1probe;

/**
 * ADR 0131 A3. Die eine Frage, die nur ein zweiter Prozess beantworten kann:
 * öffnet sich das Versiegelte noch, nachdem das Telefon den ersten
 * vergessen hat?
 *
 * Ein Siegelschlüssel, der jeden Neustart überlebt, ist die halbe Aufgabe des
 * Plattform-Keystores - einer, der es nicht tut, versiegelt nichts, er
 * verliert es nur langsamer. Im selben Prozess zu prüfen hieße, den Cache zu
 * messen statt den Keystore.
 *
 * Eigener Prozess aus demselben Grund wie die Konformanzsonde: nodejs-mobile
 * hält eine Node-Instanz je Prozess.
 */
public final class ReopenService extends ProbeService {
  @Override protected String script() { return "stage/reopen.mjs"; }
  @Override protected String log() { return "reopen.log"; }

  /** Ohne Anschluss gäbe es nichts zu öffnen. */
  @Override protected boolean offersKeystorePort() { return true; }
}
