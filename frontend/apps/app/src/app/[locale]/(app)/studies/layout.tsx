import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { siteConfig } from "@telepace/config";

/**
 * The list page is a client component and cannot export metadata, hence this
 * server shell. Nested routes (new/, [id]/) override the title with their own
 * generateMetadata; the `noindex` set here is what they all inherit — every
 * route under /studies sits behind the session guard.
 *
 * `title.template` is re-declared because a title.default consumes the root's
 * template and does not pass it on: without this, /studies/new renders a bare
 * "New study" while every sibling page gets the " · telepace" suffix.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.app.studies" });
  return {
    title: {
      default: t("title"),
      template: `%s · ${siteConfig.brand.name}`,
    },
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default function StudiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
