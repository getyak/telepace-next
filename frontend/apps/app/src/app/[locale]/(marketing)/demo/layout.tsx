import { routes } from "@telepace/config";

import { buildPageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return buildPageMetadata({
    locale,
    path: routes.demo,
    namespace: "metadata.marketing.demo",
  });
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
