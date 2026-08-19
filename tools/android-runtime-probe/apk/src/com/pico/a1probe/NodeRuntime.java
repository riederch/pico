package com.pico.a1probe;

/**
 * ADR 0131 A1/A2. One embedded Node instance per process - nodejs-mobile's
 * own constraint, and the reason the custody split runs as two Android
 * processes rather than two instances in one.
 */
public final class NodeRuntime {
  static {
    System.loadLibrary("node");
    System.loadLibrary("piconode");
  }

  private NodeRuntime() {}

  public static native int startNode(String[] argv, String outPath);

  /** Runs a script on its own thread; Node owns that thread until exit. */
  public static void runScript(final String script, final String outPath) {
    // The preload is the embedder's half of hosting Node 18: the webcrypto
    // global that newer runtimes bring themselves.
    final String preload = new java.io.File(
      new java.io.File(script).getParentFile(), "preload.cjs").getAbsolutePath();
    new Thread(new Runnable() {
      @Override public void run() {
        startNode(new String[] { "node", "--require", preload, script }, outPath);
      }
    }, "pico-node").start();
  }
}
