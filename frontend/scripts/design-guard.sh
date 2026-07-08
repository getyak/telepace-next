#!/usr/bin/env bash
# Design-token guard: fail CI if raw Tailwind palette classes sneak into the
# frontend. Every color must go through the tokens defined in
# packages/ui/src/tokens.ts (see docs/design-system.md).
set -euo pipefail

cd "$(dirname "$0")/.."

# Tailwind default palette families we ban in class position, e.g.
# text-red-600, bg-blue-500, border-green-200, ring-slate-300 …
PALETTE="red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone"
PATTERN="(text|bg|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|caret|accent)-(${PALETTE})-[0-9]{2,3}"

matches=$(grep -rnE --include='*.tsx' --include='*.ts' --include='*.css' \
  -e "$PATTERN" apps packages 2>/dev/null | grep -v node_modules || true)

if [[ -n "$matches" ]]; then
  echo "✗ Raw Tailwind palette classes found — use design tokens instead:"
  echo "$matches"
  exit 1
fi

echo "✓ design-guard: no raw Tailwind palette classes."
