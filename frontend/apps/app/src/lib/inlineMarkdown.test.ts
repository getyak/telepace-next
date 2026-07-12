import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderInlineMarkdown } from "@telepace/ui";

// Helper: describe each node as either a plain string or a tag name, so tests
// can assert structure without rendering to the DOM.
function shape(nodes: ReturnType<typeof renderInlineMarkdown>) {
  return nodes.map((n) => {
    if (typeof n === "string") return { text: n };
    if (isValidElement(n)) {
      const el = n as ReactElement<{ children?: unknown }>;
      return { tag: el.type as string, children: el.props.children };
    }
    return { other: n };
  });
}

describe("renderInlineMarkdown", () => {
  it("returns an empty array for empty input", () => {
    expect(renderInlineMarkdown("")).toEqual([]);
  });

  it("leaves plain text as a single string node", () => {
    expect(shape(renderInlineMarkdown("just plain text"))).toEqual([{ text: "just plain text" }]);
  });

  it("renders **bold** as a <strong> with the inner text", () => {
    const s = shape(renderInlineMarkdown("a **bold** b"));
    expect(s[0]).toEqual({ text: "a " });
    expect(s[1]).toMatchObject({ tag: "strong", children: "bold" });
    expect(s[2]).toEqual({ text: " b" });
  });

  it("renders the leaked '**Methodology Insight**' case as bold, not literal markers", () => {
    const s = shape(renderInlineMarkdown("**Methodology Insight**: I introduced a price anchor"));
    expect(s[0]).toMatchObject({ tag: "strong", children: "Methodology Insight" });
    expect(s[1]).toEqual({ text: ": I introduced a price anchor" });
    // The literal asterisks must be gone.
    expect(JSON.stringify(s)).not.toContain("**");
  });

  it("renders `code`", () => {
    const code = shape(renderInlineMarkdown("use `pnpm test` now"));
    expect(code[1]).toMatchObject({ tag: "code", children: "pnpm test" });
  });

  it("does NOT render single-* as italic — multiplication stays literal", () => {
    // A lone asterisk in a research chat is a multiplication sign, not markdown.
    for (const input of ["a*b*c", "5 * 3 * 2 = 30", "sample * weight"]) {
      const s = shape(renderInlineMarkdown(input));
      expect(s.every((n) => "text" in n)).toBe(true);
      expect(s.map((n) => (n as { text: string }).text).join("")).toBe(input);
    }
  });

  it("leaves an unbalanced marker as a literal character (fail-safe)", () => {
    const s = shape(renderInlineMarkdown("price is **50 dollars"));
    expect(s.every((n) => "text" in n)).toBe(true);
    expect((s[0] as { text: string }).text).toContain("**50 dollars");
  });

  it("NEVER produces HTML injection — angle brackets stay as text content", () => {
    const s = shape(renderInlineMarkdown("**<img src=x onerror=alert(1)>** and </div>"));
    // The bold group carries the raw string as React children (text content),
    // never as innerHTML — so it can't execute. The <strong> child is the exact
    // literal string.
    expect(s[0]).toMatchObject({ tag: "strong", children: "<img src=x onerror=alert(1)>" });
    // No node is a dangerouslySetInnerHTML carrier.
    expect(JSON.stringify(s)).not.toContain("dangerouslySetInnerHTML");
  });

  it("handles multiple spans in one line", () => {
    const s = shape(renderInlineMarkdown("**bold** then `code` then **more**"));
    const tags = s.filter((n) => "tag" in n).map((n) => (n as { tag: string }).tag);
    expect(tags).toEqual(["strong", "code", "strong"]);
  });

  it("preserves Chinese text around markers", () => {
    const s = shape(renderInlineMarkdown("我引入了**价格锚点**来量化价值"));
    expect(s[0]).toEqual({ text: "我引入了" });
    expect(s[1]).toMatchObject({ tag: "strong", children: "价格锚点" });
    expect(s[2]).toEqual({ text: "来量化价值" });
  });
});
