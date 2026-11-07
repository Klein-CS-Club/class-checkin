#!/usr/bin/env bash
# One file with every seat's copy-paste prompt, so the next round is six pastes.
#
#   scripts/next-prompts.sh [worktree]
#
# Reads the NEWEST nextsessions/PASTE-SEAT<n>-<date>.txt per seat from MAIN, writes nextsessions/NEXT-PROMPTS.md in the
# worktree, and copies it to ~/Desktop/<PROJECT>-NEXT-PROMPTS.md. Run it after you write a new PASTE file, then commit
# NEXT-PROMPTS.md with it. Seats = SEATS env (default "1 2 3 4 5 6").
set -euo pipefail
BRANCH="${SEATS_BRANCH:-seats}"   # the branch seats commit to; never main

WT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$WT"
PROJECT="$(basename "$(git rev-parse --show-toplevel)")"
OUT="$WT/nextsessions/NEXT-PROMPTS.md"
DESK="$HOME/Desktop/$(echo "$PROJECT" | tr '[:lower:]' '[:upper:]')-NEXT-PROMPTS.md"
SEATS="${SEATS:-1 2 3 4 5 6}"
mkdir -p "$WT/nextsessions"

main_sha="$(git rev-parse --short "$BRANCH")"
now="$(date -u +%Y-%m-%dT%H:%MZ)"

newest() {
  git ls-tree --name-only "$BRANCH:nextsessions" 2>/dev/null | grep -E "^PASTE-SEAT$1-[0-9-]+\.txt$" | sort | tail -1
}

{
  echo "# $PROJECT: next sessions, copy-paste prompts"
  echo
  echo "As of \`$BRANCH\` at \`$main_sha\`, written $now by \`scripts/next-prompts.sh\` (rerun it after a new PASTE file lands)."
  echo
  echo "How: \`seats up .\` in the project, paste ONE block per seat; seat 6 goes in as \`/loop\` followed by its block. Round-one blocks start in PLAN MODE; next-round blocks post a plan to the room and start. Each block tells the seat what to read."
  echo
  if git cat-file -e $BRANCH:nextsessions/OPEN-ASKS.md 2>/dev/null; then
    git show $BRANCH:nextsessions/OPEN-ASKS.md
    echo
  fi
  for n in $SEATS; do
    file="$(newest "$n" || true)"
    [[ -z "$file" ]] && continue
    echo "## Seat $n: \`nextsessions/$file\`"
    echo
    echo '```text'
    git show "$BRANCH:nextsessions/$file"
    echo '```'
    echo
  done
  echo "---"
  echo "Where things stand: \`docs/HANDOFF.md\`, newest section first."
} > "$OUT"

cp "$OUT" "$DESK"
echo "wrote $OUT"
echo "copied to $DESK"
