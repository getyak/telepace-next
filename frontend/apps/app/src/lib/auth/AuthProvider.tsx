"use client";

import { useRouter } from "@/i18n/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { routes } from "@telepace/config";

import { onHttpEvent } from "../http";
import { fetchMe, login as loginApi, logout as logoutApi, registerUser, type AuthUser } from "./client";

type AuthStatus = "loading" | "authenticated" | "guest";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  redirectOnExpiry = true,
  initialHasSession,
}: {
  children: React.ReactNode;
  /**
   * When a session expires (or /me 401s), redirect to the login page. Correct
   * for the protected app shell, but the public marketing pages mount this
   * provider too — there a guest must NOT be bounced to /login, so they pass
   * `redirectOnExpiry={false}`.
   */
  redirectOnExpiry?: boolean;
  /**
   * First-paint hint from the server, which can read the httpOnly session
   * cookie. When it's explicitly `false` we KNOW the visitor is a guest, so we
   * skip the initial `/me` probe entirely — that probe was a guaranteed 401
   * that (a) tripped the global "session expired" toast on marketing pages a
   * never-logged-in visitor first sees, and (b) logged two noisy 401s on every
   * first paint. `true`/`undefined` keep the probe (a cookie may be present but
   * expired, which only /me can confirm).
   */
  initialHasSession?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  // The session lives in an httpOnly cookie, so the client can't know its full
  // auth state synchronously. When the server already told us there's no cookie,
  // start as a settled guest; otherwise start "loading" and resolve via /me.
  const knownGuest = initialHasSession === false;
  const [status, setStatus] = useState<AuthStatus>(knownGuest ? "guest" : "loading");

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe();
      setUser({
        id: me.id,
        email: me.email,
        display_name: me.display_name,
        org_id: me.org_id,
      });
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("guest");
    }
  }, []);

  useEffect(() => {
    // No cookie means no session to resolve — don't fire a doomed /me probe.
    if (knownGuest) return;
    void refresh();
  }, [refresh, knownGuest]);

  useEffect(() => {
    return onHttpEvent((evt) => {
      if (evt.type === "auth:expired") {
        setUser(null);
        setStatus("guest");
        // On public pages we just fall back to the guest UI in place; only the
        // protected shell bounces to /login.
        if (redirectOnExpiry) {
          router.push(routes.login);
        }
      }
    });
  }, [router, redirectOnExpiry]);

  const login = useCallback(
    async (email: string, password: string) => {
      await loginApi({ email, password });
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      await registerUser({ email, password, display_name: displayName });
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
    setStatus("guest");
    router.push(routes.login);
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, refresh }),
    [status, user, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
