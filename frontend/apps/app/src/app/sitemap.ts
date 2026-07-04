import type { MetadataRoute } from "next";
import { routes, siteConfig } from "@telepace/config";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return MARKETING_PATHS.map((path) => ({
    url: `${siteConfig.urls.home}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: path === routes.changelog ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
