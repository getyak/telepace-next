"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Badge, cn } from "@telepace/ui";

const SUGGESTION_KEYS = [
  "suggestContradictions",
  "suggestThemes",
  "suggestSegments",
  "suggestQuotes",
] as const;

/**
 * Four tappable suggested-question chips. Clicking a chip hands the fully
 * resolved question text back to the parent (which fills the composer).
 */
export function SuggestedQuestions({
  onSelect,
  disabled,
  className,
}: {
  onSelect: (question: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("app.research");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {t("suggestedQuestions")}
      </p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTION_KEYS.map((key) => {
          const question = t(key);
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(question)}
              className="rounded-pill focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Badge className="cursor-pointer bg-paper-elevated hover:bg-accent-soft hover:text-accent">
                {question}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
