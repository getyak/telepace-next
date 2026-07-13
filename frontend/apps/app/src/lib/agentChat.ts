/**
 * SSE client for the global agent (POST /agent/chat).
 *
 * Mirrors refineOutlineStream's frame parser but consumes the OrchestratorAgent
 * event vocabulary: text / tool_call / tool_result / tool_error / done / error.
 * The agent runs a tool-calling loop server-side; each event streams back so the
 * sidebar can show tool activity ("creating study…") before the final answer.
 */

import { apiEndpoints } from "@telepace/config";

import { apiFetchRaw } from "./http";

export type AgentTurn = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: Record<string, unknown> }
  | { type: "tool_error"; name: string; message: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

export type AgentChatHandlers = {
  onEvent: (event: AgentEvent) => void;
  signal?: AbortSignal;
};

export async function agentChatStream(
  messages: AgentTurn[],
  handlers: AgentChatHandlers,
): Promise<void> {
  const res = await apiFetchRaw(apiEndpoints.agent.chat, {
    method: "POST",
    headers: { accept: "text/event-stream" },
    json: { messages },
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
    let payload: AgentEvent;
    try {
      payload = JSON.parse(dataLines.join("\n")) as AgentEvent;
    } catch {
      return;
    }
    handlers.onEvent(payload);
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
