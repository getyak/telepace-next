#!/usr/bin/env node
/**
 * Guards the design-token system against drift in apps/**.
 *
 * Three families of leak are caught, each pointing back at a token the UI
 * already ships (packages/ui/src/tokens.ts + the tailwind preset):
 *
 *   1. Tailwind default *palette* colours  — `text-red-600`, `bg-slate-500`.
 *   2. Brand *hex* in className arbitraries — `bg-[#4A5D3B]`, `text-[#B45A3C]`.
 *      (Bare hex in comments / inline-style objects / SVG / OG-image constants
 *       is NOT matched — only the `utility-[#hex]` className form, which is the
 *       shape that actually re-implements a token by hand.)
 *   3. Tailwind default *shadow / transition* utilities that bypass the motion
 *      + elevation tokens — `shadow-2xl`, `transition-all`. The product ships a
 *      deliberately small set (shadow-hover / shadow-overlay / shadow-hairline,
 *      transition-colors / transition-[transform,box-shadow]); `-all` and the
 *      default shadow scale are how "quiet luxury" quietly turns into noise.
 *
 * Run via `pnpm check:colors`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../apps", import.meta.url).pathname;
const EXTENSIONS = new Set([".ts", ".tsx"]);

const PALETTE =
  /\b(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:red|blue|green|yellow|purple|pink|indigo|gray|grey|orange|teal|cyan|lime|emerald|sky|violet|fuchsia|rose|amber|slate|zinc|neutral|stone)-\d{2,3}\b/;

// A colour utility carrying a raw hex arbitrary value, e.g. `bg-[#4A5D3B]`,
// `text-[#B45A3C]/80`, `accent-[#4A5D3B]`. Only the className shape — a bare
// `#F8F6F1` in a comment or a `const INK = "#141414"` never matches.
const BRAND_HEX =
  /\b(?:text|bg|border|border-[trblxy]|ring|fill|stroke|accent|caret|decoration|from|via|to)-\[#[0-9A-Fa-f]{3,8}\](?:\/\d+)?/;

// Default elevation / motion utilities that step outside the shipped tokens.
const DEFAULT_UTILITY = /\b(?:transition-all|shadow-(?:sm|md|lg|xl|2xl|inner))\b/;

/**
 * Files allowed to use raw hex arbitraries because they render a surface that
 * intentionally sits *outside* the warm-paper palette (a dark code terminal).
 * Kept explicit and tiny so the exception can't quietly grow.
 */
const HEX_ALLOWLIST = [join("integrations", "CodeBlock.tsx")];

/** @type {string[]} */
const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTENSIONS.has(full.slice(full.lastIndexOf(".")))) continue;
    const hexAllowed = HEX_ALLOWLIST.some((suffix) => full.endsWith(suffix));
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      const at = `${full}:${i + 1}: ${line.trim()}`;
      if (PALETTE.test(line)) offenders.push(at);
      else if (DEFAULT_UTILITY.test(line)) offenders.push(at);
      else if (!hexAllowed && BRAND_HEX.test(line)) offenders.push(at);
    });
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error("Found design-token drift outside packages/ui/src/tokens.ts:\n");
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    "\nReach for a token instead — e.g. text-danger / bg-accent-soft / border-l-terracotta" +
      " for colour, shadow-hover / shadow-overlay for elevation, and a scoped" +
      " transition-colors / transition-[transform,box-shadow] instead of transition-all.",
  );
  process.exit(1);
}

console.log("check-color-tokens: no design-token drift found.");
