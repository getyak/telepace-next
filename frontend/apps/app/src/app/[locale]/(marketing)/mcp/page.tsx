import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button, Card } from "@telepace/ui";
import { routes } from "@telepace/config";
import { PageHeader } from "@/components/marketing/site-chrome";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.mcp" });
  return { title: t("title"), description: t("description") };
}

const toolIds = [
  "createCampaign",
  "getCampaignProgress",
  "getCampaignInsights",
  "askFollowup",
  "pushInsights",
] as const;

type ToolId = (typeof toolIds)[number];

const toolMeta: Record<ToolId, { name: string; input: string; output: string }> = {
  createCampaign: {
    name: "create_campaign",
    input: "{ title, goal, background?, target_completions?, channels? }",
    output: "{ campaign_id, outline, share_url, next_actions }",
  },
  getCampaignProgress: {
    name: "get_campaign_progress",
    input: "{ campaign_id }",
    output: "{ status, completions, coverage, spend_usd, next_actions }",
  },
  getCampaignInsights: {
    name: "get_campaign_insights",
    input: "{ campaign_id, min_confidence? }",
    output: "{ themes[], verbatims[], next_actions }",
  },
  askFollowup: {
    name: "ask_followup",
    input: "{ campaign_id, question }",
    output: "{ answer, supporting_quotes, next_actions }",
  },
  pushInsights: {
    name: "push_insights",
    input: "{ campaign_id, destination, config }",
    output: "{ status, external_ref, next_actions }",
  },
};

const surfaceIds = ["claudeDesktop", "claudeCode", "cursor", "codexCli", "custom"] as const;

type SurfaceId = (typeof surfaceIds)[number];

const surfaceMeta: Record<SurfaceId, { href: string }> = {
  claudeDesktop: { href: "/docs#claude-desktop" },
  claudeCode: { href: "/docs#claude-code" },
  cursor: { href: "/docs#cursor" },
  codexCli: { href: "/docs#codex" },
  custom: { href: "/docs#custom" },
};

export default async function McpPage() {
  const t = await getTranslations("marketing.mcp");

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={t.rich("hero.title", {
          italic: (chunks) => <span className="italic text-accent">{chunks}</span>,
        })}
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content grid gap-4 md:grid-cols-5">
          {surfaceIds.map((id) => (
            <Link
              key={id}
              href={surfaceMeta[id].href}
              className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <Card interactive className="h-full p-5">
                <p className="font-display text-lg">{t(`surfaces.${id}.name`)}</p>
                <p className="text-xs text-muted mt-1 font-mono">{t(`surfaces.${id}.note`)}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-paper-elevated section-padding">
        <div className="container-content">
          <p className="overline mb-4">{t("tools.eyebrow")}</p>
          <h2 className="font-display text-4xl mb-10 max-w-2xl">
            {t.rich("tools.title", {
              italic: (chunks) => <span className="italic">{chunks}</span>,
            })}
          </h2>
          <div className="grid gap-4">
            {toolIds.map((id) => (
              <div key={id} className="rounded-card border border-hairline bg-paper p-6">
                <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-3">
                  <code className="font-mono text-lg text-ink">{toolMeta[id].name}</code>
                  <span className="text-xs text-muted">{t("tools.badge")}</span>
                </div>
                <p className="text-body mb-4">{t(`tools.items.${id}`)}</p>
                <div className="grid md:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-2 text-muted">{t("tools.input")}</p>
                    <code className="text-body whitespace-pre-wrap">{toolMeta[id].input}</code>
                  </div>
                  <div className="rounded-btn bg-paper-sunken p-3">
                    <p className="overline mb-2 text-muted">{t("tools.output")}</p>
                    <code className="text-body whitespace-pre-wrap">{toolMeta[id].output}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-2 gap-10">
          <div>
            <p className="overline mb-3">{t("tryIt.eyebrow")}</p>
            <h2 className="font-display text-3xl mb-4">{t("tryIt.title")}</h2>
            <p className="text-body mb-6">{t("tryIt.body")}</p>
            <Link href={routes.docs}><Button>{t("tryIt.cta")}</Button></Link>
          </div>
          <pre className="rounded-card border border-hairline bg-ink text-paper font-mono text-[13px] p-6 overflow-x-auto whitespace-pre-wrap">
{`# 1. Add the MCP server
$ claude mcp add telepace https://mcp.telepace.io

# 2. Ask Claude to do research
claude> Run a study on why users churn from our pro tier.

  · Calling telepace.create_campaign …
    ↳ campaign_id: 4f2b…9c1
    ↳ share_url:  https://telepace.io/r/4f2b9c1

  · Calling telepace.get_campaign_progress …
    ↳ 32 / 50 completions · coverage 78%

  · Calling telepace.get_campaign_insights …
    ↳ 3 themes surfaced (confidence ≥ 0.7)

Ready to push? Reply "push to Notion" and I'll finalize.`}
          </pre>
        </div>
      </section>
    </>
  );
}
