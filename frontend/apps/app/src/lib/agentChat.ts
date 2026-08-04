/**
 * Durable run client for the global agent.
 *
 * Starting work and watching it are deliberately separate. A network
 * disconnect only ends the watch request; the server-side run continues and
 * can be replayed from its last monotonically increasing event sequence.
 */

import { apiEndpoints } from "@telepace/config";

import { apiFetch, apiFetchRaw } from "./http";

export type AgentTurn = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "text"; text: string }
  | {
      type: "tool_call";
      tool_use_id?: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id?: string;
      name: string;
      result: Record<string, unknown>;
    }
  | {
      type: "tool_error";
      tool_use_id?: string;
      name: string;
      message: string;
      failure_count?: number;
    }
  | {
      type: "plan_update";
      items: Array<{ step: string; status: "pending" | "in_progress" | "completed" }>;
    }
  | {
      type: "verification";
      name: string;
      verified: boolean;
      verifier?: string;
      error?: string;
    }
  | {
      type: "confirm_request";
      confirmation_id: string;
      tool_use_id?: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "confirmation_result";
      confirmation_id: string;
      name: string;
      approved: boolean;
    }
  | {
      type: "compaction";
      before_chars: number;
      after_chars: number;
      retained_recent_messages: number;
    }
  | {
      type: "usage";
      input_tokens: number;
      output_tokens: number;
      total_input_tokens: number;
      total_output_tokens: number;
      llm_latency_ms: number;
    }
  | {
      type: "done";
      text: string;
      status?: "completed" | "incomplete";
      reason?: string;
    }
  | { type: "error"; message: string };

export type SequencedAgentEvent = AgentEvent & { run_id: string; seq: number };

export type AgentRunCreated = {
  run_id: string;
  status: AgentRunStatus["status"];
  events_url: string;
};

export type AgentRunStatus = {
  run_id: string;
  status: "running" | "completed" | "incomplete" | "failed";
  error: string | null;
  messages: AgentTurn[];
};

export type AgentRunHandlers = {
  onEvent: (event: SequencedAgentEvent) => void;
  signal?: AbortSignal;
};

export async function createAgentRun(
  messages: AgentTurn[],
): Promise<AgentRunCreated> {
  return apiFetch<AgentRunCreated>(apiEndpoints.agent.runs, {
    method: "POST",
    json: { messages },
  });
}

export async function getAgentRun(runId: string): Promise<AgentRunStatus> {
  return apiFetch<AgentRunStatus>(apiEndpoints.agent.run(runId));
}

export async function resolveAgentConfirmation(
  runId: string,
  confirmationId: string,
  approved: boolean,
): Promise<void> {
  await apiFetch(apiEndpoints.agent.confirmation(runId, confirmationId), {
    method: "POST",
    json: { approved },
  });
}

export function parseAgentSseFrame(raw: string): SequencedAgentEvent | null {
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join("\n")) as SequencedAgentEvent;
  } catch {
    return null;
  }
}

/** Watch one run until the server closes the stream or the caller disconnects. */
export async function watchAgentRun(
  runId: string,
  after: number,
  handlers: AgentRunHandlers,
): Promise<number> {
  const query = new URLSearchParams({ after: String(after), follow: "true" });
  const res = await apiFetchRaw(
    `${apiEndpoints.agent.runEvents(runId)}?${query.toString()}`,
    {
      headers: { accept: "text/event-stream" },
      signal: handlers.signal,
    },
  );

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let cursor = after;

  const dispatch = (raw: string) => {
    const payload = parseAgentSseFrame(raw);
    if (payload && payload.seq > cursor) {
      cursor = payload.seq;
      handlers.onEvent(payload);
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
  return cursor;
}
