#!/usr/bin/env bash
# Imports src/data into ScriptableObjects, regenerates the Phase 0 scene and applies the
# Android player settings. Re-runnable, and run through the editor directly because the
# work is not a build.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/unity-guard.sh
unity_guard_check

METHOD="${1:-ScrapTitan.Editor.Setup.RunAll}"
EDITOR="$(scripts/unity-editor-path.sh)"
mkdir -p Logs

set +e
"$EDITOR" \
  -batchmode -quit -nographics \
  -projectPath "$PWD/ScrapTitan" \
  -executeMethod "$METHOD" \
  -logFile "$PWD/Logs/unity-setup.log"
STATUS=$?
set -e

echo "editor exit status: $STATUS"
# Batch mode reports a thrown exception only through the exit code, so show what it said.
grep -E '^\[(DataImport|Phase0|AndroidBuild)' Logs/unity-setup.log || true
if [ "$STATUS" -ne 0 ]; then
  echo "--- errors from Logs/unity-setup.log ---" >&2
  grep -nE 'Exception|error CS|Error building|Aborting' Logs/unity-setup.log | head -40 >&2
fi
exit "$STATUS"
