import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button, Card, EmptyState, icons } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";

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

type ThemeDef = {
  titleKey: string;
  confidence: number;
  quoteCount: number;
  tagKey: string;
  tagStyle: string;
  quoteKeys: string[];
};

const themes: ThemeDef[] = [
  {
    titleKey: "theme1Title",
    confidence: 0.82,
    quoteCount: 11,
    tagKey: "tagPricing",
    tagStyle: "bg-terracotta/10 text-terracotta border-terracotta/20",
    quoteKeys: ["theme1Quote1", "theme1Quote2", "theme1Quote3"],
  },
  {
    titleKey: "theme2Title",
    confidence: 0.74,
    quoteCount: 8,
    tagKey: "tagOnboarding",
    tagStyle: "bg-paper-sunken text-body border-hairline",
    quoteKeys: ["theme2Quote1", "theme2Quote2"],
  },
  {
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
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            <Button variant="secondary" size="sm">{t("filter")}</Button>
            <Button size="sm">{t("pushToNotion")}</Button>
          </>
        }
      />

      {themes.length === 0 ? (
        <EmptyState
          icon={<icons.InsightsIcon size={28} />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : (
      <div className="grid gap-6">
        {themes.map((theme) => (
          <Card key={theme.titleKey} className="p-8">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${theme.tagStyle}`}>
                    {t(theme.tagKey)}
                  </span>
                  <span className="text-xs text-muted">
                    {t("confidenceLabel", { value: theme.confidence.toFixed(2), count: theme.quoteCount })}
                  </span>
                </div>
                <h2 className="font-display text-3xl leading-tight">{t(theme.titleKey)}</h2>
              </div>
              <div>
                <Button variant="ghost" size="sm">{t("dismiss")}</Button>
              </div>
            </div>
            <div className="space-y-3 border-l-2 border-accent pl-6">
              {theme.quoteKeys.map((qk, i) => (
                <blockquote key={i} className="text-body italic leading-relaxed">
                  {`“${t(qk)}”`}
                </blockquote>
              ))}
            </div>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
