"use client";

import { useTranslations } from "next-intl";
import type { WizardForm } from "./types";

interface StepReviewProps {
  form: WizardForm;
}

export function StepReview({ form }: StepReviewProps) {
  const t = useTranslations("app.wizard");

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl text-ink">{t("reviewTitle")}</h1>

      <section>
        <p className="overline mb-1">{t("reviewGoal")}</p>
        <p className="text-body">{form.goal || "—"}</p>
      </section>

      <section>
        <p className="overline mb-1">{t("reviewAudience")}</p>
        <p className="text-body">{form.target_persona || "—"}</p>
        {form.audience_screener.filter(Boolean).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {form.audience_screener.filter(Boolean).map((q, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-pill text-xs border border-hairline bg-paper text-body"
              >
                {q}
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <p className="overline mb-2">
          {t("reviewQuestionCount", { count: form.outline.length })}
        </p>
        {form.outline.length === 0 ? (
          <p className="text-muted text-sm">—</p>
        ) : (
          <ol className="space-y-2">
            {form.outline.map((q, i) => (
              <li key={i} className="flex gap-3 text-body">
                <span className="font-mono text-xs text-muted pt-0.5 w-6">
                  {String(q.order).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-ink">{q.question || "—"}</p>
                  {q.goal && (
                    <p className="text-xs text-muted mt-0.5">{q.goal}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <p className="overline mb-2">{t("stepSettings")}</p>
        <div className="flex flex-wrap gap-2">
          {form.channels.map((ch) => (
            <span
              key={ch}
              className="px-3 py-1.5 rounded-pill text-xs border border-hairline bg-paper text-body"
            >
              {ch.replace(/_/g, " ")}
            </span>
          ))}
          <span className="px-3 py-1.5 rounded-pill text-xs border border-hairline bg-paper text-body">
            {t("reviewQuestionCount", { count: form.target_completions })}
          </span>
        </div>
      </section>
    </div>
  );
}
