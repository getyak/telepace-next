import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * The page itself is a client component (the whole studio is interactive), so
 * it cannot export metadata — hence this server shell. No canonical/hreflang
 * here the way marketing pages get them: this route sits behind the session
 * guard, so it is `noindex` rather than something we want crawled.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.newStudy" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default function NewStudyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
