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

  /**
   * Ob dieser Dienst weiterläuft, wenn sein Skript fertig ist.
   *
   * **Am 2026-08-26 auf dem Bildschirm gefunden.** `nodejs-mobile` hält eine
   * Node-Instanz je Prozess, also darf ein Skript je Prozess einmal laufen -
   * das ist der `started`-Wächter unten. Zusammen mit `START_STICKY` hieß das
   * aber: der Dienst überlebt seinen Lauf, jeder spätere Start ist stillschweigend
   * wirkungslos, und die Datei, die er geschrieben hat, bleibt stehen.
   *
   * Auf dem Telefon stand daraufhin „dein Home antwortet nicht" - richtig um
   * 09:02, als es wirklich nicht antwortete - direkt über einem Termin, den
   * dasselbe Home um 09:09 herausgegeben hatte. Zwei Aussagen über dasselbe,
   * eine davon alt, und nichts, das die alte zurücknimmt. Genau die
   * Verwechslung, die ADR 0118 O4 zwischen „nichts wartet" und „niemand hat
   * nachgesehen" verbietet, nur eine Ebene tiefer: hier hatte jemand
   * nachgesehen, und die Antwort war von gestern.
   *
   * Ein Lauf ist deshalb ein Lauf: wenn das Skript zurückkehrt, endet der
   * Prozess, und der nächste Start bekommt einen frischen. Wer wohnen bleibt -
   * der Vault-Daemon, dessen Skript nie zurückkehrt - sagt es hier.
   */
  protected boolean staysResident() { return false; }

  /**
   * ADR 0131 A3. Ob dieser Dienst den Plattform-Keystore anbietet.
   *
   * Nur der Beitritt braucht ihn, weil nur dort eine Passphrase entsteht. Ein
   * Anschluss, den ein Dienst öffnet, ohne dass jemand ihn benutzt, ist eine
   * Tür mehr in einem Prozess - und die Sonden, die hier sonst laufen, messen
   * Erreichbarkeit und Konformität und haben nichts zu versiegeln.
   */
  protected boolean offersKeystorePort() { return false; }

  /**
   * Was das Skript an Tatsachen der Plattform braucht. Leer für alle, die
   * keine brauchen - eine Sonde, die etwas misst, misst es selbst.
   */
  protected String[] scriptArguments() { return new String[0]; }

  /**
   * Wo dieser Dienst den Keystore anbietet.
   *
   * **Ein Server je Prozess, ein Pfad je Server** - am Gerät gelernt, am
   * 2026-08-24. Als der A7-Dienst denselben Namen nahm wie der Beitritt, banden
   * zwei Prozesse dasselbe AF_UNIX-Socket: der zweite hängte das erste aus, und
   * der Beitritt bekam mitten im Lauf `ECONNREFUSED` auf einen Anschluss, den
   * sein eigenes Protokoll drei Zeilen vorher als lauschend meldete. Der Fehler
   * sieht aus wie ein Wettlauf und ist ein Namenskonflikt.
   */
  protected String keystoreSocket() { return "keystore.sock"; }

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
      if (offersKeystorePort()) {
        // Vor Node, nicht danach: der Anschluss muss stehen, bevor der erste
        // Frager kommt. Node wartet zwar, aber ein Warten, das nur meistens
        // reicht, ist ein Wettlauf mit gutem Ausgang.
        KeystorePort.serve(new File(files, keystoreSocket()),
          new File(files, "keystore-port.log"));
      }
      NodeRuntime.runScript(
        new File(files, script()).getAbsolutePath(),
        new File(files, log()).getAbsolutePath(),
        () -> {
          if (!staysResident()) {
            /**
             * **Der Prozess endet, nicht nur der Dienst.** `stopSelf()` allein
             * ließe die Node-Instanz im Prozess stehen, und der nächste Start
             * fände denselben Prozess mit derselben verbrauchten Instanz vor -
             * die Lage, aus der dieser Kommentar entstanden ist.
             */
            stopSelf();
            System.exit(0);
          }
        },
        scriptArguments());
    }
    // Nicht klebrig, weil ein Lauf kein Bewohner ist: ein Dienst, den Android
    // nach dem Ende neu startet, liefe sein Skript in einer Schleife.
    return staysResident() ? START_STICKY : START_NOT_STICKY;
  }

  @Override public IBinder onBind(Intent intent) { return null; }
}
