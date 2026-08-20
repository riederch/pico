package com.pico.a1probe;

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
public final class JoinService extends ProbeService {
  @Override protected String script() { return "stage/join.mjs"; }
  @Override protected String log() { return "join.log"; }
}
