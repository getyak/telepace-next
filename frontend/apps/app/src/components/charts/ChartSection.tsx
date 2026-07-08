"use client";

import type { ReactNode } from "react";

import { SmallSampleWarning, MultiSelectTip, Top2BoxNote } from "./StatAnnotation";

type ChartSectionProps = {
  baseN: number;
  isMultiSelect?: boolean;
  showTop2Box?: boolean;
  children: ReactNode;
};

export function ChartSection({
  baseN,
  isMultiSelect,
  showTop2Box,
  children,
}: ChartSectionProps) {
  return (
    <div className="space-y-4">
      {children}
      <SmallSampleWarning n={baseN} />
      {isMultiSelect && <MultiSelectTip />}
      {showTop2Box && <Top2BoxNote />}
    </div>
  );
}
