import { getTranslations } from "next-intl/server";
import { Badge, Button } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";

const items = [
  {
    id: "e1",
    kind: "escalation",
    study: "Pricing sensitivity for pro tier",
    body: "Interview 048 flagged distress signals — auto-closed. Review the transcript before dismissing.",
    time: "12m ago",
    urgent: true,
  },
  {
    id: "e2",
    kind: "insight",
    study: "Pricing sensitivity for pro tier",
    body: "New theme surfaced: '$79 feels punitive without SSO' (confidence 0.82, 11 supporting quotes).",
    time: "1h ago",
  },
  {
    id: "e3",
    kind: "progress",
    study: "New onboarding walkthrough — first reactions",
    body: "Reached 24 / 24 completions. Study auto-closes tomorrow unless you extend it.",
    time: "3h ago",
  },
  {
    id: "e4",
    kind: "system",
    study: "Workspace",
    body: "Weekly digest is ready — 3 studies progressed and 2 new themes surfaced.",
    time: "yesterday",
  },
];

const kindVariant: Record<string, "danger" | "accent" | "neutral"> = {
  escalation: "danger",
  insight: "accent",
  progress: "neutral",
  system: "neutral",
};

export default async function InboxPage() {
  const t = await getTranslations("app.inbox");
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            <Button variant="ghost" size="sm">{t("markAllRead")}</Button>
            <Button variant="secondary" size="sm">{t("filter")}</Button>
          </>
        }
      />

      <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
        {items.map((it) => (
          <article key={it.id} className="grid grid-cols-12 items-start gap-4 px-6 py-5 hover:bg-paper transition-colors">
            <div className="col-span-2">
              <Badge variant={kindVariant[it.kind] ?? "neutral"}>{it.kind}</Badge>
            </div>
            <div className="col-span-8">
              <p className="text-xs text-muted mb-1">{it.study}</p>
              <p className={it.urgent ? "text-ink font-medium" : "text-body"}>{it.body}</p>
            </div>
            <div className="col-span-2 text-right text-sm text-muted">{it.time}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
