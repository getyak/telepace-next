/**
 * Auth API client — one function per BFF endpoint.
 *
 * Endpoint paths are looked up in `@telepace/config/endpoints`; the HTTP
 * layer maps them onto the same-origin BFF (`/api/auth/*`). Tokens are
 * handled entirely by httpOnly cookies — nothing is stored client-side.
 */

import { apiEndpoints } from "@telepace/config";

import { apiFetch } from "../http";

export type AuthUser = {
  id: string;
  email: string;
  display_name: string | null;
  org_id: string;
};

export type UserResponse = AuthUser & {
  created_at: string;
};

export async function registerUser(body: {
  email: string;
  password: string;
  display_name?: string;
}): Promise<void> {
  await apiFetch(apiEndpoints.auth.register, { method: "POST", json: body });
}

export async function login(body: {
  email: string;
  password: string;
}): Promise<void> {
  await apiFetch(apiEndpoints.auth.login, { method: "POST", json: body });
}

export async function fetchMe(): Promise<UserResponse> {
  return apiFetch<UserResponse>(apiEndpoints.auth.me);
}

export async function logout(): Promise<void> {
  await apiFetch(apiEndpoints.auth.logout, { method: "POST" });
}
