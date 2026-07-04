import type { MetadataRoute } from "next";
import { routes, siteConfig } from "@telepace/config";

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

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return paths.map((path) => ({
    url: new URL(path, siteConfig.urls.home).toString(),
    lastModified,
  }));
}
