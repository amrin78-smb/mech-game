#!/usr/bin/env bash
# Refuses to let a Unity run start while another one is going.
#
# Roar Rally and abcwonderland share this computer and also run Unity in batch mode. Two
# Unity runs at once have run it out of memory, and a run the kernel kills part way through
# leaves a half-written Library that is slow to recover from. So: check first, every time.
#
# Sourced by the other scripts, or run on its own to see the state.
set -uo pipefail

MIN_AVAILABLE_MB="${UNITY_MIN_AVAILABLE_MB:-4096}"

unity_guard_check() {
  # The editor binary is named exactly "Unity", which keeps this from matching the shell
  # that is running the check.
  local pids
  pids="$(pgrep -x Unity || true)"

  if [ -n "$pids" ]; then
    echo "REFUSING TO START: Unity is already running on this machine." >&2
    echo >&2
    local pid
    for pid in $pids; do
      local project
      project="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null \
                 | grep -oP '(?<=-projectPath )\S+' || echo 'unknown project')"
      echo "  pid $pid  $project" >&2
    done
    echo >&2
    echo "Wait for it to finish, or stop it, then run this again." >&2
    return 1
  fi

  local available
  available="$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo)"
  if [ "$available" -lt "$MIN_AVAILABLE_MB" ]; then
    echo "REFUSING TO START: only ${available} MB of memory available, want ${MIN_AVAILABLE_MB} MB." >&2
    echo "A Unity run killed for low memory is worse than one that never started." >&2
    return 1
  fi

  echo "Unity guard: clear. No other Unity running, ${available} MB available."
  return 0
}

# Run directly rather than sourced.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  unity_guard_check
fi
