#!/bin/bash
# Cursor afterFileEdit hook: re-typecheck the affected workspace package
# so the agent self-corrects type errors before moving on.
#
# Fails open (exit 0 with empty additional_context) if anything goes wrong —
# we never want a flaky typecheck to block the user.

set -u

input=$(cat)

# Extract the edited file path from the hook input JSON.
file_path=$(printf '%s' "$input" | sed -n 's/.*"file_path":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)

# Only run for TS/TSX/JS/JSX files inside our workspace packages.
case "$file_path" in
  *.ts|*.tsx|*.mts|*.cts)
    ;;
  *)
    echo '{}'
    exit 0
    ;;
esac

# Don't run on the hook script itself or on type definitions in node_modules.
case "$file_path" in
  */node_modules/*|*.cursor/hooks/*)
    echo '{}'
    exit 0
    ;;
esac

# Pick the package to typecheck based on the file path.
target=""
if [[ "$file_path" == *"packages/engine/"* ]]; then
  target="packages/engine"
elif [[ "$file_path" == *"apps/mobile/"* ]]; then
  target="apps/mobile"
fi

if [[ -z "$target" ]] || [[ ! -d "$target" ]]; then
  echo '{}'
  exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
  echo '{}'
  exit 0
fi

# Run tsc in noEmit mode for that package. Cap output to keep context small.
# IMPORTANT: capture tsc's exit status, not head's (PIPESTATUS bash-ism).
raw=$(cd "$target" && bunx tsc --noEmit 2>&1; echo "__TSC_EXIT__$?")
status=$(printf '%s' "$raw" | sed -n 's/.*__TSC_EXIT__\([0-9]*\).*/\1/p' | tail -n1)
output=$(printf '%s' "$raw" | sed 's/__TSC_EXIT__[0-9]*$//' | head -n 80)

if [[ "$status" == "0" ]]; then
  echo '{}'
  exit 0
fi

# Escape the output for JSON.
escaped=$(printf '%s' "$output" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null)
if [[ -z "$escaped" ]]; then
  echo '{}'
  exit 0
fi

printf '{"additional_context": "Typecheck failed in %s after the edit. Fix these before proceeding:\\n\\n%s"}\n' \
  "$target" \
  "${escaped:1:${#escaped}-2}"

exit 0
