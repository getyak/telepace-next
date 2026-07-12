"use client";

import { useTranslations } from "next-intl";
import { cn } from "@telepace/ui";

export type StudyOption = { id: string; nameKey: string };

export const MOCK_STUDIES: StudyOption[] = [
  { id: "onboarding-q3", nameKey: "mockStudyOnboarding" },
  { id: "pricing-sso", nameKey: "mockStudyPricing" },
  { id: "mcp-expansion", nameKey: "mockStudyMcp" },
  { id: "churn-winback", nameKey: "mockStudyChurn" },
];

export function StudySelector({
  studies = MOCK_STUDIES,
  selectedIds,
  onChange,
  allLabel,
  label,
}: {
  studies?: StudyOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allLabel: string;
  label: string;
}) {
  const t = useTranslations("app.copilot");
  const allSelected = selectedIds.length === studies.length;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    onChange(allSelected ? [] : studies.map((s) => s.id));
  }

  return (
    <div>
      <p className="overline mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        <Pill selected={allSelected} onClick={selectAll}>
          {allLabel}
        </Pill>
        {studies.map((study) => (
          <Pill
            key={study.id}
            selected={selectedIds.includes(study.id)}
            onClick={() => toggle(study.id)}
          >
            {t(study.nameKey)}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function Pill({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-pill border px-3 py-1.5 text-sm transform-gpu transition-[transform,color,background-color,border-color] duration-150 active:scale-[0.97] active:duration-75 motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        selected
          ? "border-accent bg-accent text-paper"
          : "border-hairline bg-paper-elevated text-body hover:border-accent/40 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
