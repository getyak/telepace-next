import { Button, Badge, EmptyState, icons } from "@telepace/ui";
import { PageHeader } from "../../components/app/PageHeader";

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

const kindVariant: Record<string, "danger" | "accent" | "neutral"> = {
  escalation: "danger",
  insight: "accent",
  progress: "neutral",
  system: "neutral",
};

export default function InboxPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow="Inbox"
        title="Everything that needs a human."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm">Mark all read</Button>
            <Button variant="secondary" size="sm">Filter</Button>
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<icons.InboxIcon size={28} />}
          title="Inbox zero."
          description="Escalations, new insights, and progress updates will show up here as your studies run."
        />
      ) : (
        <div className="border border-hairline rounded-card divide-y divide-hairline bg-paper-elevated">
          {items.map((it) => (
            <article className="grid grid-cols-2 md:grid-cols-12 items-start gap-x-4 gap-y-2 px-6 py-5 hover:bg-paper transition-colors" key={it.id}>
              <div className="md:col-span-2">
                <Badge variant={kindVariant[it.kind] ?? "neutral"}>{it.kind}</Badge>
              </div>
              <div className="text-right text-sm text-muted md:col-span-2 md:order-3">{it.time}</div>
              <div className="col-span-2 md:col-span-8 md:order-2">
                <p className="text-xs text-muted mb-1">{it.study}</p>
                <p className={it.urgent ? "text-ink font-medium" : "text-body"}>{it.body}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
