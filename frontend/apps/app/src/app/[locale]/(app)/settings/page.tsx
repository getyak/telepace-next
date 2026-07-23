import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button, Card, CardBody, CardFooter, EmptyState } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";
import { BillingPanel } from "./_components/BillingPanel";
import { DeleteWorkspaceDialog } from "./_components/DeleteWorkspaceDialog";
import { SettingsShell } from "./_components/SettingsShell";
import { MembersPanel, McpPanel, WorkspacePanel } from "./_components/WorkspacePanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.settings" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

const SECTION_IDS = ["workspace", "members", "billing", "api-keys", "mcp", "danger"] as const;

// Until the org settings API lands, the delete confirmation asks for this
// fixed word rather than a per-workspace slug (which the client derives from
// the user's email and the server does not yet know about).
const DELETE_CONFIRM_WORD = "delete";

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
      <WorkspacePanel
        labels={{
          workspaceName: t("workspaceName"),
          workspaceNameHint: t("workspaceNameHint"),
          urlSlug: t("urlSlug"),
          urlSlugHint: t("urlSlugHint"),
          saveChanges: t("saveChanges"),
        }}
      />
    ),

    members: (
      <MembersPanel
        labels={{
          roleOwner: t("roleOwner"),
          seatsHint: t("seatsHint"),
          inviteMember: t("inviteMember"),
        }}
      />
    ),

    billing: <BillingPanel />,

    "api-keys": (
      <Card>
        <CardBody>
          <EmptyState title={t("noKeysYet")} description={t("keysHint")} />
        </CardBody>
        <CardFooter className="flex justify-end">
          <Button variant="secondary" size="sm" disabled>
            {t("createKey")}
          </Button>
        </CardFooter>
      </Card>
    ),

    mcp: (
      <McpPanel
        labels={{
          mcpEndpointIntro: t("mcpEndpointIntro"),
          mcpAuthHint: t("mcpAuthHint"),
        }}
      />
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
              slug={DELETE_CONFIRM_WORD}
              labels={{
                trigger: t("deleteWorkspace"),
                title: t("deleteConfirmTitle"),
                body: t("deleteConfirmBody", { slug: DELETE_CONFIRM_WORD }),
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
