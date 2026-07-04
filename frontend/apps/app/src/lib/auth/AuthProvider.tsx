"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { routes } from "@telepace/config";

import { onHttpEvent } from "../http";
import { fetchMe, login as loginApi, logout as logoutApi, registerUser } from "./client";
import { tokenStore, type StoredUser } from "./store";

type AuthStatus = "loading" | "authenticated" | "guest";

type AuthContextValue = {
  status: AuthStatus;
  user: StoredUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(() => tokenStore.getUser());
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStore.getAccessToken() ? "loading" : "guest",
  );

  const refresh = useCallback(async () => {
    if (!tokenStore.getAccessToken()) {
      setUser(null);
      setStatus("guest");
      return;
    }
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
      tokenStore.clear();
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
