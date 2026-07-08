/**
 * Centralized, validated env access for the frontend app.
 *
 * Every `NEXT_PUBLIC_*` variable the frontend reads MUST live here.
 * Anything a page imports from this module is guaranteed non-empty at
 * module-load time — no scattered `?? "http://localhost:XXXX"` fallbacks
 * that silently mask misconfiguration.
 *
 * IMPORTANT: each variable is read via a static `process.env.NEXT_PUBLIC_X`
 * member expression. The Next.js compiler inlines those into client bundles
 * at build time; a dynamic `process.env[name]` lookup would resolve to
 * `undefined` in the browser and crash pages that touch `env`.
 */

type Env = {
  apiBaseUrl: string;
  wsBaseUrl: string;
  mcpUrl: string;
  /** Feature flag: show the "Continue with Google" button on auth pages. */
  oauthGoogleEnabled: boolean;
};

function nonEmpty(v: string | undefined): string | undefined {
  return v && v.length > 0 ? v : undefined;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function assertUrl(name: string, value: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid URL in ${name}: ${value}`);
  }
}

function readFlag(v: string | undefined): boolean {
  return v === "1" || v === "true";
}

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  // Static member accesses — do not refactor into a loop (see header note).
  const apiBaseUrl = nonEmpty(process.env.NEXT_PUBLIC_API_BASE_URL);
  const wsBaseUrl = nonEmpty(process.env.NEXT_PUBLIC_WS_BASE_URL);
  const mcpUrl = nonEmpty(process.env.NEXT_PUBLIC_MCP_URL);
  const oauthGoogle = nonEmpty(process.env.NEXT_PUBLIC_OAUTH_GOOGLE);

  const missing: string[] = [];
  if (!apiBaseUrl) missing.push("NEXT_PUBLIC_API_BASE_URL");
  if (!wsBaseUrl) missing.push("NEXT_PUBLIC_WS_BASE_URL");
  if (missing.length > 0 && isProduction()) {
    throw new Error(
      `Missing required env vars: ${missing.join(", ")}. ` +
        "Set them in .env.local (dev) or your deployment environment.",
    );
  }

  cached = {
    apiBaseUrl: apiBaseUrl
      ? assertUrl("NEXT_PUBLIC_API_BASE_URL", apiBaseUrl)
      : "http://localhost:8010",
    wsBaseUrl: wsBaseUrl
      ? assertUrl("NEXT_PUBLIC_WS_BASE_URL", wsBaseUrl)
      : "ws://localhost:8010",
    mcpUrl: mcpUrl
      ? assertUrl("NEXT_PUBLIC_MCP_URL", mcpUrl)
      : "https://mcp.telepace.io",
    oauthGoogleEnabled: readFlag(oauthGoogle),
  };
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return (loadEnv() as unknown as Record<string, unknown>)[prop];
  },
});
