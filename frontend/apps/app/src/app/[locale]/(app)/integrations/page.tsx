import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Button, Card, EmptyState, icons } from "@telepace/ui";
import { routes } from "@telepace/config";

import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/app/PageHeader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.integrations" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

type IntegrationDef = {
  name: string;
  categoryKey: string;
  statusKey: string;
  detailKey: string;
};

const integrations: IntegrationDef[] = [
  { name: "Notion",    categoryKey: "catInsightDest",   statusKey: "statusConnected",    detailKey: "detailNotion" },
  { name: "Linear",    categoryKey: "catIssueTracker",  statusKey: "statusConnected",    detailKey: "detailLinear" },
  { name: "Slack",     categoryKey: "catNotifications", statusKey: "statusConnected",    detailKey: "detailSlack" },
  { name: "Webhooks",  categoryKey: "catCustom",        statusKey: "status1Active",      detailKey: "detailWebhooks" },
  { name: "Anthropic", categoryKey: "catLlmKey",        statusKey: "statusConnected",    detailKey: "detailAnthropic" },
  { name: "OpenAI",    categoryKey: "catLlmKey",        statusKey: "statusDisconnected", detailKey: "detailOpenAI" },
  { name: "Vapi",      categoryKey: "catVoicePhone",    statusKey: "statusConnected",    detailKey: "detailVapi" },
  { name: "Resend",    categoryKey: "catEmailDelivery", statusKey: "statusConnected",    detailKey: "detailResend" },
];

const disconnectedStatuses = new Set(["statusDisconnected"]);

export default async function IntegrationsPage() {
  const t = await getTranslations("app.integrations");
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={<Button size="sm">{t("addIntegration")}</Button>}
      />

      {/* MCP is the only surface here that is our own protocol rather than a
          third-party vendor, so it leads instead of sitting in the vendor grid. */}
      <Card className="mb-8 p-6 flex items-start justify-between gap-6">
        <div>
          <p className="overline mb-1">{t("catAgentProtocol")}</p>
          <p className="font-display text-2xl mb-2">{t("mcpName")}</p>
          <p className="text-sm text-body">{t("mcpDetail")}</p>
        </div>
        <Link href={routes.app.integrationsMcp}>
          <Button variant="secondary" size="sm">{t("viewDocs")}</Button>
        </Link>
      </Card>

      {integrations.length === 0 ? (
        <EmptyState
          icon={<icons.IntegrationsIcon size={28} />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={<Button size="sm">{t("addIntegration")}</Button>}
        />
      ) : (
      <div className="grid md:grid-cols-2 gap-4">
        {integrations.map((it) => {
          const isDisconnected = disconnectedStatuses.has(it.statusKey);
          return (
            <Card key={it.name} className="p-6 flex items-start justify-between gap-6">
              <div>
                <p className="overline mb-1">{t(it.categoryKey)}</p>
                <p className="font-display text-2xl mb-2">{it.name}</p>
                <p className="text-sm text-body">{t(it.detailKey)}</p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <Badge variant={isDisconnected ? "neutral" : "accent"}>{t(it.statusKey)}</Badge>
                <Button variant={isDisconnected ? "primary" : "secondary"} size="sm">
                  {isDisconnected ? t("connect") : t("configure")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
