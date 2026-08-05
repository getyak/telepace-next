import { describe, expect, it } from "vitest";

import { parseAgentSseFrame } from "./agentChat";

describe("durable agent SSE parsing", () => {
  it("parses sequenced events needed for cursor replay", () => {
    expect(
      parseAgentSseFrame(
        'data: {"type":"plan_update","items":[],"run_id":"run-1","seq":7}\n',
      ),
    ).toEqual({
      type: "plan_update",
      items: [],
      run_id: "run-1",
      seq: 7,
    });
  });

  it("supports multiline SSE data and ignores non-data frames", () => {
    expect(parseAgentSseFrame("event: ping\n\n")).toBeNull();
    expect(
      parseAgentSseFrame(
        'data: {"type":"text",\ndata: "text":"reconnected","run_id":"run-1","seq":8}',
      ),
    ).toMatchObject({ type: "text", text: "reconnected", seq: 8 });
  });

  it("does not surface malformed frames", () => {
    expect(parseAgentSseFrame("data: {not-json}")).toBeNull();
  });
});
