import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button, Card } from "@telepace/ui";
import { routes, siteConfig } from "@telepace/config";
import { PageHeader } from "@/components/marketing/site-chrome";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing.docs" });
  return { title: t("title"), description: t("description") };
}

const SECTION_IDS = ["quickstart", "coreConcepts", "integrations", "reference"] as const;

const SECTION_ITEM_IDS: Record<(typeof SECTION_IDS)[number], string[]> = {
  quickstart: ["60seconds", "15minutes", "anHour"],
  coreConcepts: ["campaigns", "interviews", "insights", "harness"],
  integrations: ["mcp", "restApi", "notion", "linear", "webhooks"],
  reference: ["commandSchemas", "eventSchemas", "mcpToolSchemas"],
};

const codeSample = `# Install the CLI (optional)
$ pip install telepace-cli

# Or use the MCP directly in Claude Code
$ claude mcp add telepace https://mcp.telepace.io

# Create your first campaign
$ telepace campaigns create \\
    --title "Why do users abandon onboarding?" \\
    --goal "Understand the first-run friction" \\
    --channel web_text \\
    --target 25

  ✓ campaign_id: 4f2b…9c1
  ✓ share_url:  https://telepace.io/r/4f2b9c1
  ✓ next_actions:
      · dispatch invites via email
      · watch progress: telepace campaigns progress 4f2b9c1`;

export default async function DocsPage() {
  const t = await getTranslations("marketing.docs");

  const sections = SECTION_IDS.map((sectionId) => ({
    id: sectionId,
    title: t(`sections.${sectionId}.title`),
    items: SECTION_ITEM_IDS[sectionId].map((itemId) => ({
      id: itemId,
      h: t(`sections.${sectionId}.items.${itemId}.h`),
      body: t(`sections.${sectionId}.items.${itemId}.body`),
    })),
  }));

  return (
    <>
      <PageHeader
        eyebrow={t("hero.eyebrow")}
        title={<>{t("hero.title")}</>}
        lede={t("hero.lede")}
      />

      <section className="section-padding">
        <div className="container-content grid md:grid-cols-12 gap-10">
          <aside className="md:col-span-3">
            <nav className="sticky top-24 space-y-6 text-sm">
              {sections.map((s) => (
                <div key={s.id}>
                  <p className="overline mb-2">{s.title}</p>
                  <ul className="space-y-1.5 text-body">
                    {s.items.map((it) => (
                      <li key={it.id}>
                        <a href={`#${slug(it.h)}`} className="hover:text-ink transition-colors">{it.h}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>
          <div className="md:col-span-9 space-y-16">
            <div>
              <p className="overline mb-4">{t("install.eyebrow")}</p>
              <h2 className="font-display text-3xl mb-6">{t("install.title")}</h2>
              <pre className="rounded-card border border-hairline bg-ink text-paper font-mono text-[13px] leading-relaxed p-6 overflow-x-auto whitespace-pre-wrap">
{codeSample}
              </pre>
            </div>

            {sections.map((s) => (
              <div key={s.id} className="space-y-6">
                <h2 className="font-display text-2xl">{s.title}</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {s.items.map((it) => (
                    <Card
                      key={it.id}
                      id={slug(it.h)}
                      className="p-6"
                    >
                      <p className="font-display text-xl mb-2">{it.h}</p>
                      <p className="text-body text-sm">{it.body}</p>
                    </Card>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-card border border-hairline bg-ink text-paper p-8">
              <p className="overline text-paper/70 mb-3">{t("support.eyebrow")}</p>
              <p className="font-display text-2xl mb-4">{t("support.title")}</p>
              <div className="flex gap-3">
                <Link href={`mailto:${siteConfig.contact.supportEmail}`}><Button variant="secondary" className="border-paper/30 text-paper hover:bg-paper/10">{t("support.emailSupport")}</Button></Link>
                <Link href={routes.mcp}><Button variant="secondary" className="border-paper/30 text-paper hover:bg-paper/10">{t("support.browseMcpTools")}</Button></Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
