package com.pico.a1probe;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.app.usage.UsageStatsManager;
import android.os.Build;
import android.os.PowerManager;

/**
 * ADR 0131 A4. The stand-in for the six-hourly authenticated lifecycle read:
 * it does no Link work, it only records *that the system let it run*, and
 * under which power state.
 *
 * ADR 0112 claims a running device gets at least seven independent chances
 * to see a recovery alarm inside a 48-hour window, on a six-hour cadence.
 * On Android that cadence is a request, not a promise, so what matters is
 * the distance between the interval asked for and the intervals that
 * actually arrive - which is a subtraction over these lines, not an opinion.
 */
public final class ReachabilityJobService extends JobService {
  @Override public boolean onStartJob(JobParameters params) {
    PowerManager power = getSystemService(PowerManager.class);
    UsageStatsManager usage = getSystemService(UsageStatsManager.class);
    ProbeLog.write(this, "heartbeat",
      "\"jobId\":" + params.getJobId()
      + ",\"deviceIdle\":" + (power != null && power.isDeviceIdleMode())
      + ",\"powerSave\":" + (power != null && power.isPowerSaveMode())
      + ",\"standbyBucket\":" + (usage == null ? -1 : usage.getAppStandbyBucket())
      + ",\"interactive\":" + (power != null && power.isInteractive()));
    // Nothing asynchronous: the work is the record.
    return false;
  }

  @Override public boolean onStopJob(JobParameters params) {
    ProbeLog.write(this, "job_stopped",
      "\"jobId\":" + params.getJobId()
      + ",\"reason\":" + (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        ? params.getStopReason() : -1));
    return true;
  }
}
