import type { MetadataRoute } from "next";
import { siteConfig } from "@telepace/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private surfaces: app pages, auth flows, BFF, respondent interviews.
        disallow: [
          "/api/",
          "/studies",
          "/inbox",
          "/audience",
          "/insights",
          "/integrations",
          "/settings",
          "/login",
          "/signup",
          "/r/",
        ],
      },
    ],
    sitemap: `${siteConfig.urls.home}/sitemap.xml`,
  };
}
