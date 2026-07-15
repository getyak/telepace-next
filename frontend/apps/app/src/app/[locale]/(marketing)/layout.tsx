import { cookies } from "next/headers";

import { Nav, Footer } from "@/components/marketing/site-chrome";
import { JsonLd } from "@/components/seo/JsonLd";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { organizationSchema, webSiteSchema } from "@/lib/seo";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The session cookie is httpOnly and scoped to path "/", so the server can
  // detect logged-in-ness and hand it to the nav as a first-paint hint.
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(ACCESS_COOKIE);

  return (
    <AuthProvider redirectOnExpiry={false}>
      {/* Site-wide identity graph — rendered once for every marketing route so
          Organization/WebSite are always discoverable regardless of entry page. */}
      <JsonLd data={[organizationSchema(), webSiteSchema()]} />
      <Nav hasSession={hasSession} />
      <main>{children}</main>
      <Footer />
    </AuthProvider>
  );
}
