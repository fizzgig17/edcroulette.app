#!/bin/sh
# Xcode Cloud: runs after each xcodebuild action (called from
# ios/ci_scripts/ci_post_xcodebuild.sh), even when it failed. For a successful
# TestFlight archive, writes the "What to Test" text Xcode Cloud attaches to the
# upload: TestFlight's list only shows version + build number, so this records
# the branch, commit and backend, like the GitHub Actions workflow does.
set -e

if [ ! -d "${CI_APP_STORE_SIGNED_APP_PATH:-/nonexistent}" ]; then
  exit 0
fi

cd "$CI_PRIMARY_REPOSITORY_PATH"
BRANCH="${CI_BRANCH:-${CI_GIT_REF#refs/heads/}}"
if [ "$BRANCH" = "master" ]; then
  KIND=PRODUCTION; BACKEND=fizzgig-apps-prod
else
  KIND=DEVELOPMENT; BACKEND=fizzgig-apps-dev
fi
SUBJECT="$(git log -1 --pretty=%s 2>/dev/null || true)"
SHORT="$(printf '%s' "$CI_COMMIT" | cut -c1-7)"

# Xcode Cloud looks for TestFlight/ next to the Xcode workspace (ios/).
mkdir -p ios/TestFlight
printf '%s build\nBranch: %s\nCommit: %s\nBackend: %s\n%s\n' \
  "$KIND" "$BRANCH" "$SHORT" "$BACKEND" "$SUBJECT" | head -c 3900 > ios/TestFlight/WhatToTest.en-US.txt
cat ios/TestFlight/WhatToTest.en-US.txt
