#!/usr/bin/env bash
# Prints the editor binary for the version this project is pinned to, so every script uses
# the same one and an editor upgrade cannot happen by accident.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(grep -oP '(?<=^m_EditorVersion: ).*' ScrapTitan/ProjectSettings/ProjectVersion.txt | tr -d '\r')"
EDITOR="$HOME/Unity/Hub/Editor/$VERSION/Editor/Unity"

if [ ! -x "$EDITOR" ]; then
  echo "Editor $VERSION is not installed at $EDITOR" >&2
  echo "Installed editors:" >&2
  unity editors >&2
  exit 1
fi

echo "$EDITOR"
