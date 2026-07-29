import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button, Card } from "@telepace/ui";

import { PageHeader } from "@/components/app/PageHeader";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.audience" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

/**
 * There is no segments/uploads backend yet — and DESIGN.md forbids rendering
 * invented data as if it were the user's ("Acme Research" rule). So this page
 * is an honest first page instead: it keeps the Audience data-typography
 * standard (serif numerals, letterspaced caps with top rules) but renders it
 * as a GHOST segment — dashed outline, en-dash numerals — which reads as "not
 * written yet", never as your data. The funnel columns still teach what a
 * segment will show; nothing pretends to have happened.
 */
export default async function AudiencePage() {
  const t = await getTranslations("app.audience");
  return (
    <div className="p-10 max-w-content mx-auto">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        actions={
          <>
            {/* Both actions are honest about their state: no import/segment
                backend exists, so they are visibly disabled, not dead. */}
            <Button variant="secondary" size="sm" disabled>
              {t("importCsv")}
            </Button>
            <Button size="sm" disabled>
              {t("newSegment")}
            </Button>
          </>
        }
      />

      <section className="mb-14">
        <p className="overline mb-4">{t("segments")}</p>

        {/* The ghost segment — the shape of the data to come, drawn in dashed
            outline. The funnel captions keep their top rules (the house data
            style) but the numerals are en dashes: unmistakably "nothing yet". */}
        <div className="rounded-card border border-dashed border-hairline p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <p className="font-display text-2xl leading-snug">{t("emptyTitle")}</p>
              <p className="mt-2 text-sm leading-relaxed text-body">
                {t("emptyDescription")}
              </p>
            </div>
            <div className="flex shrink-0 gap-6 text-right" aria-hidden>
              <div>
                <p className="overline mb-1">{t("delivered")}</p>
                <p className="font-display text-xl text-faint">&ndash;</p>
              </div>
              <div>
                <p className="overline mb-1">{t("opened")}</p>
                <p className="font-display text-xl text-faint">&ndash;</p>
              </div>
              <div>
                <p className="overline mb-1">{t("completed")}</p>
                <p className="font-display text-xl text-faint">&ndash;</p>
              </div>
            </div>
          </div>
          <p className="mt-5 border-t border-hairline pt-4 text-xs text-muted">
            {t("emptyHowTo")}
          </p>
        </div>
      </section>

      <section>
        <p className="overline mb-4">{t("uploads")}</p>
        <Card className="divide-y divide-hairline">
          <div className="grid grid-cols-12 items-center px-6 py-2.5">
            <p className="overline col-span-6">{t("colFilename")}</p>
            <p className="overline col-span-2">{t("colRows")}</p>
            <p className="overline col-span-2">{t("colDate")}</p>
            <p className="overline col-span-2 text-right">{t("colStatus")}</p>
          </div>
          <div className="px-6 py-8 text-sm text-muted">{t("noUploadsYet")}</div>
        </Card>
      </section>
    </div>
  );
}
