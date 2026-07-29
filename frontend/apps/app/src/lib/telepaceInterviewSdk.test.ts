import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The distributable intentionally remains dependency-free JavaScript so any
// host can load it directly without a package or build step.
// @ts-expect-error The standalone browser SDK does not ship TypeScript declarations.
import { TelepaceInterview } from "../../public/embed/telepace-interview.js";

const campaignId = "campaign-1";
const baseUrl = "https://telepace.example";

function mount(locale: "en" | "zh" = "en") {
  const element = new TelepaceInterview();
  element.setAttribute("campaign-id", campaignId);
  element.setAttribute("base-url", baseUrl);
  element.setAttribute("locale", locale);
  element.setAttribute("source", "about-me-trust-gap");
  document.body.append(element);
  return element;
}

function dispatchFromFrame(
  element: InstanceType<typeof TelepaceInterview>,
  data: Record<string, unknown>,
  origin = baseUrl,
  source: MessageEventSource | null = element.frame?.contentWindow ?? null,
) {
  element.handleMessage(
    new MessageEvent("message", {
      data,
      origin,
      source,
    }),
  );
}

function readyMessage(overrides: Record<string, unknown> = {}) {
  return {
    source: "telepace-interview",
    version: 1,
    type: "telepace:ready",
    campaignId,
    payload: {},
    ...overrides,
  };
}

beforeAll(() => {
  if (!customElements.get("telepace-interview")) {
    customElements.define("telepace-interview", TelepaceInterview);
  }
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("TelepaceInterview browser SDK", () => {
  it("localizes visible chrome and accessibility status", () => {
    const element = mount("zh");

    expect(element.shadowRoot?.textContent).toContain("Telepace AI 访谈");
    expect(element.shadowRoot?.querySelector("[part=close]")?.textContent).toBe("关闭");
    expect(element.shadowRoot?.querySelector("[part=close]")?.getAttribute("aria-label")).toBe(
      "关闭访谈",
    );

    element.open();
    expect(element.shadowRoot?.querySelector(".sr-status")?.textContent).toBe("正在载入访谈");
  });

  it("rejects the wrong source window, origin, and campaign before accepting ready", () => {
    const element = mount();
    element.open();

    dispatchFromFrame(element, readyMessage(), baseUrl, window);
    dispatchFromFrame(element, readyMessage(), "https://attacker.example");
    dispatchFromFrame(element, readyMessage({ campaignId: "another-campaign" }));
    expect(element.dataset.state).toBe("loading");

    dispatchFromFrame(element, readyMessage());
    expect(element.dataset.state).toBe("ready");
    expect(element.shadowRoot?.querySelector(".loading")?.hasAttribute("hidden")).toBe(true);
  });

  it("preserves segmented source and supports close then reopen", () => {
    const element = mount();
    element.open();

    const firstUrl = new URL(element.frame?.src ?? "");
    expect(firstUrl.searchParams.get("source")).toBe("about-me-trust-gap");
    expect(firstUrl.searchParams.get("embed")).toBe("1");
    expect(firstUrl.searchParams.get("parentOrigin")).toBe(window.location.origin);

    element.close();
    expect(element.frame).toBeNull();
    expect(element.dataset.state).toBe("closed");

    element.open();
    expect(element.frame).not.toBeNull();
    expect(element.dataset.state).toBe("loading");
  });

  it("recovers when ready arrives after the timeout fallback", () => {
    vi.useFakeTimers();
    const element = mount("zh");
    element.open();

    vi.advanceTimersByTime(12_000);
    expect(element.dataset.state).toBe("error");
    expect(element.shadowRoot?.querySelector(".error")?.textContent).toContain(
      "访谈载入时间比预期更长",
    );

    dispatchFromFrame(element, readyMessage());
    expect(element.dataset.state).toBe("ready");
    expect(element.shadowRoot?.querySelector(".error")?.hasAttribute("hidden")).toBe(true);
  });
});
