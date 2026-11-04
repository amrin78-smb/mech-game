#!/usr/bin/env bash
# Runs the EditMode suite and prints a summary from the NUnit report.
#
# Driven through the editor binary rather than "unity test", because that wrapper starts the
# editor without -nographics and there is no X display on this machine, so it dies with
# "Error opening default X display" before it runs a single test.
#
#   scripts/unity-test.sh                     # everything
#   scripts/unity-test.sh DataSchemaTests     # one fixture or test, by name filter
set -uo pipefail
cd "$(dirname "$0")/.."
source scripts/unity-guard.sh
unity_guard_check || exit 1

FILTER="${1:-}"
EDITOR="$(scripts/unity-editor-path.sh)"
RESULTS="$PWD/Logs/editmode-results.xml"
LOG="$PWD/Logs/unity-test.log"
mkdir -p Logs
rm -f "$RESULTS"

ARGS=(
  -batchmode -nographics
  -projectPath "$PWD/ScrapTitan"
  -runTests -testPlatform EditMode
  -testResults "$RESULTS"
  -logFile "$LOG"
)
[ -n "$FILTER" ] && ARGS+=(-testFilter "$FILTER")

"$EDITOR" "${ARGS[@]}"
STATUS=$?

if [ ! -f "$RESULTS" ]; then
  echo "No test report was written. The run failed before testing." >&2
  grep -nE 'error CS|Unhandled|Aborting|X display' "$LOG" | head -30 >&2
  exit 1
fi

python3 - "$RESULTS" <<'PY'
import sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
total  = int(root.get('total', 0));   passed = int(root.get('passed', 0))
failed = int(root.get('failed', 0));  skipped = int(root.get('skipped', 0))
print(f"\n{passed}/{total} passed, {failed} failed, {skipped} skipped  "
      f"({float(root.get('duration', 0)):.1f}s)\n")

for case in root.iter('test-case'):
    if case.get('result') != 'Failed':
        continue
    print(f"FAILED  {case.get('fullname')}")
    failure = case.find('failure')
    if failure is not None:
        for tag in ('message', 'stack-trace'):
            node = failure.find(tag)
            if node is not None and node.text:
                for line in node.text.strip().splitlines()[:12]:
                    print(f"        {line}")
    print()

sys.exit(1 if failed else 0)
PY
PY_STATUS=$?

echo "report: Logs/editmode-results.xml"
[ "$PY_STATUS" -ne 0 ] && exit "$PY_STATUS"
exit "$STATUS"
