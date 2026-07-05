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

function localizedUrl(locale: string, path: string): string {
  const suffix = path === "/" ? "" : path;
  return `${siteConfig.urls.home}/${locale}${suffix}`;
}

function changeFrequencyFor(path: string): "weekly" | "monthly" {
  return path === routes.changelog ? "weekly" : "monthly";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return MARKETING_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(locale, path),
      lastModified,
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
