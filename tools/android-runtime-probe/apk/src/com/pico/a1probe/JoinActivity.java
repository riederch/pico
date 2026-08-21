package com.pico.a1probe;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * ADR 0131 A5, first vertical - this phone asking a Home to let it in.
 *
 * Deliberately plain: no Gradle, no AndroidX, no layout resources, no camera.
 * Every view is built in code so the app assembles with build-tools and the
 * NDK alone, which is what this machine has. What that costs is the camera
 * path; what it buys is that the seam being proven here - shell-free core
 * under an embedded runtime, driving a real surface - is not tangled up with
 * a build system nobody has decided on yet.
 *
 * The three verbs arrive over an app-private AF_UNIX socket rather than a
 * localhost port, because on Android every app can reach 127.0.0.1 and this
 * conversation carries a ceremony.
 *
 * One difference from the desktop worth naming rather than discovering: ADR
 * 0113 C2 keeps secrets out of the renderer because a renderer is a second,
 * less trusted context. Here there is no second context - the Activity *is*
 * the app - so the passphrase is typed into this process. That is not the
 * desktop rule relaxed; it is the rule having nothing to separate.
 */
public final class JoinActivity extends Activity {
  private TextView title;
  private TextView body;
  private TextView code;
  private EditText answer;
  private Button send;
  private TextView status;
  private Button scan;

  private LocalSocket socket;
  private OutputStream out;
  /** The prefix the open question expects, so a scan can refuse the wrong code. */
  private String expecting = "";

  private static final int SCAN_REQUEST = 0xA5;
  private static final int CAMERA_PERMISSION = 0xCA;

  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    /**
     * Two services, then a view. Custody in its own process (ADR 0131 A2)
     * and the ceremony in a foreground service of this one - this Activity
     * only draws it and carries answers back. Running the walk here is what
     * made Back end a ceremony that another device was waiting on.
     */
    startForegroundService(new Intent(this, CustodyService.class));
    startForegroundService(new Intent(this, JoinService.class));
    setContentView(buildView());
    new Thread(this::connect, "pico-ui-bridge").start();
  }

  private View buildView() {
    LinearLayout column = new LinearLayout(this);
    column.setOrientation(LinearLayout.VERTICAL);
    column.setPadding(48, 96, 48, 48);
    column.setBackgroundColor(Color.parseColor("#0d1117"));

    title = text(column, 22, Color.parseColor("#e6edf3"), Typeface.DEFAULT_BOLD);
    title.setText("Add this phone to your Home");
    body = text(column, 15, Color.parseColor("#9aa7b4"), Typeface.DEFAULT);
    body.setText("Your other device grants this one. Nothing is sent until you say so.");

    code = text(column, 13, Color.parseColor("#7ee787"), Typeface.MONOSPACE);
    code.setTextIsSelectable(true);
    code.setVisibility(View.GONE);

    answer = new EditText(this);
    answer.setTextColor(Color.parseColor("#e6edf3"));
    answer.setHint("");
    answer.setVisibility(View.GONE);
    column.addView(answer, wide());

    send = new Button(this);
    send.setText("Continue");
    send.setVisibility(View.GONE);
    send.setOnClickListener(view -> submit());
    column.addView(send, wide());

    /**
     * ADR 0131 A5. The camera, offered wherever a code is read - and the only
     * usable way to read a grant, which runs to about eleven hundred
     * characters and expires in four minutes.
     */
    scan = new Button(this);
    scan.setText("Scan it with the camera");
    scan.setVisibility(View.GONE);
    scan.setOnClickListener(view -> startScan());
    column.addView(scan, wide());

    status = text(column, 13, Color.parseColor("#8b949e"), Typeface.DEFAULT);
    status.setText("Starting Pico on this device...");

    ScrollView scroller = new ScrollView(this);
    scroller.addView(column);
    return scroller;
  }

  private TextView text(LinearLayout parent, int size, int colour, Typeface face) {
    TextView view = new TextView(this);
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size);
    view.setTextColor(colour);
    view.setTypeface(face);
    view.setPadding(0, 24, 0, 0);
    parent.addView(view, wide());
    return view;
  }

  private static LinearLayout.LayoutParams wide() {
    return new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
  }

  /** The runtime starts when the app does; the socket appears when it is ready. */
  private void connect() {
    File path = new File(getFilesDir(), "ui.sock");
    for (int attempt = 0; attempt < 120; attempt++) {
      try {
        LocalSocket candidate = new LocalSocket();
        candidate.connect(new LocalSocketAddress(
          path.getAbsolutePath(), LocalSocketAddress.Namespace.FILESYSTEM));
        socket = candidate;
        out = candidate.getOutputStream();
        write(new JSONObject().put("v", "begin"));
        listen();
        return;
      } catch (Throwable retry) {
        try { Thread.sleep(500); } catch (InterruptedException stop) { return; }
      }
    }
    runOnUiThread(() -> status.setText("Pico did not start on this device."));
  }

  private void listen() throws Exception {
    BufferedReader reader = new BufferedReader(
      new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      JSONObject message = new JSONObject(line);
      runOnUiThread(() -> render(message));
    }
  }

  private void render(JSONObject message) {
    String verb = message.optString("v");
    String step = message.optString("step");
    switch (verb) {
      case "show":
        title.setText(titleOf(message, step));
        body.setText(bodyOf(message, step));
        code.setText(message.optString("code"));
        code.setVisibility(View.VISIBLE);
        answer.setVisibility(View.GONE);
        send.setVisibility(View.GONE);
        status.setText("Hold this up to your other device, or type it there.");
        break;
      case "ask":
        title.setText(titleOf(message, step));
        body.setText(message.has("statement")
          ? message.optString("statement") : bodyOf(message, step));
        // The code being shown stays on screen while the answer is typed:
        // the other device is reading it at that moment.
        code.setVisibility(message.has("showing") ? View.VISIBLE : code.getVisibility());
        answer.setInputType("secret".equals(message.optString("kind"))
          ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
          : InputType.TYPE_CLASS_TEXT);
        answer.setText("");
        answer.setVisibility("approval".equals(message.optString("kind"))
          ? View.GONE : View.VISIBLE);
        send.setText("approval".equals(message.optString("kind")) ? "Yes, sign it" : "Continue");
        send.setVisibility(View.VISIBLE);
        send.setTag(message.optString("kind"));
        expecting = message.optString("prefix", "");
        // A code is read either way; a secret and an approval are not.
        scan.setVisibility("code".equals(message.optString("kind"))
          ? View.VISIBLE : View.GONE);
        status.setText("");
        break;
      case "say":
        status.setText(bodyOf(message, step));
        answer.setVisibility(View.GONE);
        send.setVisibility(View.GONE);
        scan.setVisibility(View.GONE);
        break;
      case "done":
        title.setText(titleOf(message, step));
        body.setText(bodyOf(message, step));
        code.setVisibility(View.GONE);
        answer.setVisibility(View.GONE);
        send.setVisibility(View.GONE);
        status.setText("");
        break;
      /**
       * Bleibt hier, und der Desktop hält seine Ablehnungssätze ebenfalls
       * selbst (`contract.ts` übersetzt dort die Fehlerwörter). Ein gleicher
       * Stand auf beiden Seiten, kein Nachzügler - und der nächste, der
       * umzieht, wenn jemand die Ablehnungen anfasst.
       */
      case "failed":
        title.setText("This phone was not added");
        body.setText("Nothing was changed at your Home.");
        status.setText(message.optString("reason"));
        answer.setVisibility(View.GONE);
        send.setVisibility(View.GONE);
        break;
      default:
        break;
    }
  }

  private void startScan() {
    if (checkSelfPermission(android.Manifest.permission.CAMERA)
        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      // Asked at the moment it is needed and for the reason it is needed,
      // which is the only honest time to ask for a camera.
      requestPermissions(new String[] { android.Manifest.permission.CAMERA },
        CAMERA_PERMISSION);
      return;
    }
    Intent scanner = new Intent(this, ScanActivity.class);
    scanner.putExtra(ScanActivity.EXTRA_PREFIX, expecting);
    startActivityForResult(scanner, SCAN_REQUEST);
  }

  @Override public void onRequestPermissionsResult(
      int request, String[] permissions, int[] granted) {
    super.onRequestPermissionsResult(request, permissions, granted);
    if (request == CAMERA_PERMISSION
        && granted.length > 0
        && granted[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
      startScan();
    } else if (request == CAMERA_PERMISSION) {
      status.setText("Without the camera this code has to be typed, "
        + "and a grant is too long to type.");
    }
  }

  @Override protected void onActivityResult(int request, int result, Intent data) {
    super.onActivityResult(request, result, data);
    if (request != SCAN_REQUEST || result != Activity.RESULT_OK || data == null) {
      return;
    }
    String value = data.getStringExtra(ScanActivity.EXTRA_VALUE);
    if (value == null || value.isEmpty()) {
      return;
    }
    answer.setText(value);
    submit();
  }

  private void submit() {
    String value = "approval".equals(String.valueOf(send.getTag()))
      ? "yes" : answer.getText().toString();
    /**
     * An empty answer is not an answer. Sending one hands the ceremony a
     * blank code, which it refuses as a malformed one - and the person reads
     * "this phone was not added" for a button they pressed too early.
     */
    if (value.isEmpty()) {
      status.setText("There is nothing in the field yet.");
      return;
    }
    answer.setText("");
    answer.setVisibility(View.GONE);
    send.setVisibility(View.GONE);
    scan.setVisibility(View.GONE);
    status.setText("Working...");
    new Thread(() -> {
      try {
        write(new JSONObject().put("v", "value").put("text", value));
      } catch (Throwable error) {
        runOnUiThread(() -> status.setText("Pico stopped listening on this device."));
      }
    }, "pico-ui-send").start();
  }

  private void write(JSONObject message) throws Exception {
    out.write((message.toString() + "\n").getBytes(StandardCharsets.UTF_8));
    out.flush();
  }

  /**
   * The words, in one place. They are the desktop's own step names (ADR 0130
   * E3) said for a phone; a second vocabulary would be a second thing to keep
   * true.
   */
  /**
   * ADR 0131 A5 / ADR 0113 C2 - der gereichte Satz gewinnt.
   *
   * Bis zum 2026-08-21 wählte diese Activity ihre Worte selbst, und der Kern
   * hielt dieselben Schritte in anderen Sätzen. Zwei Clients, die einer Person
   * zwei verschiedene Dinge über denselben Moment sagen, sind der Defekt, den
   * A5 misst - und diese Fläche war der zweite Client.
   *
   * Was unten stehen bleibt, sind die zwei Momente, die kein Schritt des Walks
   * sind: die Passphrase und die ADR-0106-Zustimmung. Der Desktop hält seine
   * dafür ebenfalls selbst, also ist das ein gleicher Stand und keine
   * Abweichung.
   */
  private static String titleOf(JSONObject message, String step) {
    String given = message.optString("title", "");
    return given.isEmpty() ? titleFor(step) : given;
  }

  private static String bodyOf(JSONObject message, String step) {
    String given = message.optString("body", "");
    return given.isEmpty() ? bodyFor(step) : given;
  }

  /**
   * Nur noch der eine Moment, der kein Schritt des Walks ist.
   *
   * Für `show_offer`, `read_grant`, `show_acceptance`, `waiting` und `joined`
   * standen hier bis zum 2026-08-21 eigene Sätze - andere als die des Kerns,
   * nachgewiesen am Gerät: der Bildschirm zeigte "This device checks that the
   * code is really about itself...", während diese Datei "Your other device is
   * showing a grant. Type it here." gesagt hätte. Zwei Clients, ein Moment,
   * zwei Auskünfte.
   *
   * Sie sind entfernt statt stehengelassen: ein Rückfall, den niemand liest,
   * ist ein Rückfall, den niemand bemerkt, wenn eine Nachricht ihren Satz
   * einmal verliert.
   *
   * **Die Passphrase folgte am selben Tag**, und ihr Befund war ein anderer:
   * sie war nicht nur anders als beim Desktop, sondern anders als die elf
   * Sätze daneben. "This phone is about to make its keys" stand zwischen
   * lauter Sätzen, die "device" sagen - im selben Beitritt, auf demselben
   * Bildschirm nacheinander. Der Kern kennt fünf Fassungen dieser Frage, weil
   * es fünf verschiedene Momente sind; "am Telefon" war keiner davon.
   */
  private static String titleFor(String step) {
    switch (step) {
      case "approval":
        return "Sign this?";
      default:
        return "";
    }
  }

  private static String bodyFor(String step) {
    return "";
  }

}
