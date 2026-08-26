import { describe, expect, it } from "vitest";

import { toBlocks } from "./messageBlocks";

describe("toBlocks", () => {
  it("groups unordered and ordered list lines", () => {
    expect(toBlocks("intro\n- first\n* second\n\n1. one\n2) two")).toEqual([
      { kind: "p", text: "intro" },
      { kind: "ul", items: ["first", "second"] },
      { kind: "ol", items: ["one", "two"] },
    ]);
  });

  it("keeps marker-like prose as a paragraph", () => {
    expect(toBlocks("-not a bullet\n1.not ordered")).toEqual([
      { kind: "p", text: "-not a bullet 1.not ordered" },
    ]);
  });

  it("handles long whitespace prefixes with a bounded scan", () => {
    expect(toBlocks(`${" ".repeat(100_000)}9) item`)).toEqual([
      { kind: "ol", items: ["item"] },
    ]);
  });
});
