import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { noindexMetadata } from "@/lib/seo";

// Respondent interview links are distributed outside our control (email,
// SMS, chat) — robots.ts already disallows `/r/*`, but that only tells
// crawlers not to fetch it. This noindex is the fallback that keeps a link
// which leaks into a public channel out of search results too.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "respondent.masthead" });
  return {
    title: t("metadataTitle"),
    description: t("subtitle"),
    ...noindexMetadata(),
  };
}

export default function RespondentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
