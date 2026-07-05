"use client";

/**
 * Bridges classified HTTP-layer errors to the shared toast system.
 * Mounted once in the root layout, next to <Toaster />.
 *
 * The root layout sits outside the [locale] segment's NextIntlClientProvider,
 * so the resolved copy table is built server-side (via getTranslations) and
 * passed in as a plain serializable prop — functions can't cross the
 * server/client boundary, so this reads the table locally instead of
 * calling useTranslations() itself.
 */

import { useEffect } from "react";
import { toast } from "@telepace/ui";

import { friendlyMessage, type ErrorsCopyTable } from "../../lib/errors";
import { onHttpEvent } from "../../lib/http";

export function HttpErrorBridge({ copy }: { copy: ErrorsCopyTable }) {
  useEffect(() => {
    let lastAuthAt = 0;
    return onHttpEvent((evt) => {
      if (evt.type === "auth:expired") {
        const now = Date.now();
        if (now - lastAuthAt < 2000) return; // de-dupe parallel 401s
        lastAuthAt = now;
        toast.error({
          title: copy.auth.title,
          description: copy.auth.description,
          durationMs: 8000,
        });
        return;
      }
      if (evt.type === "api:error") {
        if (evt.error.kind === "AUTH") return; // handled above
        if (evt.error.kind === "CANCELED") return; // usually user-initiated
        const friendly = friendlyMessage(evt.error, copy);
        toast.error({ title: friendly.title, description: friendly.description });
      }
    });
  }, [copy]);

  return null;
}
