import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, Button, Card } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.inbox" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

type InboxItemDef = {
  id: string;
  kind: string;
  studyKey: string;
  bodyKey: string;
  timeKey: string;
  urgent?: boolean;
};

const items: InboxItemDef[] = [
  { id: "e1", kind: "escalation", studyKey: "itemStudy1",  bodyKey: "itemBody1", timeKey: "itemTime1", urgent: true },
  { id: "e2", kind: "insight",    studyKey: "itemStudy1",  bodyKey: "itemBody2", timeKey: "itemTime2" },
  { id: "e3", kind: "progress",   studyKey: "itemStudy2",  bodyKey: "itemBody3", timeKey: "itemTime3" },
  { id: "e4", kind: "system",     studyKey: "itemStudy3",  bodyKey: "itemBody4", timeKey: "itemTime4" },
];

const kindVariant: Record<string, "danger" | "accent" | "neutral"> = {
  escalation: "danger",
  insight: "accent",
  progress: "neutral",
  system: "neutral",
};

const kindLabelKey: Record<string, string> = {
  escalation: "kindEscalation",
  insight: "kindInsight",
  progress: "kindProgress",
  system: "kindSystem",
};

export default async function InboxPage() {
  const t = await getTranslations("app.inbox");
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            <Button variant="ghost" size="sm">{t("markAllRead")}</Button>
            <Button variant="secondary" size="sm">{t("filter")}</Button>
          </>
        }
      />

      <Card className="divide-y divide-hairline overflow-hidden">
        {items.map((it) => (
          <article key={it.id} className="grid grid-cols-12 items-start gap-4 px-6 py-5">
            <div className="col-span-3 sm:col-span-2">
              <Badge variant={kindVariant[it.kind] ?? "neutral"}>{t(kindLabelKey[it.kind] ?? it.kind)}</Badge>
            </div>
            <div className="col-span-6 sm:col-span-8">
              <p className="text-xs text-muted mb-1">{t(it.studyKey)}</p>
              <p className={it.urgent ? "text-ink font-medium" : "text-body"}>{t(it.bodyKey)}</p>
            </div>
            <div className="col-span-3 sm:col-span-2 text-right text-sm text-muted">{t(it.timeKey)}</div>
          </article>
        ))}
      </Card>
    </div>
  );
}
