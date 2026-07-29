const MESSAGE_SOURCE = "telepace-interview";
const MESSAGE_VERSION = 1;
const READY_TIMEOUT_MS = 12000;
const MIN_FRAME_HEIGHT = 560;
const MAX_FRAME_HEIGHT = 860;
const COPY = {
  en: {
    brand: "Telepace AI interview",
    close: "Close",
    closeLabel: "Close interview",
    defaultTitle: "Telepace AI interview",
    loading: "Loading interview",
    closed: "Interview closed",
    ready: "Interview ready",
    complete: "Interview complete",
    invalidTitle: "This interview is not configured yet.",
    timeoutTitle: "The interview is taking longer than expected.",
    timeoutBody: "You can continue in a new tab without losing your place.",
    unavailableTitle: "This conversation is not open right now.",
    unavailableBody: "The interview may have ended or is still being prepared.",
    fallback: "Open in a new tab",
  },
  zh: {
    brand: "Telepace AI 访谈",
    close: "关闭",
    closeLabel: "关闭访谈",
    defaultTitle: "Telepace AI 访谈",
    loading: "正在载入访谈",
    closed: "访谈已关闭",
    ready: "访谈已就绪",
    complete: "访谈已完成",
    invalidTitle: "访谈尚未完成配置。",
    timeoutTitle: "访谈载入时间比预期更长。",
    timeoutBody: "你可以在新标签页继续，不会丢失进度。",
    unavailableTitle: "这次访谈目前未开放。",
    unavailableBody: "访谈可能已经结束，或仍在准备中。",
    fallback: "在新标签页打开",
  },
};

const clampHeight = (value) => {
  const height = Number(value);
  if (!Number.isFinite(height)) return 680;
  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(height)));
};

const normalizedBaseUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch {
    return "";
  }
};

export class TelepaceInterview extends HTMLElement {
  constructor() {
    super();
    this.frame = null;
    this.readyTimer = null;
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    window.addEventListener("message", this.handleMessage);
    this.addEventListener("click", this.handleClick);
    if (this.hasAttribute("open")) this.open();
  }

  disconnectedCallback() {
    window.removeEventListener("message", this.handleMessage);
    this.removeEventListener("click", this.handleClick);
    this.clearReadyTimer();
  }

  get copy() {
    return COPY[this.getAttribute("locale") === "zh" ? "zh" : "en"];
  }

  render() {
    const copy = this.copy;
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--tp-embed-ink, #181714);
          font: inherit;
          contain: content;
        }
        [hidden] { display: none !important; }
        .surface {
          position: relative;
          overflow: hidden;
          min-height: var(--tp-embed-min-height, 520px);
          border: 1px solid var(--tp-embed-rule, rgba(24, 23, 20, .14));
          border-radius: var(--tp-embed-radius, 20px);
          background: var(--tp-embed-bg, #f8f6f1);
          box-shadow: var(--tp-embed-shadow, 0 24px 70px rgba(38, 34, 28, .10));
        }
        .placeholder {
          min-height: inherit;
        }
        .runtime {
          min-height: inherit;
          background: var(--tp-embed-bg, #f8f6f1);
        }
        .bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--tp-embed-rule, rgba(24, 23, 20, .12));
          color: var(--tp-embed-muted, #6d685f);
          background: color-mix(in srgb, var(--tp-embed-bg, #f8f6f1) 92%, transparent);
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 12px;
          letter-spacing: .06em;
        }
        .mark {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: var(--tp-embed-accent, #4a5d3b);
        }
        button {
          appearance: none;
          border: 0;
          border-radius: 8px;
          padding: 7px 10px;
          color: inherit;
          background: transparent;
          font: inherit;
          font-size: 12px;
          cursor: pointer;
        }
        button:hover { background: rgba(24, 23, 20, .06); }
        button:active { transform: translateY(.85px); }
        button:focus-visible {
          outline: 2px solid var(--tp-embed-accent, #4a5d3b);
          outline-offset: 2px;
        }
        .stage {
          position: relative;
          min-height: calc(var(--tp-frame-height, 680px) - 48px);
        }
        iframe {
          display: block;
          width: 100%;
          height: var(--tp-frame-height, 680px);
          border: 0;
          background: var(--tp-embed-bg, #f8f6f1);
          transition: height 220ms cubic-bezier(.2, .76, .2, 1);
        }
        .loading {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          z-index: 1;
          color: var(--tp-embed-muted, #6d685f);
          background: var(--tp-embed-bg, #f8f6f1);
        }
        .loading span {
          width: min(72%, 360px);
          height: 12px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(24,23,20,.06), rgba(24,23,20,.13), rgba(24,23,20,.06));
          background-size: 220% 100%;
          animation: loading 1.2s ease-in-out infinite;
        }
        .error {
          display: grid;
          min-height: 420px;
          place-items: center;
          padding: 32px;
          text-align: center;
        }
        .error strong {
          display: block;
          margin-bottom: 10px;
          font-size: 22px;
          font-weight: 550;
        }
        .error p {
          max-width: 36ch;
          margin: 0 auto 20px;
          color: var(--tp-embed-muted, #6d685f);
          line-height: 1.6;
        }
        .error a {
          color: var(--tp-embed-accent, #4a5d3b);
          text-underline-offset: 4px;
        }
        .sr-status {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        @keyframes loading { to { background-position: -120% 0; } }
        @media (max-width: 640px) {
          .surface { border-radius: var(--tp-embed-radius-mobile, 14px); }
          .bar { padding-inline: 12px; }
          iframe { min-height: 640px; }
        }
        @media (prefers-reduced-motion: reduce) {
          iframe { transition: none; }
          .loading span { animation: none; }
          button:active { transform: none; }
        }
      </style>
      <section class="surface" part="surface">
        <div class="placeholder" part="placeholder"><slot></slot></div>
        <div class="runtime" part="runtime" hidden>
          <header class="bar" part="bar">
            <span class="brand"><i class="mark" aria-hidden="true"></i>${copy.brand}</span>
            <button type="button" part="close" aria-label="${copy.closeLabel}">${copy.close}</button>
          </header>
          <div class="stage">
            <div class="loading" part="loading" role="status"><span aria-hidden="true"></span></div>
            <div class="error" part="error" hidden></div>
          </div>
        </div>
        <span class="sr-status" aria-live="polite"></span>
      </section>
    `;
    this.shadowRoot.querySelector("[part=close]").addEventListener("click", () => this.close());
  }

  handleClick(event) {
    const trigger = event
      .composedPath()
      .find((node) => node instanceof Element && node.hasAttribute("data-telepace-open"));
    if (!trigger) return;
    event.preventDefault();
    this.open();
  }

  open() {
    if (this.frame) return;
    const campaignId = (this.getAttribute("campaign-id") || "").trim();
    const baseUrl = normalizedBaseUrl(this.getAttribute("base-url") || "");
    if (!campaignId || !baseUrl) {
      this.showError(this.copy.invalidTitle, "", "");
      this.emit("telepace-error", { code: "invalid_configuration" });
      return;
    }

    const locale = this.getAttribute("locale") === "zh" ? "zh" : "en";
    const source = (this.getAttribute("source") || "embed").trim();
    const interviewUrl = new URL(`/${locale}/r/${encodeURIComponent(campaignId)}`, baseUrl);
    interviewUrl.searchParams.set("embed", "1");
    interviewUrl.searchParams.set("source", source);
    interviewUrl.searchParams.set("parentOrigin", window.location.origin);

    const iframe = document.createElement("iframe");
    iframe.title = this.getAttribute("title") || this.copy.defaultTitle;
    iframe.src = interviewUrl.toString();
    iframe.loading = "eager";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allow = "microphone";
    iframe.setAttribute(
      "sandbox",
      "allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox",
    );
    this.frame = iframe;
    this.dataset.state = "loading";
    this.shadowRoot.querySelector(".placeholder").hidden = true;
    this.shadowRoot.querySelector(".runtime").hidden = false;
    this.shadowRoot.querySelector(".stage").append(iframe);
    this.shadowRoot.querySelector(".sr-status").textContent = this.copy.loading;
    this.readyTimer = window.setTimeout(() => {
      this.showError(
        this.copy.timeoutTitle,
        this.copy.timeoutBody,
        interviewUrl.toString(),
      );
      this.emit("telepace-error", { code: "ready_timeout" });
    }, READY_TIMEOUT_MS);
    this.emit("telepace-open", { campaignId });
  }

  close() {
    this.clearReadyTimer();
    this.frame?.remove();
    this.frame = null;
    this.dataset.state = "closed";
    this.shadowRoot.querySelector(".runtime").hidden = true;
    this.shadowRoot.querySelector(".placeholder").hidden = false;
    this.shadowRoot.querySelector(".loading").hidden = false;
    this.shadowRoot.querySelector(".error").hidden = true;
    this.shadowRoot.querySelector(".sr-status").textContent = this.copy.closed;
    this.emit("telepace-close", {});
  }

  handleMessage(event) {
    if (!this.frame || event.source !== this.frame.contentWindow) return;
    const baseUrl = normalizedBaseUrl(this.getAttribute("base-url") || "");
    if (!baseUrl || event.origin !== baseUrl) return;
    const message = event.data;
    if (
      !message ||
      message.source !== MESSAGE_SOURCE ||
      message.version !== MESSAGE_VERSION ||
      message.campaignId !== this.getAttribute("campaign-id")
    ) {
      return;
    }

    const payload = message.payload || {};
    if (message.type === "telepace:ready") {
      this.clearReadyTimer();
      this.dataset.state = "ready";
      this.shadowRoot.querySelector(".loading").hidden = true;
      this.shadowRoot.querySelector(".error").hidden = true;
      this.shadowRoot.querySelector(".sr-status").textContent = this.copy.ready;
    } else if (message.type === "telepace:resize") {
      const height = clampHeight(payload.height);
      this.style.setProperty("--tp-frame-height", `${height}px`);
    } else if (message.type === "telepace:error" && payload.recoverable === false) {
      this.showError(
        this.copy.unavailableTitle,
        this.copy.unavailableBody,
        "",
      );
    } else if (message.type === "telepace:complete") {
      this.dataset.state = "complete";
      this.shadowRoot.querySelector(".sr-status").textContent = this.copy.complete;
    }
    this.emit(message.type.replace(":", "-"), payload);
  }

  showError(title, body, fallbackUrl) {
    this.clearReadyTimer();
    this.dataset.state = "error";
    const error = this.shadowRoot.querySelector(".error");
    const fallback = fallbackUrl
      ? `<a href="${fallbackUrl}" target="_blank" rel="noopener">${this.copy.fallback}</a>`
      : "";
    error.innerHTML = `<div><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}${fallback}</div>`;
    error.hidden = false;
    this.shadowRoot.querySelector(".loading").hidden = true;
    this.shadowRoot.querySelector(".runtime").hidden = false;
    this.shadowRoot.querySelector(".placeholder").hidden = true;
    this.shadowRoot.querySelector(".sr-status").textContent = title;
  }

  clearReadyTimer() {
    if (this.readyTimer) window.clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
}

if (!customElements.get("telepace-interview")) {
  customElements.define("telepace-interview", TelepaceInterview);
}
