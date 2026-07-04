import type { MetadataRoute } from "next";
import { routes, siteConfig } from "@telepace/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
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
    routes.terms,
    routes.privacy,
    routes.login,
    routes.signup,
  ];

  return paths.map((path) => ({
    url: new URL(path, siteConfig.urls.home).toString(),
    lastModified: new Date(),
  }));
}
