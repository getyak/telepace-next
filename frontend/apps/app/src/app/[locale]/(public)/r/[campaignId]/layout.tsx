import type { Metadata } from "next";

import { noindexMetadata } from "@/lib/seo";

// Respondent interview links are distributed outside our control (email,
// SMS, chat) — robots.ts already disallows `/r/*`, but that only tells
// crawlers not to fetch it. This noindex is the fallback that keeps a link
// which leaks into a public channel out of search results too.
export function generateMetadata(): Metadata {
  return noindexMetadata();
}

export default function RespondentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
