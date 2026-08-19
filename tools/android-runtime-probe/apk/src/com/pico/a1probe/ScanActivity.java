package com.pico.a1probe;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.Image;
import android.media.ImageReader;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.util.TypedValue;
import android.view.Surface;
import android.view.TextureView;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * ADR 0131 A5. Reading a code with the camera, because the big one cannot be
 * typed.
 *
 * Measured on 2026-08-19 before this existed: an enrolment grant is 1,127
 * characters - it carries the activation signature input, the Home's host
 * keys, its identity and the endpoint - and it is only valid for four
 * minutes. A person does not type that, and a machine pretending to be one
 * failed four different ways trying. So on a phone the camera is the path for
 * a grant and the typed field is the fallback for a scanner.
 *
 * Platform Camera2 and a plain-JAR decoder, no Gradle and no AndroidX, for
 * the same reason the rest of this app is built that way. The decoder is
 * ZXing's `core`, which is pure Java with no resources - the one shape of
 * dependency a hand-assembled APK can take.
 *
 * The camera never meets the ceremony. What it produces is a string, which
 * goes back to the walk over the same bridge a typed one does - the same
 * split ADR 0113 draws on the desktop, where `camera-scan.ts` is shell code
 * and the core is told only what it read.
 */
public final class ScanActivity extends Activity {
  public static final String EXTRA_PREFIX = "pico.scan.prefix";
  public static final String EXTRA_VALUE = "pico.scan.value";

  private TextureView preview;
  private TextView status;
  private CameraDevice camera;
  private CameraCaptureSession session;
  private ImageReader reader;
  private HandlerThread thread;
  private Handler handler;
  private MultiFormatReader decoder;
  private String prefix = "";
  private boolean answered = false;
  private LinearLayout lenses;
  private final Map<String, String> physicalParents = new java.util.HashMap<>();
  private String openId = "";
  private Size captureSize = new Size(1280, 960);

  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    prefix = getIntent().getStringExtra(EXTRA_PREFIX);
    if (prefix == null) {
      prefix = "";
    }

    FrameLayout frame = new FrameLayout(this);
    frame.setBackgroundColor(Color.BLACK);
    preview = new TextureView(this);
    frame.addView(preview, new FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    status = new TextView(this);
    status.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    status.setTextColor(Color.WHITE);
    status.setBackgroundColor(Color.parseColor("#aa000000"));
    status.setPadding(36, 36, 36, 36);
    status.setText("Hold the code on your other device in front of the camera.");
    frame.addView(status, new FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    /**
     * ADR 0131 A5. The lens is the person's choice, not a guess.
     *
     * A phone has several back cameras and only some of them can read a
     * dense code: the ultra-wide and the macro have no autofocus and see a
     * 177-module QR as porridge. This was picked by a heuristic first -
     * autofocus, then sensor size - and the heuristic is still what opens
     * first, but a heuristic that is wrong leaves a person stuck in front of
     * a code their phone can see and cannot read. So the lenses are named
     * and offered.
     */
    lenses = new LinearLayout(this);
    lenses.setOrientation(LinearLayout.HORIZONTAL);
    lenses.setBackgroundColor(Color.parseColor("#aa000000"));
    lenses.setPadding(18, 18, 18, 18);
    FrameLayout.LayoutParams bottom = new FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    bottom.gravity = android.view.Gravity.BOTTOM;
    frame.addView(lenses, bottom);
    setContentView(frame);

    Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
    hints.put(DecodeHintType.POSSIBLE_FORMATS,
      Arrays.asList(com.google.zxing.BarcodeFormat.QR_CODE));
    hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
    decoder = new MultiFormatReader();
    decoder.setHints(hints);

    preview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
      @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int w, int h) {
        open();
      }
      @Override public void onSurfaceTextureSizeChanged(SurfaceTexture t, int w, int h) {}
      @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture t) { return true; }
      @Override public void onSurfaceTextureUpdated(SurfaceTexture t) {}
    });
  }

  private void open() {
    thread = new HandlerThread("pico-camera");
    thread.start();
    handler = new Handler(thread.getLooper());
    CameraManager manager = getSystemService(CameraManager.class);
    try {
      /**
       * The *main* back camera, not the first one listed.
       *
       * A phone has several: on this one the first back-facing id is the
       * ultra-wide, which has no autofocus and cannot resolve a
       * 177-module grant QR at reading distance. Taking whichever came
       * first produced a camera that saw the code and could never read it.
       *
       * Scored rather than guessed: autofocus decides it, and among the
       * cameras that have it the largest sensor output wins - which is the
       * main lens on every phone this has been looked at on.
       */
      String chosen = null;
      long best = -1;
      for (String id : manager.getCameraIdList()) {
        CameraCharacteristics traits = manager.getCameraCharacteristics(id);
        Integer facing = traits.get(CameraCharacteristics.LENS_FACING);
        if (facing == null || facing != CameraCharacteristics.LENS_FACING_BACK) {
          continue;
        }
        int[] focus = traits.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
        boolean focuses = false;
        if (focus != null) {
          for (int mode : focus) {
            if (mode == CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
              || mode == CaptureRequest.CONTROL_AF_MODE_AUTO) {
              focuses = true;
            }
          }
        }
        long pixels = 0;
        android.hardware.camera2.params.StreamConfigurationMap streams =
          traits.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        if (streams != null) {
          for (Size option : streams.getOutputSizes(ImageFormat.YUV_420_888)) {
            pixels = Math.max(pixels, (long) option.getWidth() * option.getHeight());
          }
        }
        long score = (focuses ? 1_000_000_000L : 0L) + pixels;
        if (score > best) {
          best = score;
          chosen = id;
        }
      }
      final String chosenId = chosen;
      if (chosen == null) {
        fail("This device has no back camera.");
        return;
      }
      /**
       * A middling resolution on purpose. A dense grant QR is version 40 -
       * 177 modules across - so too small an image loses the modules, and
       * too large a one costs decode time on every frame.
       */
      Size size = new Size(1280, 960);
      reader = ImageReader.newInstance(size.getWidth(), size.getHeight(), ImageFormat.YUV_420_888, 2);
      reader.setOnImageAvailableListener(this::onFrame, handler);
      captureSize = size;
      /**
       * Every lens the device will admit to, not only the back-facing ones
       * the ceremony expects. Two reasons, both learned here: a phone
       * reports four cameras and only two were being offered, and which of
       * them can read a dense code is a fact about optics that the person
       * holding it can see and this code cannot.
       */
      final List<String> offered = new ArrayList<>();
      for (String id : manager.getCameraIdList()) {
        offered.add(id);
        /**
         * A logical camera hides its physical lenses - the macro usually
         * lives here, invisible to `getCameraIdList`. They can be opened
         * only through their parent, which `use` handles.
         */
        for (String physical : manager.getCameraCharacteristics(id).getPhysicalCameraIds()) {
          if (!offered.contains(physical)) {
            offered.add(physical);
            physicalParents.put(physical, id);
          }
        }
      }
      runOnUiThread(() -> showLenses(manager, offered));
      use(chosenId);
    } catch (CameraAccessException | SecurityException error) {
      fail("Pico may not use the camera on this device.");
    }
  }

  /**
   * One button per back camera, labelled the way a person tells lenses
   * apart: how wide it is, and whether it can focus. The 35 mm equivalent
   * comes from the focal length and the sensor's own width, which is the
   * only pair of numbers a phone reliably reports about its optics.
   */
  private void showLenses(CameraManager manager, List<String> ids) {
    lenses.removeAllViews();
    for (String id : ids) {
      Button button = new Button(this);
      button.setText(label(manager, id));
      button.setOnClickListener(view -> use(id));
      lenses.addView(button, new LinearLayout.LayoutParams(0,
        ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    }
  }

  private String label(CameraManager manager, String id) {
    try {
      CameraCharacteristics traits = manager.getCameraCharacteristics(id);
      float[] focal = traits.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
      android.util.SizeF sensor = traits.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
      int[] focus = traits.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
      boolean focuses = false;
      if (focus != null) {
        for (int mode : focus) {
          if (mode == CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
            || mode == CaptureRequest.CONTROL_AF_MODE_AUTO) {
            focuses = true;
          }
        }
      }
      String wide = "";
      if (focal != null && focal.length > 0 && sensor != null && sensor.getWidth() > 0) {
        wide = Math.round(focal[0] * 36f / sensor.getWidth()) + "mm";
      }
      Integer facing = traits.get(CameraCharacteristics.LENS_FACING);
      String side = facing == null ? "?"
        : facing == CameraCharacteristics.LENS_FACING_BACK ? "back"
        : facing == CameraCharacteristics.LENS_FACING_FRONT ? "front" : "other";
      return id + (physicalParents.containsKey(id) ? "*" : "")
        + "\n" + side + " " + wide + (focuses ? "\nfocus" : "\nfixed");
    } catch (CameraAccessException error) {
      return id;
    }
  }

  /** Switch to a lens: close what is open, then open the chosen one. */
  private void use(String id) {
    if (id == null || id.equals(openId)) {
      return;
    }
    closeCamera();
    openId = id;
    CameraManager manager = getSystemService(CameraManager.class);
    final String parent = physicalParents.get(id);
    physicalTarget = parent == null ? null : id;
    runOnUiThread(() -> status.setText(
      "Camera " + id + (parent == null ? "" : " (through " + parent + ")")
        + ". Hold the code in front of it."));
    try {
      manager.openCamera(parent == null ? id : parent, new CameraDevice.StateCallback() {
        @Override public void onOpened(CameraDevice opened) {
          camera = opened;
          start(captureSize);
        }
        @Override public void onDisconnected(CameraDevice opened) { opened.close(); }
        @Override public void onError(CameraDevice opened, int error) {
          opened.close();
          fail("Camera " + id + " could not be opened (" + error + "). Try another lens.");
        }
      }, handler);
    } catch (CameraAccessException | SecurityException error) {
      fail("Pico may not use camera " + id + " on this device.");
    }
  }

  private String physicalTarget = null;

  private void closeCamera() {
    if (session != null) {
      session.close();
      session = null;
    }
    if (camera != null) {
      camera.close();
      camera = null;
    }
  }

  private void start(Size size) {
    try {
      SurfaceTexture texture = preview.getSurfaceTexture();
      texture.setDefaultBufferSize(size.getWidth(), size.getHeight());
      Surface previewSurface = new Surface(texture);
      List<Surface> surfaces = new ArrayList<>();
      surfaces.add(previewSurface);
      surfaces.add(reader.getSurface());
      CaptureRequest.Builder request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
      request.addTarget(previewSurface);
      request.addTarget(reader.getSurface());
      request.set(CaptureRequest.CONTROL_AF_MODE,
        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
      if (physicalTarget != null) {
        // A physical lens is reached by naming it on each output, never by
        // opening it: the parent is what the system hands out.
        List<android.hardware.camera2.params.OutputConfiguration> outputs = new ArrayList<>();
        for (Surface surface : surfaces) {
          android.hardware.camera2.params.OutputConfiguration output =
            new android.hardware.camera2.params.OutputConfiguration(surface);
          output.setPhysicalCameraId(physicalTarget);
          outputs.add(output);
        }
        camera.createCaptureSessionByOutputConfigurations(outputs,
          new CameraCaptureSession.StateCallback() {
            @Override public void onConfigured(CameraCaptureSession configured) {
              session = configured;
              try {
                configured.setRepeatingRequest(request.build(), null, handler);
              } catch (CameraAccessException error) {
                fail("That lens stopped before it started.");
              }
            }
            @Override public void onConfigureFailed(CameraCaptureSession configured) {
              fail("That lens cannot be used for this. Try another.");
            }
          }, handler);
        return;
      }
      camera.createCaptureSession(surfaces, new CameraCaptureSession.StateCallback() {
        @Override public void onConfigured(CameraCaptureSession configured) {
          session = configured;
          try {
            configured.setRepeatingRequest(request.build(), null, handler);
          } catch (CameraAccessException error) {
            fail("The camera stopped before it started.");
          }
        }
        @Override public void onConfigureFailed(CameraCaptureSession configured) {
          fail("The camera would not start.");
        }
      }, handler);
    } catch (CameraAccessException error) {
      fail("The camera stopped before it started.");
    }
  }

  /** One frame, one attempt. Nothing is kept and nothing is written down. */
  private void onFrame(ImageReader from) {
    Image image = from.acquireLatestImage();
    if (image == null || answered) {
      if (image != null) {
        image.close();
      }
      return;
    }
    try {
      ByteBuffer buffer = image.getPlanes()[0].getBuffer();
      byte[] luminance = new byte[buffer.remaining()];
      buffer.get(luminance);
      int width = image.getWidth();
      int height = image.getHeight();
      PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(
        luminance, image.getPlanes()[0].getRowStride(), height,
        0, 0, width, height, false);
      Result result = decoder.decodeWithState(new BinaryBitmap(new HybridBinarizer(source)));
      String text = result.getText();
      if (text != null && text.startsWith(prefix)) {
        answered = true;
        // What the decoder produced, before any view has touched it.
        android.util.Log.i("PicoScan", "decoded " + text.length() + " chars, tail "
          + text.substring(Math.max(0, text.length() - 12)));
        runOnUiThread(() -> answer(text));
      } else if (text != null) {
        runOnUiThread(() -> status.setText(
          "That is a code, but not the one this step is waiting for."));
      }
    } catch (Throwable notThisFrame) {
      // Most frames hold no code. That is not an error, it is looking.
    } finally {
      image.close();
      decoder.reset();
    }
  }

  private void answer(String value) {
    Intent result = new Intent();
    result.putExtra(EXTRA_VALUE, value);
    setResult(Activity.RESULT_OK, result);
    finish();
  }

  private void fail(String because) {
    runOnUiThread(() -> status.setText(because));
  }

  @Override protected void onPause() {
    super.onPause();
    closeCamera();
    if (reader != null) {
      reader.close();
      reader = null;
    }
    if (thread != null) {
      thread.quitSafely();
      thread = null;
    }
  }
}
