"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EmptyState, icons } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import { MemoExport } from "@/components/copilot/MemoExport";
import { MOCK_STUDIES, StudySelector } from "@/components/copilot/StudySelector";

export default function CopilotPage() {
  const t = useTranslations("app.copilot");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    MOCK_STUDIES.map((s) => s.id),
  );

  return (
    <div className="mx-auto max-w-content p-10">
      <PageHeader
        eyebrow={t("title")}
        title={t("subtitle")}
        actions={
          <MemoExport
            exportLabel={t("exportMemo")}
            notionLabel={t("toNotion")}
            linearLabel={t("toLinear")}
          />
        }
      />

      {MOCK_STUDIES.length === 0 ? (
        <EmptyState
          icon={<icons.InsightsIcon size={28} />}
          title={t("noStudies")}
          description={t("noStudiesDescription")}
        />
      ) : (
        <div className="space-y-6">
          <StudySelector
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            allLabel={t("allStudies")}
            label={t("selectStudies")}
          />
          <CopilotChat
            selectedStudyIds={selectedIds}
            placeholder={t("placeholder")}
            sendLabel={t("send")}
            thinkingLabel={t("thinking")}
          />
        </div>
      )}
    </div>
  );
}
