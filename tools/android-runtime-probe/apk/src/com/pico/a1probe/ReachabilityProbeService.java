package com.pico.a1probe;

import io.github.riederch.pico.*;

import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.app.usage.UsageStatsManager;
import android.content.ComponentName;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.provider.Settings;

/**
 * ADR 0131 A4 - the reachability contract, measured rather than claimed.
 *
 * ADR 0112 rests a guarantee on cadence: six hours against a 48-hour veto
 * window "gives a running device at least seven independent chances to see
 * the alarm". On a desktop the tray simply runs. On Android every word of
 * that sentence is granted conditionally, so this records the conditions as
 * the device actually reports them, and then keeps a heartbeat so the
 * distance between a requested interval and the intervals that arrive is a
 * subtraction rather than an argument.
 *
 * Three things it deliberately does not do. It does not ask for the battery
 * optimisation exemption - the *default* state is what a first run meets,
 * and a probe that fixed its own environment would measure the fix. It does
 * not claim the loud alarm was seen: whether a notification was unmissable
 * is a person's observation, so it records what the system permitted and
 * posted, and the looking is left to the person. And it never lowers a
 * requested interval to make the numbers look better.
 */
public final class ReachabilityProbeService extends Service {
  public static final int HEARTBEAT_JOB_ID = 0xa4;
  private static final long REQUESTED_INTERVAL_MS = 15 * 60 * 1000L;

  private boolean started = false;

  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (started) {
      return START_STICKY;
    }
    started = true;
    NotificationManager notifications = getSystemService(NotificationManager.class);
    notifications.createNotificationChannel(new NotificationChannel(
      "pico_a4", "Pico A4 Reachability", NotificationManager.IMPORTANCE_LOW));
    startForeground(0xa4, new Notification.Builder(this, "pico_a4")
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle("ReachabilityProbeService")
      .build());

    recordPolicy(notifications);
    scheduleHeartbeat();
    postAlarms(notifications);
    return START_STICKY;
  }

  @Override public IBinder onBind(Intent intent) { return null; }

  /** What the device grants a first run, before anyone has been asked anything. */
  private void recordPolicy(NotificationManager notifications) {
    PowerManager power = getSystemService(PowerManager.class);
    ActivityManager activity = getSystemService(ActivityManager.class);
    UsageStatsManager usage = getSystemService(UsageStatsManager.class);
    AlarmManager alarms = getSystemService(AlarmManager.class);

    ProbeLog.write(this, "policy",
      "\"batteryOptimisationExempt\":"
        + (power != null && power.isIgnoringBatteryOptimizations(getPackageName()))
      + ",\"backgroundRestricted\":" + (activity != null && activity.isBackgroundRestricted())
      + ",\"standbyBucket\":" + (usage == null ? -1 : usage.getAppStandbyBucket())
      + ",\"powerSaveMode\":" + (power != null && power.isPowerSaveMode())
      + ",\"deviceIdleMode\":" + (power != null && power.isDeviceIdleMode())
      + ",\"notificationsEnabled\":" + notifications.areNotificationsEnabled()
      + ",\"canScheduleExactAlarms\":"
        + (Build.VERSION.SDK_INT < Build.VERSION_CODES.S
          || (alarms != null && alarms.canScheduleExactAlarms()))
      + ",\"canUseFullScreenIntent\":"
        + (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE
          || notifications.canUseFullScreenIntent()));
  }

  /**
   * The interval the system assigns, read back from the scheduled job rather
   * than from the request. Fifteen minutes is asked for because it is the
   * documented floor: if the platform will not honour its own minimum, six
   * hours is not a discussion worth having.
   */
  private void scheduleHeartbeat() {
    JobScheduler scheduler = getSystemService(JobScheduler.class);
    JobInfo job = new JobInfo.Builder(HEARTBEAT_JOB_ID,
      new ComponentName(this, ReachabilityJobService.class))
      .setPeriodic(REQUESTED_INTERVAL_MS)
      .setPersisted(true)
      .build();
    int result = scheduler.schedule(job);
    JobInfo pending = scheduler.getPendingJob(HEARTBEAT_JOB_ID);
    ProbeLog.write(this, "heartbeat_scheduled",
      "\"requestedIntervalMs\":" + REQUESTED_INTERVAL_MS
      + ",\"accepted\":" + (result == JobScheduler.RESULT_SUCCESS)
      + ",\"assignedIntervalMs\":" + (pending == null ? -1 : pending.getIntervalMillis())
      + ",\"assignedFlexMs\":" + (pending == null ? -1 : pending.getFlexMillis()));
  }

  /**
   * The ADR 0112 alarm, both ways. ADR 0131 says the full-screen
   * presentation is a restricted permission and that where it is not
   * granted the alarm degrades to a high-importance notification **and the
   * degradation is shown to the person**. So both are posted and both are
   * recorded; which one the device actually showed is what the person is
   * asked to look at.
   */
  private void postAlarms(NotificationManager notifications) {
    NotificationChannel loud = new NotificationChannel(
      "pico_a4_alarm", "Pico A4 Alarm", NotificationManager.IMPORTANCE_HIGH);
    loud.setSound(Settings.System.DEFAULT_ALARM_ALERT_URI,
      new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build());
    loud.enableVibration(true);
    notifications.createNotificationChannel(loud);

    NotificationChannel readBack = notifications.getNotificationChannel("pico_a4_alarm");
    boolean fullScreenPermitted = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE
      || notifications.canUseFullScreenIntent();

    PendingIntent open = PendingIntent.getService(this, 0,
      new Intent(this, ReachabilityProbeService.class),
      PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

    notifications.notify(0xa401, new Notification.Builder(this, "pico_a4_alarm")
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle("A recovery of your identity is pending")
      .setContentText("Full-screen intent requested (probe).")
      .setCategory(Notification.CATEGORY_ALARM)
      .setFullScreenIntent(open, true)
      .build());

    notifications.notify(0xa402, new Notification.Builder(this, "pico_a4_alarm")
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setContentTitle("A recovery of your identity is pending")
      .setContentText("No full-screen intent (probe).")
      .setCategory(Notification.CATEGORY_ALARM)
      .build());

    ProbeLog.write(this, "alarm_posted",
      "\"fullScreenPermitted\":" + fullScreenPermitted
      + ",\"channelImportanceRequested\":" + NotificationManager.IMPORTANCE_HIGH
      + ",\"channelImportanceGranted\":"
        + (readBack == null ? -1 : readBack.getImportance())
      + ",\"channelSoundKept\":" + (readBack != null && readBack.getSound() != null)
      + ",\"channelVibrationKept\":" + (readBack != null && readBack.shouldVibrate()));
  }
}
