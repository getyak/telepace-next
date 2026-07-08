"use client";

import type { ReactNode } from "react";

import { SmallSampleWarning, MultiSelectTip, Top2BoxNote } from "./StatAnnotation";

type ChartSectionProps = {
  baseN: number | number[];
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
  const minN = Array.isArray(baseN) ? Math.min(...baseN) : baseN;

  return (
    <div className="space-y-4">
      {children}
      <SmallSampleWarning n={minN} />
      {isMultiSelect && <MultiSelectTip />}
      {showTop2Box && <Top2BoxNote />}
    </div>
  );
}
