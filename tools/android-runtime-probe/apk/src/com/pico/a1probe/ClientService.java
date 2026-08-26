package com.pico.a1probe;

/** The client process: the probe's custody walk across the socket. */
public final class ClientService extends ProbeService {
  @Override protected String script() { return "stage/client.mjs"; }
  @Override protected String log() { return "client.log"; }

  /**
   * **Teilt den Prozess mit der Fläche**, wie der Beitritt daneben - und darf
   * ihn aus demselben Grund nicht beenden.
   */
  @Override protected boolean staysResident() { return true; }
}
