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

const themes: ThemeDef[] = [
  {
    id: "pricing-sso",
    titleKey: "theme1Title",
    confidence: 0.82,
    quoteCount: 11,
    tagKey: "tagPricing",
    tagStyle: "bg-terracotta/10 text-terracotta border-terracotta/20",
    quoteKeys: ["theme1Quote1", "theme1Quote2", "theme1Quote3"],
  },
  {
    id: "onboarding-stall",
    titleKey: "theme2Title",
    confidence: 0.74,
    quoteCount: 8,
    tagKey: "tagOnboarding",
    tagStyle: "bg-paper-sunken text-body border-hairline",
    quoteKeys: ["theme2Quote1", "theme2Quote2"],
  },
  {
    id: "mcp-upgrade",
    titleKey: "theme3Title",
    confidence: 0.91,
    quoteCount: 14,
    tagKey: "tagExpansion",
    tagStyle: "bg-accent-soft text-accent border-accent/30",
    quoteKeys: ["theme3Quote1", "theme3Quote2"],
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
