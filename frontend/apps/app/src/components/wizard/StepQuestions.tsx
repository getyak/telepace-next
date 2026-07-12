"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Input, Label } from "@telepace/ui";
import { FollowUpConfig } from "./FollowUpConfig";
import type { OutlineItem } from "./types";

interface StepQuestionsProps {
  outline: OutlineItem[];
  onChange: (outline: OutlineItem[]) => void;
}

export function StepQuestions({ outline, onChange }: StepQuestionsProps) {
  const t = useTranslations("app.wizard");
  const [expanded, setExpanded] = useState<number | null>(null);

  function updateItem(index: number, patch: Partial<OutlineItem>) {
    onChange(outline.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function removeItem(index: number) {
    onChange(
      outline
        .filter((_, i) => i !== index)
        .map((q, i) => ({ ...q, order: i + 1 })),
    );
    setExpanded(null);
  }

  function addItem() {
    onChange([
      ...outline,
      { order: outline.length + 1, question: "", goal: "" },
    ]);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-ink">{t("questionsTitle")}</h1>

      <ol className="space-y-4">
        {outline.map((q, i) => {
          const isOpen = expanded === i;
          return (
            <li key={i}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                <span className="font-mono text-sm text-muted pt-2.5 w-6">
                  {String(q.order).padStart(2, "0")}
                </span>
                <div className="flex-1 space-y-3">
                  <Input
                    value={q.question}
                    placeholder={t("questionPlaceholder")}
                    onChange={(e) => updateItem(i, { question: e.target.value })}
                  />
                  <div>
                    <Label>{t("goalLabel")}</Label>
                    <Input
                      value={q.goal}
                      placeholder={t("goalFieldPlaceholder")}
                      onChange={(e) => updateItem(i, { goal: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(isOpen ? null : i)}
                    >
                      {isOpen ? "▾ " : "▸ "}
                      {t("stepSettings")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(i)}
                    >
                      {t("removeQuestion")}
                    </Button>
                  </div>

                  {isOpen && (
                    <FollowUpConfig
                      item={q}
                      onChange={(updated) => updateItem(i, updated)}
                    />
                  )}
                </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <Button variant="secondary" size="sm" onClick={addItem}>
        {t("addQuestion")}
      </Button>
    </div>
  );
}
