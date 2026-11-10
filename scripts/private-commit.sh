#!/usr/bin/env bash
# Commit files from your own worktree onto $BRANCH through a private index, never touching the shared checkout (with six
# seats, the shared checkout is stale on purpose).
#
#   scripts/private-commit.sh <worktree> <base sha> <message file> <path>...
#
# Refuses a path whose blob on $BRANCH differs from <base> (someone changed it since you started), conflict markers, and
# an empty tree; then commit-tree on $BRANCH and update-ref with compare-and-swap. Author = your git config.
set -euo pipefail
BRANCH="${SEATS_BRANCH:-seats}"   # the branch seats commit to; never main
WT="$1"; BASE="$2"; MSG="$3"; shift 3
REPO="$(cd "$(git -C "$WT" rev-parse --git-common-dir)/.." && pwd)"
MAIN="$(git -C "$REPO" rev-parse refs/heads/$BRANCH)"

for path in "$@"; do
  base_blob="$(git -C "$REPO" rev-parse --verify -q "$BASE:$path" || true)"
  main_blob="$(git -C "$REPO" rev-parse --verify -q "$MAIN:$path" || true)"
  if [[ "$base_blob" != "$main_blob" ]]; then
    echo "REFUSED: $path changed on $BRANCH since $BASE" >&2
    exit 1
  fi
  if grep -q '^<<<<<<< \|^>>>>>>> ' "$WT/$path" 2>/dev/null; then
    echo "REFUSED: conflict markers in $path" >&2
    exit 1
  fi
done

INDEX="$(mktemp -t seatsindex)"
export GIT_INDEX_FILE="$INDEX"
git -C "$REPO" read-tree "$MAIN"
while IFS= read -r path; do
  if [[ -f "$WT/$path" ]]; then
    blob="$(git -C "$REPO" hash-object -w "$WT/$path")"
    mode="100644"; [[ -x "$WT/$path" ]] && mode="100755"
    git -C "$REPO" update-index --add --cacheinfo "$mode,$blob,$path"
  else
    git -C "$REPO" update-index --force-remove "$path"
  fi
done < <(printf '%s\n' "$@")
TREE="$(git -C "$REPO" write-tree)"
rm -f "$INDEX"
unset GIT_INDEX_FILE
if [[ "$TREE" == "$(git -C "$REPO" rev-parse "$MAIN^{tree}")" ]]; then
  echo "REFUSED: nothing changed against $BRANCH (an empty commit)" >&2
  exit 1
fi

COMMIT="$(git -C "$REPO" commit-tree "$TREE" -p "$MAIN" -F "$MSG")"
git -C "$REPO" update-ref refs/heads/$BRANCH "$COMMIT" "$MAIN"
echo "$COMMIT"
git -C "$REPO" show --stat --format='%h %s' "$COMMIT" | cut -c1-160
