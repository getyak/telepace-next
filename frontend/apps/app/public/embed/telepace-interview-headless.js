const PHASE = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  CONSENT: "consent",
  AUTHORIZING: "authorizing",
  CONNECTING: "connecting",
  ASKING: "asking",
  THINKING: "thinking",
  COMPLETE: "complete",
  ERROR: "error",
  CLOSED: "closed",
});

const MESSAGE = Object.freeze({
  HELLO: "hello",
  REPLY: "reply",
  INTERVIEWER_TURN: "interviewer_turn",
  ERROR: "error",
  WRAP_UP: "wrap_up",
});

const DEFAULT_TIMEOUT_MS = 15_000;

function normalizedUrl(value, protocols, name) {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) throw new Error();
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new TypeError(`${name} must be an absolute ${protocols.join(" or ")} URL`);
  }
}

function cloneState(state) {
  return {
    ...state,
    campaign: state.campaign ? { ...state.campaign } : null,
    completion: state.completion ? { ...state.completion } : null,
    error: state.error ? { ...state.error } : null,
    progress: { ...state.progress },
    messages: state.messages.map((message) => ({ ...message })),
  };
}

async function decodeSocketData(data) {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
  }
  return "";
}

async function fetchJson(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    let body = {};
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) {
      const detail =
        typeof body.detail === "string" ? body.detail : `request failed (${response.status})`;
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export class TelepaceInterviewClient {
  constructor(options) {
    if (!options || typeof options !== "object") {
      throw new TypeError("Telepace interview options are required");
    }
    const campaignId = String(options.campaignId || "").trim();
    if (!campaignId) throw new TypeError("campaignId is required");

    this.campaignId = campaignId;
    this.apiUrl = normalizedUrl(options.apiUrl, ["http:", "https:"], "apiUrl");
    this.wsUrl = normalizedUrl(options.wsUrl, ["ws:", "wss:"], "wsUrl");
    this.locale = options.locale === "zh" ? "zh" : "en";
    this.source = String(options.source || "embed").trim() || "embed";
    this.origin =
      String(options.origin || globalThis.location?.origin || "").trim() || "null";
    this.timeoutMs = Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    this.WebSocketImpl = options.WebSocketImpl || globalThis.WebSocket;
    if (typeof this.fetchImpl !== "function") {
      throw new TypeError("A fetch implementation is required");
    }
    if (typeof this.WebSocketImpl !== "function") {
      throw new TypeError("A WebSocket implementation is required");
    }

    this.listeners = new Set();
    this.socket = null;
    this.intentionalClose = false;
    this.lastReply = "";
    this.state = {
      phase: PHASE.IDLE,
      campaign: null,
      messages: [],
      progress: { current: null, total: 0 },
      completion: null,
      connected: false,
      answerCount: 0,
      error: null,
      source: this.source,
    };
  }

  getState() {
    return cloneState(this.state);
  }

  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("subscribe requires a listener");
    }
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  emit(patch) {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  fail(code, message, recoverable = true) {
    this.emit({
      phase: PHASE.ERROR,
      connected: false,
      error: { code, message: message || code, recoverable },
    });
  }

  async load() {
    this.emit({ phase: PHASE.LOADING, error: null });
    try {
      const campaign = await fetchJson(
        this.fetchImpl,
        `${this.apiUrl}/v1/campaigns/${encodeURIComponent(this.campaignId)}/respondent`,
        { method: "GET", headers: { Accept: "application/json" }, credentials: "omit" },
        this.timeoutMs,
      );
      if (!campaign.accepting_responses) {
        this.fail("campaign_not_live", "campaign is not accepting responses", false);
        return this.getState();
      }
      this.emit({ phase: PHASE.CONSENT, campaign, error: null });
      return this.getState();
    } catch (error) {
      const code = error?.name === "AbortError" ? "campaign_timeout" : "campaign_unavailable";
      this.fail(code, error?.message, true);
      return this.getState();
    }
  }

  async start({ consent = false } = {}) {
    if (!this.state.campaign) await this.load();
    if (this.state.phase === PHASE.ERROR || !this.state.campaign) return this.getState();
    if (this.state.campaign.consent_text && !consent) {
      this.fail("consent_required", "consent is required before starting", true);
      return this.getState();
    }

    this.disconnectSocket();
    this.emit({ phase: PHASE.AUTHORIZING, error: null, completion: null });
    try {
      const session = await fetchJson(
        this.fetchImpl,
        `${this.apiUrl}/v1/interviews/session`,
        {
          method: "POST",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            campaign_id: this.campaignId,
            source: this.source,
            consent_method: this.state.campaign.consent_text ? "checkbox" : "continue",
          }),
        },
        this.timeoutMs,
      );
      if (!session.session_token) throw new Error("session token missing");
      this.connect(session.session_token);
    } catch (error) {
      const code = error?.name === "AbortError" ? "session_timeout" : "session_unavailable";
      this.fail(code, error?.message, true);
    }
    return this.getState();
  }

  connect(sessionToken) {
    const url = new URL(
      `${this.wsUrl}/ws/interview/${encodeURIComponent(this.campaignId)}`,
    );
    url.searchParams.set("client", "headless");

    this.intentionalClose = false;
    const socket = new this.WebSocketImpl(url.toString());
    this.socket = socket;
    this.emit({ phase: PHASE.CONNECTING, connected: false, error: null });

    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      socket.send(
        JSON.stringify({
          type: "authenticate",
          session_token: sessionToken,
        }),
      );
      this.emit({ connected: true });
    });
    socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(socket, event.data);
    });
    socket.addEventListener("error", () => {
      if (this.socket !== socket || this.intentionalClose) return;
      this.fail("socket_error", "the interview connection failed", true);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (
        !this.intentionalClose &&
        this.state.phase !== PHASE.COMPLETE &&
        this.state.phase !== PHASE.ERROR
      ) {
        this.fail("connection_lost", "the interview connection was interrupted", true);
      }
    });
  }

  async handleSocketMessage(socket, data) {
    if (this.socket !== socket) return;
    const raw = await decodeSocketData(data);
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === MESSAGE.HELLO) {
      const opening = String(message.opening || "").trim();
      const progress = message.progress || {};
      this.emit({
        phase: PHASE.ASKING,
        connected: true,
        messages: opening
          ? [{ id: crypto.randomUUID(), role: "interviewer", text: opening }]
          : [],
        progress: {
          current: progress.question_order ?? 1,
          total: Number(progress.total_questions) || 0,
        },
      });
      return;
    }

    if (message.type === MESSAGE.ERROR) {
      this.fail(
        String(message.reason || "interview_error"),
        String(message.reason || "the interview could not continue"),
        message.recoverable !== false,
      );
      return;
    }

    if (message.type !== MESSAGE.INTERVIEWER_TURN || !message.result) return;
    this.lastReply = "";
    const result = message.result;
    const text = String(result.text || "").trim();
    const nextMessages = text
      ? [
          ...this.state.messages,
          { id: crypto.randomUUID(), role: "interviewer", text },
        ]
      : this.state.messages;
    const progress = result.progress || {};
    if (result.kind === MESSAGE.WRAP_UP) {
      this.disconnectSocket();
      this.emit({
        phase: PHASE.COMPLETE,
        connected: false,
        messages: nextMessages,
        progress: {
          current: progress.question_order ?? this.state.progress.current,
          total: Number(progress.total_questions) || this.state.progress.total,
        },
        completion: {
          endMessage: String(result.end_message || ""),
          rewardDescription: String(result.reward_description || ""),
          redirectUrl: String(result.redirect_url || ""),
        },
      });
      return;
    }
    this.emit({
      phase: PHASE.ASKING,
      messages: nextMessages,
      progress: {
        current: progress.question_order ?? this.state.progress.current,
        total: Number(progress.total_questions) || this.state.progress.total,
      },
    });
  }

  reply(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (!this.socket || this.socket.readyState !== 1 || this.state.phase !== PHASE.ASKING) {
      this.fail("not_ready", "the interview is not ready for an answer", true);
      return false;
    }
    this.lastReply = text;
    this.socket.send(JSON.stringify({ type: MESSAGE.REPLY, text }));
    this.emit({
      phase: PHASE.THINKING,
      messages: [
        ...this.state.messages,
        { id: crypto.randomUUID(), role: "respondent", text },
      ],
      answerCount: this.state.answerCount + 1,
      error: null,
    });
    return true;
  }

  retry() {
    if (
      !this.lastReply ||
      !this.state.error?.recoverable ||
      !this.socket ||
      this.socket.readyState !== 1
    ) {
      return false;
    }
    this.socket.send(JSON.stringify({ type: MESSAGE.REPLY, text: this.lastReply }));
    this.emit({ phase: PHASE.THINKING, connected: true, error: null });
    return true;
  }

  async restart({ consent = true } = {}) {
    this.disconnectSocket();
    this.lastReply = "";
    this.emit({
      phase: PHASE.CONSENT,
      messages: [],
      progress: { current: null, total: 0 },
      completion: null,
      connected: false,
      answerCount: 0,
      error: null,
    });
    return this.start({ consent });
  }

  close() {
    this.disconnectSocket();
    this.lastReply = "";
    this.emit({ phase: PHASE.CLOSED, connected: false, error: null });
  }

  disconnectSocket() {
    if (!this.socket) return;
    this.intentionalClose = true;
    const socket = this.socket;
    this.socket = null;
    socket.close(1000, "client closed");
  }

  destroy() {
    this.disconnectSocket();
    this.listeners.clear();
  }
}

export function createTelepaceInterview(options) {
  return new TelepaceInterviewClient(options);
}

export { PHASE as TelepaceInterviewPhase };
