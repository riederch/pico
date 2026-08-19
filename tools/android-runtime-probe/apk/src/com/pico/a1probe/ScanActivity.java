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
import android.widget.FrameLayout;
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
      String chosen = null;
      for (String id : manager.getCameraIdList()) {
        Integer facing = manager.getCameraCharacteristics(id)
          .get(CameraCharacteristics.LENS_FACING);
        if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
          chosen = id;
          break;
        }
      }
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
      manager.openCamera(chosen, new CameraDevice.StateCallback() {
        @Override public void onOpened(CameraDevice opened) {
          camera = opened;
          start(size);
        }
        @Override public void onDisconnected(CameraDevice opened) { opened.close(); }
        @Override public void onError(CameraDevice opened, int error) {
          opened.close();
          fail("The camera could not be opened (" + error + ").");
        }
      }, handler);
    } catch (CameraAccessException | SecurityException error) {
      fail("Pico may not use the camera on this device.");
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
    if (session != null) {
      session.close();
      session = null;
    }
    if (camera != null) {
      camera.close();
      camera = null;
    }
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
