import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing } from "./routing";

const NAMESPACES = [
  "common",
  "nav",
  "marketing",
  "app",
  "auth",
  "respondent",
  "errors",
  "metadata",
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  if (!hasLocale(routing.locales, requested)) {
    notFound();
  }

  const locale = requested;

  const messages = Object.fromEntries(
    await Promise.all(
      NAMESPACES.map(async (namespace) => [
        namespace,
        (await import(`../../messages/${locale}/${namespace}.json`)).default,
      ]),
    ),
  );

  return { locale, messages };
});
