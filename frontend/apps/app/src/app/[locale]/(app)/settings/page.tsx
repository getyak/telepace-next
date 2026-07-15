import { getTranslations } from "next-intl/server";
import { Button, Card, CardBody, CardFooter, Input, Label } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";
import { DeleteWorkspaceDialog } from "./_components/DeleteWorkspaceDialog";
import { SettingsShell } from "./_components/SettingsShell";

const SECTION_IDS = ["workspace", "members", "billing", "api-keys", "mcp", "danger"] as const;

const WORKSPACE_SLUG = "acme";

const members = [
  { name: "Alex Kim", email: "alex@acme.com", roleKey: "roleOwner" },
  { name: "Jordan Lee", email: "jordan@acme.com", roleKey: "roleEditor" },
  { name: "Priya Rao", email: "priya@acme.com", roleKey: "roleViewer" },
];

const usage = [
  { labelKey: "studiesUsed", value: "14" },
  { labelKey: "completions", value: "312 / 500" },
  { labelKey: "voiceMinutes", value: "48 min" },
];

export default async function SettingsPage() {
  const t = await getTranslations("app.settings");

  const sections = [
    { id: "workspace", label: t("sections.workspace"), description: t("sectionDesc.workspace") },
    { id: "members", label: t("sections.members"), description: t("sectionDesc.members") },
    { id: "billing", label: t("sections.billing"), description: t("sectionDesc.billing") },
    { id: "api-keys", label: t("sections.apiKeys"), description: t("sectionDesc.apiKeys") },
    { id: "mcp", label: t("sections.mcp"), description: t("sectionDesc.mcp") },
    { id: "danger", label: t("sections.danger"), description: t("sectionDesc.danger") },
  ];

  const panels: Record<(typeof SECTION_IDS)[number], React.ReactNode> = {
    workspace: (
      <Card>
        <CardBody className="space-y-5">
          <div>
            <Label htmlFor="ws-name">{t("workspaceName")}</Label>
            <Input id="ws-name" defaultValue="Acme Research" aria-describedby="ws-name-hint" />
            <p id="ws-name-hint" className="mt-1.5 text-xs text-muted">
              {t("workspaceNameHint")}
            </p>
          </div>
          <div>
            <Label htmlFor="ws-slug">{t("urlSlug")}</Label>
            <Input id="ws-slug" defaultValue={WORKSPACE_SLUG} aria-describedby="ws-slug-hint" />
            <p id="ws-slug-hint" className="mt-1.5 text-xs text-muted">
              {t("urlSlugHint")}
            </p>
          </div>
        </CardBody>
        {/* The commit sits on its own hairline shelf, mapped to the fields above. */}
        <CardFooter className="flex justify-end">
          <Button size="sm">{t("saveChanges")}</Button>
        </CardFooter>
      </Card>
    ),

    members: (
      <Card>
        <ul className="divide-y divide-hairline">
          {members.map((m) => (
            <li
              key={m.email}
              className="flex items-center justify-between gap-4 px-6 py-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{m.name}</p>
                <p className="truncate text-sm text-muted">{m.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="text-sm text-body">{t(m.roleKey)}</span>
                <Button variant="ghost" size="sm">
                  {t("manage")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <CardFooter className="flex items-center justify-between">
          <p className="text-xs text-muted">{t("seatsHint")}</p>
          <Button variant="secondary" size="sm">
            {t("inviteMember")}
          </Button>
        </CardFooter>
      </Card>
    ),

    billing: (
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="overline mb-1">{t("planLabel")}</p>
              <p className="font-display text-3xl">Pro</p>
              <p className="mt-1 text-sm text-muted">
                {t("renewsLine", { date: "2026-07-15", price: "$79 / mo" })}
              </p>
            </div>
            <Button variant="secondary" size="sm">
              {t("managePlan")}
            </Button>
          </div>
        </CardBody>
        <CardFooter className="bg-paper-sunken/40">
          <p className="overline mb-3">{t("usageTitle")}</p>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {usage.map((u) => (
              <div key={u.labelKey}>
                <dt className="text-xs text-muted">{t(u.labelKey)}</dt>
                <dd className="mt-0.5 font-display text-2xl">{u.value}</dd>
              </div>
            ))}
          </dl>
        </CardFooter>
      </Card>
    ),

    "api-keys": (
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-ink">tp_live_a1b2•••7f9</p>
              <p className="mt-0.5 text-xs text-muted">
                {t("keyMeta", { created: "2026-06-04", lastUsed: "2026-07-02" })}
              </p>
            </div>
            <Button variant="ghost" size="sm">
              {t("rotate")}
            </Button>
          </div>
        </CardBody>
        <CardFooter className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted">{t("keysHint")}</p>
          <Button variant="secondary" size="sm">
            {t("createKey")}
          </Button>
        </CardFooter>
      </Card>
    ),

    mcp: (
      <Card>
        <CardBody>
          <p className="text-body">{t("mcpEndpointIntro")}</p>
          <pre className="mt-3 overflow-x-auto rounded-btn bg-paper-sunken p-3 font-mono text-sm text-ink">
            https://mcp.telepace.io/w/{WORKSPACE_SLUG}
          </pre>
          <p className="mt-3 text-xs text-muted">{t("mcpAuthHint")}</p>
        </CardBody>
      </Card>
    ),

    danger: (
      <div className="rounded-card border border-terracotta/30 bg-terracotta/5">
        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-lg">{t("deleteWorkspace")}</p>
            <p className="mt-0.5 text-sm text-body">{t("deleteWorkspaceWarning")}</p>
          </div>
          <div className="shrink-0">
            <DeleteWorkspaceDialog
              slug={WORKSPACE_SLUG}
              labels={{
                trigger: t("deleteWorkspace"),
                title: t("deleteConfirmTitle"),
                body: t("deleteConfirmBody", { slug: WORKSPACE_SLUG }),
                inputLabel: t("deleteConfirmLabel"),
                confirm: t("deleteConfirmCta"),
                cancel: t("cancel"),
              }}
            />
          </div>
        </div>
      </div>
    ),
  };

  return (
    <div className="mx-auto max-w-content p-10">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <SettingsShell sections={sections} panels={panels} />
    </div>
  );
}
