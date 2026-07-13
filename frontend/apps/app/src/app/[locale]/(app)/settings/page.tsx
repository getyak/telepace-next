import { getTranslations } from "next-intl/server";
import { Button, Card, Input, Label } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";
import { SectionNav } from "./_components/SectionNav";

const SECTION_IDS = ["workspace", "members", "billing", "api-keys", "mcp", "danger"] as const;

const members = [
  { name: "Alex Kim", email: "alex@acme.com", roleKey: "roleOwner" },
  { name: "Jordan Lee", email: "jordan@acme.com", roleKey: "roleEditor" },
  { name: "Priya Rao", email: "priya@acme.com", roleKey: "roleViewer" },
];

export default async function SettingsPage() {
  const t = await getTranslations("app.settings");
  const sectionLabel: Record<(typeof SECTION_IDS)[number], string> = {
    workspace: t("sections.workspace"),
    members: t("sections.members"),
    billing: t("sections.billing"),
    "api-keys": t("sections.apiKeys"),
    mcp: t("sections.mcp"),
    danger: t("sections.danger"),
  };
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />

      <div className="grid md:grid-cols-12 gap-10">
        <aside className="md:col-span-3">
          <SectionNav sections={SECTION_IDS.map((id) => ({ id, label: sectionLabel[id] }))} />
        </aside>
        <div className="md:col-span-9 space-y-14">
          <section id="workspace">
            <p className="overline mb-4">{t("sections.workspace")}</p>
            <Card className="p-6 space-y-4">
              <div>
                <Label htmlFor="ws-name">{t("workspaceName")}</Label>
                <Input id="ws-name" defaultValue="Acme Research" />
              </div>
              <div>
                <Label htmlFor="ws-slug">{t("urlSlug")}</Label>
                <Input id="ws-slug" defaultValue="acme" />
              </div>
              <div className="pt-2 flex justify-end">
                <Button>{t("saveChanges")}</Button>
              </div>
            </Card>
          </section>

          <section id="members">
            <p className="overline mb-4">{t("sections.members")}</p>
            <Card className="divide-y divide-hairline">
              {members.map((m) => (
                <div key={m.email} className="grid grid-cols-12 items-center px-6 py-4">
                  <div className="col-span-5">
                    <p className="font-medium text-ink">{m.name}</p>
                    <p className="text-sm text-muted">{m.email}</p>
                  </div>
                  <div className="col-span-4 text-sm text-body">{t(m.roleKey)}</div>
                  <div className="col-span-3 text-right">
                    <Button variant="ghost" size="sm">{t("manage")}</Button>
                  </div>
                </div>
              ))}
              <div className="px-6 py-4 flex justify-end">
                <Button variant="secondary" size="sm">{t("inviteMember")}</Button>
              </div>
            </Card>
          </section>

          <section id="billing">
            <p className="overline mb-4">{t("sections.billing")}</p>
            <Card className="p-6">
              <div className="flex items-baseline justify-between mb-6">
                <div>
                  <p className="font-display text-2xl">Pro</p>
                  <p className="text-sm text-muted">{t("renewsLine", { date: "2026-07-15", price: "$79 / mo" })}</p>
                </div>
                <Button variant="secondary" size="sm">{t("managePlan")}</Button>
              </div>
              <div className="grid grid-cols-3 border-t border-hairline pt-4">
                <div><p className="overline mb-1">{t("studiesUsed")}</p><p className="font-display text-2xl">14</p></div>
                <div><p className="overline mb-1">{t("completions")}</p><p className="font-display text-2xl">312 / 500</p></div>
                <div><p className="overline mb-1">{t("voiceMinutes")}</p><p className="font-display text-2xl">48 min</p></div>
              </div>
            </Card>
          </section>

          <section id="api-keys">
            <p className="overline mb-4">{t("sections.apiKeys")}</p>
            <Card className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-ink">tp_live_a1b2•••7f9</p>
                  <p className="text-xs text-muted">{t("keyMeta", { created: "2026-06-04", lastUsed: "2026-07-02" })}</p>
                </div>
                <Button variant="ghost" size="sm">{t("rotate")}</Button>
              </div>
              <div className="pt-2 flex justify-end">
                <Button variant="secondary" size="sm">{t("createKey")}</Button>
              </div>
            </Card>
          </section>

          <section id="mcp">
            <p className="overline mb-4">{t("sections.mcp")}</p>
            <Card className="p-6">
              <p className="text-body mb-3">{t("mcpEndpointIntro")}</p>
              <pre className="font-mono text-sm rounded-btn bg-paper-sunken p-3 text-ink">https://mcp.telepace.io/w/acme</pre>
              <p className="text-xs text-muted mt-3">{t("mcpAuthHint")}</p>
            </Card>
          </section>

          <section id="danger">
            <p className="overline mb-4 text-terracotta">{t("sections.danger")}</p>
            <div className="rounded-card border border-terracotta/30 bg-terracotta/5 p-6 flex items-center justify-between">
              <div>
                <p className="font-display text-lg">{t("deleteWorkspace")}</p>
                <p className="text-sm text-body">{t("deleteWorkspaceWarning")}</p>
              </div>
              <Button variant="secondary" className="border-terracotta text-terracotta hover:bg-terracotta hover:text-paper">{t("deleteWorkspace")}</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
