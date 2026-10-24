// Android: keep the app running (not restarted) when a foldable folds, unfolds or is resized,
// and let it fill any window size. Without the extra configChanges, Samsung Folds restart the
// activity on every fold, which loses what's on screen.
const { withAndroidManifest } = require('expo/config-plugins');

const NEEDED = ['keyboard', 'keyboardHidden', 'orientation', 'screenSize', 'smallestScreenSize', 'screenLayout', 'uiMode', 'density', 'navigation', 'colorMode', 'fontScale', 'layoutDirection', 'locale'];

module.exports = function withFoldables(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) return cfg;
    const have = (main.$['android:configChanges'] || '').split('|').filter(Boolean);
    main.$['android:configChanges'] = [...new Set([...have, ...NEEDED])].join('|');
    main.$['android:resizeableActivity'] = 'true';
    delete main.$['android:screenOrientation'];
    return cfg;
  });
};
