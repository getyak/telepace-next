"use client";

import { useTranslations } from "next-intl";
import { Button, Input, Label, Textarea } from "@telepace/ui";

interface StepAudienceProps {
  targetPersona: string;
  screener: string[];
  onPersonaChange: (value: string) => void;
  onScreenerChange: (value: string[]) => void;
}

export function StepAudience({
  targetPersona,
  screener,
  onPersonaChange,
  onScreenerChange,
}: StepAudienceProps) {
  const t = useTranslations("app.wizard");

  function updateItem(index: number, value: string) {
    onScreenerChange(screener.map((s, i) => (i === index ? value : s)));
  }

  function removeItem(index: number) {
    onScreenerChange(screener.filter((_, i) => i !== index));
  }

  function addItem() {
    onScreenerChange([...screener, ""]);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-ink">{t("audienceTitle")}</h1>
      <div>
        <Label>{t("audienceTitle")}</Label>
        <Textarea
          value={targetPersona}
          placeholder={t("audiencePlaceholder")}
          rows={3}
          onChange={(e) => onPersonaChange(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        <Label>{t("stepAudience")}</Label>
        {screener.map((q, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={q}
              placeholder={t("questionPlaceholder")}
              onChange={(e) => updateItem(i, e.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => removeItem(i)}>
              {t("removeQuestion")}
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={addItem}>
          {t("addQuestion")}
        </Button>
      </div>
    </div>
  );
}
