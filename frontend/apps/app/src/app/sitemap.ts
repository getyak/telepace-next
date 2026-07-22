import { execFileSync } from "node:child_process";
import path from "node:path";

import type { MetadataRoute } from "next";
import { routes, siteConfig } from "@telepace/config";

import { routing } from "@/i18n/routing";

/** Public marketing surface only — app/auth/respondent URLs stay out. */
const MARKETING_PATHS: string[] = [
  routes.home,
  routes.product.voice,
  routes.product.agent,
  routes.pricing,
  routes.docs,
  routes.mcp,
  routes.security,
  routes.demo,
  routes.customers,
  routes.changelog,
  routes.careers,
  routes.privacy,
  routes.terms,
];

/** The page file whose last commit date stands in for "content last modified". */
const PATH_SOURCE_FILE: Record<string, string> = {
  [routes.home]: "page.tsx",
  [routes.product.voice]: "product/voice/page.tsx",
  [routes.product.agent]: "product/agent/page.tsx",
  [routes.pricing]: "pricing/page.tsx",
  [routes.docs]: "docs/page.tsx",
  [routes.mcp]: "mcp/page.tsx",
  [routes.security]: "security/page.tsx",
  [routes.demo]: "demo/page.tsx",
  [routes.customers]: "customers/page.tsx",
  [routes.changelog]: "changelog/page.tsx",
  [routes.careers]: "careers/page.tsx",
  [routes.privacy]: "privacy/page.tsx",
  [routes.terms]: "terms/page.tsx",
};

const MARKETING_DIR = path.join(process.cwd(), "src/app/[locale]/(marketing)");

// Used when git history isn't available (e.g. a shallow/archive checkout) so
// the sitemap still builds instead of throwing.
const FALLBACK_LAST_MODIFIED = new Date("2026-01-01T00:00:00Z");

/** Last commit timestamp for a marketing page's source file, memoized per path. */
function lastModifiedFor(routePath: string): Date {
  const file = PATH_SOURCE_FILE[routePath];
  if (!file) return FALLBACK_LAST_MODIFIED;
  try {
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", path.join(MARKETING_DIR, file)],
      { encoding: "utf8" },
    ).trim();
    return iso ? new Date(iso) : FALLBACK_LAST_MODIFIED;
  } catch {
    return FALLBACK_LAST_MODIFIED;
  }
}

function localizedUrl(locale: string, path: string): string {
  const suffix = path === "/" ? "" : path;
  return `${siteConfig.urls.home}/${locale}${suffix}`;
}

function changeFrequencyFor(path: string): "weekly" | "monthly" {
  return path === routes.changelog ? "weekly" : "monthly";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModifiedByPath = new Map(
    MARKETING_PATHS.map((p) => [p, lastModifiedFor(p)]),
  );
  return MARKETING_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, path),
      lastModified: lastModifiedByPath.get(path) ?? FALLBACK_LAST_MODIFIED,
      changeFrequency: changeFrequencyFor(path),
      priority: path === "/" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, localizedUrl(l, path)]),
        ),
      },
    })),
  );
}
