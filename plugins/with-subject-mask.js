// Android: finds the separate objects in a photo with Google's on-device subject segmentation
// (ML Kit, run by Google Play services), so the photo check can outline each item exactly, the way
// Apple Vision does on iPhone. Nothing leaves the phone. It answers the same call as the iPhone
// module ("EdcSubjectMask.instanceMask"): one byte per pixel, 0 = background, 1, 2, 3... = objects.
// The Android project is regenerated on every build, so this plugin re-adds everything each time.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withAppBuildGradle, withDangerousMod, withMainApplication } = require('expo/config-plugins');

const kotlin = (pkg) => `package ${pkg}

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions

class EdcSubjectMaskModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "EdcSubjectMask"

  // The photo, upright and no bigger than about maxEdge on its long side.
  private fun load(uri: String, maxEdge: Int): Bitmap? {
    val parsed = Uri.parse(uri)
    val resolver = ctx.contentResolver
    val bounds = BitmapFactory.Options()
    bounds.inJustDecodeBounds = true
    resolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxEdge) sample *= 2
    val opts = BitmapFactory.Options()
    opts.inSampleSize = sample
    val raw = resolver.openInputStream(parsed)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
    var degrees = 0f
    try {
      resolver.openInputStream(parsed)?.use { s ->
        degrees = when (ExifInterface(s).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90f
          ExifInterface.ORIENTATION_ROTATE_180 -> 180f
          ExifInterface.ORIENTATION_ROTATE_270 -> 270f
          else -> 0f
        }
      }
    } catch (e: Exception) {
      degrees = 0f
    }
    val k = maxEdge.toFloat() / maxOf(raw.width, raw.height).toFloat()
    if (degrees == 0f && k >= 1f) return raw
    val matrix = Matrix()
    if (degrees != 0f) matrix.postRotate(degrees)
    if (k < 1f) matrix.postScale(k, k)
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
  }

  // Labels every pixel with the subject it belongs to, then answers the call. Failures say why, so the app can show it.
  private fun segment(segmenter: com.google.mlkit.vision.segmentation.subject.SubjectSegmenter, bitmap: Bitmap, promise: Promise, attempt: Int = 0) {
    segmenter
        .process(InputImage.fromBitmap(bitmap, 0))
        .addOnSuccessListener { result ->
          try {
            val w = bitmap.width
            val h = bitmap.height
            val labels = ByteArray(w * h)
            var n = 0
            for (subject in result.subjects) {
              if (n >= 254) break
              val mask = subject.confidenceMask
              if (mask == null) continue
              n += 1
              for (y in 0 until subject.height) {
                for (x in 0 until subject.width) {
                  val px = subject.startX + x
                  val py = subject.startY + y
                  if (px < 0 || py < 0 || px >= w || py >= h) continue
                  if (mask.get(y * subject.width + x) > 0.5f && labels[py * w + px] == 0.toByte()) labels[py * w + px] = n.toByte()
                }
              }
            }
            if (n == 0) {
              promise.reject("none", "ML Kit found no objects in the photo")
            } else {
              val map = Arguments.createMap()
              map.putInt("width", w)
              map.putInt("height", h)
              map.putString("data", Base64.encodeToString(labels, Base64.NO_WRAP))
              promise.resolve(map)
            }
          } catch (e: Throwable) {
            promise.reject("read", "Reading the result failed: " + e.toString())
          } finally {
            segmenter.close()
          }
        }
        .addOnFailureListener { e ->
          // The first time, Google Play services may still be downloading the model ("waiting for the module to be downloaded"):
          // wait a few seconds and ask again (up to about a minute) instead of giving up and using the whole photo.
          val why = e.toString().lowercase()
          if (attempt < 20 && (why.contains("download") || why.contains("wait") || why.contains("unavailable") || why.contains("module"))) {
            Handler(Looper.getMainLooper()).postDelayed({ segment(segmenter, bitmap, promise, attempt + 1) }, 3000)
          } else {
            promise.reject("segment", "Segmentation failed: " + e.toString())
            segmenter.close()
          }
        }
  }

  // Starts the model download early (when the add screen opens), so the first photo doesn't wait for it.
  @ReactMethod
  fun prepare(promise: Promise) {
    try {
      val options = SubjectSegmenterOptions.Builder().enableMultipleSubjects(SubjectSegmenterOptions.SubjectResultOptions.Builder().enableConfidenceMask().build()).build()
      val segmenter = SubjectSegmentation.getClient(options)
      ModuleInstall.getClient(ctx)
          .installModules(ModuleInstallRequest.newBuilder().addApi(segmenter).build())
          .addOnCompleteListener {
            segmenter.close()
            promise.resolve(true)
          }
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun instanceMask(uri: String, maxEdge: Int, promise: Promise) {
    Thread {
      try {
        // Google recommends at least about 512 pixels for good results.
        val bitmap = load(uri, maxOf(maxEdge, 640))
        if (bitmap == null) {
          promise.reject("load", "Could not read the photo")
          return@Thread
        }
        val subjectOptions = SubjectSegmenterOptions.SubjectResultOptions.Builder().enableConfidenceMask().build()
        val options = SubjectSegmenterOptions.Builder().enableMultipleSubjects(subjectOptions).build()
        val segmenter = SubjectSegmentation.getClient(options)
        // Make sure Google Play services has the model first (it downloads it once, then it is kept).
        ModuleInstall.getClient(ctx)
            .installModules(ModuleInstallRequest.newBuilder().addApi(segmenter).build())
            .addOnSuccessListener { segment(segmenter, bitmap, promise) }
            .addOnFailureListener { e ->
              promise.reject("model", "Model not available: " + e.toString())
              segmenter.close()
            }
      } catch (e: Throwable) {
        promise.reject("error", e.toString())
      }
    }.start()
  }
}

class EdcSubjectMaskPackage : ReactPackage {
  override fun createNativeModules(c: ReactApplicationContext) = listOf(EdcSubjectMaskModule(c))

  override fun createViewManagers(c: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

module.exports = function withSubjectMask(config) {
  const pkg = config.android?.package;
  if (!pkg) throw new Error('with-subject-mask: android.package is not set in app.json');

  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'EdcSubjectMaskModule.kt'), kotlin(pkg));
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('EdcSubjectMaskPackage()')) {
      const marker = '// add(MyReactNativePackage())';
      if (!src.includes(marker)) throw new Error('with-subject-mask: could not find the package list in MainApplication');
      src = src.replace(marker, `${marker}\n          add(EdcSubjectMaskPackage())`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('play-services-base')) {
      const marker = 'implementation("com.facebook.react:react-android")';
      if (src.includes(marker)) src = src.replace(marker, `${marker}\n    implementation("com.google.android.gms:play-services-base:18.5.0")`);
    }
    if (!src.includes('play-services-mlkit-subject-segmentation')) {
      const marker = 'implementation("com.facebook.react:react-android")';
      if (!src.includes(marker)) throw new Error('with-subject-mask: could not find the dependencies block in app/build.gradle');
      src = src.replace(marker, `${marker}\n    implementation("com.google.android.gms:play-services-mlkit-subject-segmentation:16.0.0-beta1")`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  // Ask Google Play services to download the model when the app is installed, so the first photo already has it.
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (app) {
      app['meta-data'] = app['meta-data'] ?? [];
      const name = 'com.google.mlkit.vision.DEPENDENCIES';
      if (!app['meta-data'].some((m) => m.$?.['android:name'] === name)) {
        app['meta-data'].push({ $: { 'android:name': name, 'android:value': 'subject_segment' } });
      }
    }
    return cfg;
  });

  return config;
};
