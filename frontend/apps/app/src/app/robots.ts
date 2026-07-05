import type { MetadataRoute } from "next";
import { siteConfig } from "@telepace/config";

import { routing } from "@/i18n/routing";

// Private surfaces: app pages, auth flows, respondent interviews. Every
// locale prefix needs its own disallow entry since next-intl always emits
// a locale segment (localePrefix: "always").
const PRIVATE_SUFFIXES = [
  "/studies",
  "/inbox",
  "/audience",
  "/insights",
  "/integrations",
  "/settings",
  "/login",
  "/signup",
  "/r/",
];

export default function robots(): MetadataRoute.Robots {
  const disallow = [
    "/api/",
    ...routing.locales.flatMap((locale) =>
      PRIVATE_SUFFIXES.map((suffix) => `/${locale}${suffix}`),
    ),
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${siteConfig.urls.home}/sitemap.xml`,
  };
}
