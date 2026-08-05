"use client";

import { useEffect } from "react";

/** Keep the persistent root <html> in sync after client-side locale changes.
 *
 * Next keeps the root layout mounted while navigating between /en and /zh, so
 * relying only on the server-rendered attribute can leave screen readers on
 * the previous language.
 */
export function DocumentLocale({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
