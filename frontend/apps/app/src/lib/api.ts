/**
 * Campaign API client.
 *
 * Endpoint paths live in `@telepace/config/endpoints`; env-driven base URL
 * + auth-token injection is centralized in `./http`. No `localhost` fallback
 * lives here anymore.
 */

import { apiEndpoints } from "@telepace/config";

import { apiFetch, apiFetchRaw } from "./http";

export type CampaignSummary = {
  campaign_id: string;
  share_url: string;
  status: string;
};

export async function createCampaign(body: {
  title: string;
  goal: string;
  background?: string;
  target_completions?: number;
  budget_usd?: number;
  channels?: string[];
}): Promise<CampaignSummary> {
  return apiFetch<CampaignSummary>(apiEndpoints.campaigns.root, {
    method: "POST",
    json: body,
  });
}

export async function refineOutline(campaignId: string, instruction: string) {
  return apiFetch(apiEndpoints.campaigns.refine(campaignId), {
    method: "POST",
    json: { instruction },
  });
}

export type RefineStreamHandlers = {
  onDelta?: (text: string) => void;
  onPatch?: (patch: Record<string, unknown>) => void;
  onDone?: (summary: string) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

export async function refineOutlineStream(
  campaignId: string,
  instruction: string,
  handlers: RefineStreamHandlers = {},
): Promise<void> {
  const res = await apiFetchRaw(apiEndpoints.campaigns.refineStream(campaignId), {
    method: "POST",
    headers: { accept: "text/event-stream" },
    json: { instruction },
    signal: handlers.signal,
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const dispatch = (raw: string) => {
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    const payloadStr = dataLines.join("\n");
    let payload: {
      type?: string;
      text?: string;
      patch?: Record<string, unknown>;
      summary?: string;
      message?: string;
    };
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return;
    }
    switch (payload.type) {
      case "delta":
        if (payload.text) handlers.onDelta?.(payload.text);
        break;
      case "spec_patch":
        if (payload.patch) handlers.onPatch?.(payload.patch);
        break;
      case "done":
        handlers.onDone?.(payload.summary ?? "");
        break;
      case "error":
        handlers.onError?.(payload.message ?? "unknown error");
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const evt = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      if (evt) dispatch(evt);
    }
  }
  if (buf.trim()) dispatch(buf);
}

export async function getCampaign(id: string) {
  return apiFetch(apiEndpoints.campaigns.byId(id));
}

export async function startCampaign(id: string) {
  return apiFetch(apiEndpoints.campaigns.start(id), { method: "POST" });
}
