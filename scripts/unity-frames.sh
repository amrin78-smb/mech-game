#!/usr/bin/env bash
# Renders frames of the running battle to Logs/frames/.
#
# Needs a graphics device, so it runs under a virtual display rather than -nographics. This
# is what lets a model be judged "from frames of the running game" without building an APK
# and holding a phone.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/unity-guard.sh
unity_guard_check

METHOD="${1:-ScrapTitan.Editor.Screenshots.CaptureBattle}"
EDITOR="$(scripts/unity-editor-path.sh)"
mkdir -p Logs

set +e
xvfb-run -a --server-args="-screen 0 1600x900x24" \
  "$EDITOR" \
  -batchmode -quit \
  -projectPath "$PWD/ScrapTitan" \
  -executeMethod "$METHOD" \
  -logFile "$PWD/Logs/unity-frames.log"
STATUS=$?
set -e

echo "editor exit status: $STATUS"
grep -E '^\[Screenshots\]' Logs/unity-frames.log || true
if [ "$STATUS" -ne 0 ]; then
  echo "--- errors from Logs/unity-frames.log ---" >&2
  grep -nE 'Exception|error CS|Aborting' Logs/unity-frames.log | head -30 >&2
fi
exit "$STATUS"
