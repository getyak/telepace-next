import type { ResponseRow } from "@/types/evidence";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportResponsesCsv(rows: ResponseRow[], filename: string): void {
  // Collect all unique segment keys across all rows
  const segmentKeys = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r.segments))),
  ).sort();

  const headers = [
    "respondent_id",
    "external_ref",
    "source",
    "channel",
    "duration_seconds",
    "quality_score",
    ...segmentKeys,
    "bullet_summary",
    "exclusion_reason",
    "completed_at",
  ];

  const csvRows = [headers.map(escapeCsvField).join(",")];

  for (const row of rows) {
    const values = [
      row.respondent_id,
      row.external_ref ?? "",
      row.source,
      row.channel,
      row.duration_seconds != null ? String(row.duration_seconds) : "",
      row.quality_score != null ? String(row.quality_score) : "",
      ...segmentKeys.map((k) => row.segments[k] ?? ""),
      row.bullet_summary,
      row.exclusion_reason ?? "",
      row.completed_at ?? "",
    ];
    csvRows.push(values.map(escapeCsvField).join(","));
  }

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
