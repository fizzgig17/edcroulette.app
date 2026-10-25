// Android: lets the app ask Google Play whether a newer version of it is available to this
// install (the same way hCRI Companion does). It only CHECKS; the update itself is installed
// from the Play Store listing, which the app opens. Adds a small native module, registers it,
// and adds Google's Play update library. The project is regenerated on every build, so this
// plugin re-adds all of it each time.
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod, withMainApplication } = require('expo/config-plugins');

const kotlin = (pkg) => `package ${pkg}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability

// Asks Google Play whether a newer version of this app is available to this install (works for
// installs from Play, including closed and open testing). It never starts Play's update flow.
class InAppUpdateModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

  override fun getName() = "InAppUpdate"

  private fun installedVersionCode(): Int =
      try {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        if (android.os.Build.VERSION.SDK_INT >= 28) pi.longVersionCode.toInt() else @Suppress("DEPRECATION") pi.versionCode
      } catch (e: Exception) {
        0
      }

  @ReactMethod
  fun checkForUpdate(promise: Promise) {
    try {
      AppUpdateManagerFactory.create(ctx)
          .appUpdateInfo
          .addOnSuccessListener { info ->
            val map = Arguments.createMap()
            map.putBoolean("available", info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE)
            map.putInt("versionCode", info.availableVersionCode())
            map.putInt("availability", info.updateAvailability())
            map.putInt("installedVersionCode", installedVersionCode())
            promise.resolve(map)
          }
          .addOnFailureListener { e -> promise.reject("E_UPDATE_CHECK", e.message, e) }
    } catch (e: Exception) {
      promise.reject("E_UPDATE_CHECK", e.message, e)
    }
  }
}

class InAppUpdatePackage : ReactPackage {
  override fun createNativeModules(c: ReactApplicationContext) = listOf(InAppUpdateModule(c))

  override fun createViewManagers(c: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;

module.exports = function withPlayUpdate(config) {
  const pkg = config.android?.package;
  if (!pkg) throw new Error('with-play-update: android.package is not set in app.json');

  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/java', ...pkg.split('.'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'InAppUpdateModule.kt'), kotlin(pkg));
      return cfg;
    },
  ]);

  config = withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('InAppUpdatePackage()')) {
      const marker = '// add(MyReactNativePackage())';
      if (!src.includes(marker)) throw new Error('with-play-update: could not find the package list in MainApplication');
      src = src.replace(marker, `${marker}\n          add(InAppUpdatePackage())`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('com.google.android.play:app-update')) {
      const marker = 'implementation("com.facebook.react:react-android")';
      if (!src.includes(marker)) throw new Error('with-play-update: could not find the dependencies block in app/build.gradle');
      src = src.replace(marker, `${marker}\n    implementation("com.google.android.play:app-update:2.1.0")`);
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  return config;
};
