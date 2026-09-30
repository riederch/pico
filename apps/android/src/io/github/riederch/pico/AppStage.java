package io.github.riederch.pico;

import android.content.Context;
import android.content.pm.PackageInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * The shell-free core, unpacked from the APK into app-private storage.
 *
 * The probe never needed this: adb pushed the core as a tar and unpacked it
 * by hand before anything ran. An app a person installs has no adb, so the
 * core travels inside the APK as {@code assets/stage.tar} and every process
 * that is about to start Node calls {@link #ensure} first (ADR 0131, status
 * note 2026-09-27).
 *
 * <p><b>Unpacked once per installed build, and whole or not at all.</b> The
 * marker is the package's last update time, which changes on every install
 * and update and on nothing else: a core from the previous build must never
 * run under this build's Java. The new core is unpacked beside the old one
 * and moved into place only when complete, so a process killed halfway leaves
 * the previous core or none - never half of one.
 *
 * <p><b>One process at a time.</b> Custody, the walk and the checks each run
 * in their own process (one Node instance per process is nodejs-mobile's
 * rule), and three of them start together at launch. A file lock makes the
 * first one unpack and the others wait for it.
 *
 * <p>Without the asset - the probe, whose core adb still pushes - this does
 * nothing.
 */
public final class AppStage {
  private static final String ASSET = "stage.tar";

  private AppStage() {}

  public static void ensure(Context context) throws IOException {
    InputStream asset;
    try {
      asset = context.getAssets().open(ASSET);
    } catch (IOException none) {
      return;
    }
    asset.close();

    File files = context.getFilesDir();
    File stage = new File(files, "stage");
    File marker = new File(files, "stage.build");
    String build = buildOf(context);

    try (RandomAccessFile lockFile = new RandomAccessFile(new File(files, "stage.lock"), "rw");
        FileLock ignored = lockFile.getChannel().lock()) {
      if (stage.isDirectory() && marker.isFile()
          && build.equals(new String(Files.readAllBytes(marker.toPath()), StandardCharsets.UTF_8))) {
        return;
      }
      File unpacking = new File(files, "stage.unpacking");
      File tar = new File(files, "stage.tar");
      deleteTree(unpacking);
      if (!unpacking.mkdirs()) {
        throw new IOException("stage_unpack_dir_failed");
      }
      try (InputStream in = context.getAssets().open(ASSET);
          OutputStream out = new FileOutputStream(tar)) {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = in.read(buffer)) > 0) {
          out.write(buffer, 0, read);
        }
      }
      run(new String[] {"/system/bin/tar", "-xf", tar.getAbsolutePath(),
        "-C", unpacking.getAbsolutePath()});
      tar.delete();
      File unpacked = new File(unpacking, "app-stage");
      if (!new File(unpacked, "daemon.mjs").isFile()) {
        throw new IOException("stage_incomplete");
      }
      File retired = new File(files, "stage.retired");
      deleteTree(retired);
      if (stage.exists() && !stage.renameTo(retired)) {
        throw new IOException("stage_retire_failed");
      }
      if (!unpacked.renameTo(stage)) {
        throw new IOException("stage_install_failed");
      }
      deleteTree(retired);
      deleteTree(unpacking);
      Files.write(marker.toPath(), build.getBytes(StandardCharsets.UTF_8));
    }
  }

  private static String buildOf(Context context) throws IOException {
    try {
      PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
      return Long.toString(info.lastUpdateTime);
    } catch (android.content.pm.PackageManager.NameNotFoundException impossible) {
      throw new IOException("own_package_not_found");
    }
  }

  private static void run(String[] command) throws IOException {
    Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
    try {
      if (process.waitFor() != 0) {
        throw new IOException("stage_untar_failed:" + process.exitValue());
      }
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new IOException("stage_untar_interrupted");
    }
  }

  private static void deleteTree(File file) {
    if (!file.exists()) {
      return;
    }
    File[] children = file.listFiles();
    if (children != null) {
      for (File child : children) {
        // A link is removed, never followed: a link out of this directory
        // must not make an unpack delete what it points at.
        if (Files.isSymbolicLink(child.toPath())) {
          child.delete();
        } else {
          deleteTree(child);
        }
      }
    }
    file.delete();
  }
}
