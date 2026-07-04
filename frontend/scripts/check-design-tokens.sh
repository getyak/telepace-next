#!/usr/bin/env bash
# Fails if apps/** reference raw Tailwind palette classes instead of the
# telepace design tokens (see docs/design-system.md). Token-backed
# equivalents: text-danger/bg-danger, text-accent/bg-accent-soft,
# text-success/bg-success, text-warning/bg-warning, text-ink/bg-paper*.
set -euo pipefail

cd "$(dirname "$0")/.."

pattern='text-red-[0-9]+|bg-red-[0-9]+|text-blue-[0-9]+|bg-blue-[0-9]+|text-green-[0-9]+|bg-green-[0-9]+|text-yellow-[0-9]+|bg-yellow-[0-9]+|text-gray-[0-9]+|bg-gray-[0-9]+|text-slate-[0-9]+|bg-slate-[0-9]+|text-purple-[0-9]+|bg-purple-[0-9]+|text-indigo-[0-9]+|bg-indigo-[0-9]+'

matches=$(grep -rnE "$pattern" apps --include="*.tsx" --include="*.ts" || true)

if [ -n "$matches" ]; then
  echo "Found raw Tailwind palette classes outside the design token system:"
  echo "$matches"
  echo
  echo "Use the tokens from packages/ui/src/tokens.ts instead (e.g. text-danger, bg-accent-soft)."
  exit 1
fi

echo "No raw Tailwind palette classes found in apps/."
