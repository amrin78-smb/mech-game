#!/usr/bin/env bash
# Publishes an APK as a GitHub pre-release, the same way Roar Rally does.
#
#   scripts/release-apk.sh <version> <path-to-apk> [notes-file]
#
# The tag sits on a commit with an EMPTY TREE and no parents, authored by the GitHub noreply
# identity. That is deliberate: the release carries the APK and nothing else, so no source
# is published by tagging. The APK is downloaded back afterwards and its SHA-256 compared
# with the local file, because an upload that silently truncated would otherwise look fine.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?usage: release-apk.sh <version> <apk> [notes-file]}"
APK="${2:?usage: release-apk.sh <version> <apk> [notes-file]}"
NOTES_FILE="${3:-}"
TAG="demo-${VERSION}"
REPO="amrin78-smb/mech-game"
IDENTITY_NAME="amrin78-smb"
IDENTITY_EMAIL="amrin78-smb@users.noreply.github.com"

[ -f "$APK" ] || { echo "No APK at $APK" >&2; exit 1; }

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Tag $TAG already exists locally. Pick the next version." >&2
  exit 1
fi
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release $TAG already exists on $REPO. Pick the next version." >&2
  exit 1
fi

LOCAL_SHA="$(sha256sum "$APK" | cut -d' ' -f1)"
SIZE="$(du -h "$APK" | cut -f1)"
echo "APK     $APK"
echo "size    $SIZE"
echo "sha256  $LOCAL_SHA"

# An empty tree, so the tag publishes no source.
EMPTY_TREE="$(git hash-object -t tree /dev/null)"
COMMIT="$(
  GIT_AUTHOR_NAME="$IDENTITY_NAME" GIT_AUTHOR_EMAIL="$IDENTITY_EMAIL" \
  GIT_COMMITTER_NAME="$IDENTITY_NAME" GIT_COMMITTER_EMAIL="$IDENTITY_EMAIL" \
  git commit-tree "$EMPTY_TREE" -m "Scrap Titan demo $VERSION (APK release only; no source)"
)"
echo "commit  $COMMIT (empty tree $EMPTY_TREE)"

git tag "$TAG" "$COMMIT"
git push origin "refs/tags/$TAG"

# Created as a draft on purpose, then published as a separate step.
#
# Uploading 75 MB and flipping the release live in one call is where GitHub fails: a 502 on
# the publish step once left the asset fully uploaded, the release stuck as a draft, and
# gh's own cleanup failing too. Splitting it means the big slow upload happens once and only
# the cheap publish is retried.
CREATE_ARGS=(release create "$TAG" "$APK" --repo "$REPO" --draft --prerelease
             --title "Scrap Titan demo $VERSION")
if [ -n "$NOTES_FILE" ]; then
  CREATE_ARGS+=(--notes-file "$NOTES_FILE")
else
  CREATE_ARGS+=(--notes "Android APK only, no source. SHA-256 \`$LOCAL_SHA\`")
fi

if ! gh "${CREATE_ARGS[@]}"; then
  # It may still have got far enough to leave a draft holding the asset.
  if ! gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
    echo "Creating the release failed and left nothing behind. Nothing to recover." >&2
    exit 1
  fi
  echo "Creating the release reported an error but left a draft; carrying on with it." >&2
fi

# Confirm the asset really arrived whole before publishing a release that points at it.
REMOTE_SIZE="$(gh release view "$TAG" --repo "$REPO" --json assets \
               -q '.assets[] | select(.name|endswith(".apk")) | .size')"
LOCAL_SIZE="$(stat -c %s "$APK")"
if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
  echo "The uploaded APK is $REMOTE_SIZE bytes, the local one is $LOCAL_SIZE." >&2
  echo "Delete the draft release and the tag, then run this again." >&2
  exit 1
fi

# `gh release view --json databaseId` is not in every gh version, and a draft release cannot
# be fetched by tag through the REST API, so the id comes from the list instead.
RELEASE_ID="$(gh api "repos/$REPO/releases" --paginate \
  --jq ".[] | select(.tag_name==\"$TAG\") | .id" | head -1)"
[ -n "$RELEASE_ID" ] || { echo "Could not find a release for $TAG" >&2; exit 1; }
PUBLISHED=no
for attempt in 1 2 3; do
  if gh api --method PATCH "repos/$REPO/releases/$RELEASE_ID" \
       -F draft=false -F prerelease=true >/dev/null 2>&1; then
    PUBLISHED=yes
    break
  fi
  echo "Publishing attempt $attempt failed; retrying." >&2
done
if [ "$PUBLISHED" != yes ]; then
  echo "The asset is uploaded but the release is still a draft." >&2
  echo "Publish it by hand: gh api --method PATCH repos/$REPO/releases/$RELEASE_ID -F draft=false" >&2
  exit 1
fi

# Download it back and check it survived the round trip.
VERIFY_DIR="$(mktemp -d)"
trap 'rm -rf "$VERIFY_DIR"' EXIT
gh release download "$TAG" --repo "$REPO" --dir "$VERIFY_DIR" --pattern '*.apk'
REMOTE_APK="$(find "$VERIFY_DIR" -name '*.apk' | head -1)"
REMOTE_SHA="$(sha256sum "$REMOTE_APK" | cut -d' ' -f1)"

echo
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "VERIFIED  the published APK matches the local one"
  echo "sha256    $REMOTE_SHA"
  echo "url       $(gh release view "$TAG" --repo "$REPO" --json url -q .url)"
else
  echo "MISMATCH after upload." >&2
  echo "  local  $LOCAL_SHA" >&2
  echo "  remote $REMOTE_SHA" >&2
  exit 1
fi
