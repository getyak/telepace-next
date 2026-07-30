import { afterEach, describe, expect, it, vi } from "vitest";

// The browser distributable stays dependency-free and directly importable.
// @ts-expect-error Standalone public SDK intentionally has no declaration bundle.
import { TelepaceInterviewClient, createTelepaceInterview } from "../../public/embed/telepace-interview-headless.js";

const campaignId = "02584968-46ad-41a1-b338-3f696e5ace4a";
const campaign = {
  welcome_message: "Tell me what felt unclear.",
  consent_text: "I agree to anonymous research.",
  end_message: "Thank you.",
  reward_description: "",
  redirect_url: "",
  primary_language: "en",
  status: "live",
  accepting_responses: true,
  estimated_duration_minutes: 4,
};

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, ((event: { data?: string }) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, event: { data?: string } = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  open() {
    this.readyState = 1;
    this.dispatch("open");
  }

  message(payload: Record<string, unknown>) {
    this.dispatch("message", { data: JSON.stringify(payload) });
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.readyState = 3;
    this.dispatch("close");
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith(`/v1/campaigns/${campaignId}/respondent`)) {
      return jsonResponse(campaign);
    }
    if (url.endsWith("/v1/interviews/session") && init?.method === "POST") {
      return jsonResponse({
        session_token: "signed-session",
        expires_at: "2026-07-30T12:10:00+00:00",
      });
    }
    return jsonResponse({ detail: "not found" }, 404);
  });
}

function createClient(fetchImpl = createFetch()) {
  return createTelepaceInterview({
    apiUrl: "https://api.telepace.example",
    wsUrl: "wss://api.telepace.example",
    campaignId,
    source: "about-me-trust-gap",
    origin: "https://cubxxw.com",
    fetchImpl,
    WebSocketImpl: FakeSocket,
  });
}

async function flushSocketMessage() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  FakeSocket.instances = [];
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Telepace headless interview SDK", () => {
  it("loads consent data without creating or mutating DOM", async () => {
    document.body.innerHTML = "<main id=\"host\">About</main>";
    const before = document.body.innerHTML;
    const client = createClient();

    await client.load();

    expect(client).toBeInstanceOf(TelepaceInterviewClient);
    expect(client.getState().phase).toBe("consent");
    expect(client.getState().campaign?.consent_text).toBe(campaign.consent_text);
    expect(document.body.innerHTML).toBe(before);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("mints an origin-bound session before connecting the text socket", async () => {
    const fetchImpl = createFetch();
    const client = createClient(fetchImpl);
    await client.load();
    await client.start({ consent: true });

    const sessionCall = fetchImpl.mock.calls[1];
    expect(String(sessionCall[0])).toBe(
      "https://api.telepace.example/v1/interviews/session",
    );
    expect(JSON.parse(String(sessionCall[1]?.body))).toEqual({
      campaign_id: campaignId,
      source: "about-me-trust-gap",
      consent_method: "checkbox",
    });

    const socket = FakeSocket.instances[0];
    const socketUrl = new URL(socket.url);
    expect(socketUrl.pathname).toBe(`/ws/interview/${campaignId}`);
    expect(socketUrl.searchParams.get("client")).toBe("headless");
    expect(socketUrl.searchParams.has("session_token")).toBe(false);
    socket.open();
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "authenticate",
      session_token: "signed-session",
    });
    expect(client.getState().phase).toBe("connecting");
  });

  it("drives asking, thinking, progress, and completion as pure state", async () => {
    const client = createClient();
    const phases: string[] = [];
    client.subscribe((state: { phase: string }) => phases.push(state.phase));
    await client.load();
    await client.start({ consent: true });

    const socket = FakeSocket.instances[0];
    socket.open();
    socket.message({
      type: "hello",
      opening: "What made you keep reading?",
      progress: { question_order: 1, total_questions: 2 },
    });
    await flushSocketMessage();

    expect(client.getState().phase).toBe("asking");
    expect(client.reply("The product examples felt concrete.")).toBe(true);
    expect(client.getState().phase).toBe("thinking");
    expect(JSON.parse(socket.sent[1])).toEqual({
      type: "reply",
      text: "The product examples felt concrete.",
    });

    socket.message({
      type: "interviewer_turn",
      result: {
        text: "Where did trust weaken?",
        kind: "question",
        progress: { question_order: 2, total_questions: 2 },
      },
    });
    await flushSocketMessage();
    expect(client.getState().phase).toBe("asking");
    expect(client.getState().progress).toEqual({ current: 2, total: 2 });

    client.reply("The claims need more visible evidence.");
    socket.message({
      type: "interviewer_turn",
      result: {
        text: "That is useful. Thank you.",
        kind: "wrap_up",
        end_message: "Your answer will shape the next iteration.",
        reward_description: "",
        redirect_url: "",
        progress: { question_order: 2, total_questions: 2 },
      },
    });
    await flushSocketMessage();

    expect(client.getState().phase).toBe("complete");
    expect(client.getState().answerCount).toBe(2);
    expect(client.getState().completion?.endMessage).toContain("next iteration");
    expect(client.getState().connected).toBe(false);
    expect(socket.readyState).toBe(3);
    expect(phases).toContain("thinking");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("requires configured consent and exposes a recoverable inline error", async () => {
    const client = createClient();
    await client.load();
    await client.start();

    expect(client.getState().phase).toBe("error");
    expect(client.getState().error).toEqual({
      code: "consent_required",
      message: "consent is required before starting",
      recoverable: true,
    });
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it("retries the last answer on the same live socket after a recoverable turn error", async () => {
    const client = createClient();
    await client.load();
    await client.start({ consent: true });
    const socket = FakeSocket.instances[0];
    socket.open();
    socket.message({
      type: "hello",
      opening: "What weakened trust?",
      progress: { question_order: 1, total_questions: 2 },
    });
    await flushSocketMessage();

    client.reply("The product cards lacked evidence.");
    socket.message({
      type: "error",
      reason: "interviewer_unavailable",
      recoverable: true,
    });
    await flushSocketMessage();

    expect(client.getState().phase).toBe("error");
    expect(client.retry()).toBe(true);
    expect(client.getState().phase).toBe("thinking");
    expect(socket.sent).toEqual([
      JSON.stringify({ type: "authenticate", session_token: "signed-session" }),
      JSON.stringify({ type: "reply", text: "The product cards lacked evidence." }),
      JSON.stringify({ type: "reply", text: "The product cards lacked evidence." }),
    ]);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("keeps close local and never changes the document location", async () => {
    const client = createClient();
    const originalHref = window.location.href;
    await client.load();
    await client.start({ consent: true });
    FakeSocket.instances[0].open();

    client.close();

    expect(client.getState().phase).toBe("closed");
    expect(window.location.href).toBe(originalHref);
    expect(document.querySelector("iframe")).toBeNull();
  });
});
