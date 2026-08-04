"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton, icons } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import {
  StudySelector,
  type StudyOption,
} from "@/components/copilot/StudySelector";
import { getCampaigns } from "@/lib/api";

export default function CopilotPage() {
  const t = useTranslations("app.copilot");
  const [studies, setStudies] = useState<StudyOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const rows = await getCampaigns();
      const next = rows.map((study) => ({ id: study.id, name: study.title }));
      setStudies(next);
      setSelectedIds(next.map((study) => study.id));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-content p-10">
      <PageHeader eyebrow={t("title")} title={t("subtitle")} />

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-[560px] w-full" />
        </div>
      ) : loadError ? (
        <EmptyState
          icon={<icons.InsightsIcon size={28} />}
          title={t("loadError")}
          action={<Button onClick={() => void load()}>{t("retry")}</Button>}
        />
      ) : studies.length === 0 ? (
        <EmptyState
          icon={<icons.InsightsIcon size={28} />}
          title={t("noStudies")}
          description={t("noStudiesDescription")}
        />
      ) : (
        <div className="space-y-6">
          <StudySelector
            studies={studies}
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
