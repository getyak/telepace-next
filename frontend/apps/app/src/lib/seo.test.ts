import { describe, it, expect } from "vitest";

import {
  absoluteUrl,
  breadcrumbListSchema,
  faqPageSchema,
  languageAlternates,
  noindexMetadata,
  ogLocale,
  organizationSchema,
  softwareApplicationSchema,
  webSiteSchema,
} from "./seo";

describe("absoluteUrl", () => {
  it("collapses the home path so the locale root has no trailing slash", () => {
    expect(absoluteUrl("en", "/")).toBe("https://telepace.io/en");
  });

  it("appends non-home paths under the locale prefix", () => {
    expect(absoluteUrl("zh", "/pricing")).toBe("https://telepace.io/zh/pricing");
  });
});

describe("languageAlternates", () => {
  it("emits one entry per locale plus an x-default", () => {
    const map = languageAlternates("/pricing");
    expect(map.en).toBe("https://telepace.io/en/pricing");
    expect(map.zh).toBe("https://telepace.io/zh/pricing");
    // x-default points at the default locale copy.
    expect(map["x-default"]).toBe("https://telepace.io/en/pricing");
  });

  it("handles the home path without a trailing slash", () => {
    expect(languageAlternates("/")["x-default"]).toBe("https://telepace.io/en");
  });
});

describe("ogLocale", () => {
  it("maps known locales to language_TERRITORY", () => {
    expect(ogLocale("en")).toBe("en_US");
    expect(ogLocale("zh")).toBe("zh_CN");
  });

  it("falls back to the raw locale when unmapped", () => {
    expect(ogLocale("fr")).toBe("fr");
  });
});

describe("organizationSchema / webSiteSchema", () => {
  it("cross-reference by stable @id so crawlers dedupe the publisher", () => {
    const org = organizationSchema();
    const site = webSiteSchema();
    expect(org["@type"]).toBe("Organization");
    expect(site["@type"]).toBe("WebSite");
    expect(site.publisher).toEqual({ "@id": org["@id"] });
  });
});

describe("softwareApplicationSchema", () => {
  it("advertises a free entry tier via AggregateOffer", () => {
    const schema = softwareApplicationSchema({ name: "telepace", description: "desc" });
    expect(schema["@type"]).toBe("SoftwareApplication");
    expect(schema.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: "0" });
  });
});

describe("faqPageSchema", () => {
  it("wraps each pair as a Question with an acceptedAnswer", () => {
    const schema = faqPageSchema([{ question: "Q1?", answer: "A1." }]);
    const entities = schema.mainEntity as Array<Record<string, unknown>>;
    expect(schema["@type"]).toBe("FAQPage");
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      "@type": "Question",
      name: "Q1?",
      acceptedAnswer: { "@type": "Answer", text: "A1." },
    });
  });
});

describe("noindexMetadata", () => {
  it("marks the page index:false, follow:false", () => {
    expect(noindexMetadata()).toEqual({ robots: { index: false, follow: false } });
  });
});

describe("breadcrumbListSchema", () => {
  it("numbers crumbs 1-indexed in visit order", () => {
    const schema = breadcrumbListSchema([
      { name: "Home", url: "https://telepace.io/en" },
      { name: "Voice", url: "https://telepace.io/en/product/voice" },
    ]);
    const items = schema.itemListElement as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({ position: 1, name: "Home" });
    expect(items[1]).toMatchObject({ position: 2, item: "https://telepace.io/en/product/voice" });
  });
});
