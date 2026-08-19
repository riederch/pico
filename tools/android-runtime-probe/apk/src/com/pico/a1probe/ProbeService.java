package com.pico.a1probe;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import java.io.File;

/**
 * ADR 0131: the foreground service is the tray's honest analogue, and it is
 * also the only component shape a locked Samsung leaves alone. Both halves
 * of the probe extend this; each subclass names its script, and the process
 * split comes from the manifest's android:process, not from code.
 */
public abstract class ProbeService extends Service {
  private boolean started = false;

  protected abstract String script();
  protected abstract String log();

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (!started) {
      started = true;
      NotificationManager manager = getSystemService(NotificationManager.class);
      manager.createNotificationChannel(
        new NotificationChannel("pico_a1", "Pico A1 Probe",
          NotificationManager.IMPORTANCE_LOW));
      startForeground(getClass().getName().hashCode() & 0xffff,
        new Notification.Builder(this, "pico_a1")
          .setSmallIcon(android.R.drawable.stat_notify_sync)
          .setContentTitle(getClass().getSimpleName())
          .build());
      File files = getFilesDir();
      NodeRuntime.runScript(
        new File(files, script()).getAbsolutePath(),
        new File(files, log()).getAbsolutePath());
    }
    return START_STICKY;
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
