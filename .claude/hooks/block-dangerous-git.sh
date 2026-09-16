#!/bin/bash
# Blocks genuinely destructive git commands before Claude Code executes them.
#
# Plain `git push` is deliberately NOT blocked -- pushing a new branch to
# open a PR is routine, expected work here. Only push variants that force
# history (--force / --force-with-lease) are blocked, alongside other
# operations that discard local work or delete branches outright.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

DANGEROUS_PATTERNS=(
  "git push.*--force"
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
