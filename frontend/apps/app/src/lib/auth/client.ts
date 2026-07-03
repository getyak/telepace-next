/**
 * Auth API client — one function per backend endpoint.
 *
 * Endpoints are looked up in `@telepace/config/endpoints`, not spelled
 * inline. Tokens are attached automatically by `apiFetch`.
 */

import { apiEndpoints } from "@telepace/config";

import { apiFetch } from "../http";
import { tokenStore, type StoredUser } from "./store";

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
};

export type UserResponse = {
  id: string;
  email: string;
  display_name: string | null;
  org_id: string;
  created_at: string;
};

export async function registerUser(body: {
  email: string;
  password: string;
  display_name?: string;
}): Promise<TokenResponse> {
  const tokens = await apiFetch<TokenResponse>(apiEndpoints.auth.register, {
    method: "POST",
    json: body,
  });
  tokenStore.set({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
  return tokens;
}

export async function login(body: {
  email: string;
  password: string;
}): Promise<TokenResponse> {
  const tokens = await apiFetch<TokenResponse>(apiEndpoints.auth.login, {
    method: "POST",
    json: body,
  });
  tokenStore.set({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  });
  return tokens;
}

export async function refreshTokens(): Promise<TokenResponse | null> {
  const rt = tokenStore.getRefreshToken();
  if (!rt) return null;
  try {
    const tokens = await apiFetch<TokenResponse>(apiEndpoints.auth.refresh, {
      method: "POST",
      json: { refresh_token: rt },
    });
    tokenStore.set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });
    return tokens;
  } catch {
    tokenStore.clear();
    return null;
  }
}

export async function fetchMe(): Promise<UserResponse> {
  const me = await apiFetch<UserResponse>(apiEndpoints.auth.me);
  const stored: StoredUser = {
    id: me.id,
    email: me.email,
    display_name: me.display_name,
    org_id: me.org_id,
  };
  const at = tokenStore.getAccessToken();
  const rt = tokenStore.getRefreshToken();
  if (at && rt) tokenStore.set({ accessToken: at, refreshToken: rt, user: stored });
  return me;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch(apiEndpoints.auth.logout, { method: "POST" });
  } finally {
    tokenStore.clear();
  }
}
