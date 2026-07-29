import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/app/PageHeader";

import { InsightsBoard, type ThemeDef } from "./InsightsBoard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.insights" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

// Every quote carries interview # + role (DESIGN.md: no quote without a
// source) — the same shape real analyst output will land in.
const themes: ThemeDef[] = [
  {
    id: "pricing-sso",
    titleKey: "theme1Title",
    confidence: 0.82,
    quoteCount: 11,
    tagKey: "tagPricing",
    tagStyle: "bg-terracotta/10 text-terracotta border-terracotta/20",
    quotes: [
      { textKey: "theme1Quote1", interview: 4, roleKey: "roleEngLead" },
      { textKey: "theme1Quote2", interview: 9, roleKey: "roleItAdmin" },
      { textKey: "theme1Quote3", interview: 17, roleKey: "roleFounder" },
    ],
  },
  {
    id: "onboarding-stall",
    titleKey: "theme2Title",
    confidence: 0.74,
    quoteCount: 8,
    tagKey: "tagOnboarding",
    tagStyle: "bg-paper-sunken text-body border-hairline",
    quotes: [
      { textKey: "theme2Quote1", interview: 6, roleKey: "rolePm" },
      { textKey: "theme2Quote2", interview: 12, roleKey: "roleDesigner" },
    ],
  },
  {
    id: "mcp-upgrade",
    titleKey: "theme3Title",
    confidence: 0.91,
    quoteCount: 14,
    tagKey: "tagExpansion",
    tagStyle: "bg-accent-soft text-accent border-accent/30",
    quotes: [
      { textKey: "theme3Quote1", interview: 2, roleKey: "roleEngLead" },
      { textKey: "theme3Quote2", interview: 15, roleKey: "rolePmm" },
    ],
  },
];

export default async function InsightsPage() {
  const t = await getTranslations("app.insights");
  return (
    <div className="mx-auto max-w-content p-10">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <InsightsBoard themes={themes} />
    </div>
  );
}
