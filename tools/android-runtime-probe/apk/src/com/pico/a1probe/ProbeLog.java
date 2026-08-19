package com.pico.a1probe;

import android.content.Context;
import java.io.File;
import java.io.FileWriter;

/**
 * One append-only log both halves of the ADR 0131 A4 probe write to.
 *
 * The job service runs in the same process but at the system's whim, hours
 * apart; a shared writer held open would be a file handle across a doze
 * window. Opening per line costs nothing at this cadence and cannot lose a
 * heartbeat to a process that was killed mid-buffer - which is precisely the
 * event being measured.
 */
public final class ProbeLog {
  private ProbeLog() {}

  public static synchronized void write(Context context, String step, String fields) {
    try (FileWriter out = new FileWriter(new File(context.getFilesDir(), "reachability.log"), true)) {
      out.write("{\"step\":\"" + step + "\",\"wallMs\":" + System.currentTimeMillis()
        + ",\"elapsedRealtimeMs\":" + android.os.SystemClock.elapsedRealtime()
        + (fields.isEmpty() ? "" : "," + fields) + "}\n");
    } catch (Throwable ignored) {
      // A probe that crashes on its own logging measures nothing.
    }
  }
}
