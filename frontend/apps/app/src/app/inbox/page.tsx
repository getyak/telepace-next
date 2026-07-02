import { Button } from "@telepace/ui";

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
    body: "SOC 2 auditor requested access logs for Q2. Nothing action needed — audit trail is ready.",
    time: "yesterday",
  },
];

const kindStyle: Record<string, string> = {
  escalation: "bg-terracotta/10 text-terracotta border-terracotta/20",
  insight: "bg-accent-soft text-accent border-accent/30",
  progress: "bg-paper-sunken text-body border-hairline",
  system: "bg-paper text-muted border-hairline",
};

export default function InboxPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <header className="flex items-end justify-between mb-10">
        <div>
          <p className="overline mb-2">Inbox</p>
          <h1 className="font-display text-4xl">Everything that needs a human.</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">Mark all read</Button>
          <Button variant="secondary" size="sm">Filter</Button>
        </div>
      </header>

      <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
        {items.map((it) => (
          <article key={it.id} className="grid grid-cols-12 items-start gap-4 px-6 py-5 hover:bg-paper transition-colors">
            <div className="col-span-2">
              <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${kindStyle[it.kind]}`}>
                {it.kind}
              </span>
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
