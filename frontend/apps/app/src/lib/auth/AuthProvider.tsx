"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { routes } from "@telepace/config";

import { onHttpEvent } from "../http";
import { fetchMe, login as loginApi, logout as logoutApi, type AuthUser } from "./client";

type AuthStatus = "loading" | "authenticated" | "guest";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  // The session lives in an httpOnly cookie, so the client can't know its
  // auth state synchronously — always start in "loading" and resolve via /me.
  const [status, setStatus] = useState<AuthStatus>("loading");

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
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return onHttpEvent((evt) => {
      if (evt.type === "auth:expired") {
        setUser(null);
        setStatus("guest");
        router.push(routes.login);
      }
    });
  }, [router]);

  const login = useCallback(
    async (email: string, password: string) => {
      await loginApi({ email, password });
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
    () => ({ status, user, login, logout, refresh }),
    [status, user, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
