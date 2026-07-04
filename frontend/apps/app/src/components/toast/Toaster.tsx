"use client";

/**
 * App-specific toast wiring: the reusable Toast primitive lives in
 * `@telepace/ui` (mount once, call `toast.*` from anywhere). This module
 * just bridges classified HTTP errors from the app's http layer into it,
 * so call sites don't have to catch and forward every failed request.
 */

import { useEffect } from "react";
import { Toaster as UiToaster, toast } from "@telepace/ui";

import { friendlyMessage } from "../../lib/errors";
import { onHttpEvent } from "../../lib/http";

export { toast };

export function Toaster() {
  useEffect(() => {
    let lastAuthAt = 0;
    return onHttpEvent((evt) => {
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
  }, []);

  return <UiToaster />;
}
