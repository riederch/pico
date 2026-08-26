package com.pico.a1probe;

/**
 * ADR 0118 O1 auf dem Telefon - der Lauf, der fragt, was fällig ist.
 *
 * Phase 6 heißt „der Punkt, an dem jemand das Ding vermissen würde". Bis
 * hierher konnte das Telefon beitreten, sich wieder öffnen und sagen, ob sein
 * Home antwortet - alles wahr und nichts davon ein Grund, es dabeizuhaben.
 * Dieser Dienst ist der erste.
 *
 * Er entscheidet nichts und schreibt keinen Satz: das Skript lässt den Kern
 * die Worte setzen und legt sie als fertige Zeilen ab.
 */
public final class DueEntriesService extends ProbeService {
  @Override protected String script() { return "stage/entries.mjs"; }
  @Override protected String log() { return "entries.log"; }

  /** Ohne Anschluss ließe sich die Passphrase nicht entsiegeln. */
  @Override protected boolean offersKeystorePort() { return true; }

  /**
   * Ein eigener Pfad, wie jeder Dienst hier einen hat. Zwei Prozesse auf einem
   * AF_UNIX-Socket heißt: der zweite hängt den ersten aus (2026-08-24 am Gerät
   * gelernt, und einmal reicht).
   */
  @Override protected String keystoreSocket() { return "keystore-entries.sock"; }
}
