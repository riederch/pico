package io.github.riederch.pico;

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

  /**
   * Runs a script on its own thread; Node owns that thread until exit.
   *
   * Arguments were added for ADR 0131 A7: whether this phone has a network is
   * a fact the platform holds - `ConnectivityManager` answers it - and the
   * words about it belong to the shell-free core. So the fact travels as an
   * argument rather than being guessed again inside Node, where a DNS attempt
   * or a socket would be a second rule beside the system's.
   */
  public static void runScript(final String script, final String outPath,
      final Runnable whenFinished, final String... scriptArguments) {
    // The preload is the embedder's half of hosting Node 18: the webcrypto
    // global that newer runtimes bring themselves.
    final String preload = new java.io.File(
      new java.io.File(script).getParentFile(), "preload.cjs").getAbsolutePath();
    final String[] argv = new String[4 + scriptArguments.length];
    argv[0] = "node";
    argv[1] = "--require";
    argv[2] = preload;
    argv[3] = script;
    System.arraycopy(scriptArguments, 0, argv, 4, scriptArguments.length);
    new Thread(new Runnable() {
      @Override public void run() {
        startNode(argv, outPath);
        // Zurückgekehrt heißt fertig. Wer darauf wartet, entscheidet, was das
        // bedeutet - hier wird nichts angenommen.
        whenFinished.run();
      }
    }, "pico-node").start();
  }
}
