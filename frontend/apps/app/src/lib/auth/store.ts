/**
 * Token storage. Kept intentionally small — expand to context/subscribers
 * once we need cross-tab sync (BroadcastChannel) or React state hookup.
 */

import { storageKeys } from "@telepace/config";

type StoredUser = {
  id: string;
  email: string;
  display_name: string | null;
  org_id: string;
};

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export const tokenStore = {
  getAccessToken(): string | null {
    if (!isBrowser()) return null;
    return window.localStorage.getItem(storageKeys.accessToken);
  },
  getRefreshToken(): string | null {
    if (!isBrowser()) return null;
    return window.localStorage.getItem(storageKeys.refreshToken);
  },
  getUser(): StoredUser | null {
    if (!isBrowser()) return null;
    const raw = window.localStorage.getItem(storageKeys.currentUser);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  },
  set(pair: {
    accessToken: string;
    refreshToken: string;
    user?: StoredUser;
  }): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(storageKeys.accessToken, pair.accessToken);
    window.localStorage.setItem(storageKeys.refreshToken, pair.refreshToken);
    if (pair.user) {
      window.localStorage.setItem(
        storageKeys.currentUser,
        JSON.stringify(pair.user),
      );
    }
  },
  clear(): void {
    if (!isBrowser()) return;
    window.localStorage.removeItem(storageKeys.accessToken);
    window.localStorage.removeItem(storageKeys.refreshToken);
    window.localStorage.removeItem(storageKeys.currentUser);
  },
};

export type { StoredUser };
