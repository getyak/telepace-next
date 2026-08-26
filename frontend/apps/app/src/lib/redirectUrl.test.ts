import { describe, expect, it } from "vitest";

import { safeRedirectUrl } from "./redirectUrl";

describe("safeRedirectUrl", () => {
  it("allows only canonical HTTP and HTTPS destinations", () => {
    expect(safeRedirectUrl("https://example.com/thanks")).toBe(
      "https://example.com/thanks",
    );
    expect(safeRedirectUrl("HTTP://EXAMPLE.COM/path")).toBe("http://example.com/path");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//example.com/relative-scheme",
    "/relative/path",
    "not a URL",
    "",
  ])("rejects active, relative, or malformed redirect %s", (value) => {
    expect(safeRedirectUrl(value)).toBeNull();
  });
});
