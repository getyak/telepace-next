#!/usr/bin/env node
/**
 * Guards against Tailwind's default color palette leaking into apps/**.
 *
 * All UI must go through the design tokens in packages/ui/src/tokens.ts
 * (paper/ink/accent/terracotta/success/warning/danger, etc.) — never
 * `text-red-600`, `bg-blue-500`, and friends. Run via `pnpm check:colors`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../apps", import.meta.url).pathname;
const EXTENSIONS = new Set([".ts", ".tsx"]);
const FORBIDDEN = /\b(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:red|blue|green|yellow|purple|pink|indigo|gray|grey|orange|teal|cyan|lime|emerald|sky|violet|fuchsia|rose|amber|slate|zinc|neutral|stone)-\d{2,3}\b/;

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
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (FORBIDDEN.test(line)) {
        offenders.push(`${full}:${i + 1}: ${line.trim()}`);
      }
    });
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error("Found hardcoded Tailwind palette colors outside the design token system:\n");
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    "\nUse a token from packages/ui/src/tokens.ts instead (e.g. text-danger, bg-accent-soft).",
  );
  process.exit(1);
}

console.log("check-color-tokens: no hardcoded Tailwind palette colors found.");
