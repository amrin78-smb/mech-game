#!/usr/bin/env bash
# Builds the Android APK.
#
#   scripts/unity-build-apk.sh [version] [output-apk-relative-to-ScrapTitan]
#
# Signs with the release key when ~/.scraptitan/keystore.env exists; without it Unity's
# debug key is used and the build says so. The keystore and its passwords live outside this
# repository, are passed to the editor only as environment variables, and are never written
# into a file in the repo or onto a command line.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/unity-guard.sh
unity_guard_check

VERSION="${1:-0.1.0}"
# Absolute: the editor resolves a relative -buildOutput against its own working directory,
# which is not the Unity project directory, so a relative path lands somewhere surprising.
OUTPUT="${2:-$PWD/ScrapTitan/Builds/Android/ScrapTitan-${VERSION}.apk}"
KEY_ENV="${SCRAPTITAN_KEY_ENV:-$HOME/.scraptitan/keystore.env}"

if [ -f "$KEY_ENV" ]; then
  # shellcheck disable=SC1090
  set -a; source "$KEY_ENV"; set +a
  echo "Signing with the release key from $KEY_ENV"
else
  echo "WARNING: no $KEY_ENV, so this APK gets Unity's debug key." >&2
fi

mkdir -p Logs
unity build ScrapTitan \
  --target Android \
  --execute-method ScrapTitan.Editor.AndroidBuild.Development \
  --output-path "$OUTPUT" \
  --args "-appVersion $VERSION" \
  --log-file "$PWD/Logs/unity-build.log" \
  --allow-dirty-build

APK="$OUTPUT"
echo
echo "APK      $APK"
echo "size     $(du -h "$APK" | cut -f1)"
echo "sha256   $(sha256sum "$APK" | cut -d' ' -f1)"
