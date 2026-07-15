/**
 * Central SEO helpers: canonical + hreflang metadata and JSON-LD builders.
 *
 * Why this exists:
 *  - next-intl serves every marketing page under two locale prefixes
 *    (`/en/...`, `/zh/...`). Without a per-page canonical + hreflang map the
 *    two localized copies read as duplicate content and dilute each other in
 *    search. `buildPageMetadata` emits both, per page, from a single call.
 *  - Rich results (Organization, sitelinks search box, software listing, FAQ,
 *    breadcrumbs) need JSON-LD. The `*Schema` builders return plain objects a
 *    `<JsonLd>` server component serializes into a `<script>` tag.
 *
 * Keep this framework-thin: builders are pure, take already-translated strings,
 * and never touch the request — so they're trivially unit-testable and reusable
 * from both server components and route handlers.
 */
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@telepace/config";

import { routing } from "@/i18n/routing";

const BASE = siteConfig.urls.home;

/**
 * OpenGraph wants a `language_TERRITORY` locale, not the bare BCP-47 subtag we
 * route on. Map explicitly; fall back to the raw locale so a new language still
 * emits *something* valid rather than throwing.
 */
const OG_LOCALE: Record<string, string> = {
  en: "en_US",
  zh: "zh_CN",
};

export function ogLocale(locale: string): string {
  return OG_LOCALE[locale] ?? locale;
}

/** Absolute, locale-prefixed URL for a marketing path (`/` → bare locale root). */
export function absoluteUrl(locale: string, path: string): string {
  const suffix = path === "/" ? "" : path;
  return `${BASE}/${locale}${suffix}`;
}

/**
 * hreflang map for a path: one entry per locale plus `x-default` pointing at
 * the default-locale copy, which is what Google serves when no language matches.
 */
export function languageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = absoluteUrl(locale, path);
  }
  languages["x-default"] = absoluteUrl(routing.defaultLocale, path);
  return languages;
}

/**
 * Build a page's `Metadata` from its i18n namespace and public path.
 *
 * Emits: title/description, a self-referencing canonical, the full hreflang
 * map, and locale-aware OpenGraph/Twitter — everything a marketing page needs
 * for correct indexing without repeating the boilerplate in every file.
 */
export async function buildPageMetadata({
  locale,
  path,
  namespace,
}: {
  locale: string;
  path: string;
  namespace: string;
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  const title = t("title");
  const description = t("description");
  const canonical = absoluteUrl(locale, path);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: languageAlternates(path),
    },
    openGraph: {
      title,
      description,
      url: canonical,
      locale: ogLocale(locale),
      alternateLocale: routing.locales
        .filter((l) => l !== locale)
        .map(ogLocale),
    },
    twitter: {
      title,
      description,
    },
  };
}

/* ------------------------------------------------------------------ *
 * JSON-LD schema builders. Pure functions returning plain objects.
 * ------------------------------------------------------------------ */

type Schema = Record<string, unknown>;

/** The publisher. Referenced by other nodes via `@id` so search engines dedupe. */
export function organizationSchema(): Schema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BASE}/#organization`,
    name: siteConfig.brand.name,
    url: BASE,
    logo: `${BASE}/icon.svg`,
    description: siteConfig.brand.tagline,
    sameAs: [siteConfig.urls.githubOrg],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: siteConfig.contact.supportEmail,
    },
  };
}

/** The site itself — enables the sitelinks name/box treatment. */
export function webSiteSchema(): Schema {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BASE}/#website`,
    name: siteConfig.brand.name,
    url: BASE,
    description: siteConfig.brand.tagline,
    publisher: { "@id": `${BASE}/#organization` },
    inLanguage: routing.locales,
  };
}

/**
 * The product as a listable SaaS application. `AggregateOffer` advertises a
 * free entry tier (price 0) which is what unlocks the "Free" rich-result badge.
 */
export function softwareApplicationSchema({
  name,
  description,
}: {
  name: string;
  description: string;
}): Schema {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    url: BASE,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    publisher: { "@id": `${BASE}/#organization` },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "0",
      offerCount: 4,
    },
  };
}

/** FAQ rich result. Feed it the same question/answer pairs the page renders. */
export function faqPageSchema(
  items: ReadonlyArray<{ question: string; answer: string }>,
): Schema {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

/**
 * Breadcrumb trail. Pass display-name → absolute-URL pairs in visit order;
 * `position` is 1-indexed per the spec.
 */
export function breadcrumbListSchema(
  crumbs: ReadonlyArray<{ name: string; url: string }>,
): Schema {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(({ name, url }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: url,
    })),
  };
}
