import { describe, expect, it } from "vitest";

import { buildProxyRequestHeaders } from "./proxyHeaders";

describe("buildProxyRequestHeaders", () => {
  it("preserves the campaign idempotency key through the BFF proxy", () => {
    const headers = buildProxyRequestHeaders(
      new Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": "create-7d2c",
      }),
      "server-session-token",
    );

    expect(headers.get("idempotency-key")).toBe("create-7d2c");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer server-session-token");
  });

  it("drops browser credentials and arbitrary hop-by-hop headers", () => {
    const headers = buildProxyRequestHeaders(
      new Headers({
        Authorization: "Bearer browser-controlled",
        Cookie: "access_token=browser-controlled",
        Connection: "keep-alive",
        "X-Untrusted": "nope",
      }),
    );

    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("x-untrusted")).toBeNull();
  });
});
