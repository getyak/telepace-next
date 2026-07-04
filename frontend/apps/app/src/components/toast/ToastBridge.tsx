"use client";

/**
 * Mounts the shared `Toaster` and bridges classified HTTP errors from
 * `onHttpEvent` into toasts, so call sites don't need to catch and forward
 * manually.
 */

import { useEffect } from "react";
import { toast, Toaster } from "@telepace/ui";

import { friendlyMessage } from "../../lib/errors";
import { onHttpEvent } from "../../lib/http";

export function ToastBridge() {
  useEffect(() => {
    let lastAuthAt = 0;
    const off = onHttpEvent((evt) => {
      if (evt.type === "auth:expired") {
        const now = Date.now();
        if (now - lastAuthAt < 2000) return; // de-dupe parallel 401s
        lastAuthAt = now;
        toast.error({
          title: "登录已过期",
          description: "请重新登录以继续操作。",
          durationMs: 8000,
        });
        return;
      }
      if (evt.type === "api:error") {
        if (evt.error.kind === "AUTH") return; // handled above
        if (evt.error.kind === "CANCELED") return; // usually user-initiated
        const copy = friendlyMessage(evt.error);
        toast.error({ title: copy.title, description: copy.description });
      }
    });
    return off;
  }, []);

  return <Toaster />;
}
