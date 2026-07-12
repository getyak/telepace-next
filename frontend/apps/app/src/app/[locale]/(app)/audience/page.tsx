import { getTranslations } from "next-intl/server";
import { Badge, Button, Card } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";

type SegmentDef = {
  nameKey: string;
  count: number;
  sourceKey: string;
  delivered: number;
  opened: number;
  completed: number;
};

const segments: SegmentDef[] = [
  { nameKey: "segProTrial",     count: 1240, sourceKey: "srcStripeSync",  delivered: 380, opened: 220, completed: 68 },
  { nameKey: "segChurnedQ2",    count: 542,  sourceKey: "srcCsvUploaded", delivered: 120, opened: 84,  completed: 34 },
  { nameKey: "segBetaResearch", count: 84,   sourceKey: "srcManualVetted",delivered: 60,  opened: 55,  completed: 41 },
];

type UploadDef = {
  name: string;
  rows: number;
  date: string;
  statusKey: string;
};

const uploads: UploadDef[] = [
  { name: "pro_trial_2026-06.csv", rows: 1240, date: "2026-06-30", statusKey: "statusSynced" },
  { name: "churned_q2.csv", rows: 542, date: "2026-06-01", statusKey: "statusSynced" },
];

export default async function AudiencePage() {
  const t = await getTranslations("app.audience");
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            <Button variant="secondary" size="sm">{t("importCsv")}</Button>
            <Button size="sm">{t("newSegment")}</Button>
          </>
        }
      />

      <section className="mb-14">
        <p className="overline mb-4">{t("segments")}</p>
        <div className="grid gap-4">
          {segments.map((s) => (
            <Card key={s.nameKey} className="p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-display text-2xl mb-1">{t(s.nameKey)}</p>
                  <p className="text-sm text-muted">{t("peopleCount", { count: s.count.toLocaleString(), source: t(s.sourceKey) })}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-xs text-muted">{t("delivered")}</p>
                    <p className="font-display text-xl">{s.delivered}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t("opened")}</p>
                    <p className="font-display text-xl">{s.opened}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t("completed")}</p>
                    <p className="font-display text-xl text-accent">{s.completed}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <p className="overline mb-4">{t("uploads")}</p>
        <Card className="divide-y divide-hairline">
          {uploads.map((u) => (
            <div key={u.name} className="grid grid-cols-12 items-center px-6 py-4 text-sm">
              <div className="col-span-6 font-mono text-body">{u.name}</div>
              <div className="col-span-2 text-muted">{t("rowsCount", { count: u.rows.toLocaleString() })}</div>
              <div className="col-span-2 text-muted font-mono">{u.date}</div>
              <div className="col-span-2 text-right">
                <Badge variant="accent">{t(u.statusKey)}</Badge>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
