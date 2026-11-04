#!/usr/bin/env bash
# Checks every delivered model against its brief.
#
#   tools/model-check/check-all.sh <dir-of-model-folders> [asset-id ...]
#
# Each model lives in <dir>/<asset-id>/<asset-id>.blend. Exits non-zero if any model has an
# unwaived failure, so this can gate an import.
set -uo pipefail
cd "$(dirname "$0")/../.."

ROOT="${1:?usage: check-all.sh <dir-of-model-folders> [asset-id ...]}"
shift || true
BLENDER="${BLENDER:-$HOME/.local/bin/blender}"
# Reports go in their own directory per source, so checking the placeholders cannot
# overwrite a delivery's report and have the summary mix the two.
OUT="${OUT:-Logs/model-check}"
mkdir -p "$OUT"

if [ "$#" -gt 0 ]; then IDS=("$@"); else mapfile -t IDS < <(cd "$ROOT" && ls -d */ | tr -d /); fi

WORST=0
for id in "${IDS[@]}"; do
  blend="$ROOT/$id/$id.blend"
  if [ ! -f "$blend" ]; then echo "SKIP $id: no $blend" >&2; WORST=1; continue; fi
  # --disable-autoexec: these .blend files come from outside and must not run their own scripts.
  "$BLENDER" --background --factory-startup --disable-autoexec \
    --python tools/model-check/check_model.py -- \
    --input "$blend" --asset-id "$id" --report "$OUT/$id.json" \
    2>&1 | grep -E "^  (PASS|FAIL|WAIVED|NOTE)|^ +waived |^====|^  [0-9]+ passed"
  status=${PIPESTATUS[0]}
  [ "$status" -gt "$WORST" ] && WORST=$status
done

echo
echo "===== summary ====="
python3 -I - "$OUT" <<'PY'
import json, pathlib, sys
total = 0
for report in sorted(pathlib.Path(sys.argv[1]).glob("*.json")):
    d = json.loads(report.read_text())
    total += d["failed"]
    mark = "OK  " if d["failed"] == 0 else "FAIL"
    print(f"  {mark}  {d['asset']:26} {d['passed']} passed, {d['failed']} failed, {d['waived']} waived")
print(f"\n  {total} unwaived failures in all")
PY
exit "$WORST"
