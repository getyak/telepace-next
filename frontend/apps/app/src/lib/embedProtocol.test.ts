import { describe, expect, it } from "vitest";
import {
  createTelepaceEmbedMessage,
  isTelepaceEmbedMessage,
} from "@telepace/config";

describe("telepace embed protocol", () => {
  it("creates a versioned message that the guard accepts", () => {
    const message = createTelepaceEmbedMessage("telepace:progress", "campaign-1", {
      current: 2,
      total: 5,
    });

    expect(isTelepaceEmbedMessage(message)).toBe(true);
    expect(message).toMatchObject({
      source: "telepace-interview",
      version: 1,
      campaignId: "campaign-1",
    });
  });

  it("rejects unrelated cross-window messages", () => {
    expect(isTelepaceEmbedMessage({ type: "telepace:ready" })).toBe(false);
    expect(
      isTelepaceEmbedMessage({
        source: "another-widget",
        version: 1,
        type: "telepace:ready",
        campaignId: "campaign-1",
        payload: {},
      }),
    ).toBe(false);
    expect(
      isTelepaceEmbedMessage({
        source: "telepace-interview",
        version: 1,
        type: "telepace:unexpected",
        campaignId: "campaign-1",
        payload: {},
      }),
    ).toBe(false);
  });
});
