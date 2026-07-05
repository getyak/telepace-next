import { getTranslations } from "next-intl/server";
import { Badge, Button } from "@telepace/ui";

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

const statusVariant: Record<string, "accent" | "neutral"> = {
  connected: "accent",
  disconnected: "neutral",
  "1 active": "neutral",
};

export default async function IntegrationsPage() {
  const t = await getTranslations("app.integrations");
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={<Button size="sm">{t("addIntegration")}</Button>}
      />

      <div className="grid md:grid-cols-2 gap-4">
        {integrations.map((it) => (
          <div key={it.name} className="rounded-card border border-hairline bg-paper-elevated p-6 flex items-start justify-between gap-6">
            <div>
              <p className="overline mb-1">{it.category}</p>
              <p className="font-display text-2xl mb-2">{it.name}</p>
              <p className="text-sm text-body">{it.detail}</p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <Badge variant={statusVariant[it.status] ?? "neutral"}>{it.status}</Badge>
              <Button variant={it.status === "disconnected" ? "primary" : "secondary"} size="sm">
                {it.status === "disconnected" ? t("connect") : t("configure")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
