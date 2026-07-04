import { Button, EmptyState, icons } from "@telepace/ui";
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

export default function InsightsPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow="Insights"
        title="Themes, across every study."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm">Filter</Button>
            <Button size="sm">Push to Notion</Button>
          </div>
        }
      />

      {themes.length === 0 ? (
        <EmptyState
          icon={<icons.InsightsIcon size={28} />}
          title="No insights yet."
          description="Themes surface here once your studies start collecting responses."
        />
      ) : (
      <div className="grid gap-6">
        {themes.map((t) => (
          <article key={t.title} className="rounded-card border border-hairline bg-paper-elevated p-8">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${tagStyle[t.tag]}`}>
                    {t.tag}
                  </span>
                  <span className="text-xs text-muted">confidence {t.confidence.toFixed(2)} · {t.quoteCount} supporting quotes</span>
                </div>
                <h2 className="font-display text-3xl leading-tight">{t.title}</h2>
              </div>
              <div>
                <Button variant="ghost" size="sm">Dismiss</Button>
              </div>
            </div>
            <div className="space-y-3 border-l-2 border-accent pl-6">
              {t.quotes.map((q, i) => (
                <blockquote key={i} className="text-body italic leading-relaxed">
                  “{q}”
                </blockquote>
              ))}
            </div>
          </article>
        ))}
      </div>
      )}
    </div>
  );
}
