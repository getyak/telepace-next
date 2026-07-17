import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/app/PageHeader";

import { InboxBoard, type InboxItemDef } from "./InboxBoard";

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

const items: InboxItemDef[] = [
  { id: "e1", kind: "escalation", studyKey: "itemStudy1", bodyKey: "itemBody1", timeKey: "itemTime1", urgent: true },
  { id: "e2", kind: "insight", studyKey: "itemStudy1", bodyKey: "itemBody2", timeKey: "itemTime2" },
  { id: "e3", kind: "progress", studyKey: "itemStudy2", bodyKey: "itemBody3", timeKey: "itemTime3" },
  { id: "e4", kind: "system", studyKey: "itemStudy3", bodyKey: "itemBody4", timeKey: "itemTime4" },
];

export default async function InboxPage() {
  const t = await getTranslations("app.inbox");
  return (
    <div className="mx-auto max-w-content p-6 md:p-10">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} />
      <InboxBoard items={items} />
    </div>
  );
}
