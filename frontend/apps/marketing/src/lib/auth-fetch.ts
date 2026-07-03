/**
 * Marketing-side auth client. We don't share the app's `apiFetch` because
 * marketing has different lifecycle (no long-lived token store here — we
 * hand tokens off to the app URL after login).
 */

import { apiEndpoints, env } from "@telepace/config";

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = typeof j?.detail === "string" ? j.detail : JSON.stringify(j);
    } catch {
      detail = (await res.text().catch(() => "")) || `HTTP ${res.status}`;
    }
    throw new Error(detail);
  }
  return res.json();
}

export function login(body: { email: string; password: string }) {
  return post<TokenResponse>(apiEndpoints.auth.login, body);
}

export function registerUser(body: {
  email: string;
  password: string;
  display_name?: string;
}) {
  return post<TokenResponse>(apiEndpoints.auth.register, body);
}
