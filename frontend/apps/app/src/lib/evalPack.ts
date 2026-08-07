"use client";

import { getEvalPack, type EvalPack } from "./api";

function safeFilename(value: string): string {
  const compact = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return compact || "evaluation";
}

/** Fetch and download the durable, versioned artifact produced by an
 * evaluation program. Keeping this in one client-only seam means the studio
 * and detail page cannot silently drift into exporting different shapes. */
export async function downloadEvalPack(campaignId: string): Promise<EvalPack> {
  const pack = await getEvalPack(campaignId);
  const filename = `telepace-eval-pack-v${pack.evaluation_program.version}-${safeFilename(
    pack.evaluation_program.title,
  )}.json`;
  const blob = new Blob([`${JSON.stringify(pack, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return pack;
}
