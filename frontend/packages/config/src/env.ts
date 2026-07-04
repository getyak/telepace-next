/**
 * Centralized, validated env access for every frontend app.
 *
 * Every `NEXT_PUBLIC_*` variable the frontend reads MUST live here.
 * Anything a page imports from this module is guaranteed non-empty at
 * module-load time — no scattered `?? "http://localhost:XXXX"` fallbacks
 * that silently mask misconfiguration.
 *
 * The zero-dependency approach keeps the config package portable; we can
 * migrate to `@t3-oss/env-nextjs` later without touching call sites.
 */

type Env = {
  apiBaseUrl: string;
  wsBaseUrl: string;
  mcpUrl: string;
  oauthGoogleEnabled: boolean;
};

const REQUIRED_KEYS = {
  apiBaseUrl: "NEXT_PUBLIC_API_BASE_URL",
  wsBaseUrl: "NEXT_PUBLIC_WS_BASE_URL",
} as const;

const OPTIONAL_KEYS = {
  mcpUrl: "NEXT_PUBLIC_MCP_URL",
} as const;

const OPTIONAL_FALLBACKS = {
  mcpUrl: "https://mcp.telepace.io",
} as const satisfies Record<keyof typeof OPTIONAL_KEYS, string>;

function readRaw(name: string): string | undefined {
  const v =
    typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  return v && v.length > 0 ? v : undefined;
}

function isProduction(): boolean {
  return (
    typeof process !== "undefined" && process.env?.NODE_ENV === "production"
  );
}

function assertUrl(name: string, value: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Invalid URL in ${name}: ${value}`);
  }
}

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const missing: string[] = [];
  const raw: Partial<Env> = {};

  for (const [key, envName] of Object.entries(REQUIRED_KEYS) as [
    keyof typeof REQUIRED_KEYS,
    string,
  ][]) {
    const v = readRaw(envName);
    if (!v) {
      missing.push(envName);
    } else {
      raw[key] = assertUrl(envName, v);
    }
  }

  if (missing.length > 0 && isProduction()) {
    throw new Error(
      `Missing required env vars: ${missing.join(", ")}. ` +
        "Set them in .env.local (dev) or your deployment environment.",
    );
  }
  if (!raw.apiBaseUrl) raw.apiBaseUrl = "http://localhost:8010";
  if (!raw.wsBaseUrl) raw.wsBaseUrl = "ws://localhost:8010";

  for (const [key, envName] of Object.entries(OPTIONAL_KEYS) as [
    keyof typeof OPTIONAL_KEYS,
    string,
  ][]) {
    const v = readRaw(envName);
    raw[key] = v ? assertUrl(envName, v) : OPTIONAL_FALLBACKS[key];
  }

  // Feature-flagged: the Google OAuth button stays hidden until the backend
  // OAuth flow (docs/ui-ux-optimization-plan.md Phase 2.2) ships.
  raw.oauthGoogleEnabled = readRaw("NEXT_PUBLIC_OAUTH_GOOGLE") === "true";

  cached = raw as Env;
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return (loadEnv() as Record<string, unknown>)[prop];
  },
});
