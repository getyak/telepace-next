"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@telepace/ui";
import { useTranslations } from "next-intl";

import { CHART_COLORS, AXIS_STYLE, GRID_STYLE, TOOLTIP_STYLE } from "./theme";

type Datum = { label: string; value: number };

type TpBarChartProps = {
  data: Datum[];
  baseN: number;
  title?: string;
  height?: number;
  className?: string;
};

export function TpBarChart({
  data,
  baseN,
  title,
  height = 260,
  className,
}: TpBarChartProps) {
  const t = useTranslations("app.charts");

  return (
    <div className={cn("w-full", className)}>
      {title && (
        <p className="overline mb-4">{title}</p>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
        >
          <CartesianGrid
            vertical={false}
            stroke={GRID_STYLE.stroke}
            strokeDasharray={GRID_STYLE.strokeDasharray}
          />
          <XAxis
            dataKey="label"
            fontSize={AXIS_STYLE.fontSize}
            fontFamily={AXIS_STYLE.fontFamily}
            tickLine={false}
            axisLine={{ stroke: AXIS_STYLE.axisLine.stroke }}
            tick={{ fill: AXIS_STYLE.tick.fill }}
          />
          <YAxis
            fontSize={AXIS_STYLE.fontSize}
            fontFamily={AXIS_STYLE.fontFamily}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS_STYLE.tick.fill }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE.contentStyle}
            labelStyle={TOOLTIP_STYLE.labelStyle}
            cursor={TOOLTIP_STYLE.cursor}
          />
          <Bar
            dataKey="value"
            fill={CHART_COLORS[0]}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs font-mono text-muted">
        {t("baseN", { n: baseN })}
      </p>
    </div>
  );
}
