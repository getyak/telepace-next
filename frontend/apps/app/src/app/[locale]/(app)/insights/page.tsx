import { getTranslations } from "next-intl/server";
import { Button } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";

const themes = [
  {
    title: "$79 feels punitive without SSO",
    confidence: 0.82,
    quoteCount: 11,
    tag: "pricing",
    quotes: [
      "If SSO were included I wouldn't even blink at the price. Right now it feels like I'm paying to be inconvenienced.",
      "Every other tool at this price gives you Okta. It's table stakes.",
      "$79 with SSO = fine. $79 without = starting to look at competitors.",
    ],
  },
  {
    title: "Onboarding stops mid-flow after email confirmation",
    confidence: 0.74,
    quoteCount: 8,
    tag: "onboarding",
    quotes: [
      "I confirmed my email and… nothing. I forgot about it for two days.",
      "The email said 'you're in' but the app didn't seem to know that.",
    ],
  },
  {
    title: "The MCP hook is the reason for the upgrade",
    confidence: 0.91,
    quoteCount: 14,
    tag: "expansion",
    quotes: [
      "The MCP integration is what made me pull out the card. Everything else is table stakes.",
      "My Claude does research now. That's magic. Ten times worth $79.",
    ],
  },
];

const tagStyle: Record<string, string> = {
  pricing: "bg-terracotta/10 text-terracotta border-terracotta/20",
  onboarding: "bg-paper-sunken text-body border-hairline",
  expansion: "bg-accent-soft text-accent border-accent/30",
};

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

      <div className="grid gap-6">
        {themes.map((theme) => (
          <article key={theme.title} className="rounded-card border border-hairline bg-paper-elevated p-8">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${tagStyle[theme.tag]}`}>
                    {theme.tag}
                  </span>
                  <span className="text-xs text-muted">
                    {t("confidenceLabel", { value: theme.confidence.toFixed(2), count: theme.quoteCount })}
                  </span>
                </div>
                <h2 className="font-display text-3xl leading-tight">{theme.title}</h2>
              </div>
              <div>
                <Button variant="ghost" size="sm">{t("dismiss")}</Button>
              </div>
            </div>
            <div className="space-y-3 border-l-2 border-accent pl-6">
              {theme.quotes.map((q, i) => (
                <blockquote key={i} className="text-body italic leading-relaxed">
                  “{q}”
                </blockquote>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
