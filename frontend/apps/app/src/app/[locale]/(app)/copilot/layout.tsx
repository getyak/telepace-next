import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * The page is a client component (the chat is interactive), so it cannot
 * export metadata — hence this server shell. `noindex`: the route sits behind
 * the session guard and should never be crawled.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.copilot" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default function CopilotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
