"use client";

import { useTranslations } from "next-intl";
import { Label, Textarea } from "@telepace/ui";

interface StepGoalProps {
  goal: string;
  onChange: (goal: string) => void;
}

export function StepGoal({ goal, onChange }: StepGoalProps) {
  const t = useTranslations("app.wizard");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-ink">{t("goalTitle")}</h1>
      <div>
        <Label>{t("goalTitle")}</Label>
        <Textarea
          value={goal}
          placeholder={t("goalPlaceholder")}
          rows={5}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
