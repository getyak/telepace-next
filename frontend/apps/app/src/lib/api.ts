const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
  const res = await fetch(`${API}/v1/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function refineOutline(campaignId: string, instruction: string) {
  const res = await fetch(`${API}/v1/campaigns/${campaignId}/refine`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instruction }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type RefineStreamHandlers = {
  onDelta?: (text: string) => void;
  onPatch?: (patch: Record<string, unknown>) => void;
  onDone?: (summary: string) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

/**
 * Stream Designer refinements via SSE. Each server event is one JSON line prefixed
 * with `data: `. Message shapes:
 *   { type: "delta", text: string }
 *   { type: "spec_patch", patch: object }
 *   { type: "done", summary: string }
 *   { type: "error", message: string }
 */
export async function refineOutlineStream(
  campaignId: string,
  instruction: string,
  handlers: RefineStreamHandlers = {},
): Promise<void> {
  const res = await fetch(`${API}/v1/campaigns/${campaignId}/refine/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify({ instruction }),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const dispatch = (raw: string) => {
    // An SSE "event" is one or more `data:` lines separated by \n, terminated by \n\n.
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    const payloadStr = dataLines.join("\n");
    let payload: { type?: string; text?: string; patch?: Record<string, unknown>; summary?: string; message?: string };
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
  const res = await fetch(`${API}/v1/campaigns/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function startCampaign(id: string) {
  const res = await fetch(`${API}/v1/campaigns/${id}/start`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
