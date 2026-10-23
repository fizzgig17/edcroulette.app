#!/bin/sh
# Xcode Cloud: runs right after the repository is cloned (called from
# ios/ci_scripts/ci_post_clone.sh). Turns this Expo project into a buildable
# Xcode workspace, the same way .github/workflows/ios-testflight.yml does:
#   - installs Node and CocoaPods (not preinstalled on Xcode Cloud)
#   - picks the backend: master -> prod Supabase, anything else -> dev
#   - sets the build number, Apple team and (for dev) the "EDC Roulette Dev" name
#   - generates ios/ with expo prebuild and installs the pods
#
# Optional Xcode Cloud custom environment variables (workflow > Environment):
#   any EXPO_PUBLIC_* variable, e.g. EXPO_PUBLIC_GOOGLE_SIGNIN=1 or
#   EXPO_PUBLIC_FACEBOOK_SIGNIN=1, is passed through to the app bundle.
set -e

cd "$CI_PRIMARY_REPOSITORY_PATH"

BRANCH="${CI_BRANCH:-${CI_GIT_REF#refs/heads/}}"
if [ "$BRANCH" = "master" ]; then TARGET=production; else TARGET=development; fi
echo "Branch: ${BRANCH:-unknown} -> $TARGET build, Xcode Cloud build ${CI_BUILD_NUMBER}"

# --- Tools -------------------------------------------------------------------
export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1
brew install node@22 cocoapods
NODE_PREFIX="$(brew --prefix node@22)"
export PATH="$NODE_PREFIX/bin:$PATH"
node --version
pod --version

npm ci --no-audit --no-fund

# --- Backend and feature flags ------------------------------------------------
# Expo reads .env.local over .env when bundling, and the bundle step runs later
# inside xcodebuild, so the choice has to be written to a file (exported shell
# variables from this script don't reach it).
: > .env.local
if [ "$TARGET" = "production" ]; then
  grep -E '^EXPO_PUBLIC_[A-Z_]+=' config/prod.env >> .env.local
fi
env | grep -E '^EXPO_PUBLIC_[A-Z_]+=' >> .env.local || true
echo "Using: $(sed -E 's/=.*//' .env.local | tr '\n' ' ')"

# --- app.json: build number, team, dev display name ----------------------------
# shellcheck disable=SC2016 # the single-quoted block is JavaScript, not shell
node -e '
  const fs = require("fs");
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  const ios = (app.expo.ios = app.expo.ios || {});
  if (process.env.CI_BUILD_NUMBER) ios.buildNumber = String(process.env.CI_BUILD_NUMBER);
  if (process.env.CI_TEAM_ID) ios.appleTeamId = process.env.CI_TEAM_ID;
  if (process.argv[1] !== "production") {
    // Only the display name: changing expo.name would rename the Xcode project
    // the Xcode Cloud workflow points at.
    ios.infoPlist = { ...(ios.infoPlist || {}), CFBundleDisplayName: "EDC Roulette Dev" };
  }
  fs.writeFileSync("app.json", JSON.stringify(app, null, 2) + "\n");
  console.log(`Version ${app.expo.version} (${ios.buildNumber || "unset"})`);
' "$TARGET"

# --- Generate the native project ------------------------------------------------
# prebuild recreates ios/; the with-xcode-cloud config plugin writes
# ios/ci_scripts back so the later Xcode Cloud steps still find them.
CI=1 npx expo prebuild --platform ios --no-install
cd ios
pod install
