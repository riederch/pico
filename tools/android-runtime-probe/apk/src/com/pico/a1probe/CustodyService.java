package com.pico.a1probe;

/** The custody process (android:process=":custody"): the real vault daemon. */
public final class CustodyService extends ProbeService {
  @Override protected String script() { return "stage/daemon.mjs"; }
  @Override protected String log() { return "daemon.log"; }
}
