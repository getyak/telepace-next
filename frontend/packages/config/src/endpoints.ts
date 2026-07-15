/**
 * Backend HTTP + WebSocket endpoint paths (relative to the API base URL).
 *
 * These MUST stay in sync with `interfaces/rest_api/routers/*` and
 * `interfaces/realtime/voice_ws.py`. Any new endpoint must be added here
 * before it's called from a page.
 */

export const apiEndpoints = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    refresh: "/auth/refresh",
    me: "/auth/me",
    logout: "/auth/logout",
  },
  campaigns: {
    root: "/v1/campaigns",
    assess: "/v1/campaigns/assess",
    byId: (id: string) => `/v1/campaigns/${id}`,
    refine: (id: string) => `/v1/campaigns/${id}/refine`,
    refineStream: (id: string) => `/v1/campaigns/${id}/refine/stream`,
    start: (id: string) => `/v1/campaigns/${id}/start`,
    close: (id: string) => `/v1/campaigns/${id}/close`,
    dispatch: (id: string) => `/v1/campaigns/${id}/dispatch`,
    simulate: (id: string) => `/v1/campaigns/${id}/simulate`,
    insights: (id: string) => `/v1/campaigns/${id}/insights`,
  },
  interviews: {
    join: "/v1/interviews/join",
    reply: "/v1/interviews/reply",
  },
  agent: {
    chat: "/v1/agent/chat",
  },
} as const;

export const wsEndpoints = {
  interview: (campaignId: string) => `/ws/interview/${campaignId}`,
  voice: (campaignId: string) => `/ws/voice/${campaignId}`,
} as const;
