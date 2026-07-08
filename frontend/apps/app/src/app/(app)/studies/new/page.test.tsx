import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  createCampaign: vi.fn(),
  getCampaign: vi.fn(),
  refineOutline: vi.fn(),
  refineOutlineStream: vi.fn(),
  simulateInterview: vi.fn(),
  startCampaign: vi.fn(),
}));

vi.mock("@/lib/errors", () => ({
  friendlyMessage: () => ({ title: "Error", description: "Something went wrong" }),
}));

vi.mock("@telepace/ui", () => {
  const React = require("react");
  return {
    Button: (props: Record<string, unknown>) =>
      React.createElement(
        "button",
        { disabled: props.disabled, onClick: props.onClick },
        props.children
      ),
    ChatFeed: () => React.createElement("div", { "data-testid": "chat-feed" }),
    ChatComposer: () =>
      React.createElement("div", { "data-testid": "chat-composer" }),
  };
});

vi.mock("@telepace/config", () => ({
  ALL_CHANNELS: ["web_text", "web_voice", "phone_outbound", "email"],
  CHANNELS: {
    webText: "web_text",
    webVoice: "web_voice",
    phoneOutbound: "phone_outbound",
    email: "email",
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NewStudyPage", () => {
  // Lazy-import so mocks are registered first
  async function renderPage() {
    const mod = await import("./page");
    const Page = mod.default;
    return render(<Page />);
  }

  it("renders without crashing", async () => {
    const { container } = await renderPage();
    expect(container).toBeTruthy();
  });

  it("shows design chat header", async () => {
    await renderPage();
    expect(screen.getByText("Design chat")).toBeInTheDocument();
  });

  it("shows discussion guide header", async () => {
    await renderPage();
    expect(screen.getByText("Discussion guide")).toBeInTheDocument();
  });

  it("shows the study title input with default value", async () => {
    await renderPage();
    const input = screen.getByDisplayValue("New study");
    expect(input).toBeInTheDocument();
  });

  it("shows empty outline placeholder", async () => {
    await renderPage();
    expect(
      screen.getByText("Your outline appears here as we design it together.")
    ).toBeInTheDocument();
  });

  it("shows Publish study button (disabled initially)", async () => {
    await renderPage();
    const btn = screen.getByText("Publish study");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("shows Simulate respondent button (disabled initially)", async () => {
    await renderPage();
    const btn = screen.getByText("Simulate respondent");
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("displays channel delivery buttons", async () => {
    await renderPage();
    // ALL_CHANNELS includes web_text, web_voice, phone_outbound, email
    expect(screen.getByText("web text")).toBeInTheDocument();
    expect(screen.getByText("web voice")).toBeInTheDocument();
    expect(screen.getByText("phone outbound")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
  });

  it("shows the Questions section heading", async () => {
    await renderPage();
    expect(screen.getByText("Questions")).toBeInTheDocument();
  });

  it("shows the Delivery section heading", async () => {
    await renderPage();
    expect(screen.getByText("Delivery")).toBeInTheDocument();
  });
});
