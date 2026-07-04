import { Button, EmptyState, icons } from "@telepace/ui";
import { PageHeader } from "@/components/app/PageHeader";

const integrations = [
  { name: "Notion",   category: "Insight destination", status: "connected",   detail: "Sync into 'Research' database" },
  { name: "Linear",   category: "Issue tracker",       status: "connected",   detail: "One issue per theme" },
  { name: "Slack",    category: "Notifications",       status: "connected",   detail: "#user-research channel" },
  { name: "Webhooks", category: "Custom",              status: "1 active",    detail: "https://ops.acme.com/hooks/telepace" },
  { name: "Anthropic",category: "LLM key (BYO)",       status: "connected",   detail: "Bearer • sk-***-9c1" },
  { name: "OpenAI",   category: "LLM key (BYO)",       status: "disconnected",detail: "Add a key to enable" },
  { name: "Vapi",     category: "Voice / phone",       status: "connected",   detail: "Outbound number: +1 415 555 0134" },
  { name: "Resend",   category: "Email delivery",      status: "connected",   detail: "Domain: mail.telepace.io" },
];

const statusStyle: Record<string, string> = {
  connected: "bg-accent-soft text-accent border-accent/30",
  disconnected: "bg-paper text-muted border-hairline",
  "1 active": "bg-paper-sunken text-body border-hairline",
};

export default function IntegrationsPage() {
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow="Integrations"
        title="Where telepace connects."
        action={<Button size="sm">+ Add integration</Button>}
      />

      {integrations.length === 0 ? (
        <EmptyState
          icon={<icons.IntegrationsIcon size={28} />}
          title="No integrations yet."
          description="Connect Notion, Linear, Slack, or a webhook to send insights where your team already works."
          action={<Button size="sm">+ Add integration</Button>}
        />
      ) : (
      <div className="grid md:grid-cols-2 gap-4">
        {integrations.map((it) => (
          <div key={it.name} className="rounded-card border border-hairline bg-paper-elevated p-6 flex items-start justify-between gap-6">
            <div>
              <p className="overline mb-1">{it.category}</p>
              <p className="font-display text-2xl mb-2">{it.name}</p>
              <p className="text-sm text-body">{it.detail}</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <span className={`inline-block px-2.5 py-0.5 rounded-pill border text-xs ${statusStyle[it.status]}`}>
                {it.status}
              </span>
              <Button variant={it.status === "disconnected" ? "primary" : "secondary"} size="sm">
                {it.status === "disconnected" ? "Connect" : "Configure"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
